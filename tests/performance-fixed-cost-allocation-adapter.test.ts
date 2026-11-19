import { describe, expect, it } from "vitest";
import { PerformanceFixedCostAllocationAdapterV1 } from "../packages/application/src/performance-fixed-cost-allocation-adapter";
import type { BusinessStartDateCostAllocationReportV1 } from "../packages/application/src/business-start-date-cost-allocation-service";
import type { CostAllocationSourceResultV1 } from "../packages/domain/src/business-start-date-cost-allocation";

function daily(sourceId: string, sourceKind: "emi" | "compliance", sourceVersion: number, from: string, to: string) {
  const rows: { date: string; amountPaise: number; sourceId: string; sourceKind: "emi" | "compliance"; sourceVersion: number }[] = [];
  for (let day = Date.parse(from + "T00:00:00.000Z"); day <= Date.parse(to + "T00:00:00.000Z"); day += 86_400_000) {
    rows.push({ date: new Date(day).toISOString().slice(0, 10), amountPaise: 1, sourceId, sourceKind, sourceVersion });
  }
  return rows;
}
function source(input: Partial<CostAllocationSourceResultV1> & Pick<CostAllocationSourceResultV1, "sourceId" | "sourceKind" | "sourceVersion" | "sourceAmountPaise" | "disposition">): CostAllocationSourceResultV1 {
  return { ...input, daily: input.daily ?? [] };
}

