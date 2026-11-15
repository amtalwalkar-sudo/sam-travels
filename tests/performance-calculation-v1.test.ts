import { describe, expect, it } from "vitest";
import {
  allocatePreBusinessRecoveryV1,
  calculatePerformanceV1,
  type PerformanceCalculationInputV1,
} from "../packages/domain/src/performance-calculation-v1";

function fixture(overrides: Partial<PerformanceCalculationInputV1> = {}): PerformanceCalculationInputV1 {
  return {
    businessStartDate: "2026-03-15",
    periodFrom: "2026-04-01",
    periodTo: "2026-04-30",
    monthlyDriverTargetPaise: 50_000,
    revenue: [
      { date: "2026-03-15", grossFarePaise: 10_000, cancellationFeePaise: 500, verified: true,
        sourceRefs: [{ sourceId: "fare-1", revision: 1 }, { sourceId: "cancel-1", revision: 1 }] },
      { date: "2026-04-05", grossFarePaise: 20_000, cancellationFeePaise: 0, verified: true,
        sourceRefs: [{ sourceId: "fare-2", revision: 2 }] },
    ],
    costs: [
      { date: "2026-03-20", kind: "emi", amountPaise: 3_000, verified: true,
        sourceRefs: [{ sourceId: "emi-1", revision: 1 }] },
      { date: "2026-04-05", kind: "compliance", amountPaise: 1_000, verified: true,
        sourceRefs: [{ sourceId: "compliance-1", revision: 1 }] },
      { date: "2026-04-05", kind: "platform-fee", amountPaise: 500, verified: true,
        sourceRefs: [{ sourceId: "platform-1", revision: 1 }] },
    ],
    preBusinessRecovery: [
      { sourceId: "pre-business-manual-1", revision: 1, amountPaise: 18_000, note: "Initial setup",
        origin: "manual" },
      { sourceId: "pre-business-emi-1", revision: 2, amountPaise: 9_000, note: "Pre-start EMI portion",
        origin: "emi" },
      { sourceId: "pre-business-compliance-1", revision: 1, amountPaise: 3_000, note: "Pre-start compliance portion",
        origin: "compliance" },
    ],
    completeness: [{ source: "verified-records", status: "complete" }],
    ...overrides,
  };
}

describe("Performance Calculation Contract v1.0", () => {
  it("recovers each pre-business source over exactly 18 months from business start", () => {
    const result = allocatePreBusinessRecoveryV1("2026-03-15", [
      { sourceId: "pre-1", revision: 1, amountPaise: 18_000, note: "setup", origin: "manual" },
    ]);
    expect(result.from).toBe("2026-03-15");
    expect(result.toExclusive).toBe("2027-09-15");
    expect(result.daily[0].date).toBe("2026-03-15");
    expect(result.daily[result.daily.length - 1].date).toBe("2027-09-14");
    expect(result.daily.reduce((sum, row) => sum + row.amountPaise, 0)).toBe(18_000);
    expect(result.daily.every(row => row.date < result.toExclusive)).toBe(true);
  });

  it("allocates remainder paise deterministically and reconciles multiple independent entries", () => {
    const result = allocatePreBusinessRecoveryV1("2026-03-15", [
      { sourceId: "a", revision: 1, amountPaise: 1, note: "one paise", origin: "manual" },
      { sourceId: "b", revision: 1, amountPaise: 2, note: "two paise", origin: "manual" },
    ]);
    expect(result.totalPaise).toBe(3);
    expect(result.daily.filter(row => row.amountPaise > 0).map(row => [row.date, row.amountPaise]))
      .toEqual([["2026-03-15", 1], ["2026-03-15", 1], ["2026-03-16", 1]]);
  });

  it("keeps EMI and compliance distinct from the pre-business recovery bucket", () => {
    const result = calculatePerformanceV1(fixture());
    const aprilFirst = result.daily[0];
    expect(aprilFirst.costs.emi).toBe(0);
    expect(aprilFirst.costs.compliance).toBe(0);
    expect(aprilFirst.costs["pre-business-recovery"]).toBeGreaterThan(0);
    expect(result.daily.some(row => row.costs.emi > 0)).toBe(false);
    expect(result.daily.some(row => row.costs.compliance > 0)).toBe(true);
  });

  it("calculates lifetime position independently from selected-period profit", () => {
    const result = calculatePerformanceV1(fixture());
    expect(result.period.revenuePaise).toBe(20_000);
    expect(result.period.costPaise).toBeGreaterThan(1_500);
    expect(result.period.profitPaise).toBe(result.period.revenuePaise - result.period.costPaise);
    expect(result.lifetime.revenuePaise).toBe(30_500);
    expect(result.lifetime.profitPaise).toBe(result.lifetime.revenuePaise - result.lifetime.costPaise);
    expect(result.lifetime.targetPositionPaise).toBe(result.lifetime.profitPaise - result.lifetime.targetPaise);
    expect(result.lifetime.elapsedCalendarMonths).toBe(2);
  });

  it("does not prorate the configured monthly target for a one-day selected period", () => {
    const result = calculatePerformanceV1(fixture({ periodFrom: "2026-04-05", periodTo: "2026-04-05" }));
    expect(result.period.monthlyDriverTargetPaise).toBe(50_000);
    expect(result.daily).toHaveLength(1);
  });

  it("excludes unverified source facts and exposes their incompleteness", () => {
    const result = calculatePerformanceV1(fixture({
      revenue: [{ date: "2026-04-05", grossFarePaise: 99_000, cancellationFeePaise: 0, verified: false,
        sourceRefs: [{ sourceId: "unverified-fare", revision: 1 }] }],
      costs: [{ date: "2026-04-05", kind: "emi", amountPaise: 7_000, verified: false,
        sourceRefs: [{ sourceId: "unverified-emi", revision: 1 }] }],
    }));
    expect(result.period.revenuePaise).toBe(0);
    expect(result.period.costPaise).toBeGreaterThan(0); // verified recovery only
    expect(result.provenance.completeness).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "revenue:2026-04-05", status: "incomplete" }),
      expect.objectContaining({ source: "cost:2026-04-05:emi", status: "incomplete" }),
    ]));
  });

  it("rejects duplicate recovery source identities and invalid amounts", () => {
    expect(() => allocatePreBusinessRecoveryV1("2026-03-15", [
      { sourceId: "same", revision: 1, amountPaise: 1, note: "a", origin: "manual" },
      { sourceId: "same", revision: 2, amountPaise: 1, note: "b", origin: "manual" },
    ])).toThrow("performance_recovery_source_invalid");
  });
});
