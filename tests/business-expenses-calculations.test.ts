import { describe, expect, it } from "vitest";
import {
  assertBusinessExpenseEntryV1,
  assertFuelPurchaseV1,
  calculateDailyBusinessExpenses,
  calculateFuelIntervals,
  deriveFuelQuantityMilliKg,
  type BusinessExpenseEntryV1,
  type FuelPurchaseV1,
} from "../packages/features/business-expenses";

const vehicleId = "feature:vehicle:MH01AB1234";
function fuel(id: string, occurredAt: string, odometerKm: number, partialRefill: boolean, amountPaise: number): FuelPurchaseV1 {
  return {
    schemaVersion: 1, kind: "fuel_purchase", id, revision: 1,
    businessDate: new Date(Date.parse(occurredAt) + 330 * 60_000).toISOString().slice(0, 10), occurredAt, vehicleId, odometerKm,
    pricePaisePerKg: 10_000, amountPaise, partialRefill,
  };
}
function expense(id: string, sourceKind: BusinessExpenseEntryV1["sourceKind"], amountPaise: number,
  overrides: Partial<BusinessExpenseEntryV1> = {}): BusinessExpenseEntryV1 {
  return {
    schemaVersion: 1, kind: "business_expense", id, revision: 1, sourceKind,
    businessDate: "2026-11-14", amountPaise, currencyCode: "INR", effect: "charge",
    ...(sourceKind === "traffic_challan" ? { paymentStatus: "unpaid" as const } : {}), ...overrides,
  };
}

describe("Business expense source contracts", () => {
  it("validates optional event-scoped fuel GPS evidence without requiring it", () => {
    const purchase = fuel("fuel-gps", "2026-11-14T20:00:00.000Z", 45000, false, 18000);
    expect(() => assertFuelPurchaseV1(purchase)).not.toThrow();
    expect(() => assertFuelPurchaseV1({
      ...purchase,
      locationEvidence: {
        latitude: 19.076, longitude: 72.8777, accuracyMeters: 18,
        capturedAt: "2026-11-14T19:59:30.000Z", provider: "device",
      },
    })).not.toThrow();
    expect(() => assertFuelPurchaseV1({
      ...purchase,
      locationEvidence: {
        latitude: 190, longitude: 72.8777, accuracyMeters: 18,
        capturedAt: "2026-11-14T19:59:30.000Z", provider: "device",
      },
    })).toThrow("fuel_purchase_invalid");
  });

  it("derives fuel quantity to the nearest gram without changing source money", () => {
    expect(deriveFuelQuantityMilliKg(10_000, 10_000)).toBe(1_000);
    expect(deriveFuelQuantityMilliKg(10_005, 10_000)).toBe(1_001);
    expect(() => deriveFuelQuantityMilliKg(0, 10_000)).toThrow("fuel_amount_and_price_must_be_positive_integer_paise");
  });

  it("rejects invalid fuel facts, mismatched India business dates, and malformed expense entries", () => {
    expect(() => assertFuelPurchaseV1({ ...fuel("f1", "2026-11-14T09:00:00.000Z", 10, false, 1000), amountPaise: 0 }))
      .toThrow("fuel_purchase_invalid");
    expect(() => assertFuelPurchaseV1({ ...fuel("f2", "2026-11-14T20:00:00.000Z", 10, false, 1000), businessDate: "2026-11-14" }))
      .toThrow("fuel_purchase_invalid");
    expect(() => assertBusinessExpenseEntryV1({ ...expense("e1", "traffic_challan", 100), currencyCode: "USD" }))
      .toThrow("business_expense_entry_invalid");
  });
});

