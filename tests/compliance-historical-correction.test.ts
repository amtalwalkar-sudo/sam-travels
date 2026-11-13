import { describe, expect, it } from "vitest";
import type { AtomicRecordBatchRepository } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import { createComplianceHistoricalCorrectionService } from "../apps/web/src/compliance-historical-correction";

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
  async compareAndSetMany(mutations: readonly { id: string; expectedRevision: number | null; next: RecordEnvelope<unknown> }[]) {
    if (mutations.some(item => {
      const current = this.rows.get(item.id);
      return item.expectedRevision === null ? current !== undefined : current?.revision !== item.expectedRevision;
    })) return false;
    mutations.forEach(item => this.rows.set(item.id, item.next));
    return true;
  }
}

const targetId = "feature:compliance:123e4567-e89b-42d3-a456-426614174000";
const timestamp = "2026-11-07T00:00:00.000Z";
const originalData = {
  schemaVersion: 1 as const, vehicleId: "feature:vehicle:MH01AB1234",
  complianceName: "Insurance", validFrom: "2026-01-01", validTo: "2026-12-31",
  totalCostPaise: 365000,
};

function setup() {
  const repository = new MemoryRepository();
  const original: RecordEnvelope<typeof originalData> = {
    id: targetId, schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
    source: "web", revision: 1, createdBy: { personId: "admin-1", role: "admin" },
    data: originalData,
  };
  repository.put(original);
  const service = createComplianceHistoricalCorrectionService(repository, {
    async currentActor() {
      return { role: "admin" as const, actorId: "admin-1", adminPinVerifiedAt: timestamp };
    },
  }, "web", () => timestamp);
  return { repository, service, original };
}

describe("Compliance historical correction policy", () => {
  it("projects an approved field correction without rewriting the source record", async () => {
    const { repository, service, original } = setup();
    const result = await service.submit({
      correctionId: "correction-1", targetRecordId: targetId,
      expectedTargetRevision: 1, expectedChainRevision: 0,
      fieldPath: "totalCostPaise", afterValue: 366000,
      reason: "Corrected from the original receipt.",
      businessEffectiveDate: "2026-01-01",
    });
    expect(result.currentData).toMatchObject({ totalCostPaise: 366000 });
    expect(result.chainRevision).toBe(1);
    expect((await repository.get(targetId))?.data).toEqual(original.data);
    expect((await repository.get("historical-correction:correction-1"))?.data)
      .toMatchObject({ featureId: "compliance", fieldPath: "totalCostPaise" });
  });

  it("rejects changes to vehicle identity and renewal linkage", async () => {
    const { service } = setup();
    await expect(service.submit({
      correctionId: "correction-2", targetRecordId: targetId,
      expectedTargetRevision: 1, expectedChainRevision: 0,
      fieldPath: "vehicleId", afterValue: "feature:vehicle:MH02CD5678",
      reason: "Attempted identity reassignment.",
    })).rejects.toThrow("historical_correction_field_not_allowed");
    await expect(service.submit({
      correctionId: "correction-3", targetRecordId: targetId,
      expectedTargetRevision: 1, expectedChainRevision: 0,
      fieldPath: "renewedFromRecordId", afterValue: "feature:compliance:123e4567-e89b-42d3-a456-426614174001",
      reason: "Attempted renewal relink.",
    })).rejects.toThrow("historical_correction_field_not_allowed");
  });
});
