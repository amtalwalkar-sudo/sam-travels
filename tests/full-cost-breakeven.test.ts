import { describe, expect, it } from "vitest";
import { calculateFullCostBreakevenV1, type BreakevenInputV1 } from "../packages/domain/src/full-cost-breakeven";

function fixture(overrides: Partial<BreakevenInputV1> = {}): BreakevenInputV1 {
  return {
    from: "2026-11-01", to: "2026-11-02",
    dailyActivity: [
      { date: "2026-11-01", businessKm: 100, fuelCostPaisePerKm: { numerator: "150", denominator: "1" },
        maintenanceRatePaisePerKm: 20, distanceSourceId: "distance-1", distanceSourceRevision: 1 },
      { date: "2026-11-02", businessKm: 0, fuelCostPaisePerKm: { numerator: "150", denominator: "1" },
        maintenanceRatePaisePerKm: 20, distanceSourceId: "distance-2", distanceSourceRevision: 1 },
    ],
    datedCosts: [
      { date: "2026-11-01", amountPaise: 500, kind: "emi", sourceId: "emi-row-1", sourceRevision: 2, scheduleVersion: 3 },
      { date: "2026-11-02", amountPaise: 100, kind: "compliance", sourceId: "compliance-1", sourceRevision: 4 },
    ],
    completeness: [{ source: "finance", status: "complete" }, { source: "fuel", status: "complete" }],
    ...overrides,
  };
}

describe("Full-cost breakeven calculation v1", () => {
  it("calculates activity-based fuel and maintenance plus dated time costs", () => {
    const result = calculateFullCostBreakevenV1(fixture());
    expect(result.daily.map(row => row.totalCostPaise)).toEqual([17_500, 100]);
    expect(result.totalCostPaise).toBe(17_600);
    expect(result.weekly.map(row => row.totalCostPaise)).toEqual([17_500, 100]);
    expect(result.weekly.map(row => row.week)).toEqual(["2026-W44", "2026-W45"]);
    expect(result.monthly).toEqual([{ month: "2026-11", totalCostPaise: 17_600 }]);
    expect(result.yearly).toEqual([{ year: "2026", totalCostPaise: 17_600 }]);
  });

  it("reconciles arbitrary ranges by summing canonical daily rows", () => {
    const result = calculateFullCostBreakevenV1(fixture());
    expect(result.totalCostPaise).toBe(result.daily.reduce((sum, row) => sum + row.totalCostPaise, 0));
    expect(result.weekly.reduce((sum, row) => sum + row.totalCostPaise, 0)).toBe(result.totalCostPaise);
    expect(result.monthly.reduce((sum, row) => sum + row.totalCostPaise, 0)).toBe(result.totalCostPaise);
    expect(result.yearly.reduce((sum, row) => sum + row.totalCostPaise, 0)).toBe(result.totalCostPaise);
  });

  it("retains source revisions and marks periods incomplete when a source is not complete", () => {
    const result = calculateFullCostBreakevenV1(fixture({
      completeness: [{ source: "fuel", status: "incomplete", detail: "awaiting full checkpoint" }],
    }));
    expect(result.provenance.sourceIds).toContain("emi-row-1");
    expect(result.provenance.sourceRevisions).toContainEqual({ sourceId: "emi-row-1", revision: 2, scheduleVersion: 3 });
    expect(result.daily.every(row => row.complete === false)).toBe(true);
    expect(result.provenance.completeness[0].detail).toBe("awaiting full checkpoint");
  });

  it("rejects invalid date windows and missing effective fuel rate for business distance", () => {
    expect(() => calculateFullCostBreakevenV1(fixture({ from: "2026-11-03" }))).toThrow("breakeven_period_invalid");
    expect(() => calculateFullCostBreakevenV1(fixture({
      dailyActivity: [{ date: "2026-11-01", businessKm: 1, maintenanceRatePaisePerKm: 1,
        distanceSourceId: "d", distanceSourceRevision: 1 }],
    }))).toThrow("breakeven_fuel_rate_unavailable");
  });
  it("accepts explicit daily source amounts and preserves every source revision", () => {
    const result = calculateFullCostBreakevenV1(fixture({
      dailyActivity: [{
        date: "2026-11-01", businessKm: 10, fuelCostPaise: 1250, maintenanceCostPaise: 300,
        distanceSourceId: "aggregate-distance", distanceSourceRevision: 1,
        sourceRefs: [{ sourceId: "accrual-a", revision: 2 }, { sourceId: "fuel-purchase-a", revision: 3 }],
      }],
      datedCosts: [],
      completeness: [{ source: "annual-allocation", status: "complete" }],
    }));
    expect(result.daily[0].costs.fuel).toBe(1250);
    expect(result.daily[0].costs.maintenance).toBe(300);
    expect(result.provenance.sourceIds).toContain("accrual-a");
    expect(result.provenance.sourceIds).toContain("fuel-purchase-a");
    expect(result.totalCostPaise).toBe(1550);
  });

  it("reconciles cross-year weeks, months, years and a custom sub-range from daily rows", () => {
    const base = fixture({
      from: "2026-12-31", to: "2027-01-02",
      dailyActivity: ["2026-12-31", "2027-01-01", "2027-01-02"].map(date => ({
        date, businessKm: 1, fuelCostPaise: 100, maintenanceCostPaise: 0,
        distanceSourceId: "distance-" + date, distanceSourceRevision: 1,
      })),
      datedCosts: ["2026-12-31", "2027-01-01", "2027-01-02"].map(date => ({
        date, amountPaise: 50, kind: "miscellaneous" as const, sourceId: "expense-" + date, sourceRevision: 1,
      })),
    });
    const full = calculateFullCostBreakevenV1(base);
    expect(full.totalCostPaise).toBe(450);
    expect(full.weekly).toEqual([{ week: "2026-W53", from: "2026-12-31", to: "2027-01-02", totalCostPaise: 450 }]);
    expect(full.monthly).toEqual([
      { month: "2026-12", totalCostPaise: 150 }, { month: "2027-01", totalCostPaise: 300 },
    ]);
    expect(full.yearly).toEqual([
      { year: "2026", totalCostPaise: 150 }, { year: "2027", totalCostPaise: 300 },
    ]);
    const custom = calculateFullCostBreakevenV1({ ...base, from: "2027-01-01", to: "2027-01-02" });
    expect(custom.totalCostPaise).toBe(300);
    expect(custom.provenance.sourceIds).not.toContain("distance-2026-12-31");
    expect(custom.provenance.sourceIds).not.toContain("expense-2026-12-31");
  });

  it("uses leap-year calendar dates for daily and monthly reconciliation", () => {
    const result = calculateFullCostBreakevenV1(fixture({
      from: "2024-02-28", to: "2024-03-01",
      dailyActivity: ["2024-02-28", "2024-02-29", "2024-03-01"].map(date => ({
        date, businessKm: 1, fuelCostPaise: 100, maintenanceCostPaise: 0,
        distanceSourceId: "distance-" + date, distanceSourceRevision: 1,
      })),
      datedCosts: [],
    }));
    expect(result.daily.map(row => row.date)).toEqual(["2024-02-28", "2024-02-29", "2024-03-01"]);
    expect(result.monthly).toEqual([
      { month: "2024-02", totalCostPaise: 200 }, { month: "2024-03", totalCostPaise: 100 },
    ]);
    expect(result.yearly).toEqual([{ year: "2024", totalCostPaise: 300 }]);
  });

});
