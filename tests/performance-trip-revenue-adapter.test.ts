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

  it("uses the captured operational date on either side of the 04:00 boundary", async () => {
    const records = [
      envelope("work:trip-financial-obligation:before-0400", {
        schemaVersion: 1, tripId: "before-0400", kind: "completed_ride_financials",
        status: "submitted", endRideEventId: "end-before", createdAt: "2026-04-06T03:59:59.000Z",
        tripContext: { schemaVersion: 1, shiftId: "shift-before", driverId: "driver-1",
          assignmentId: "assignment-1", vehicleId: "vehicle-1", operationalDate: "2026-04-05" },
        farePaise: 1_000,
      } satisfies CompletedTripFinancialObligation),
      envelope("work:trip-financial-obligation:at-0400", {
        schemaVersion: 1, tripId: "at-0400", kind: "completed_ride_financials",
        status: "submitted", endRideEventId: "end-at", createdAt: "2026-04-06T04:00:00.000Z",
        tripContext: { schemaVersion: 1, shiftId: "shift-after", driverId: "driver-1",
          assignmentId: "assignment-1", vehicleId: "vehicle-1", operationalDate: "2026-04-06" },
        farePaise: 2_000,
      } satisfies CompletedTripFinancialObligation),
    ];
    const adapter = new PerformanceTripRevenueAdapterV1({
      submittedTripFinancialRecords: async () => records,
    });
    const result = await adapter.listVerifiedDailyRevenue("2026-04-05", "2026-04-06");
    expect(result.map(row => [row.date, row.grossFarePaise])).toEqual([
      ["2026-04-05", 1_000], ["2026-04-06", 2_000],
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
