import { describe, expect, it } from "vitest";
import { BusinessStartDateCostAllocationService } from "../packages/application/src/business-start-date-cost-allocation-service";

const loanId = "feature:finance:loan:123e4567-e89b-42d3-a456-426614174000";
const loan = {
  id: loanId, schemaVersion: 1, createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z", source: "web", revision: 4,
  data: { schemaVersion: 1, kind: "loan", lifecycleState: "active",
    details: { loanName: "Vehicle loan", lenderName: "Lender", vehicleId: "feature:vehicle:MH01AB1234",
      principalPaise: 100_000, annualInterestRateBasisPoints: 1200,
      loanStartDate: "2026-01-01", tenureMonths: 3, firstEmiDate: "2026-01-01" },
    currentScheduleVersion: 1, scheduleVersions: [] },
};
const complianceRecord = {
  id: "feature:compliance:123e4567-e89b-42d3-a456-426614174001",
  schemaVersion: 1, createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z", source: "web", revision: 2,
  data: { schemaVersion: 1, vehicleId: "feature:vehicle:MH01AB1234",
    complianceName: "Insurance", validFrom: "2026-01-01", validTo: "2026-02-28", totalCostPaise: 1_000 },
};
const rows = [
  { installmentNumber: 1, dueDate: "2026-01-01", installmentAmountPaise: 3_100 },
  { installmentNumber: 2, dueDate: "2026-02-01", installmentAmountPaise: 2_800 },
  { installmentNumber: 3, dueDate: "2026-03-01", installmentAmountPaise: 3_100 },
];
function createService(options: { settlement?: boolean; overlap?: boolean } = {}) {
  const overview = {
    records: options.overlap ? [complianceRecord, {
      ...complianceRecord, id: "feature:compliance:123e4567-e89b-42d3-a456-426614174002",
      data: { ...complianceRecord.data, validFrom: "2026-02-01", validTo: "2026-03-31" },
    }] : [complianceRecord],
    reviews: [], gaps: [],
    overlaps: options.overlap ? [{
      vehicleId: complianceRecord.data.vehicleId, complianceName: "Insurance",
      firstRecordId: complianceRecord.id,
      secondRecordId: "feature:compliance:123e4567-e89b-42d3-a456-426614174002",
      from: "2026-02-01", to: "2026-02-28", days: 28,
      reviewStatus: "unreviewed",
    }] : [],
  };
  return new BusinessStartDateCostAllocationService(
    { async get() { return { id: "feature:business-settings:business", revision: 7,
      data: { schemaVersion: 1, businessStartDate: "2026-02-15" } }; } } as never,
    { async getOverview() { return overview; } } as never,
    { async list() { return [loan]; } } as never,
    { async getScheduleHistory() { return {
      currentScheduleVersion: 2,
      versions: [
        { version: 1, effectiveDate: "2026-01-01", createdAt: "2026-01-01T00:00:00.000Z",
          label: "Original schedule", rows, regularEmiPaise: 3_100,
          principalPaise: 100_000, totalInterestPaise: 0, totalScheduledPaymentsPaise: 9_000 },
        { version: 2, effectiveDate: "2026-02-01", createdAt: "2026-02-01T00:00:00.000Z",
          label: "Prepayment", rows, regularEmiPaise: 2_800,
          principalPaise: 90_000, totalInterestPaise: 0, totalScheduledPaymentsPaise: 9_000 },
      ], prepayments: [],
    }; } } as never,
    { async list() { return options.settlement ? [{
      kind: "settlement", id: "settlement-1", commandId: "settlement-1", loanId,
      businessDate: "2026-02-01", amountPaise: 90_000, method: "bank_transfer",
      scheduleVersion: 2, paidThroughInstallment: 2,
      createdAt: "2026-02-01T00:00:00.000Z", source: "web", status: "committed",
    }] : []; } } as never,
    () => "2026-11-13T00:00:00.000Z",
  );
}

describe("BusinessStartDateCostAllocationService", () => {
  it("rebuilds current Compliance and effective prepayment EMI schedule allocations from owner services", async () => {
    const report = await createService().getReport();
    expect(report.businessStartDate).toBe("2026-02-15");
    expect(report.businessSettingsRevision).toBe(7);
    expect(report.result.allocatedAmountPaise).toBe(10_000);
    expect(report.result.sources.some(item => item.sourceKind === "emi" && item.scheduleVersion === 2)).toBe(true);
    expect(report.result.daily.every(item => item.date >= report.businessStartDate)).toBe(true);
    expect(report.result.monthly.reduce((sum,item)=>sum+item.amountPaise,0)).toBe(10_000);
  });

  it("uses the Finance settlement's schedule and paid-through boundary without counting later instalments", async () => {
    const report = await createService({ settlement: true }).getReport();
    const emiSources = report.result.sources.filter(item => item.sourceKind === "emi");
    expect(emiSources).toHaveLength(1);
    expect(emiSources[0].sourceId.endsWith(":2")).toBe(true);
    expect(emiSources[0].sourceAmountPaise).toBe(2_800);
    expect(report.result.sources.find(item => item.sourceKind === "emi-pre-business-carry-forward")?.sourceAmountPaise).toBe(3_100);
    expect(report.result.allocatedAmountPaise).toBe(6_900);
  });

  it("withholds each source affected by unresolved Compliance overlaps", async () => {
    const report = await createService({ overlap: true }).getReport();
    const compliance = report.result.sources.filter(item => item.sourceKind === "compliance");
    expect(compliance).toHaveLength(2);
    expect(compliance.every(item => item.disposition === "overlap_review_required")).toBe(true);
    expect(report.result.withheldAmountPaise).toBe(2_000);
  });

  it("fails closed if Business Start Date has not been configured", async () => {
    const service = createService();
    const missingSettings = new BusinessStartDateCostAllocationService(
      { async get() { return undefined; } } as never,
      { async getOverview() { return { records: [], overlaps: [] }; } } as never,
      { async list() { return []; } } as never,
      { async getScheduleHistory() { throw new Error("not_expected"); } } as never,
      { async list() { return []; } } as never,
    );
    void service;
    await expect(missingSettings.getReport()).rejects.toThrow("business_start_date_not_configured");
  });
});
