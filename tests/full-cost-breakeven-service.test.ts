import { describe, expect, it } from "vitest";
import { FullCostBreakevenService } from "../packages/application/src/full-cost-breakeven-service";
const vehicleIdForDistanceTests = "feature:vehicle:MH01AB1234";
function distanceService(input: {
  trips?: readonly unknown[];
  dailyRecords?: readonly unknown[];
  maintenanceRecords?: unknown;
  fuelPurchases?: readonly unknown[];
  fuelRates?: readonly unknown[];
  expenseEntries?: readonly unknown[];
  dailyExpenseOutputs?: readonly unknown[];
  correctionRefs?: (sourceId: string) => Promise<readonly { sourceId: string; revision: number }[]>;
}) {
  return new FullCostBreakevenService(
    { list: async () => [{ id: vehicleIdForDistanceTests, revision: 1 }] } as never,
    { listVehicleRecords: async () => input.maintenanceRecords ?? {
      accruals: [], visits: [], expenses: [], rateHistory: [],
    } } as never,
    {
      listExpenseEntries: async () => input.expenseEntries ?? [],
      listDailyExpenseOutputs: async () => input.dailyExpenseOutputs ?? [],
      listFuelPurchases: async () => input.fuelPurchases ?? [],
      listFuelCostRateHistory: async () => input.fuelRates ?? [],
      ...(input.correctionRefs ? { listCorrectionReferences: input.correctionRefs } : {}),
    } as never,
    { getReport: async () => ({ result: { sources: [] } }) } as never,
    { submittedTripFinancialRecords: async () => input.trips ?? [] } as never,
    { list: async () => input.dailyRecords ?? [] } as never,
  );
}


