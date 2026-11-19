import { describe, expect, it } from "vitest";
import type { AtomicRecordRepository } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import {
  TripFinancialService, cancellationFeeObligationId, calculateTripFinancialSummary,
  submitCompletedTripFinancials, type CompletedTripFinancialObligation,
} from "../packages/application/src/trip-financial-service";
import { PerformanceTripRevenueAdapterV1 } from "../packages/application/src/performance-trip-revenue-adapter";
import { FullCostBreakevenService } from "../packages/application/src/full-cost-breakeven-service";

class MemoryRecords implements AtomicRecordRepository {
  private rows = new Map<string, RecordEnvelope<unknown>>();
  async get<T>(id: string) { return this.rows.get(id) as RecordEnvelope<T> | undefined; }
  async put<T>(row: RecordEnvelope<T>) { this.rows.set(row.id, row as RecordEnvelope<unknown>); }
  async list<T>() { return [...this.rows.values()] as RecordEnvelope<T>[]; }
  async remove(id: string) { this.rows.delete(id); }
  async compareAndSet<T>(id: string, expectedRevision: number | null, next: RecordEnvelope<T>) {
    if ((this.rows.get(id)?.revision ?? null) !== expectedRevision) return false;
    this.rows.set(id, next as RecordEnvelope<unknown>);
    return true;
  }
}

describe("completed trip financial end-to-end read models", () => {
  it("publishes submitted Fare as gross revenue and driver-paid Toll/Parking as full-cost expenses", async () => {
    const records = new MemoryRecords();
    const tripId = "trip-downstream-1";
    const vehicleId = "feature:vehicle:MH01AB1234";
    const at = "2026-11-10T12:00:00.000Z";
    const obligation: RecordEnvelope<CompletedTripFinancialObligation> = {
      id: cancellationFeeObligationId(tripId), schemaVersion: 1,
      createdAt: at, updatedAt: at, source: "integration", revision: 1,
      data: {
        schemaVersion: 1, tripId, kind: "completed_ride_financials", status: "pending",
        endRideEventId: "end-ride-downstream-1", createdAt: at,
        tripContext: {
          schemaVersion: 1, shiftId: "shift-downstream-1", driverId: "driver-1",
          assignmentId: "assignment-1", vehicleId, operationalDate: "2026-11-10",
        },
      },
    };
    await records.put(obligation);
    const submitted = await submitCompletedTripFinancials(
      records, "web", tripId,
      { farePaise: 252_000, tollPaise: 32_000, tollPayer: "driver",
        parkingPaise: 25_000, parkingPayer: "driver" },
      "trip-downstream-submit", () => at,
    );
    expect(submitted.revision).toBe(2);
    expect(calculateTripFinancialSummary(submitted.data)).toEqual({
      customerChargePaise: 252_000, driverExpensesPaise: 57_000,
      netTripEarningsBeforeFuelPaise: 195_000,
    });

    const revenue = new PerformanceTripRevenueAdapterV1({
      submittedTripFinancialRecords: () => new TripFinancialService(records, "web").submittedTripFinancialRecords(),
    });
    await expect(revenue.listVerifiedDailyRevenue("2026-11-10", "2026-11-10")).resolves.toEqual([{
      date: "2026-11-10", grossFarePaise: 252_000, cancellationFeePaise: 0,
      verified: true, sourceRefs: [{ sourceId: obligation.id, revision: 2 }],
    }]);

    const breakeven = new FullCostBreakevenService(
      { list: async () => [{ id: vehicleId, revision: 1 }] } as never,
      { listVehicleRecords: async () => ({
        accruals: [], visits: [], expenses: [], rateHistory: [],
      }) } as never,
      {
        listExpenseEntries: async () => [],
        listDailyExpenseOutputs: async () => [],
        listFuelPurchases: async () => [],
        listFuelCostRateHistory: async () => [],
      } as never,
      { getReport: async () => ({
        businessStartDate: "2026-01-01", businessSettingsRevision: 1,
        result: { sources: [] },
      }) } as never,
      new TripFinancialService(records, "web"),
      records,
    );
    const projection = await breakeven.getSourceProjection("2026-11-10", "2026-11-10");
    expect(projection.datedCosts).toContainEqual(expect.objectContaining({
      date: "2026-11-10", amountPaise: 57_000, kind: "miscellaneous",
      sourceId: obligation.id, sourceRevision: 2,
      sourceRefs: [{ sourceId: obligation.id, revision: 2 }],
    }));
  });
});
