import { describe, expect, it } from "vitest";
import { PerformanceTripRevenueAdapterV1 } from "../packages/application/src/performance-trip-revenue-adapter";
import type { RecordEnvelope } from "../packages/core/src/types";
import type { CancellationFeeObligation, CompletedTripFinancialObligation } from "../packages/application/src/trip-financial-service";

function envelope<T>(id: string, data: T, revision = 1): RecordEnvelope<T> {
  return {
    id, schemaVersion: 1, createdAt: "2026-04-05T10:00:00.000Z",
    updatedAt: "2026-04-05T10:00:00.000Z", businessDate: "2026-04-05",
    source: "web", revision, data,
  };
}

describe("Performance trip revenue adapter v1", () => {
  it("uses immutable operational dates for submitted fares and cancellation fees", async () => {
    const records = [
      envelope("work:trip-financial-obligation:trip-1", {
        schemaVersion: 1, tripId: "trip-1", kind: "completed_ride_financials",
        status: "submitted", endRideEventId: "end-1", createdAt: "2026-04-05T08:00:00.000Z",
        tripContext: { schemaVersion: 1, shiftId: "shift-1", driverId: "driver-1",
          assignmentId: "assignment-1", vehicleId: "vehicle-1", operationalDate: "2026-04-05" },
        farePaise: 12_500,
      } satisfies CompletedTripFinancialObligation, 3),
      envelope("work:trip-financial-obligation:trip-2", {
        schemaVersion: 1, tripId: "trip-2", kind: "cancellation_fee",
        status: "submitted", cancellationEventId: "cancel-2", createdAt: "2026-04-05T09:00:00.000Z",
        tripContext: { schemaVersion: 1, shiftId: "shift-2", driverId: "driver-1",
          assignmentId: "assignment-1", vehicleId: "vehicle-1", operationalDate: "2026-04-06" },
        feePaise: 750,
      } satisfies CancellationFeeObligation, 2),
    ];
    const adapter = new PerformanceTripRevenueAdapterV1({
      submittedTripFinancialRecords: async () => records,
    });
    await expect(adapter.listVerifiedDailyRevenue("2026-04-05", "2026-04-06")).resolves.toEqual([
      { date: "2026-04-05", grossFarePaise: 12_500, cancellationFeePaise: 0,
        verified: true, sourceRefs: [{ sourceId: records[0].id, revision: 3 }] },
      { date: "2026-04-06", grossFarePaise: 0, cancellationFeePaise: 750,
        verified: true, sourceRefs: [{ sourceId: records[1].id, revision: 2 }] },
    ]);
    await expect(adapter.getCompleteness("2026-04-05", "2026-04-06")).resolves.toEqual([
      { source: "trip-financials", status: "complete" },
    ]);
  });

  it("does not guess revenue attribution when legacy records lack trip context", async () => {
    const records = [envelope("work:trip-financial-obligation:legacy", {
      schemaVersion: 1, tripId: "legacy", kind: "completed_ride_financials",
      status: "submitted", endRideEventId: "end-legacy", createdAt: "2026-04-05T08:00:00.000Z",
      farePaise: 9_000,
    } satisfies CompletedTripFinancialObligation)];
    const adapter = new PerformanceTripRevenueAdapterV1({
      submittedTripFinancialRecords: async () => records,
    });
    await expect(adapter.listVerifiedDailyRevenue("2026-04-01", "2026-04-30")).resolves.toEqual([]);
    await expect(adapter.getCompleteness("2026-04-01", "2026-04-30")).resolves.toEqual([
      expect.objectContaining({ source: "trip-financials", status: "incomplete" }),
    ]);
  });
});
