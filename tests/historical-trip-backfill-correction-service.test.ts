import { describe, expect, it } from "vitest";
import type { AtomicRecordBatchRepository } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import { HistoricalTripBackfillCorrectionServiceV1 } from "../packages/application/src/historical-trip-backfill-correction-service";
import type { HistoricalTripBackfillV1 } from "../packages/domain/src/historical-trip-backfill";

class Records implements AtomicRecordBatchRepository {
  private rows = new Map<string, RecordEnvelope<unknown>>();
  async get<T>(id: string) { return this.rows.get(id) as RecordEnvelope<T> | undefined; }
  async put<T>(row: RecordEnvelope<T>) { this.rows.set(row.id, row as RecordEnvelope<unknown>); }
  async list<T>() { return [...this.rows.values()] as RecordEnvelope<T>[]; }
  async remove(id: string) { this.rows.delete(id); }
  async compareAndSet<T>(id: string, revision: number | null, next: RecordEnvelope<T>) {
    if ((this.rows.get(id)?.revision ?? null) !== revision) return false;
    this.rows.set(id, next as RecordEnvelope<unknown>); return true;
  }
  async compareAndSetMany(mutations: readonly { id: string; expectedRevision: number | null; next: RecordEnvelope<unknown> }[]) {
    if (mutations.some(row => (this.rows.get(row.id)?.revision ?? null) !== row.expectedRevision)) return false;
    mutations.forEach(row => this.rows.set(row.id, row.next)); return true;
  }
}

const at = "2026-11-10T08:00:00.000Z";
function source(): RecordEnvelope<HistoricalTripBackfillV1> {
  return {
    id: "historical-trip-backfill:paper-trip-1", schemaVersion: 1,
    createdAt: at, updatedAt: at, businessDate: "2026-11-10", source: "web", revision: 1,
    createdBy: { personId: "admin-1", role: "admin" },
    data: {
      schemaVersion: 1, kind: "historical_trip_backfill", backfillId: "paper-trip-1",
      status: "submitted", attribution: "admin_declared", driverId: "driver-1",
      vehicleId: "vehicle-1", operationalDate: "2026-11-10", startedAt: at,
      endedAt: "2026-11-10T08:30:00.000Z", farePaise: 10000, tollPaise: 500,
      tollPayer: "driver", reason: "Paper trip sheet", recordedAt: at,
      actor: { role: "admin", actorId: "admin-1" },
    },
  };
}

describe("historical trip backfill financial corrections", () => {
  it("corrects fare and driver-paid toll append-only and exposes correction provenance", async () => {
    const records = new Records(), original = source();
    await records.put(original);
    const corrections = new HistoricalTripBackfillCorrectionServiceV1(records, {
      currentActor: async () => ({ role: "admin", actorId: "admin-1", adminPinVerifiedAt: "2026-11-11T08:00:00.000Z" }),
    }, "web", () => "2026-11-11T08:01:00.000Z");

    const fare = await corrections.submit({
      correctionId: "backfill-fare-fix", targetRecordId: original.id,
      expectedTargetRevision: 1, expectedChainRevision: 0, fieldPath: "farePaise",
      afterValue: 12500, reason: "Corrected from customer receipt", businessEffectiveDate: "2026-11-10",
    });
    expect((fare.currentData as HistoricalTripBackfillV1).farePaise).toBe(12500);
    const toll = await corrections.submit({
      correctionId: "backfill-toll-fix", targetRecordId: original.id,
      expectedTargetRevision: 1, expectedChainRevision: 1, fieldPath: "tollPaise",
      afterValue: 800, reason: "Corrected from toll receipt", businessEffectiveDate: "2026-11-10",
    });
    expect((toll.currentData as HistoricalTripBackfillV1).tollPaise).toBe(800);

    const projected = await corrections.project(original);
    expect(projected.data).toMatchObject({ farePaise: 12500, tollPaise: 800, tollPayer: "driver" });
    expect(projected.correctionChainRevision).toBe(2);
    expect(projected.correctionRefs.map(ref => ref.sourceId)).toEqual([
      "historical-correction:backfill-fare-fix", "historical-correction:backfill-toll-fix",
    ]);
    expect((await records.get<HistoricalTripBackfillV1>(original.id))?.data.farePaise).toBe(10000);
    expect((await records.get<HistoricalTripBackfillV1>(original.id))?.data.tollPaise).toBe(500);
  });

  it("rejects edits to historical identity, operational date and fabricated Work evidence", async () => {
    const records = new Records(), original = source(); await records.put(original);
    const corrections = new HistoricalTripBackfillCorrectionServiceV1(records, {
      currentActor: async () => ({ role: "admin", actorId: "admin-1", adminPinVerifiedAt: "2026-11-11T08:00:00.000Z" }),
    });
    await expect(corrections.submit({
      correctionId: "vehicle-change", targetRecordId: original.id, expectedTargetRevision: 1,
      expectedChainRevision: 0, fieldPath: "vehicleId", afterValue: "vehicle-2", reason: "Wrong vehicle",
    })).rejects.toThrow("historical_correction_field_not_allowed");
    await expect(corrections.submit({
      correctionId: "event-fabrication", targetRecordId: original.id, expectedTargetRevision: 1,
      expectedChainRevision: 0, fieldPath: "farePaise", afterValue: 11000, reason: "Correction",
    }).then(() => corrections.submit({
      correctionId: "gps-change", targetRecordId: original.id, expectedTargetRevision: 1,
      expectedChainRevision: 1, fieldPath: "tripContext", afterValue: {}, reason: "No",
    }))).rejects.toThrow();
  });

  it("requires verified Admin authority and rejects stale correction chains", async () => {
    const records = new Records(), original = source(); await records.put(original);
    const unverified = new HistoricalTripBackfillCorrectionServiceV1(records, {
      currentActor: async () => ({ role: "admin", actorId: "admin-1" }),
    });
    await expect(unverified.submit({
      correctionId: "unverified", targetRecordId: original.id, expectedTargetRevision: 1,
      expectedChainRevision: 0, fieldPath: "farePaise", afterValue: 11000, reason: "Correction",
    })).rejects.toThrow("historical_correction_actor_required");

    const valid = new HistoricalTripBackfillCorrectionServiceV1(records, {
      currentActor: async () => ({ role: "admin", actorId: "admin-1", adminPinVerifiedAt: "2026-11-11T08:00:00.000Z" }),
    });
    await valid.submit({
      correctionId: "first", targetRecordId: original.id, expectedTargetRevision: 1,
      expectedChainRevision: 0, fieldPath: "farePaise", afterValue: 11000, reason: "Correction",
    });
    await expect(valid.submit({
      correctionId: "stale", targetRecordId: original.id, expectedTargetRevision: 1,
      expectedChainRevision: 0, fieldPath: "farePaise", afterValue: 12000, reason: "Stale correction",
    })).rejects.toThrow("historical_correction_stale_chain");
  });
});
