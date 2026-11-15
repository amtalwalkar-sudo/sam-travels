import { describe, expect, it, vi } from "vitest";
import { PerformanceCalculationServiceV1, type PerformanceCalculationReadModelsV1 } from "../packages/application/src/performance-calculation-service";
import { PerformanceTripRevenueAdapterV1 } from "../packages/application/src/performance-trip-revenue-adapter";
import type { CompletedTripFinancialObligation } from "../packages/application/src/trip-financial-service";
import type { RecordEnvelope } from "../packages/core/src/types";

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
    expect(result.daily[0].costs["pre-business-manual-recovery"]).toBeGreaterThan(0);
    expect(result.daily[0].costs["pre-business-emi-recovery"]).toBeGreaterThan(0);
    expect(result.daily[0].costs["pre-business-compliance-recovery"]).toBeGreaterThan(0);
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

  it("prepares and releases a shared source snapshot once for the full calculation", async () => {
    const base = sources();
    const fixed = {
      ...base.emi,
      ...base.compliance,
      prepareSnapshot: vi.fn(async (_from: string, _to: string) => {}),
      releaseSnapshot: vi.fn(),
    };
    const readModels: PerformanceCalculationReadModelsV1 = {
      ...base, emi: fixed, compliance: fixed,
    };
    await new PerformanceCalculationServiceV1(readModels).calculate("2026-03-16", "2026-03-16");
    expect(fixed.prepareSnapshot).toHaveBeenCalledTimes(1);
    expect(fixed.prepareSnapshot).toHaveBeenCalledWith("2026-03-15", "2026-03-16");
    expect(fixed.releaseSnapshot).toHaveBeenCalledTimes(1);
  });

  it("reconciles a corrected trip revenue revision on the next calculation snapshot", async () => {
    let record: RecordEnvelope<CompletedTripFinancialObligation> = {
      id: "work:trip-financial-obligation:corrected-trip", schemaVersion: 1,
      createdAt: "2026-04-05T10:00:00.000Z", updatedAt: "2026-04-05T10:00:00.000Z",
      source: "web", revision: 1,
      data: {
        schemaVersion: 1, tripId: "corrected-trip", kind: "completed_ride_financials",
        status: "submitted", endRideEventId: "end-corrected", createdAt: "2026-04-05T10:00:00.000Z",
        tripContext: { schemaVersion: 1, shiftId: "shift-1", driverId: "driver-1",
          assignmentId: "assignment-1", vehicleId: "vehicle-1", operationalDate: "2026-04-05" },
        farePaise: 10_000,
      },
    };
    const revenue = new PerformanceTripRevenueAdapterV1({
      submittedTripFinancialRecords: async () => [record],
    });
    const base = sources();
    const readModels: PerformanceCalculationReadModelsV1 = {
      ...base,
      revenue,
      operatingCosts: { listDailyCosts: async () => [] },
      emi: { listDailyEmiAllocations: async () => [], listPreBusinessEmiPortions: async () => [] },
      compliance: { listDailyComplianceAllocations: async () => [], listPreBusinessCompliancePortions: async () => [] },
      manualPreBusinessCosts: { listEntries: async () => [] },
    };
    const service = new PerformanceCalculationServiceV1(readModels);
    const first = await service.calculate("2026-04-05", "2026-04-05");
    record = {
      ...record, revision: 2, updatedAt: "2026-04-06T08:00:00.000Z",
      data: { ...record.data, farePaise: 12_500 },
    };
    const corrected = await service.calculate("2026-04-05", "2026-04-05");
    expect(first.period.revenuePaise).toBe(10_000);
    expect(corrected.period.revenuePaise).toBe(12_500);
    expect(corrected.provenance.sourceRefs).toContainEqual({
      sourceId: record.id, revision: 2,
    });
  });

  it("completes recovery through the exact 18-month anniversary under application orchestration", async () => {
    const base = sources();
    const readModels: PerformanceCalculationReadModelsV1 = {
      ...base,
      revenue: { listVerifiedDailyRevenue: async () => [] },
      operatingCosts: { listDailyCosts: async () => [] },
      emi: { listDailyEmiAllocations: async () => [], listPreBusinessEmiPortions: async () => [] },
      compliance: { listDailyComplianceAllocations: async () => [], listPreBusinessCompliancePortions: async () => [] },
      manualPreBusinessCosts: { listEntries: async () => [
        { sourceId: "pre-business-18m", revision: 3, amountPaise: 18_000,
          note: "Launch preparation", origin: "manual" as const },
      ] },
    };
    const result = await new PerformanceCalculationServiceV1(readModels)
      .calculate("2027-09-15", "2027-09-15");
    expect(result.recovery.from).toBe("2026-03-15");
    expect(result.recovery.toExclusive).toBe("2027-09-15");
    expect(result.recovery.totalPaise).toBe(18_000);
    expect(result.recovery.daily[result.recovery.daily.length - 1].date).toBe("2027-09-14");
    expect(result.daily).toHaveLength(1);
    expect(result.daily[0].date).toBe("2027-09-15");
    expect(result.daily[0].costs["pre-business-manual-recovery"]).toBe(0);
    expect(result.lifetime.costPaise).toBe(18_000);
  });

  it("keeps the monthly target configuration read-only and unprorated for date filters", async () => {
    const readModels = sources();
    const result = await new PerformanceCalculationServiceV1(readModels).calculate("2026-03-16", "2026-03-16");
    expect(result.period.monthlyDriverTargetPaise).toBe(50_000);
    expect(readModels.driverTarget.getMonthlyTargetPaise).toHaveBeenCalledTimes(1);
  });
});
