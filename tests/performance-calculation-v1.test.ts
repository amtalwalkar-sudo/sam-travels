import { describe, expect, it } from "vitest";
import {
  allocatePreBusinessRecoveryV1,
  calculatePerformanceV1,
  type PerformanceCalculationInputV1,
} from "../packages/domain/src/performance-calculation-v1";
import { buildPerformancePassbookV1 } from "../packages/domain/src/performance-passbook-v1";

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

  it("recovers the aggregate pool in 18 equal monthly instalments with date clamping", () => {
    const result = allocatePreBusinessRecoveryV1("2026-03-15", [
      { sourceId: "partial-month", revision: 1, amountPaise: 54_900, note: "setup", origin: "manual" },
    ]);
    const firstCycle = result.daily.filter(row => row.date >= "2026-03-15" && row.date < "2026-04-15")
      .reduce((sum, row) => sum + row.amountPaise, 0);
    const secondCycle = result.daily.filter(row => row.date >= "2026-04-15" && row.date < "2026-05-15")
      .reduce((sum, row) => sum + row.amountPaise, 0);
    expect(firstCycle).toBe(3_050);
    expect(secondCycle).toBe(3_050);
    expect(result.toExclusive).toBe("2027-09-15");
    expect(result.daily.reduce((sum, row) => sum + row.amountPaise, 0)).toBe(54_900);
  });


  it("assigns indivisible recovery paise to the earliest monthly instalments", () => {
    const result = allocatePreBusinessRecoveryV1("2026-01-31", [
      { sourceId: "remainder", revision: 1, amountPaise: 19, note: "remainder", origin: "manual" },
    ]);
    const monthlyTotals = Array.from({ length: 18 }, (_, index) => {
      const from = new Date(Date.UTC(2026, 0, 31));
      const monthIndex = 2026 * 12 + from.getUTCMonth() + index;
      const year = Math.floor(monthIndex / 12);
      const month = monthIndex % 12;
      const day = Math.min(31, new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
      const start = new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
      const nextIndex = monthIndex + 1;
      const nextYear = Math.floor(nextIndex / 12);
      const nextMonth = nextIndex % 12;
      const nextDay = Math.min(31, new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate());
      const end = new Date(Date.UTC(nextYear, nextMonth, nextDay)).toISOString().slice(0, 10);
      return result.daily.filter(row => row.date >= start && row.date < end)
        .reduce((sum, row) => sum + row.amountPaise, 0);
    });
    expect(monthlyTotals).toEqual([2, ...Array(17).fill(1)]);
  });

  it("allocates remainder paise across the earliest monthly instalments", () => {
    const result = allocatePreBusinessRecoveryV1("2026-03-15", [
      { sourceId: "a", revision: 1, amountPaise: 1, note: "one paise", origin: "manual" },
      { sourceId: "b", revision: 1, amountPaise: 2, note: "two paise", origin: "manual" },
    ]);
    expect(result.totalPaise).toBe(3);
    expect(result.daily.filter(row => row.amountPaise > 0).map(row => [row.date, row.amountPaise]))
      .toEqual([["2026-03-15", 1], ["2026-04-15", 1], ["2026-05-15", 1]]);
    expect(result.daily.filter(row => row.sourceId === "a")
      .reduce((sum, row) => sum + row.amountPaise, 0)).toBe(1);
    expect(result.daily.filter(row => row.sourceId === "b")
      .reduce((sum, row) => sum + row.amountPaise, 0)).toBe(2);
  });

  it("keeps EMI and compliance distinct from the pre-business recovery bucket", () => {
    const result = calculatePerformanceV1(fixture());
    const aprilFirst = result.daily[0];
    expect(aprilFirst.costs.emi).toBe(0);
    expect(aprilFirst.costs.compliance).toBe(0);
    expect(aprilFirst.costs["pre-business-manual-recovery"]).toBeGreaterThan(0);
    expect(result.recovery.daily.every(row => row.origin === "manual")).toBe(true);
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

  it("prorates only the first calendar month's Driver Target from the start date", () => {
    const result = calculatePerformanceV1(fixture({
      periodFrom: "2026-04-01", periodTo: "2026-04-30",
      monthlyDriverTargetPaise: 31_000,
    }));
    // March 15-31 is 17 of 31 days; April and later months are full.
    expect(result.lifetime.elapsedCalendarMonths).toBe(2);
    expect(result.lifetime.targetPaise).toBe(17_000 + 31_000);
    expect(result.period.targetPaise).toBe(31_000);
  });

  it("prorates selected-period and lifetime targets across partial calendar months", () => {
    const result = calculatePerformanceV1(fixture({
      periodFrom: "2026-04-05", periodTo: "2026-05-15",
      monthlyDriverTargetPaise: 30_000,
    }));
    // April 5-30 is 26/30 days; May 1-15 is 15/31 days.
    expect(result.period.monthlyDriverTargetPaise).toBe(30_000);
    expect(result.period.targetPaise).toBe(26_000 + 14_516);
    // Lifetime March 15-31 (17/31), all April, then May 1-15.
    expect(result.lifetime.targetPaise).toBe(16_452 + 30_000 + 14_516);
  });

  it("prorates the configured monthly target for a one-day selected period", () => {
    const result = calculatePerformanceV1(fixture({ periodFrom: "2026-04-05", periodTo: "2026-04-05" }));
    expect(result.period.monthlyDriverTargetPaise).toBe(50_000);
    expect(result.period.targetPaise).toBe(1_667);
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

  it("marks only the affected day incomplete for date-scoped unverified facts", () => {
    const result = calculatePerformanceV1(fixture({
      revenue: [
        { date: "2026-04-05", grossFarePaise: 1_000, cancellationFeePaise: 0, verified: false,
          sourceRefs: [{ sourceId: "unverified-fare", revision: 1 }] },
        { date: "2026-04-06", grossFarePaise: 2_000, cancellationFeePaise: 0, verified: true,
          sourceRefs: [{ sourceId: "verified-fare", revision: 1 }] },
      ],
      periodFrom: "2026-04-05",
      periodTo: "2026-04-06",
    }));
    expect(result.daily.find(row => row.date === "2026-04-05")?.complete).toBe(false);
    expect(result.daily.find(row => row.date === "2026-04-06")?.complete).toBe(true);
  });

  it("builds a cumulative Passbook with recoverable shortfalls and remaining target", () => {
    const result = calculatePerformanceV1(fixture({
      periodFrom: "2026-03-15",
      periodTo: "2026-04-30",
      monthlyDriverTargetPaise: 31_000,
    }));
    expect(result.passbook.from).toBe("2026-03-15");
    expect(result.passbook.to).toBe("2026-04-30");
    expect(result.passbook.daily).toHaveLength(47);
    expect(result.passbook.daily[0].date).toBe("2026-03-15");
    expect(result.passbook.daily.at(-1)?.date).toBe("2026-04-30");
    expect(result.passbook.expectedCumulativeTargetPaise).toBe(result.lifetime.targetPaise);
    expect(result.passbook.actualEligibleSurplusPaise).toBe(result.lifetime.profitPaise);
    expect(result.passbook.positionPaise).toBe(
      result.passbook.actualEligibleSurplusPaise - result.passbook.expectedCumulativeTargetPaise,
    );
    expect(result.passbook.remainingTargetPaise).toBe(
      Math.max(0, -result.passbook.positionPaise),
    );
    expect(result.passbook.daily.at(-1)?.positionPaise).toBe(result.passbook.positionPaise);
    expect(result.passbook.daily.at(-1)?.remainingTargetPaise).toBe(result.passbook.remainingTargetPaise);
  });



  it("carries the verified source identities into each daily Passbook row", () => {
    const result = calculatePerformanceV1({
      businessStartDate: "2026-03-01", periodFrom: "2026-03-01", periodTo: "2026-03-01",
      monthlyDriverTargetPaise: 3_100,
      revenue: [{ date: "2026-03-01", grossFarePaise: 5_000, cancellationFeePaise: 0,
        verified: true, sourceRefs: [{ sourceId: "trip:passbook-source", revision: 2 }] }],
      costs: [{ date: "2026-03-01", kind: "fuel", amountPaise: 500, verified: true,
        sourceRefs: [{ sourceId: "fuel:passbook-source", revision: 3 }] }],
      preBusinessRecovery: [], completeness: [],
    });
    expect(result.passbook.daily[0].sourceRefs).toEqual([
      { sourceId: "fuel:passbook-source", revision: 3 },
      { sourceId: "trip:passbook-source", revision: 2 },
    ]);
  });

  it("recovers an earlier Passbook shortfall with later eligible surplus", () => {
    const passbook = buildPerformancePassbookV1({
      businessStartDate: "2026-03-01",
      periodTo: "2026-03-03",
      monthlyDriverTargetPaise: 3_100,
      daily: [
        { date: "2026-03-01", profitPaise: 0 },
        { date: "2026-03-02", profitPaise: 250 },
        { date: "2026-03-03", profitPaise: -50 },
      ],
    });
    expect(passbook.daily[0]).toMatchObject({
      expectedCumulativeTargetPaise: 100, actualCumulativeSurplusPaise: 0,
      positionPaise: -100, remainingTargetPaise: 100,
    });
    expect(passbook.daily[1]).toMatchObject({
      expectedCumulativeTargetPaise: 200, actualCumulativeSurplusPaise: 250,
      positionPaise: 50, remainingTargetPaise: 0,
    });
    expect(passbook.daily[2]).toMatchObject({
      expectedCumulativeTargetPaise: 300, actualCumulativeSurplusPaise: 200,
      positionPaise: -100, remainingTargetPaise: 100,
    });
    expect(passbook.positionPaise).toBe(passbook.daily[2].positionPaise);
  });

  it("rejects duplicate recovery source identities and invalid amounts", () => {
    expect(() => allocatePreBusinessRecoveryV1("2026-03-15", [
      { sourceId: "same", revision: 1, amountPaise: 1, note: "a", origin: "manual" },
      { sourceId: "same", revision: 2, amountPaise: 1, note: "b", origin: "manual" },
    ])).toThrow("performance_recovery_source_invalid");
  });
});
