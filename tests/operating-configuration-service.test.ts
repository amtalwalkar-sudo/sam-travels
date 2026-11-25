import { describe, expect, it } from "vitest";
import type { AtomicRecordRepository } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import { driverAssignmentHistoryId } from "../packages/domain/src/driver-assignment";
import { driverRecordId } from "../packages/domain/src/driver-record-identity";
import { OperatingConfigurationServiceV1 } from "../packages/application/src/operating-configuration-service";

class MemoryRepository implements AtomicRecordRepository {
  private rows = new Map<string, RecordEnvelope<unknown>>();
  async get<T>(id: string) { return this.rows.get(id) as RecordEnvelope<T> | undefined; }
  async put<T>(record: RecordEnvelope<T>) { this.rows.set(record.id, record as RecordEnvelope<unknown>); }
  async list<T>() { return [...this.rows.values()] as Array<RecordEnvelope<T>>; }
  async remove(id: string) { this.rows.delete(id); }
  async compareAndSet<T>(id: string, expectedRevision: number | null, next: RecordEnvelope<T>) {
    if ((this.rows.get(id)?.revision ?? null) !== expectedRevision) return false;
    this.rows.set(id, next as RecordEnvelope<unknown>);
    return true;
  }
}

const at = "2026-11-20T08:00:00.000Z";
const vehicleId = "feature:vehicle:MH01AB1234";
function row<T>(id: string, revision: number, data: T): RecordEnvelope<T> {
  return { id, schemaVersion: 1, createdAt: at, updatedAt: at, source: "web", revision, data };
}
function configuredRepository() {
  const records = new MemoryRepository();
  records.put(row("work:selected-driver", 2, { schemaVersion: 1, driverId: "driver-1" }));
  records.put(row(driverRecordId("driver-1"), 3, {
    schemaVersion: 1, driverId: "driver-1", name: "Configured Driver", lifecycleState: "active",
  }));
  records.put(row(vehicleId, 4, {
    schemaVersion: 1, registrationNumber: "MH01AB1234", make: "Tata", model: "Ace",
    vehicleType: "LCV", fuelType: "CNG", yearOfManufacture: 2022,
    ownership: "Owned", lifecycleState: "active",
  }));
  records.put(row(driverAssignmentHistoryId("driver-1"), 5, {
    schemaVersion: 1, driverId: "driver-1",
    assignments: [{ assignmentId: "assignment-1", vehicleId, assignedAt: at }],
  }));
  return records;
}

describe("versioned operating configuration service", () => {
  it("returns the single configured pair with all source revisions", async () => {
    const service = new OperatingConfigurationServiceV1(configuredRepository());
    await expect(service.get()).resolves.toEqual({
      schemaVersion: 1, driverId: "driver-1", vehicleId, assignmentId: "assignment-1",
      selectionRevision: 2, driverRevision: 3, vehicleRevision: 4, assignmentRevision: 5,
    });
  });

  it("allows read-only pair resolution during an active shift while command resolution stays locked", async () => {
    const records = configuredRepository();
    const selected = await records.get<{ schemaVersion: 1; driverId: string }>("work:selected-driver");
    await records.put({
      ...selected!, revision: 3, updatedAt: "2026-11-20T09:00:00.000Z",
      data: { schemaVersion: 1, driverId: "driver-1", lockedShiftId: "active-shift-1" },
    });
    const service = new OperatingConfigurationServiceV1(records);
    await expect(service.get()).rejects.toThrow("operating_driver_selection_locked");
    await expect(service.getForReadOnly()).resolves.toMatchObject({
      driverId: "driver-1", vehicleId, assignmentId: "assignment-1", selectionRevision: 3,
    });
    expect((await records.get("work:selected-driver"))?.revision).toBe(3);
  });

  it("provides vehicle-only read context when no Work Driver is selected without relaxing command resolution", async () => {
    const records = new MemoryRepository();
    records.put(row(vehicleId, 4, {
      schemaVersion: 1, registrationNumber: "MH01AB1234", make: "Tata", model: "Ace",
      vehicleType: "LCV", fuelType: "CNG", yearOfManufacture: 2022,
      ownership: "Owned", lifecycleState: "active",
    }));
    const service = new OperatingConfigurationServiceV1(records);
    await expect(service.get()).rejects.toThrow("work_driver_not_selected");
    await expect(service.getForReadOnly()).rejects.toThrow("work_driver_not_selected");
    await expect(service.getVehicleForReadOnly()).resolves.toEqual({
      schemaVersion: 1, vehicleId, vehicleRevision: 4,
    });
  });

  it("rejects a stale form snapshot before a dependent command can write", async () => {
    const records = configuredRepository();
    const service = new OperatingConfigurationServiceV1(records);
    const opened = await service.get();
    const originalRows = await records.list();
    const vehicle = await records.get<Record<string, unknown>>(vehicleId);
    await records.put({ ...vehicle!, revision: 5, updatedAt: "2026-11-20T09:00:00.000Z" });
    const beforeRejectedCommand = await records.list();
    await expect(service.assertCurrent(opened)).rejects.toThrow("operating_configuration_stale");
    expect(await records.list()).toEqual(beforeRejectedCommand);
    expect(originalRows).toHaveLength(4);
  });

  it("fails closed instead of choosing the first of multiple active vehicles", async () => {
    const records = configuredRepository();
    await records.put(row("feature:vehicle:MH02CD5678", 1, {
      schemaVersion: 1, registrationNumber: "MH02CD5678", make: "Tata", model: "Ace",
      vehicleType: "LCV", fuelType: "CNG", yearOfManufacture: 2022,
      ownership: "Owned", lifecycleState: "active",
    }));
    await expect(new OperatingConfigurationServiceV1(records).get())
      .rejects.toThrow("operating_vehicle_ambiguous");
  });
});
