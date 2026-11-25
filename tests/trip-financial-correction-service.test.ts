import { describe, expect, it } from "vitest";
import type { AtomicRecordBatchRepository } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import { TripFinancialCorrectionServiceV1 } from "../packages/application/src/trip-financial-correction-service";
import { TripFinancialService, type CompletedTripFinancialObligation } from "../packages/application/src/trip-financial-service";
import { PerformanceTripRevenueAdapterV1 } from "../packages/application/src/performance-trip-revenue-adapter";

class Records implements AtomicRecordBatchRepository {
  private rows = new Map<string, RecordEnvelope<unknown>>();
  async get<T>(id: string) { return this.rows.get(id) as RecordEnvelope<T> | undefined; }
  async put<T>(row: RecordEnvelope<T>) { this.rows.set(row.id, row as RecordEnvelope<unknown>); }
  async list<T>() { return [...this.rows.values()] as RecordEnvelope<T>[]; }
  async remove(id: string) { this.rows.delete(id); }
  async compareAndSet<T>(id: string, revision: number | null, next: RecordEnvelope<T>) {
    if ((this.rows.get(id)?.revision ?? null) !== revision) return false;
    this.rows.set(id, next as RecordEnvelope<unknown>);
    return true;
  }
  async compareAndSetMany(mutations: readonly { id: string; expectedRevision: number | null; next: RecordEnvelope<unknown> }[]) {
    if (mutations.some(item => (this.rows.get(item.id)?.revision ?? null) !== item.expectedRevision)) return false;
    for (const item of mutations) this.rows.set(item.id, item.next);
    return true;
  }
}

const at = "2026-11-10T01:00:00.000Z";
function sourceRecord(): RecordEnvelope<CompletedTripFinancialObligation> {
  return {
    id: "work:trip-financial-obligation:trip-correct",
    schemaVersion: 1, createdAt: at, updatedAt: at, source: "web", revision: 2,
    createdBy: { personId: "driver-person", role: "driver" },
    data: {
      schemaVersion: 1, tripId: "trip-correct", kind: "completed_ride_financials",
      status: "submitted", endRideEventId: "immutable-end-event", createdAt: at,
      tripContext: { schemaVersion: 1, shiftId: "shift-1", driverId: "driver-1",
        assignmentId: "assignment-1", vehicleId: "vehicle-1", operationalDate: "2026-11-10" },
      farePaise: 10000, tollPaise: 500, tollPayer: "driver",
      operationId: "submit-1", submittedAt: at,
    },
  };
}

