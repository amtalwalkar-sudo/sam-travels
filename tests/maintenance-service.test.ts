import { describe, expect, it } from "vitest";
import type { AtomicRecordRepository } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import {
  assertMaintenanceRecordV1,
  calculateMaintenanceVisitTotal,
  maintenanceBusinessDateFromInstant,
} from "../packages/features/maintenance";
import { MaintenanceService } from "../packages/application/src/maintenance-service";

class MemoryRepository implements AtomicRecordRepository {
  private rows = new Map<string, RecordEnvelope<unknown>>();
  async get<T>(id: string) { return this.rows.get(id) as RecordEnvelope<T> | undefined; }
  async put<T>(record: RecordEnvelope<T>) { this.rows.set(record.id, record as RecordEnvelope<unknown>); }
  async list<T>() { return [...this.rows.values()] as Array<RecordEnvelope<T>>; }
  async remove(id: string) { this.rows.delete(id); }
  async compareAndSet<T>(id: string, expectedRevision: number | null, next: RecordEnvelope<T>) {
    const current = this.rows.get(id);
    if (expectedRevision === null ? current !== undefined : current?.revision !== expectedRevision) return false;
    this.rows.set(id, next as RecordEnvelope<unknown>);
    return true;
  }
}

const vehicleId = "feature:vehicle:MH01AB1234";
const vehicle: RecordEnvelope<{ lifecycleState: string }> = {
  id: vehicleId, schemaVersion: 1, createdAt: "2026-10-31T20:00:00.000Z",
  updatedAt: "2026-10-31T20:00:00.000Z", source: "web", revision: 1,
  data: { lifecycleState: "active" },
};

function setup() {
  let now = "2026-11-02T10:00:00.000Z";
  const vehicles = { async getById(id: string) { return id === vehicleId ? vehicle : undefined; } };
  const service = new MaintenanceService(
    new MemoryRepository(), assertMaintenanceRecordV1, vehicles,
    calculateMaintenanceVisitTotal, maintenanceBusinessDateFromInstant, () => now,
  );
  return { service, setNow(value: string) { now = value; } };
}

const visitInput = {
  vehicleId, maintenanceDate: "2026-10-05", maintenanceType: "Regular service",
  description: "Oil and filter replacement",
  items: [
    { id: "123e4567-e89b-42d3-a456-426614174000", description: "Engine oil", amountPaise: 200000 },
    { id: "123e4567-e89b-42d3-a456-426614174001", description: "Filter", amountPaise: 50000 },
  ],
  odometerKm: 45000, provider: "Local Garage", nextServiceDate: "2027-04-05", nextServiceKm: 50000,
};

describe("MaintenanceService", () => {
  it("creates maintenance history as immutable business records", async () => {
    const { service } = setup();
    const created = await service.createVisit({
      uuid: "123e4567-e89b-42d3-a456-426614174010",
      data: visitInput, source: "web",
    });
    expect(created.data.totalPaise).toBe(250000);
    expect(created.businessDate).toBe("2026-10-05");
    expect(created.revision).toBe(1);
    expect("editVisit" in service).toBe(false);
    expect("editExpense" in service).toBe(false);
    const history = await service.listVehicleRecords(vehicleId);
    expect(history.visits[0]).toEqual(created);
  });

  it("keeps general expenses separate and sums only actual expenses", async () => {
    const { service } = setup();
    await service.createVisit({
      uuid: "123e4567-e89b-42d3-a456-426614174010", data: visitInput, source: "web",
    });
    await service.createExpense({
      uuid: "123e4567-e89b-42d3-a456-426614174011",
      data: {
        vehicleId, expenseDate: "2026-10-06", expenseName: "Towing",
        description: "Roadside towing", amountPaise: 120000,
      }, source: "android",
    });
    expect(await service.getActualExpenseTotal(vehicleId)).toBe(370000);
    const history = await service.listVehicleRecords(vehicleId);
    expect(history.visits).toHaveLength(1);
    expect(history.expenses).toHaveLength(1);
    expect(history.rateHistory[0].ratePaisePerKm).toBe(250);
  });

  it("starts each vehicle at ₹2.50/km and appends idempotent effective-date rate changes", async () => {
    const { service, setNow } = setup();
    const defaultHistory = await service.getRateHistory(vehicleId);
    expect(defaultHistory.entries[0]).toMatchObject({
      effectiveFrom: "2026-11-01", ratePaisePerKm: 250, isDefault: true,
    });

    const commandId = "123e4567-e89b-42d3-a456-426614174020";
    const first = await service.setRate({
      vehicleId, ratePaisePerKm: 300, commandId, source: "web",
    });
    expect(first.revision).toBe(1);
    expect(first.data.entries).toHaveLength(2);
    const duplicate = await service.setRate({
      vehicleId, ratePaisePerKm: 300, commandId, source: "web",
    });
    expect(duplicate.revision).toBe(1);
    expect(duplicate.data.entries).toHaveLength(2);
    await expect(service.setRate({
      vehicleId, ratePaisePerKm: 350, commandId, source: "web",
    })).rejects.toThrow("maintenance_rate_idempotency_conflict");
    expect((await service.getRateForDate(vehicleId, "2026-11-01")).ratePaisePerKm).toBe(250);
    expect((await service.getRateForDate(vehicleId, "2026-11-02")).ratePaisePerKm).toBe(300);

    setNow("2026-11-02T11:00:00.000Z");
    await service.setRate({
      vehicleId, ratePaisePerKm: 350,
      commandId: "123e4567-e89b-42d3-a456-426614174021", source: "android",
    });
    expect((await service.getRateForDate(vehicleId, "2026-11-02")).ratePaisePerKm).toBe(350);
    expect(await service.getActualExpenseTotal(vehicleId)).toBe(0);
  });

  it("rejects records for unknown vehicles", async () => {
    const { service } = setup();
    await expect(service.createExpense({
      uuid: "123e4567-e89b-42d3-a456-426614174011",
      data: {
        vehicleId: "feature:vehicle:UNKNOWN", expenseDate: "2026-10-06",
        expenseName: "Towing", description: "Roadside towing", amountPaise: 120000,
      }, source: "web",
    })).rejects.toThrow("maintenance_vehicle_not_found");
  });

  it("projects date and kilometre reminders from recorded readings only", async () => {
    const { service } = setup();
    await service.createVisit({
      uuid: "123e4567-e89b-42d3-a456-426614174010",
      data: { ...visitInput, nextServiceDate: "2026-11-01", nextServiceKm: 50000 },
      source: "web",
    });
    expect(await service.getDateReminders(vehicleId, "2026-11-01")).toHaveLength(1);
    const withoutReading = await service.getServiceReminderStates(vehicleId, "2026-11-01");
    expect(withoutReading[0].kilometreStatus).toBe("not_due");
    expect(withoutReading[0].latestOdometerKm).toBe(45000);

    await service.createExpense({
      uuid: "123e4567-e89b-42d3-a456-426614174012",
      data: {
        vehicleId, expenseDate: "2026-12-01", expenseName: "Odometer update",
        description: "Recorded odometer reading", amountPaise: 0, odometerKm: 50200,
      }, source: "web",
    });
    const afterReading = await service.getServiceReminderStates(vehicleId, "2026-12-01");
    expect(afterReading[0].kilometreStatus).toBe("due");
    expect(afterReading[0].latestOdometerKm).toBe(50200);
  });
});
