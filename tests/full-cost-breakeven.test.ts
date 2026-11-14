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
});
