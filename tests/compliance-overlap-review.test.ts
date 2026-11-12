import { describe, expect, it } from "vitest";
import type { AtomicRecordBatchRepository, AtomicRecordMutation } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import {
  resolveComplianceOverlapReview,
  type ComplianceRecordV1,
} from "../packages/features/compliance";
import { ComplianceOverlapReviewService } from "../packages/features/compliance";

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
      if (mutation.expectedRevision === null ? current !== undefined : current?.revision !== mutation.expectedRevision) {
        return false;
      }
    }
    for (const mutation of mutations) this.rows.set(mutation.id, mutation.next);
    return true;
  }
}

const firstId = "feature:compliance:123e4567-e89b-42d3-a456-426614174000";
const secondId = "feature:compliance:123e4567-e89b-42d3-a456-426614174001";
const vehicleId = "feature:vehicle:MH01AB1234";
const first: ComplianceRecordV1 = {
  schemaVersion: 1, vehicleId, complianceName: "Insurance",
  validFrom: "2024-01-01", validTo: "2024-01-15", totalCostPaise: 1500,
};
const second: ComplianceRecordV1 = {
  ...first, validFrom: "2024-01-10", validTo: "2024-01-20", totalCostPaise: 2200,
};

function setup() {
  const repository = new MemoryRepository();
  const timestamp = "2024-01-01T00:00:00.000Z";
  for (const [id, data] of [[firstId, first], [secondId, second]] as const) {
    void repository.put({
      id, schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
      source: "web", revision: 1, data,
    });
  }
  const service = new ComplianceOverlapReviewService(
    repository,
    { async currentActor() { return { actorId: "admin-1", role: "admin" as const }; } },
    "web",
    () => "2024-01-21T12:00:00.000Z",
  );
  return { repository, service };
}

describe("Compliance overlap review persistence", () => {
  it("records an attributed immutable confirmation scoped to exact source revisions", async () => {
    const { service } = setup();
    const event = await service.recordDecision({
      uuid: "123e4567-e89b-42d3-a456-426614174010",
      firstRecordId: firstId, secondRecordId: secondId,
      from: "2024-01-10", to: "2024-01-15",
      decision: "confirmed", rationale: "Two distinct active insurance policies.",
    });
    expect(event).toMatchObject({
      decision: "confirmed", decisionRevision: 1,
      actor: { actorId: "admin-1", role: "admin" },
      sourceRecords: [
        { recordId: firstId, recordRevision: 1 },
        { recordId: secondId, recordRevision: 1 },
      ],
    });
    const reviews = await service.list();
    expect(reviews).toHaveLength(1);
    expect(resolveComplianceOverlapReview(
      [{ recordId: firstId, recordRevision: 1 }, { recordId: secondId, recordRevision: 1 }],
      "2024-01-10", "2024-01-15", reviews,
    )).toBe("confirmed");
  });

  it("appends a later decision instead of mutating the prior review", async () => {
    const { service } = setup();
    const firstEvent = await service.recordDecision({
      uuid: "123e4567-e89b-42d3-a456-426614174010",
      firstRecordId: firstId, secondRecordId: secondId,
      from: "2024-01-10", to: "2024-01-15",
      decision: "confirmed", rationale: "Initial review.",
    });
    const secondEvent = await service.recordDecision({
      uuid: "123e4567-e89b-42d3-a456-426614174011",
      firstRecordId: firstId, secondRecordId: secondId,
      from: "2024-01-10", to: "2024-01-15",
      decision: "rejected", rationale: "Evidence was insufficient.",
    });
    expect(secondEvent.decisionRevision).toBe(2);
    expect(secondEvent.supersedesEventId).toBe(firstEvent.eventId);
    expect(await service.list()).toHaveLength(2);
    expect(resolveComplianceOverlapReview(
      [{ recordId: firstId, recordRevision: 1 }, { recordId: secondId, recordRevision: 1 }],
      "2024-01-10", "2024-01-15", await service.list(),
    )).toBe("rejected");
  });

  it("rejects a review scope that does not match the actual intersection", async () => {
    const { service } = setup();
    await expect(service.recordDecision({
      uuid: "123e4567-e89b-42d3-a456-426614174010",
      firstRecordId: firstId, secondRecordId: secondId,
      from: "2024-01-11", to: "2024-01-15",
      decision: "confirmed", rationale: "Wrong dates.",
    })).rejects.toThrow("compliance_overlap_review_scope_mismatch");
  });
});
