import { describe, expect, it } from "vitest";
import type { AtomicRecordRepository } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import {
  cancellationFeeObligationId,
  TripFinancialService,
  type CancellationFeeObligation,
  submitCompletedTripFinancials,
  type CompletedTripFinancialObligation,
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

function completedObligation(tripId: string): RecordEnvelope<CompletedTripFinancialObligation> {
  return {
    id: cancellationFeeObligationId(tripId), schemaVersion: 1,
    createdAt: "2026-11-10T00:00:00.000Z", updatedAt: "2026-11-10T00:00:00.000Z",
    source: "integration", revision: 1,
    data: { schemaVersion: 1, tripId, kind: "completed_ride_financials", status: "pending",
      endRideEventId: "end_ride_123", createdAt: "2026-11-10T00:00:00.000Z" },
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

  it("persists the active person as author on submitted cancellation fees", async () => {
    const records = new MemoryRecords();
    await records.put(obligation("trip_author"));
    const service = new TripFinancialService(records, "web", () => "2026-11-10T01:00:00.000Z",
      async () => ({ personId: "person-driver-1", role: "driver" }));
    const submitted = await service.submitCancellationFee("trip_author", 2500, "operation_author");
    expect(submitted.createdBy).toEqual({ personId: "person-driver-1", role: "driver" });
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

  it("accepts concurrent PWA and Android replay of the same cancellation-fee operation", async () => {
    const records = new MemoryRecords();
    await records.put(obligation("trip_cancel_same"));
    const pwa = new TripFinancialService(records, "web");
    const android = new TripFinancialService(records, "android");
    const results = await Promise.all([
      pwa.submitCancellationFee("trip_cancel_same", 0, "cancel_same_operation"),
      android.submitCancellationFee("trip_cancel_same", 0, "cancel_same_operation"),
    ]);
    expect(results.map(result => result.revision)).toEqual([2, 2]);
    expect(results[0].data).toMatchObject({
      status: "submitted", feePaise: 0, operationId: "cancel_same_operation",
    });
  });

  it("rejects competing PWA and Android cancellation-fee submissions without overwriting", async () => {
    const records = new MemoryRecords();
    await records.put(obligation("trip_cancel_competing"));
    const pwa = new TripFinancialService(records, "web");
    const android = new TripFinancialService(records, "android");
    const outcomes = await Promise.allSettled([
      pwa.submitCancellationFee("trip_cancel_competing", 12500, "cancel_pwa"),
      android.submitCancellationFee("trip_cancel_competing", 25000, "cancel_android"),
    ]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(result => result.status === "rejected")).toHaveLength(1);
    const stored = await records.get<CancellationFeeObligation>(
      cancellationFeeObligationId("trip_cancel_competing"),
    );
    expect(stored?.revision).toBe(2);
    expect(stored?.data.status).toBe("submitted");
    expect(["cancel_pwa", "cancel_android"]).toContain(stored?.data.operationId);
    expect([12500, 25000]).toContain(stored?.data.feePaise);
  });

describe("completed-trip financial concurrent submission", () => {
  const values = { farePaise: 12345, tollPaise: 500, tollPayer: "customer" as const };

  it("persists the active person as author on submitted completed-trip financials", async () => {
    const records = new MemoryRecords();
    await records.put(completedObligation("trip_completed_author"));
    const submitted = await submitCompletedTripFinancials(
      records, "web", "trip_completed_author", values, "operation_author",
      () => "2026-11-10T01:00:00.000Z", { personId: "person-driver-1", role: "driver" },
    );
    expect(submitted.createdBy).toEqual({ personId: "person-driver-1", role: "driver" });
  });

  it("accepts concurrent replay of the same operation and payload", async () => {
    const records = new MemoryRecords();
    await records.put(completedObligation("trip_completed_1"));
    const submit = () => submitCompletedTripFinancials(records, "web", "trip_completed_1", values, "operation_same");
    const results = await Promise.all([submit(), submit()]);
    expect(results[0].revision).toBe(2);
    expect(results[1].revision).toBe(2);
    expect(results[0].data).toMatchObject({ status: "submitted", operationId: "operation_same", farePaise: 12345 });
  });

  it("rejects a competing PWA and Android operation instead of overwriting the first submission", async () => {
    const records = new MemoryRecords();
    await records.put(completedObligation("trip_completed_2"));
    const outcomes = await Promise.allSettled([
      submitCompletedTripFinancials(records, "web", "trip_completed_2", values, "operation_pwa"),
      submitCompletedTripFinancials(records, "android", "trip_completed_2", { ...values, farePaise: 99999 }, "operation_android"),
    ]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(result => result.status === "rejected")).toHaveLength(1);
    const stored = await records.get<CompletedTripFinancialObligation>(cancellationFeeObligationId("trip_completed_2"));
    expect(stored?.revision).toBe(2);
    expect(stored?.data.status).toBe("submitted");
    expect(stored?.data.farePaise).toBe(12345);
  });
});