describe("Performance fixed-cost allocation adapter v1", () => {
  it("consumes canonical daily rows once and flags historical sources without eligible days", async () => {
    const sources: CostAllocationSourceResultV1[] = [
      source({
        sourceId: "loan:emi:3", sourceKind: "emi", sourceVersion: 2, scheduleVersion: 1,
        sourceAmountPaise: 31, disposition: "allocated",
        sourcePeriod: { from: "2026-03-01", to: "2026-03-31", label: "EMI installment 3" },
        eligibleFrom: "2026-03-01", eligibleTo: "2026-03-31",
        daily: daily("loan:emi:3", "emi", 2, "2026-03-01", "2026-03-31").map(row => ({ ...row, scheduleVersion: 1 })),
      }),
      source({
        sourceId: "loan:emi:pre-business",
        sourceKind: "emi", sourceVersion: 2, scheduleVersion: 1,
        sourceAmountPaise: 31, disposition: "allocated",
        sourcePeriod: { from: "2026-01-01", to: "2026-02-28", label: "EMI installment 2" },
        eligibleFrom: "2026-03-01", eligibleTo: "2026-03-31",
        daily: daily("loan:emi:pre-business", "emi", 2, "2026-03-01", "2026-03-31"),
      }),
      source({
        sourceId: "loan:emi:2", sourceKind: "emi", sourceVersion: 2, scheduleVersion: 1,
        sourceAmountPaise: 5_000, disposition: "pre_business_historical",
        sourcePeriod: { from: "2026-01-01", to: "2026-02-28", label: "EMI installment 2" },
      }),
      source({
        sourceId: "compliance:overlap", sourceKind: "compliance", sourceVersion: 4,
        sourceAmountPaise: 306, disposition: "allocated",
        sourcePeriod: { from: "2026-03-01", to: "2026-12-31", label: "Annual permit" },
        eligibleFrom: "2026-03-01", eligibleTo: "2026-12-31",
        daily: daily("compliance:overlap", "compliance", 4, "2026-03-01", "2026-12-31"),
      }),
      source({
        sourceId: "compliance:historical", sourceKind: "compliance", sourceVersion: 3,
        sourceAmountPaise: 10_000, disposition: "pre_business_historical",
        sourcePeriod: { from: "2026-01-01", to: "2026-02-28", label: "Old permit" },
      }),
      source({
        sourceId: "compliance:pre-business", sourceKind: "compliance", sourceVersion: 5,
        sourceAmountPaise: 31, disposition: "allocated",
        sourcePeriod: { from: "2026-01-01", to: "2026-02-28", label: "Pre-start permit" },
        eligibleFrom: "2026-03-01", eligibleTo: "2026-03-31",
        daily: daily("compliance:pre-business", "compliance", 5, "2026-03-01", "2026-03-31"),
      }),
      source({
        sourceId: "compliance:blocked", sourceKind: "compliance", sourceVersion: 1,
        sourceAmountPaise: 5_000, disposition: "overlap_review_required",
      }),
    ];
    const report = {
      businessStartDate: "2026-03-01", businessSettingsRevision: 1,
      generatedAt: "2026-11-15T00:00:00.000Z",
      sourceCorrectionRefs: [{
        sourceId: "compliance:overlap",
        refs: [{ sourceId: "historical-correction:compliance-validity-change", revision: 1 }],
      }],
      result: {
        calculationId: "business-start-date-cost-allocation.v2", calculationVersion: 2,
        businessStartDate: "2026-03-01", sources,
        daily: [], monthly: [], yearly: [],
        allocatedAmountPaise: 0, historicalAmountPaise: 10_000, withheldAmountPaise: 5_000,
      },
    } as unknown as BusinessStartDateCostAllocationReportV1;
    let reads = 0;
    const adapter = new PerformanceFixedCostAllocationAdapterV1({
      getReport: async () => { reads++; return report; },
    });

    await adapter.prepareSnapshot("2026-03-01", "2026-12-31");
    const preBusiness = await adapter.listPreBusinessRecoveryEntries();
    const emi = await adapter.listDailyEmiAllocations("2026-03-01", "2026-03-31");
    const compliance = await adapter.listDailyComplianceAllocations("2026-03-01", "2026-12-31");
    const firstDayEmi = await adapter.listDailyEmiAllocations("2026-03-01", "2026-03-01");
    const firstDayCompliance = await adapter.listDailyComplianceAllocations("2026-03-01", "2026-03-01");
    const completeness = await adapter.getCompleteness("2026-03-01", "2026-12-31");
    adapter.releaseSnapshot();

    expect(reads).toBe(1);
    expect(emi.reduce((sum, row) => sum + row.amountPaise, 0)).toBe(31);
    expect(preBusiness).toContainEqual(expect.objectContaining({ sourceId: "loan:emi:pre-business", amountPaise: 31, origin: "emi", scheduleVersion: 1 }));
    expect(preBusiness).toContainEqual(expect.objectContaining({ sourceId: "compliance:pre-business", amountPaise: 31, origin: "compliance" }));
    expect(emi.every(row => row.verified && row.sourceRefs[0].revision === 2)).toBe(true);
    expect(emi.find(row => row.sourceRefs[0].sourceId === "loan:emi:3")?.sourceRefs[0].scheduleVersion).toBe(1);
    expect(new Set(emi.map(row => row.sourceRefs[0].sourceId)))
      .toEqual(new Set(["loan:emi:3"]));
    expect(compliance.reduce((sum, row) => sum + row.amountPaise, 0)).toBe(306);
    expect(compliance.every(row => row.verified &&
      row.sourceRefs.some(ref => ref.sourceId === "compliance:overlap" && ref.revision === 4) &&
      row.sourceRefs.some(ref => ref.sourceId === "historical-correction:compliance-validity-change" && ref.revision === 1))).toBe(true);
    // The adapter returns the canonical daily paise rows verbatim and does not
    // reconstruct a new distribution for the requested report window.
    expect(firstDayEmi.reduce((sum, row) => sum + row.amountPaise, 0)).toBe(1);
    expect(firstDayCompliance.reduce((sum, row) => sum + row.amountPaise, 0)).toBe(1);
    expect(completeness).toEqual([expect.objectContaining({ status: "review-required" })]);
  });

  it("rejects an allocation snapshot for a different business start date", async () => {
    const report = {
      businessStartDate: "2026-03-01", businessSettingsRevision: 1,
      generatedAt: "2026-11-15T00:00:00.000Z",
      result: {
        calculationId: "business-start-date-cost-allocation.v2", calculationVersion: 2,
        businessStartDate: "2026-03-01", sources: [],
        daily: [], monthly: [], yearly: [],
        allocatedAmountPaise: 0, historicalAmountPaise: 0, withheldAmountPaise: 0,
      },
    } as unknown as BusinessStartDateCostAllocationReportV1;
    const adapter = new PerformanceFixedCostAllocationAdapterV1({ getReport: async () => report });
    await expect(adapter.prepareSnapshot("2026-04-01", "2026-04-30"))
      .rejects.toThrow("performance_allocation_snapshot_business_start_date_mismatch");
    adapter.releaseSnapshot();
  });

  it("does not emit unreviewed overlap costs into daily or recovery totals", async () => {
    const report = {
      businessStartDate: "2026-03-01", businessSettingsRevision: 1,
      generatedAt: "2026-11-15T00:00:00.000Z",
      result: {
        calculationId: "business-start-date-cost-allocation.v2", calculationVersion: 2,
        businessStartDate: "2026-03-01",
        sources: [
          source({
            sourceId: "compliance:blocked", sourceKind: "compliance", sourceVersion: 1,
            sourceAmountPaise: 9_000, disposition: "overlap_review_required",
          }),
          source({
            sourceId: "compliance:missing-daily", sourceKind: "compliance", sourceVersion: 2,
            sourceAmountPaise: 12_000, disposition: "allocated",
            sourcePeriod: { from: "2026-03-01", to: "2026-03-31", label: "March permit" },
            eligibleFrom: "2026-03-01", eligibleTo: "2026-03-31", daily: [],
          }),
        ],
        daily: [], monthly: [], yearly: [],
        allocatedAmountPaise: 0, historicalAmountPaise: 0, withheldAmountPaise: 9_000,
      },
    } as unknown as BusinessStartDateCostAllocationReportV1;
    const adapter = new PerformanceFixedCostAllocationAdapterV1({ getReport: async () => report });
    expect(await adapter.listDailyComplianceAllocations("2026-03-01", "2026-12-31")).toEqual([]);
    await expect(adapter.getCompleteness("2026-03-01", "2026-03-31"))
      .resolves.toEqual([expect.objectContaining({
        status: "review-required",
        detail: expect.stringContaining("compliance:missing-daily has incomplete daily allocation rows"),
      })]);
  });
});
