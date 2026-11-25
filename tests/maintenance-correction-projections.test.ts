import { describe, expect, it } from "vitest";
import type { AtomicRecordBatchRepository, AtomicRecordMutation } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import {
  assertMaintenanceRecordV1,
  calculateMaintenanceVisitTotal,
  maintenanceBusinessDateFromInstant,
} from "../packages/features/maintenance";
import { MaintenanceService } from "../packages/application/src/maintenance-service";
import { createMaintenanceExpenseCorrectionAdapter } from "../apps/web/src/maintenance-expense-correction-runtime";
import { accrueMaintenanceForCompletedWorkDay } from "../packages/application/src/maintenance-daily-accrual-integration";

class MemoryRepository implements AtomicRecordBatchRepository {
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
  async compareAndSetMany(mutations: readonly AtomicRecordMutation[]) {
    for (const mutation of mutations) {
      const current = this.rows.get(mutation.id);
      if (mutation.expectedRevision === null ? current !== undefined : current?.revision !== mutation.expectedRevision) return false;
    }
    for (const mutation of mutations) this.rows.set(mutation.id, mutation.next as RecordEnvelope<unknown>);
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
  const repository = new MemoryRepository();
  const service = new MaintenanceService(
    repository, assertMaintenanceRecordV1, vehicles,
    calculateMaintenanceVisitTotal, maintenanceBusinessDateFromInstant, () => now,
  );
  return { service, repository, setNow(value: string) { now = value; } };
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

describe("Maintenance corrected actual-expense projections", () => {
  it("uses append-only expense corrections in history and actual-expense totals without rewriting the source", async () => {
    const { service, repository } = setup();
    const original = await service.createExpense({
      uuid: "123e4567-e89b-42d3-a456-426614174099",
      data: { vehicleId, expenseDate: "2026-10-06", expenseName: "Towing",
        description: "Roadside towing", amountPaise: 120000 },
      source: "web",
    });
    const recordedAt = "2026-11-20T08:00:00.000Z";
    const correction = {
      schemaVersion: 1, correctionId: "maintenance-amount-fix",
      targetRecordId: original.id, targetRecordRevision: original.revision,
      featureId: "maintenance", chainRevision: 1, fieldPath: "amountPaise",
      beforeValue: 120000, afterValue: 150000, reason: "Verified garage receipt",
      actor: { role: "admin", actorId: "admin-person", adminPinVerifiedAt: recordedAt },
      recordedAt,
    } as const;
    await repository.put({
      id: "historical-correction:" + correction.correctionId,
      schemaVersion: 1, createdAt: recordedAt, updatedAt: recordedAt,
      source: "integration", revision: 1, data: correction,
    });
    await repository.put({
      id: "historical-correction-chain:" + encodeURIComponent(original.id),
      schemaVersion: 1, createdAt: recordedAt, updatedAt: recordedAt,
      source: "integration", revision: 1,
      data: { schemaVersion: 1, targetRecordId: original.id, chainRevision: 1,
        headCorrectionId: correction.correctionId },
    });

    const history = await service.listVehicleRecords(vehicleId);
    expect(history.expenses.find(row => row.id === original.id)?.data.amountPaise).toBe(150000);
    expect(await service.getActualExpenseTotal(vehicleId)).toBe(150000);
    expect((await repository.get<typeof original.data>(original.id))?.data.amountPaise).toBe(120000);
  });

  it("fails closed when a correction chain head does not match its append-only records", async () => {
    const { service, repository } = setup();
    const original = await service.createExpense({
      uuid: "123e4567-e89b-42d3-a456-426614174098",
      data: { vehicleId, expenseDate: "2026-10-06", expenseName: "Towing",
        description: "Roadside towing", amountPaise: 120000 },
      source: "web",
    });
    const recordedAt = "2026-11-20T08:00:00.000Z";
    await repository.put({
      id: "historical-correction-chain:" + encodeURIComponent(original.id),
      schemaVersion: 1, createdAt: recordedAt, updatedAt: recordedAt,
      source: "integration", revision: 1,
      data: { schemaVersion: 1, targetRecordId: original.id, chainRevision: 1,
        headCorrectionId: "missing-correction" },
    });
    await expect(service.getActualExpenseTotal(vehicleId))
      .rejects.toThrow("maintenance_correction_chain_head_invalid");
  });
});


describe("Maintenance corrected service visit totals", () => {
  it("propagates a corrected visit total into actual expenses while retaining the original itemised record", async () => {
    const { service, repository } = setup();
    const original = await service.createVisit({
      uuid: "123e4567-e89b-42d3-a456-426614174097",
      data: visitInput, source: "web",
    });
    const recordedAt = "2026-11-20T08:00:00.000Z";
    const correction = {
      schemaVersion: 1, correctionId: "maintenance-visit-total-fix",
      targetRecordId: original.id, targetRecordRevision: original.revision,
      featureId: "maintenance", chainRevision: 1, fieldPath: "totalPaise",
      beforeValue: 250000, afterValue: 275000, reason: "Verified final service invoice",
      actor: { role: "admin", actorId: "admin-person", adminPinVerifiedAt: recordedAt },
      recordedAt,
    } as const;
    await repository.put({
      id: "historical-correction:" + correction.correctionId,
      schemaVersion: 1, createdAt: recordedAt, updatedAt: recordedAt,
      source: "integration", revision: 1, data: correction,
    });
    await repository.put({
      id: "historical-correction-chain:" + encodeURIComponent(original.id),
      schemaVersion: 1, createdAt: recordedAt, updatedAt: recordedAt,
      source: "integration", revision: 1,
      data: { schemaVersion: 1, targetRecordId: original.id, chainRevision: 1,
        headCorrectionId: correction.correctionId },
    });
    const history = await service.listVehicleRecords(vehicleId);
    expect(history.visits.find(row => row.id === original.id)?.data.totalPaise).toBe(275000);
    expect(await service.getActualExpenseTotal(vehicleId)).toBe(275000);
    const unchanged = await repository.get<typeof original.data>(original.id);
    expect(unchanged?.data.totalPaise).toBe(250000);
    expect(unchanged?.data.items).toEqual(original.data.items);
  });
});