describe("FullCostBreakevenService source integration", () => {
  it("joins per-vehicle fuel rates, maintenance accruals, dated expenses and annual allocation rows", async () => {
    const vehicleId = "feature:vehicle:MH01AB1234";
    const dailyId = "work:daily-business-km:" + encodeURIComponent(vehicleId) + ":2026-11-01";
    const accrual = {
      id: "maintenance-accrual-1", revision: 2,
      data: { operationalDate: "2026-11-01", businessKm: 100, amountPaise: 2000,
        rateEffectiveFrom: "2026-10-31", ratePaisePerKm: 20,
        dailyBusinessKmRecordId: dailyId, dailyBusinessKmRevision: 4 },
    };
    const fuelPurchase = { id: "fuel-purchase-1", data: { kind: "fuel_purchase", vehicleId } };
    const service = new FullCostBreakevenService(
      { list: async () => [{ id: vehicleId }] } as never,
      { listVehicleRecords: async () => ({ accruals: [accrual], visits: [], expenses: [],
        rateHistory: [{ effectiveFrom: "2026-10-31", ratePaisePerKm: 20, savedAt: "2026-10-31T00:00:00.000Z", isDefault: true }],
        rateHistoryRecord: { id: "maintenance-rate-history-1", revision: 3 } }) } as never,
      {
        listExpenseEntries: async () => [{
          id: "platform-fee-1", revision: 1,
          data: { sourceKind: "platform_fee", businessDate: "2026-11-01", amountPaise: 100,
            effect: "charge", alreadyNettedFromIncome: false },
        }, {
          id: "unpaid-challan-1", revision: 1,
          data: { sourceKind: "traffic_challan", businessDate: "2026-11-01", amountPaise: 9000,
            effect: "charge", paymentStatus: "unpaid" },
        }, {
          id: "manual-trip-toll-duplicate", revision: 1,
          data: { sourceKind: "miscellaneous", businessDate: "2026-11-01", amountPaise: 50,
            effect: "charge", tripExpenseTreatment: "already-in-trip-closeout",
            tripFinancialSourceId: "work:trip-financial-obligation:trip-1", tripFinancialComponent: "toll" },
        }, {
          id: "legacy-parking-unclear", revision: 1,
          data: { sourceKind: "miscellaneous", businessDate: "2026-11-01", amountPaise: 3000,
            effect: "charge", category: "Parking" },
        }, {
          id: "manual-trip-toll-reversal", revision: 1,
          data: { sourceKind: "miscellaneous", businessDate: "2026-11-02", amountPaise: 50,
            effect: "reversal", reversesSourceId: "manual-trip-toll-duplicate",
            tripExpenseTreatment: "already-in-trip-closeout",
            tripFinancialSourceId: "work:trip-financial-obligation:trip-1",
            tripFinancialComponent: "toll" },
        }],
        listDailyExpenseOutputs: async () => [{ businessDate: "2026-11-01", platformFeesPaise: 100,
          trafficChallansPaise: 0, miscellaneousPaise: 3050, sourceIds: [
            "platform-fee-1", "manual-trip-toll-duplicate", "legacy-parking-unclear",
          ], sourceRevisions: [1, 1, 1] }, {
          businessDate: "2026-11-02", platformFeesPaise: 0,
          trafficChallansPaise: 0, miscellaneousPaise: -50, sourceIds: [
            "manual-trip-toll-reversal",
          ], sourceRevisions: [1],
        }],
        listFuelPurchases: async () => [fuelPurchase],
        listCorrectionReferences: async (sourceId: string) => sourceId === "fuel-purchase-1"
          ? [{ sourceId: "historical-correction:fuel-amount-correction", revision: 1 }]
          : [],
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
        id: "work:trip-financial-obligation:trip-1", revision: 2,
        data: { kind: "completed_ride_financials", status: "submitted",
          tripContext: { schemaVersion: 1, shiftId: "shift-1", driverId: "driver-1", assignmentId: "assignment-1", vehicleId, operationalDate: "2026-11-01" }, tollPaise: 50, tollPayer: "driver",
          parkingPaise: 40, parkingPayer: "customer" },
      }, {
        id: "legacy-trip-financial-2", revision: 1,
        data: { kind: "completed_ride_financials", status: "submitted", tollPaise: 25, tollPayer: "driver" },
      }] } as never,
      { list: async () => [{
        id: dailyId, revision: 4,
        data: { schemaVersion: 1, kind: "daily_business_kilometres", vehicleId,
          operationalDate: "2026-11-01", totalBusinessKm: 100, unallocatedBusinessKm: 0, entries: [{
            shiftId: "shift-1", allocationStatus: "allocated", businessKm: 100,
          }] },
      }] } as never,
    );
    const result = await service.calculate("2026-11-01", "2026-11-01");
    expect(result.activeDrivingDayCount).toBe(1);
    expect(result.averageBusinessKmPerActiveDrivingDay).toBe(100);
    expect(result.daily[0].activeDrivingDay).toBe(true);
    expect(result.provenance.sourceIds).toContain(dailyId);
    expect(result.totalCostPaise).toBe(17_650);
    expect(result.daily[0].costs).toMatchObject({
      fuel: 15_000, maintenance: 2_000, "platform-fee": 100, emi: 500, miscellaneous: 50,
    });
    expect(result.provenance.sourceIds).toContain("fuel-purchase-1");
    expect(result.provenance.sourceIds).toContain("historical-correction:fuel-amount-correction");
    expect(result.provenance.sourceIds).toContain("maintenance-accrual-1");
    expect(result.provenance.sourceIds).toContain("maintenance-rate-history-1");
    expect(result.provenance.sourceIds).toContain("loan:emi:1");
    expect(result.provenance.sourceIds).toContain("work:trip-financial-obligation:trip-1");
    expect(result.daily[0].complete).toBe(false);
    expect(result.provenance.completeness).toContainEqual(expect.objectContaining({ source: "trip-financials", status: "incomplete" }));
    expect(result.provenance.completeness).toContainEqual(expect.objectContaining({
      source: "business-expenses", status: "review-required",
      detail: expect.stringContaining("Legacy toll/parking expense legacy-parking-unclear"),
    }));
  });

  it("uses immutable trip operational date and rejects a ride assigned to a different finalized shift", async () => {
    const vehicleId = "feature:vehicle:MH01AB1234";
    const operationalDate = "2026-11-01";
    const dailyId = "work:daily-business-km:" + encodeURIComponent(vehicleId) + ":" + operationalDate;
    const service = new FullCostBreakevenService(
      { list: async () => [{ id: vehicleId, revision: 1 }] } as never,
      { listVehicleRecords: async () => ({ accruals: [], visits: [], expenses: [], rateHistory: [] }) } as never,
      {
        listExpenseEntries: async () => [],
        listDailyExpenseOutputs: async () => [],
        listFuelPurchases: async () => [],
        listFuelCostRateHistory: async () => [],
      } as never,
      { getReport: async () => ({ result: { sources: [] } }) } as never,
      { submittedTripFinancialRecords: async () => [{
        id: "work:trip-financial-obligation:cross-boundary-trip", revision: 2,
        data: { kind: "completed_ride_financials", status: "submitted",
          createdAt: "2026-11-02T04:10:00+05:30",
          tripContext: { schemaVersion: 1, shiftId: "shift-expected", driverId: "driver-1",
            assignmentId: "assignment-1", vehicleId, operationalDate } },
      }] } as never,
      { list: async () => [{
        id: dailyId, revision: 4,
        data: { schemaVersion: 1, kind: "daily_business_kilometres", vehicleId, operationalDate,
          totalBusinessKm: 100, unallocatedBusinessKm: 0, entries: [{
            shiftId: "different-shift", allocationStatus: "allocated", businessKm: 100, personalKm: 40,
          }] },
      }] } as never,
    );
    const result = await service.calculate(operationalDate, operationalDate);
    expect(result.distanceSummary.totalBusinessKm).toBe(100);
    expect(result.activeDrivingDayCount).toBe(0);
    expect(result.averageBusinessKmPerActiveDrivingDay).toBeNull();
    expect(result.distanceSummary.complete).toBe(false);
    expect(result.provenance.completeness).toContainEqual(expect.objectContaining({
      source: "active-driving-day-distance", status: "incomplete",
    }));
  });

  it("keeps a zero-kilometre active day when its immutable shift context has no finalized distance row", async () => {
    const vehicleId = "feature:vehicle:MH01AB1234";
    const operationalDate = "2026-11-01";
    const service = new FullCostBreakevenService(
      { list: async () => [{ id: vehicleId, revision: 1 }] } as never,
      { listVehicleRecords: async () => ({ accruals: [], visits: [], expenses: [], rateHistory: [] }) } as never,
      {
        listExpenseEntries: async () => [],
        listDailyExpenseOutputs: async () => [],
        listFuelPurchases: async () => [],
        listFuelCostRateHistory: async () => [],
      } as never,
      { getReport: async () => ({ result: { sources: [] } }) } as never,
      { submittedTripFinancialRecords: async () => [{
        id: "work:trip-financial-obligation:distance-pending-trip", revision: 1,
        data: { kind: "cancellation_fee", status: "submitted",
          tripContext: { schemaVersion: 1, shiftId: "shift-a", driverId: "driver-1",
            assignmentId: "assignment-1", vehicleId, operationalDate } },
      }] } as never,
      { list: async () => [] } as never,
    );
    const result = await service.calculate(operationalDate, operationalDate);
    expect(result.activeDrivingDayCount).toBe(1);
    expect(result.averageBusinessKmPerActiveDrivingDay).toBe(0);
    expect(result.distanceSummary.totalBusinessKm).toBe(0);
    expect(result.distanceSummary.complete).toBe(false);
  });

  it("withholds unallocated boundary distance from historical summaries", async () => {
    const vehicleId = "feature:vehicle:MH01AB1234";
    const operationalDate = "2026-11-01";
    const dailyId = "work:daily-business-km:" + encodeURIComponent(vehicleId) + ":" + operationalDate;
    const service = new FullCostBreakevenService(
      { list: async () => [{ id: vehicleId, revision: 1 }] } as never,
      { listVehicleRecords: async () => ({ accruals: [], visits: [], expenses: [], rateHistory: [] }) } as never,
      {
        listExpenseEntries: async () => [],
        listDailyExpenseOutputs: async () => [],
        listFuelPurchases: async () => [],
        listFuelCostRateHistory: async () => [],
      } as never,
      { getReport: async () => ({ result: { sources: [] } }) } as never,
      { submittedTripFinancialRecords: async () => [{
        id: "work:trip-financial-obligation:boundary-trip", revision: 1,
        data: { kind: "completed_ride_financials", status: "submitted",
          tripContext: { schemaVersion: 1, shiftId: "shift-a", driverId: "driver-1",
            assignmentId: "assignment-1", vehicleId, operationalDate } },
      }] } as never,
      { list: async () => [{
        id: dailyId, revision: 5,
        data: { schemaVersion: 1, kind: "daily_business_kilometres", vehicleId, operationalDate,
          totalBusinessKm: 25, unallocatedBusinessKm: 25, entries: [{
            shiftId: "shift-a", allocationStatus: "awaiting_operational_boundary", businessKm: 25,
          }] },
      }] } as never,
    );
    const result = await service.calculate(operationalDate, operationalDate);
    expect(result.activeDrivingDayCount).toBe(1);
    expect(result.distanceSummary.totalBusinessKm).toBe(0);
    expect(result.averageBusinessKmPerActiveDrivingDay).toBe(0);
    expect(result.distanceSummary.complete).toBe(false);
  });

  it("does not classify a Work distance day as active without a submitted ride", async () => {
    const operationalDate = "2026-11-01";
    const dailyId = "work:daily-business-km:" + encodeURIComponent(vehicleIdForDistanceTests) + ":" + operationalDate;
    const result = await distanceService({
      dailyRecords: [{
        id: dailyId, revision: 2,
        data: { schemaVersion: 1, kind: "daily_business_kilometres", vehicleId: vehicleIdForDistanceTests,
          operationalDate, totalBusinessKm: 42, unallocatedBusinessKm: 0,
          entries: [{ shiftId: "online-shift-without-ride", allocationStatus: "allocated",
            businessKm: 42, personalKm: 7 }] },
      }],
    }).calculate(operationalDate, operationalDate);
    expect(result.distanceSummary.totalBusinessKm).toBe(42);
    expect(result.activeDrivingDayCount).toBe(0);
    expect(result.averageBusinessKmPerActiveDrivingDay).toBeNull();
    expect(result.distanceSummary.complete).toBe(true);
  });

  it("does not classify a legacy submitted ride without the complete immutable Work context", async () => {
    const operationalDate = "2026-11-01";
    const result = await distanceService({
      trips: [{
        id: "work:trip-financial-obligation:legacy-without-context", revision: 1,
        data: { kind: "completed_ride_financials", status: "submitted",
          tripContext: { shiftId: "unknown-shift", vehicleId: vehicleIdForDistanceTests, operationalDate } },
      }],
    }).calculate(operationalDate, operationalDate);
    expect(result.activeDrivingDayCount).toBe(0);
    expect(result.averageBusinessKmPerActiveDrivingDay).toBeNull();
    expect(result.distanceSummary.complete).toBe(false);
    expect(result.provenance.completeness).toContainEqual(expect.objectContaining({
      source: "active-driving-day-distance", status: "incomplete",
    }));
  });

  it("counts a zero-kilometre active day when the matching finalized Work contribution is allocated", async () => {
    const operationalDate = "2026-11-01";
    const shiftId = "zero-km-active-shift";
    const dailyId = "work:daily-business-km:" + encodeURIComponent(vehicleIdForDistanceTests) + ":" + operationalDate;
    const result = await distanceService({
      trips: [{
        id: "work:trip-financial-obligation:zero-km-ride", revision: 1,
        data: { kind: "cancellation_fee", status: "submitted",
          tripContext: { schemaVersion: 1, shiftId, driverId: "driver-1", assignmentId: "assignment-1",
            vehicleId: vehicleIdForDistanceTests, operationalDate } },
      }],
      dailyRecords: [{
        id: dailyId, revision: 3,
        data: { schemaVersion: 1, kind: "daily_business_kilometres", vehicleId: vehicleIdForDistanceTests,
          operationalDate, totalBusinessKm: 0, unallocatedBusinessKm: 0,
          entries: [{ shiftId, allocationStatus: "allocated", businessKm: 0, personalKm: 0 }] },
      }],
    }).calculate(operationalDate, operationalDate);
    expect(result.activeDrivingDayCount).toBe(1);
    expect(result.distanceSummary.totalBusinessKm).toBe(0);
    expect(result.averageBusinessKmPerActiveDrivingDay).toBe(0);
    expect(result.distanceSummary.complete).toBe(true);
  });

  it("keeps a ride closed after 04:00 on its immutable pre-boundary Work operational date", async () => {
    const operationalDate = "2026-11-08";
    const followingDate = "2026-11-09";
    const shiftId = "cross-boundary-online-shift";
    const dailyId = "work:daily-business-km:" + encodeURIComponent(vehicleIdForDistanceTests) + ":" + operationalDate;
    const result = await distanceService({
      trips: [{
        id: "work:trip-financial-obligation:cross-boundary-completed-ride", revision: 2,
        data: { kind: "completed_ride_financials", status: "submitted",
          createdAt: "2026-11-08T22:20:00.000Z", completedAt: "2026-11-08T22:40:00.000Z",
          tripContext: { schemaVersion: 1, shiftId, driverId: "driver-1", assignmentId: "assignment-1",
            vehicleId: vehicleIdForDistanceTests, operationalDate } },
      }],
      dailyRecords: [{
        id: dailyId, revision: 4,
        data: { schemaVersion: 1, kind: "daily_business_kilometres", vehicleId: vehicleIdForDistanceTests,
          operationalDate, totalBusinessKm: 42, unallocatedBusinessKm: 0,
          entries: [{ shiftId, allocationStatus: "allocated", businessKm: 42, personalKm: 7 }] },
      }],
    }).calculate(operationalDate, followingDate);
    expect(result.activeDrivingDayCount).toBe(1);
    expect(result.averageBusinessKmPerActiveDrivingDay).toBe(42);
    expect(result.distanceSummary.daily.find(row => row.date === operationalDate)).toMatchObject({
      businessKm: 42, activeDrivingDay: true, complete: true,
    });
    expect(result.distanceSummary.daily.find(row => row.date === followingDate)).toMatchObject({
      businessKm: 0, activeDrivingDay: false, complete: true,
    });
  });

  it("keeps corrected Maintenance visit/repair expenses outside Performance while including only the confirmed per-km accrual", async () => {
    const operationalDate = "2026-11-01";
    const dailyId = "work:daily-business-km:" + encodeURIComponent(vehicleIdForDistanceTests) + ":" + operationalDate;
    const accrualId = "feature:maintenance:daily-accrual:" +
      encodeURIComponent(vehicleIdForDistanceTests) + ":" + operationalDate;
    const maintenanceExpenseId = "feature:maintenance:expense:123e4567-e89b-42d3-a456-426614174200";
    const fuelPurchaseId = "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174201";
    const result = await distanceService({
      dailyRecords: [{
        id: dailyId, revision: 4,
        data: { schemaVersion: 1, kind: "daily_business_kilometres", vehicleId: vehicleIdForDistanceTests,
          operationalDate, totalBusinessKm: 100, unallocatedBusinessKm: 0,
          entries: [{ shiftId: "maintenance-cost-shift", allocationStatus: "allocated",
            businessKm: 100, personalKm: 20 }] },
      }],
      fuelPurchases: [{ id: fuelPurchaseId, revision: 1, data: { kind: "fuel_purchase", vehicleId: vehicleIdForDistanceTests } }],
      fuelRates: [{
        effectiveFrom: operationalDate, costPaisePerKm: { numerator: "10", denominator: "1" },
        sourcePurchaseIds: [fuelPurchaseId], sourceRevisions: [1],
      }],
      maintenanceRecords: {
        accruals: [{
          id: accrualId, revision: 1,
          data: { operationalDate, businessKm: 100, personalKm: 20, personalAmountPaise: 400,
            amountPaise: 2000, rateEffectiveFrom: operationalDate, ratePaisePerKm: 20,
            dailyBusinessKmRecordId: dailyId, dailyBusinessKmRevision: 4 },
        }],
        visits: [],
        expenses: [{
          id: maintenanceExpenseId, revision: 2,
          data: { kind: "expense", vehicleId: vehicleIdForDistanceTests, expenseDate: operationalDate,
            expenseName: "Corrected tyre repair", amountPaise: 90_000 },
          correctionRefs: [{ sourceId: "historical-correction:maintenance-expense-fix", revision: 1 }],
        }],
        rateHistory: [{ effectiveFrom: operationalDate, ratePaisePerKm: 20 }],
        rateHistoryRecord: { id: "maintenance-rate-history", revision: 3 },
      },
    }).calculate(operationalDate, operationalDate);
    expect(result.daily[0].costs).toMatchObject({ fuel: 1_000, maintenance: 2_000 });
    expect(result.totalCostPaise).toBe(3_000);
    expect(result.provenance.sourceIds).toContain(accrualId);
    expect(result.provenance.sourceIds).toContain("maintenance-rate-history");
    expect(result.provenance.sourceIds).toContain(dailyId);
    expect(result.provenance.sourceIds).not.toContain(maintenanceExpenseId);
    expect(result.provenance.sourceIds).not.toContain("historical-correction:maintenance-expense-fix");
  });

  it("carries corrected Business Expense effective-date provenance into the full-cost daily output", async () => {
    const sourceId = "feature:business-expenses:entry:123e4567-e89b-42d3-a456-426614174202";
    const correctionId = "historical-correction:platform-fee-business-date-fix";
    const correctedDate = "2026-11-02";
    const result = await distanceService({
      expenseEntries: [{
        id: sourceId, revision: 1,
        data: { kind: "business_expense", sourceKind: "platform_fee", businessDate: correctedDate,
          amountPaise: 1_200, effect: "charge", reference: "paid platform pass" },
      }],
      dailyExpenseOutputs: [{
        businessDate: correctedDate, platformFeesPaise: 1_200, trafficChallansPaise: 0,
        miscellaneousPaise: 0, sourceIds: [sourceId], sourceRevisions: [1],
      }],
      correctionRefs: async id => id === sourceId ? [{ sourceId: correctionId, revision: 1 }] : [],
    }).calculate("2026-11-01", "2026-11-03");
    expect(result.daily.find(row => row.date === "2026-11-01")?.costs["platform-fee"]).toBe(0);
    expect(result.daily.find(row => row.date === correctedDate)?.costs["platform-fee"]).toBe(1_200);
    expect(result.provenance.sourceIds).toContain(correctionId);
  });
});
