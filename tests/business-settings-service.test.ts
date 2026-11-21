import { describe, expect, it } from "vitest";
import type { AtomicRecordBatchRepository, AtomicRecordMutation } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import { assertBusinessSettingsRecordV1 } from "../packages/features/business-settings";
import {
  BUSINESS_SETTINGS_RECORD_ID,
  BusinessSettingsService,
} from "../packages/application/src/business-settings-service";

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

describe("BusinessSettingsService", () => {
  it("uses one stable business-wide record and updates it by revision", async () => {
    const repository = new MemoryRepository();
    let tick = 0;
    const service = new BusinessSettingsService(repository, assertBusinessSettingsRecordV1, () => `2026-11-07T00:00:0${tick++}.000Z`);
    expect(await service.get()).toBeUndefined();

    const created = await service.setBusinessStartDate("2020-01-15", "web");
    expect(created).toMatchObject({
      id: BUSINESS_SETTINGS_RECORD_ID,
      revision: 1,
      data: { schemaVersion: 1, businessStartDate: "2020-01-15" },
    });

    const updated = await service.setBusinessStartDate("2021-02-16", "android");
    expect(updated).toMatchObject({
      id: BUSINESS_SETTINGS_RECORD_ID,
      revision: 2,
      createdAt: created.createdAt,
      source: "web",
      data: { schemaVersion: 1, businessStartDate: "2021-02-16" },
    });
    expect(await repository.list()).toHaveLength(1);
  });

  it("replays Business Start Date create and update receipts after interrupted completion", async () => {
    const repository = new MemoryRepository();
    const service = new BusinessSettingsService(repository, assertBusinessSettingsRecordV1);
    const createOperation = { operationId: "business-start-create", payloadFingerprint: "start-date-2026-01-01" };
    const created = await service.setBusinessStartDate("2026-01-01", "web", createOperation, "2026-11-19T08:00:00.000Z");
    expect(await service.setBusinessStartDate("2026-01-01", "web", createOperation, "2026-11-19T09:00:00.000Z")).toEqual(created);
    const updateOperation = { operationId: "business-start-update", payloadFingerprint: "start-date-2026-02-01" };
    const updated = await service.setBusinessStartDate("2026-02-01", "web", updateOperation, "2026-11-19T08:30:00.000Z");
    expect(await service.setBusinessStartDate("2026-02-01", "web", updateOperation, "2026-11-19T09:30:00.000Z")).toEqual(updated);
    expect(updated.revision).toBe(2);
    expect((await repository.list()).filter(row => row.id.startsWith("__sam_travels_feature_operation__:"))).toHaveLength(2);
    await expect(service.setBusinessStartDate("2026-03-01", "web", updateOperation))
      .rejects.toThrow("feature_record_operation_payload_conflict");
  });

  it("rejects invalid calendar dates without writing", async () => {
    const repository = new MemoryRepository();
    const service = new BusinessSettingsService(repository, assertBusinessSettingsRecordV1);
    await expect(service.setBusinessStartDate("2025-02-29", "web")).rejects.toThrow("business_settings_record_invalid");
    expect(await repository.list()).toHaveLength(0);
  });
});
