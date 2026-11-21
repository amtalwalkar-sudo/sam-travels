import { describe, expect, it } from "vitest";
import type { AtomicRecordBatchRepository, AtomicRecordMutation } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import { assertDriverRecordV1 } from "../packages/features/driver-records";
import { DriverRecordsService } from "../packages/application/src/driver-records-service";

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

const driver = {
  schemaVersion: 1 as const, driverId: "driver-001", name: "Example Driver",
  licenceNumber: "DL-12345", licenceExpiryDate: "2030-02-28",
  mobileNumber: "+919876543210", lifecycleState: "active" as const,
};

describe("DriverRecordsService", () => {
  it("creates, reads, and updates one stable driver record by revision", async () => {
    const repository = new MemoryRepository();
    const service = new DriverRecordsService(repository, assertDriverRecordV1);
    const created = await service.create(driver, "web");
    expect(created).toMatchObject({ id: "feature:driver-records:driver:driver-001", revision: 1 });
    const updated = await service.update({
      driverId: driver.driverId, expectedRevision: 1,
      data: { ...driver, mobileNumber: "+919999999999" },
    });
    expect(updated.revision).toBe(2);
    expect((await service.get(driver.driverId))?.data.mobileNumber).toBe("+919999999999");
    expect(await service.list()).toHaveLength(1);
  });

  it("replays create and update receipts without duplicating or reapplying a mutation", async () => {
    const repository = new MemoryRepository();
    const service = new DriverRecordsService(repository, assertDriverRecordV1, () => "2026-11-19T08:00:00.000Z");
    const createOperation = { operationId: "driver-create-op", payloadFingerprint: "driver-create-payload" };
    const created = await service.create(driver, "web", createOperation, "2026-11-19T08:00:00.000Z");
    expect(await service.create(driver, "web", createOperation, "2026-11-19T09:00:00.000Z")).toEqual(created);

    const updatedData = { ...driver, mobileNumber: "+919999999999" };
    const updateOperation = { operationId: "driver-update-op", payloadFingerprint: "driver-update-payload" };
    const updated = await service.update({
      driverId: driver.driverId, expectedRevision: 1, data: updatedData,
      operation: updateOperation, now: "2026-11-19T08:30:00.000Z",
    });
    expect(await service.update({
      driverId: driver.driverId, expectedRevision: 1, data: updatedData,
      operation: updateOperation, now: "2026-11-19T09:30:00.000Z",
    })).toEqual(updated);
    expect(updated.revision).toBe(2);
    expect((await repository.list()).filter(row =>
      row.id.startsWith("__sam_travels_feature_operation__:"),
    )).toHaveLength(2);
    await expect(service.update({
      driverId: driver.driverId, expectedRevision: 1,
      data: { ...updatedData, name: "Changed payload" }, operation: updateOperation,
    })).rejects.toThrow("feature_record_operation_payload_conflict");
  });

  it("rejects duplicate driver identities and stale or mismatched updates", async () => {
    const service = new DriverRecordsService(new MemoryRepository(), assertDriverRecordV1);
    await service.create(driver, "web");
    await expect(service.create(driver, "android")).rejects.toThrow("feature_record_already_exists");
    await expect(service.update({
      driverId: driver.driverId, expectedRevision: 1,
      data: { ...driver, driverId: "driver-002" },
    })).rejects.toThrow("driver_identity_immutable");
    await expect(service.update({
      driverId: driver.driverId, expectedRevision: 0, data: driver,
    })).rejects.toThrow("feature_record_expected_revision_invalid");
  });
});