describe("trip financial append-only corrections", () => {
  it("projects a corrected Fare while preserving the submitted obligation and Work event", async () => {
    const records = new Records();
    const original = sourceRecord();
    await records.put(original);
    const service = new TripFinancialCorrectionServiceV1(records, {
      currentActor: async () => ({ role: "driver", actorId: "driver-person" }),
    }, "web", () => "2026-11-11T01:00:00.000Z");

    const submitted = await service.submit({
      correctionId: "fare-correction-1",
      targetRecordId: original.id,
      expectedTargetRevision: 2,
      expectedChainRevision: 0,
      fieldPath: "farePaise",
      afterValue: 12500,
      reason: "Correct fare transcribed from the trip receipt",
      businessEffectiveDate: "2026-11-10",
    });
    expect(submitted.currentData as CompletedTripFinancialObligation).toMatchObject({ farePaise: 12500, endRideEventId: "immutable-end-event" });
    expect((await records.get<CompletedTripFinancialObligation>(original.id))?.data.farePaise).toBe(10000);
    expect((await records.get<CompletedTripFinancialObligation>(original.id))?.data.tripContext).toEqual(original.data.tripContext);

    const projected = await service.project(original);
    expect((projected.data as CompletedTripFinancialObligation).farePaise).toBe(12500);
    expect(projected.correctionChainRevision).toBe(1);
    expect(projected.correctionRefs).toHaveLength(1);
    expect(projected.correctionRefs[0]).toMatchObject({ sourceId: "historical-correction:fare-correction-1", revision: 1, chainRevision: 1 });
  });

  it("rejects edits to immutable Work, GPS, odometer and trip-context lineage", async () => {
    const records = new Records();
    const original = sourceRecord();
    await records.put(original);
    const service = new TripFinancialCorrectionServiceV1(records, {
      currentActor: async () => ({ role: "driver", actorId: "driver-person" }),
    });
    await expect(service.submit({
      correctionId: "context-correction",
      targetRecordId: original.id, expectedTargetRevision: 2, expectedChainRevision: 0,
      fieldPath: "tripContext.vehicleId", afterValue: "vehicle-2", reason: "Wrong vehicle",
    })).rejects.toThrow("historical_correction_field_not_allowed");
  });

  it("enforces self-only Driver authority and validates the complete projected fare/toll/payer set", async () => {
    const records = new Records();
    const original = sourceRecord();
    await records.put(original);
    const otherDriver = new TripFinancialCorrectionServiceV1(records, {
      currentActor: async () => ({ role: "driver", actorId: "another-driver" }),
    });
    await expect(otherDriver.submit({
      correctionId: "forbidden-fare-correction", targetRecordId: original.id,
      expectedTargetRevision: 2, expectedChainRevision: 0,
      fieldPath: "farePaise", afterValue: 12000, reason: "Attempted correction",
    })).rejects.toThrow("historical_correction_forbidden");

    const owner = new TripFinancialCorrectionServiceV1(records, {
      currentActor: async () => ({ role: "driver", actorId: "driver-person" }),
    });
    await expect(owner.submit({
      correctionId: "invalid-toll-correction", targetRecordId: original.id,
      expectedTargetRevision: 2, expectedChainRevision: 0,
      fieldPath: "tollPayer", afterValue: "operator", reason: "Invalid payer",
    })).rejects.toThrow("trip_financial_correction_projection_invalid");
  });


  it("refreshes the production daily-revenue projection and provenance after a fare correction", async () => {
    const records = new Records();
    const original = sourceRecord();
    await records.put(original);
    const corrections = new TripFinancialCorrectionServiceV1(records, {
      currentActor: async () => ({ role: "driver", actorId: "driver-person" }),
    }, "web", () => "2026-11-11T01:00:00.000Z");
    await corrections.submit({
      correctionId: "fare-correction-revenue",
      targetRecordId: original.id, expectedTargetRevision: 2, expectedChainRevision: 0,
      fieldPath: "farePaise", afterValue: 17500, reason: "Correct fare from receipt",
      businessEffectiveDate: "2026-11-10",
    });
    const financials = new TripFinancialService(records, "web", undefined, undefined, corrections);
    const revenue = new PerformanceTripRevenueAdapterV1(financials);
    const rows = await revenue.listVerifiedDailyRevenue("2026-11-10", "2026-11-10");
    expect(rows).toEqual([expect.objectContaining({
      date: "2026-11-10", grossFarePaise: 17500, cancellationFeePaise: 0, verified: true,
      sourceRefs: [
        { sourceId: original.id, revision: 2 },
        { sourceId: "historical-correction:fare-correction-revenue", revision: 1 },
      ],
    })]);
    expect(await revenue.getSourceSnapshotIdentity()).toContain("historical-correction:fare-correction-revenue@1");
  });

  it("rejects a stale chain revision rather than applying competing corrections", async () => {
    const records = new Records();
    const original = sourceRecord();
    await records.put(original);
    const service = new TripFinancialCorrectionServiceV1(records, {
      currentActor: async () => ({ role: "driver", actorId: "driver-person" }),
    });
    await service.submit({
      correctionId: "fare-correction-first", targetRecordId: original.id,
      expectedTargetRevision: 2, expectedChainRevision: 0,
      fieldPath: "farePaise", afterValue: 11000, reason: "First correction",
    });
    await expect(service.submit({
      correctionId: "fare-correction-stale", targetRecordId: original.id,
      expectedTargetRevision: 2, expectedChainRevision: 0,
      fieldPath: "farePaise", afterValue: 12000, reason: "Stale competing correction",
    })).rejects.toThrow("historical_correction_stale_chain");
  });
});
