import { describe, expect, it } from "vitest";
import type { AtomicRecordRepository } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import {
  cancellationFeeObligationId,
  TripFinancialService,
  type CancellationFeeObligation,
} from "../packages/application/src/trip-financial-service";

class MemoryRecords implements AtomicRecordRepository {
  private rows = new Map<string, RecordEnvelope<unknown>>();
  async get<T>(id: string) { return this.rows.get(id) as RecordEnvelope<T> | undefined; }
  async put<T>(row: RecordEnvelope<T>) { this.rows.set(row.id, row as RecordEnvelope<unknown>); }
  async list<T>() { return [...this.rows.values()] as RecordEnvelope<T>[]; }
  async remove(id: string) { this.rows.delete(id); }
  async compareAndSet<T>(id: string, expectedRevision: number | null, next: RecordEnvelope<T>) {
    const current = this.rows.get(id);
    if ((current?.revision ?? null) !== expectedRevision) return false;
    this.rows.set(id, next as RecordEnvelope<unknown>);
    return true;
  }
}

function obligation(tripId: string): RecordEnvelope<CancellationFeeObligation> {
  return {
    id: cancellationFeeObligationId(tripId), schemaVersion: 1,
    createdAt: "2026-11-10T00:00:00.000Z", updatedAt: "2026-11-10T00:00:00.000Z",
    source: "integration", revision: 1,
    data: { schemaVersion: 1, tripId, kind: "cancellation_fee", status: "pending",
      cancellationEventId: "cancel_123", createdAt: "2026-11-10T00:00:00.000Z" },
  };
}

describe("TripFinancialService cancellation fee closeout", () => {
  it("commits explicit zero and replays the same operation idempotently", async () => {
    const records = new MemoryRecords();
    await records.put(obligation("trip_123"));
    const service = new TripFinancialService(records, "web", () => "2026-11-10T01:00:00.000Z");
    const first = await service.submitCancellationFee("trip_123", 0, "operation_123");
    const replay = await service.submitCancellationFee("trip_123", 0, "operation_123");
    expect(first.data).toMatchObject({ status: "submitted", feePaise: 0, operationId: "operation_123" });
    expect(replay.revision).toBe(first.revision);
    expect(await service.pendingCancellationFees()).toHaveLength(0);
  });

  it("rejects a missing obligation, negative amounts and a conflicting replay", async () => {
    const records = new MemoryRecords();
    const service = new TripFinancialService(records, "web");
    await expect(service.submitCancellationFee("trip_123", 0, "operation_123"))
      .rejects.toThrow("cancellation_fee_obligation_missing");
    await records.put(obligation("trip_123"));
    await expect(service.submitCancellationFee("trip_123", -1, "operation_123"))
      .rejects.toThrow("cancellation_fee_must_be_non_negative_integer_paise");
    await service.submitCancellationFee("trip_123", 0, "operation_123");
    await expect(service.submitCancellationFee("trip_123", 100, "operation_456"))
      .rejects.toThrow("cancellation_fee_already_submitted");
  });
});