describe("Full-to-full fuel intervals", () => {
  it("uses intervening partial refills and the closing full refill, not the opening baseline", () => {
    const result = calculateFuelIntervals([
      fuel("baseline", "2026-11-01T09:00:00.000Z", 100, false, 50_000),
      fuel("partial", "2026-11-05T09:00:00.000Z", 110, true, 20_000),
      fuel("closing", "2026-11-10T09:00:00.000Z", 120, false, 30_000),
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      calculationVersion: "business-expenses.fuel-interval.v1",
      status: "available", distanceKm: 20, quantityMilliKg: 5_000, spendPaise: 50_000,
      kmPerKg: { numerator: "20000", denominator: "5000" },
      effectiveCostPaisePerKg: { numerator: "50000000", denominator: "5000" },
      costPaisePerKm: { numerator: "50000", denominator: "20" },
      sourcePurchaseIds: ["partial", "closing"],
    });
    expect(result[1]).toMatchObject({
      status: "incomplete", startCheckpointId: "closing", issue: "awaiting_full_checkpoint",
    });
  });

  it("reports an explicit incomplete interval until the next full checkpoint arrives", () => {
    expect(calculateFuelIntervals([
      fuel("baseline", "2026-11-01T09:00:00.000Z", 100, false, 50_000),
      fuel("partial-after-baseline", "2026-11-05T09:00:00.000Z", 110, true, 20_000),
    ])).toEqual([{
      calculationVersion: "business-expenses.fuel-interval.v1",
      status: "incomplete",
      startCheckpointId: "baseline",
      sourcePurchaseIds: ["partial-after-baseline"],
      sourceRevisions: [1],
      issue: "awaiting_full_checkpoint",
    }]);
  });

  it("withholds mileage when the odometer does not increase", () => {
    const result = calculateFuelIntervals([
      fuel("a", "2026-11-01T09:00:00.000Z", 120, false, 50_000),
      fuel("b", "2026-11-10T09:00:00.000Z", 110, false, 30_000),
    ]);
    expect(result[0]).toMatchObject({ status: "needs_attention", issue: "odometer_not_increasing" });
    expect(result[0].kmPerKg).toBeUndefined();
  });

  it("keeps independent vehicle checkpoint sequences separate", () => {
    const otherVehicle = { ...fuel("other-a", "2026-11-01T09:00:00.000Z", 50, false, 20_000), vehicleId: "feature:vehicle:MH02CD5678" };
    const result = calculateFuelIntervals([
      fuel("a1", "2026-11-01T09:00:00.000Z", 100, false, 50_000),
      otherVehicle,
      fuel("a2", "2026-11-10T09:00:00.000Z", 120, false, 30_000),
      { ...otherVehicle, id: "other-b", occurredAt: "2026-11-10T09:00:00.000Z", businessDate: "2026-11-10", odometerKm: 70 },
    ]);
    expect(result).toHaveLength(4);
    expect(result.filter(item => item.status === "available")).toHaveLength(2);
    expect(result.filter(item => item.status === "incomplete")).toHaveLength(2);
  });
});

describe("Daily expense aggregation", () => {
  it("recognizes only paid challans and treats paid platform charges separately from gross fare", () => {
    const result = calculateDailyBusinessExpenses([
      fuel("full", "2026-11-14T09:00:00.000Z", 100, false, 10_000),
      fuel("partial", "2026-11-14T10:00:00.000Z", 101, true, 2_000),
    ], [
      expense("fee", "platform_fee", 5_000, { vehicleId, alreadyNettedFromIncome: false }),
      expense("unpaid-challan", "traffic_challan", 2_000, { paymentStatus: "unpaid" }),
      expense("paid-challan", "traffic_challan", 1_000, { paymentStatus: "paid" }),
      expense("misc", "miscellaneous", 3_000),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      fuelPaise: 12_000, platformFeesPaise: 5_000, trafficChallansPaise: 1_000,
      miscellaneousPaise: 3_000, reportedSourceExpensePaise: 21_000,
      normalOperatingExpensePaise: 20_000, fullCostExpensePaise: 21_000,
    });
  });

  it("fails closed for a platform charge marked as already netted from gross fare", () => {
    expect(() => calculateDailyBusinessExpenses([], [
      expense("fee-netted", "platform_fee", 5_000, { vehicleId, alreadyNettedFromIncome: true }),
    ])).toThrow("business_expense_entry_invalid");
  });

  it("applies a linked reversal on its own business date", () => {
    const charge = expense("fee", "platform_fee", 500, { vehicleId });
    const reversal = expense("fee-reversal", "platform_fee", 500, {
      businessDate: "2026-11-15", effect: "reversal", reversesSourceId: "fee", vehicleId,
    });
    const result = calculateDailyBusinessExpenses([], [charge, reversal]);
    expect(result.find(row => row.businessDate === "2026-11-14")?.platformFeesPaise).toBe(500);
    expect(result.find(row => row.businessDate === "2026-11-15")?.platformFeesPaise).toBe(-500);
  });
});
