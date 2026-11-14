import { describe, expect, it } from "vitest";
import { FullCostBreakevenService } from "../packages/application/src/full-cost-breakeven-service";

describe("FullCostBreakevenService source integration", () => {
  it("joins per-vehicle fuel rates, maintenance accruals, dated expenses and annual allocation rows", async () => {
    const vehicleId = "feature:vehicle:MH01AB1234";
    const accrual = {
      id: "maintenance-accrual-1", revision: 2,
      data: { operationalDate: "2026-11-01", businessKm: 100, amountPaise: 2000,
        dailyBusinessKmRecordId: "work:daily-business-km:vehicle:2026-11-01", dailyBusinessKmRevision: 4 },
    };
    const fuelPurchase = { id: "fuel-purchase-1", data: { kind: "fuel_purchase", vehicleId } };
    const service = new FullCostBreakevenService(
      { list: async () => [{ id: vehicleId }] } as never,
      { listVehicleRecords: async () => ({ accruals: [accrual], visits: [], expenses: [], rateHistory: [], rateHistoryRecord: { id: "maintenance-rate-history-1", revision: 3 } }) } as never,
      {
        listExpenseEntries: async () => [{
          id: "platform-fee-1", revision: 1,
          data: { sourceKind: "platform_fee", businessDate: "2026-11-01", amountPaise: 100,
            effect: "charge", alreadyNettedFromIncome: false },
        }, {
          id: "unpaid-challan-1", revision: 1,
          data: { sourceKind: "traffic_challan", businessDate: "2026-11-01", amountPaise: 9000,
            effect: "charge", paymentStatus: "unpaid" },
        }],
        listFuelPurchases: async () => [fuelPurchase],
        listFuelCostRateHistory: async () => [{
          calculationVersion: "business-expenses.fuel-cost-rate-history.v1",
          effectiveFrom: "2026-10-31", completionBusinessDate: "2026-10-30",
          costPaisePerKm: { numerator: "150", denominator: "1" },
          cumulativeSpendPaise: 15000, cumulativeDistanceKm: 100,
          intervalEndCheckpointIds: ["fuel-checkpoint"], sourcePurchaseIds: ["fuel-purchase-1"],
          sourceRevisions: [1],
        }],
      } as never,
      {
        getReport: async () => ({
          result: { sources: [{
            sourceId: "loan:emi:1", sourceKind: "emi", sourceVersion: 3, scheduleVersion: 2,
            sourceAmountPaise: 500, disposition: "allocated",
            daily: [{ date: "2026-11-01", amountPaise: 500, sourceId: "loan:emi:1",
              sourceKind: "emi", sourceVersion: 3, scheduleVersion: 2 }],
          }] },
        }),
      } as never,
      { submittedTripFinancialRecords: async () => [{
        id: "trip-financial-1", revision: 2,
        data: { kind: "completed_ride_financials", status: "submitted",
          tripContext: { operationalDate: "2026-11-01" }, tollPaise: 50, tollPayer: "driver",
          parkingPaise: 40, parkingPayer: "customer" },
      }, {
        id: "legacy-trip-financial-2", revision: 1,
        data: { kind: "completed_ride_financials", status: "submitted", tollPaise: 25, tollPayer: "driver" },
      }] } as never,
    );
    const result = await service.calculate("2026-11-01", "2026-11-01");
    expect(result.totalCostPaise).toBe(17_650);
    expect(result.daily[0].costs).toMatchObject({
      fuel: 15_000, maintenance: 2_000, "platform-fee": 100, emi: 500, miscellaneous: 50,
    });
    expect(result.provenance.sourceIds).toContain("fuel-purchase-1");
    expect(result.provenance.sourceIds).toContain("maintenance-accrual-1");
    expect(result.provenance.sourceIds).toContain("maintenance-rate-history-1");
    expect(result.provenance.sourceIds).toContain("loan:emi:1");
    expect(result.provenance.sourceIds).toContain("trip-financial-1");
    expect(result.daily[0].complete).toBe(false);
    expect(result.provenance.completeness).toContainEqual(expect.objectContaining({ source: "trip-financials", status: "incomplete" }));
  });
});
