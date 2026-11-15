import { describe, expect, it, vi } from "vitest";
import { PerformanceCalculationServiceV1, type PerformanceCalculationReadModelsV1 } from "../packages/application/src/performance-calculation-service";

function sources(): PerformanceCalculationReadModelsV1 {
  return {
    businessSettings: { getBusinessStartDate: vi.fn(async () => "2026-03-15") },
    driverTarget: { getMonthlyTargetPaise: vi.fn(async () => 50_000) },
    revenue: { listVerifiedDailyRevenue: vi.fn(async () => [
      { date: "2026-03-16", grossFarePaise: 10_000, cancellationFeePaise: 500, verified: true,
        sourceRefs: [{ sourceId: "fare", revision: 1 }, { sourceId: "cancel", revision: 1 }] },
    ]) },
    operatingCosts: { listDailyCosts: vi.fn(async () => [
      { date: "2026-03-16", kind: "fuel" as const, amountPaise: 1_000, verified: true,
        sourceRefs: [{ sourceId: "fuel", revision: 1 }] },
    ]) },
    emi: {
      listDailyEmiAllocations: vi.fn(async () => [
        { date: "2026-03-16", kind: "emi" as const, amountPaise: 2_000, verified: true,
          sourceRefs: [{ sourceId: "emi", revision: 1 }] },
      ]),
      listPreBusinessEmiPortions: vi.fn(async () => [
        { sourceId: "emi-pre", revision: 1, amountPaise: 18_000, note: "Before business start", origin: "emi" as const },
      ]),
    },
    compliance: {
      listDailyComplianceAllocations: vi.fn(async () => [
        { date: "2026-03-16", kind: "compliance" as const, amountPaise: 500, verified: true,
          sourceRefs: [{ sourceId: "compliance", revision: 1 }] },
      ]),
      listPreBusinessCompliancePortions: vi.fn(async () => [
        { sourceId: "compliance-pre", revision: 1, amountPaise: 9_000, note: "Before business start", origin: "compliance" as const },
      ]),
    },
    manualPreBusinessCosts: { listEntries: vi.fn(async () => [
      { sourceId: "manual-pre", revision: 1, amountPaise: 3_000, note: "Initial setup", origin: "manual" as const },
    ]) },
    completeness: { getCompleteness: vi.fn(async () => [{ source: "all", status: "complete" as const }]) },
  };
}

describe("PerformanceCalculationServiceV1", () => {
  it("composes separately owned EMI and Compliance sources without merging their identities", async () => {
    const readModels = sources();
    const result = await new PerformanceCalculationServiceV1(readModels).calculate("2026-03-16", "2026-03-16");
    expect(readModels.emi.listDailyEmiAllocations).toHaveBeenCalledWith("2026-03-15", "2026-03-16");
    expect(readModels.compliance.listDailyComplianceAllocations).toHaveBeenCalledWith("2026-03-15", "2026-03-16");
    expect(result.daily[0].costs.emi).toBe(2_000);
    expect(result.daily[0].costs.compliance).toBe(500);
    expect(result.daily[0].costs["pre-business-recovery"]).toBeGreaterThan(0);
    expect(result.provenance.sourceRefs.map(row => row.sourceId)).toContain("emi");
    expect(result.provenance.sourceRefs.map(row => row.sourceId)).toContain("compliance");
  });

  it("rejects cross-category source leakage instead of silently double counting", async () => {
    const readModels = sources();
    vi.mocked(readModels.operatingCosts.listDailyCosts).mockResolvedValue([
      { date: "2026-03-16", kind: "fuel", amountPaise: 100, verified: true, sourceRefs: [] },
    ]);
    vi.mocked(readModels.emi.listDailyEmiAllocations).mockResolvedValue([
      { date: "2026-03-16", kind: "compliance", amountPaise: 100, verified: true, sourceRefs: [] },
    ]);
    await expect(new PerformanceCalculationServiceV1(readModels).calculate("2026-03-16", "2026-03-16"))
      .rejects.toThrow("performance_emi_read_model_kind_invalid");
  });

  it("keeps the monthly target configuration read-only and unprorated for date filters", async () => {
    const readModels = sources();
    const result = await new PerformanceCalculationServiceV1(readModels).calculate("2026-03-16", "2026-03-16");
    expect(result.period.monthlyDriverTargetPaise).toBe(50_000);
    expect(readModels.driverTarget.getMonthlyTargetPaise).toHaveBeenCalledTimes(1);
  });
});
