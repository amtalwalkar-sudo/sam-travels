import { describe, expect, it } from "vitest";
import { FullCostBreakevenService } from "../packages/application/src/full-cost-breakeven-service";
import { buildFullCostWorkDistanceProjectionV1 } from "../packages/application/src/full-cost-breakeven-work-distance";
import parityFixture from "./fixtures/driver-workflow-parity-v1.json";

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

describe("Full-cost contract boundary regressions", () => {

  it("matches the shared 04:00 active-driving-day fixture used by Android Room", () => {
    const fixture = parityFixture.activeDrivingDay;
    const dailyId = "work:daily-business-km:" + encodeURIComponent(fixture.vehicleId) + ":" + fixture.operationalDate;
    const tripId = "work:trip-financial-obligation:" + fixture.tripId;
    const projection = buildFullCostWorkDistanceProjectionV1({
      vehicleId: fixture.vehicleId,
      from: fixture.operationalDate,
      to: fixture.followingOperationalDate,
      dailyDistanceRecords: [{
        id: dailyId, revision: 4,
        data: { schemaVersion: 1, kind: "daily_business_kilometres", vehicleId: fixture.vehicleId,
          operationalDate: fixture.operationalDate, totalBusinessKm: fixture.businessKm,
          unallocatedBusinessKm: 0, entries: [{ shiftId: fixture.shiftId, allocationStatus: "allocated",
            businessKm: fixture.businessKm, personalKm: fixture.personalKm }] },
      }],
      tripFinancialRecords: [{
        id: tripId, revision: 2,
        data: { kind: "completed_ride_financials", status: "submitted",
          createdAt: fixture.tripCreatedAt, completedAt: fixture.tripCompletedAt,
          tripContext: { schemaVersion: 1, shiftId: fixture.shiftId, driverId: fixture.driverId,
            assignmentId: fixture.assignmentId, vehicleId: fixture.vehicleId,
            operationalDate: fixture.operationalDate } },
      }],
    });
    const activeDays = [...projection.activityByDate.values()].filter(bucket => bucket.activeDrivingDay).length;
    const totalBusinessKm = [...projection.distanceByDate.values()].reduce((sum, item) => sum + item.businessKm, 0);
    expect(activeDays).toBe(fixture.expectedActiveDrivingDayCount);
    expect(totalBusinessKm).toBe(fixture.expectedTotalBusinessKm);
    expect(totalBusinessKm / activeDays).toBe(fixture.expectedAverageBusinessKmPerActiveDrivingDay);
    expect(projection.activeDaySourceIssues).toEqual([]);
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
