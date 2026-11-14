import { describe, expect, it } from "vitest";
import {
  allocateComplianceCostV1,
  allocateScheduledEmisV1,
  buildBusinessStartDateAllocationResultV1,
} from "../packages/domain/src/business-start-date-cost-allocation";

const compliance = (overrides: Partial<Parameters<typeof allocateComplianceCostV1>[1]> = {}) => ({
  id: "feature:compliance:record-a", revision: 3, complianceName: "Insurance",
  validFrom: "2026-01-01", validTo: "2026-01-10", totalCostPaise: 1_000,
  overlapReviewStatus: "not_overlapping" as const, ...overrides,
});
const loanSchedule = (overrides: Partial<Parameters<typeof allocateScheduledEmisV1>[1]> = {}) => ({
  loanId: "feature:finance:loan:loan-a", loanRevision: 8, scheduleVersion: 2,
  rows: [
    { installmentNumber: 1, dueDate: "2026-01-01", installmentAmountPaise: 3_100 },
    { installmentNumber: 2, dueDate: "2026-02-01", installmentAmountPaise: 2_800 },
    { installmentNumber: 3, dueDate: "2026-03-01", installmentAmountPaise: 3_100 },
  ], ...overrides,
});

describe("Business Start Date Compliance allocation", () => {
  it("carries the complete source cost forward across remaining inclusive validity days", () => {
    const result = allocateComplianceCostV1("2026-01-06", compliance());
    expect(result.disposition).toBe("allocated");
    expect(result.eligibleFrom).toBe("2026-01-06");
    expect(result.eligibleTo).toBe("2026-01-10");
    expect(result.daily.map(row => row.amountPaise)).toEqual([200,200,200,200,200]);
    expect(result.daily.reduce((sum,row)=>sum+row.amountPaise,0)).toBe(1_000);
    expect(result.daily.every(row => row.date >= "2026-01-06")).toBe(true);
  });

  it("allocates a record beginning on the Business Start Date over its full period", () => {
    const result = allocateComplianceCostV1("2026-01-01", compliance({ validFrom: "2026-01-01", validTo: "2026-01-03" }));
    expect(result.daily.map(row => row.date)).toEqual(["2026-01-01","2026-01-02","2026-01-03"]);
    expect(result.daily.reduce((sum,row)=>sum+row.amountPaise,0)).toBe(1_000);
  });

  it("retains an expired pre-business record without extending its end date", () => {
    const result = allocateComplianceCostV1("2026-01-11", compliance());
    expect(result.disposition).toBe("pre_business_historical");
    expect(result.daily).toEqual([]);
    expect(result.sourceAmountPaise).toBe(1_000);
  });

  it.each(["unreviewed","rejected","stale"] as const)("withholds %s overlap sources", status => {
    const result = allocateComplianceCostV1("2026-01-01", compliance({ overlapReviewStatus: status }));
    expect(result.disposition).toBe("overlap_review_required");
    expect(result.daily).toEqual([]);
  });

  it("distributes residual paise to earlier eligible dates deterministically", () => {
    const result = allocateComplianceCostV1("2026-01-01", compliance({ validTo: "2026-01-03", totalCostPaise: 10 }));
    expect(result.daily.map(row => row.amountPaise)).toEqual([4,3,3]);
  });
});

describe("Business Start Date scheduled EMI allocation", () => {
  it("allocates straddling EMI and later EMIs separately and carries fully elapsed periods", () => {
    const results = allocateScheduledEmisV1("2026-02-15", loanSchedule());
    const carry = results.find(item => item.sourceKind === "emi-pre-business-carry-forward")!;
    const february = results.find(item => item.sourceKind === "emi" && item.sourceId.endsWith(":2"))!;
    const march = results.find(item => item.sourceKind === "emi" && item.sourceId.endsWith(":3"))!;
    expect(carry.sourceAmountPaise).toBe(3_100);
    expect(carry.eligibleFrom).toBe("2026-02-15");
    expect(carry.eligibleTo).toBe("2026-03-31");
    expect(february.eligibleFrom).toBe("2026-02-15");
    expect(february.eligibleTo).toBe("2026-02-28");
    expect(march.eligibleFrom).toBe("2026-03-01");
    expect(march.eligibleTo).toBe("2026-03-31");
    expect(results.reduce((sum,item)=>sum+item.sourceAmountPaise,0)).toBe(9_000);
    expect(results.every(item => item.daily.every(row => row.date >= "2026-02-15"))).toBe(true);
  });

  it("uses complete scheduled EMI amounts and retains schedule and source revisions", () => {
    const results = allocateScheduledEmisV1("2026-02-01", loanSchedule());
    const first = results.find(item => item.sourceKind === "emi")!;
    expect(first.sourceAmountPaise).toBe(2_800);
    expect(first.sourceVersion).toBe(8);
    expect(first.scheduleVersion).toBe(2);
    expect(first.daily.every(row => row.sourceVersion === 8 && row.scheduleVersion === 2)).toBe(true);
  });

  it("uses the final scheduled calendar month end for the last period", () => {
    const results = allocateScheduledEmisV1("2026-03-15", loanSchedule({
      rows: [{ installmentNumber: 9, dueDate: "2026-03-15", installmentAmountPaise: 5_000 }],
    }));
    expect(results[0].eligibleTo).toBe("2026-03-31");
    expect(results[0].daily).toHaveLength(17);
  });

  it("handles leap day and month/year boundaries with inclusive dates", () => {
    const results = allocateScheduledEmisV1("2024-03-01", loanSchedule({
      rows: [
        { installmentNumber: 1, dueDate: "2024-01-01", installmentAmountPaise: 100 },
        { installmentNumber: 2, dueDate: "2024-03-01", installmentAmountPaise: 200 },
        { installmentNumber: 3, dueDate: "2024-04-01", installmentAmountPaise: 300 },
      ],
    }));
    const carry = results.find(item => item.sourceKind === "emi-pre-business-carry-forward")!;
    expect(carry.eligibleTo).toBe("2024-04-30");
    expect(carry.daily[0].date).toBe("2024-03-01");
  });

  it("caps the final EMI allocation period at the loan settlement date", () => {
    const results = allocateScheduledEmisV1("2026-03-15", loanSchedule({
      rows: [{ installmentNumber: 9, dueDate: "2026-03-15", installmentAmountPaise: 5_000 }],
      allocationEndDate: "2026-03-20",
    }));
    expect(results[0].eligibleTo).toBe("2026-03-20");
    expect(results[0].daily).toHaveLength(6);
    expect(results[0].daily.reduce((sum,row)=>sum+row.amountPaise,0)).toBe(5_000);
  });

  it("marks a schedule fully elapsed before Business Start Date as historical", () => {
    const results = allocateScheduledEmisV1("2026-04-01", loanSchedule({
      rows: [{ installmentNumber: 1, dueDate: "2026-01-01", installmentAmountPaise: 1_000 }],
    }));
    expect(results).toHaveLength(1);
    expect(results[0].disposition).toBe("pre_business_historical");
    expect(results[0].daily).toEqual([]);
  });

  it("does not split scheduled EMI into principal and interest components", () => {
    const results = allocateScheduledEmisV1("2026-02-01", loanSchedule());
    const scheduled = results.filter(item => item.sourceKind === "emi");
    expect(scheduled.map(item => item.sourceAmountPaise)).toEqual([2_800,3_100]);
  });

  it("rejects duplicate installments, invalid dates, and zero scheduled EMI amounts", () => {
    expect(() => allocateScheduledEmisV1("2026-01-01", loanSchedule({
      rows: [
        { installmentNumber: 1, dueDate: "2026-01-01", installmentAmountPaise: 100 },
        { installmentNumber: 1, dueDate: "2026-02-01", installmentAmountPaise: 100 },
      ],
    }))).toThrow("business_start_date_emi_schedule_invalid");
    expect(() => allocateScheduledEmisV1("2026-01-01", loanSchedule({
      rows: [{ installmentNumber: 1, dueDate: "2026-02-30", installmentAmountPaise: 100 }],
    }))).toThrow("business_start_date_allocation_date_invalid");
    expect(() => allocateScheduledEmisV1("2026-01-01", loanSchedule({
      rows: [{ installmentNumber: 1, dueDate: "2026-01-01", installmentAmountPaise: 0 }],
    }))).toThrow("business_start_date_emi_amount_invalid");
  });
});

describe("Business Start Date reporting rollups", () => {
  it("derives daily, monthly, and yearly totals from the same integer-paise rows", () => {
    const complianceResult = allocateComplianceCostV1("2026-12-31", compliance({
      validFrom: "2026-12-30", validTo: "2027-01-02", totalCostPaise: 7,
    }));
    const result = buildBusinessStartDateAllocationResultV1("2026-12-31", [complianceResult]);
    expect(result.daily).toEqual([
      { date: "2026-12-31", amountPaise: 3 },
      { date: "2027-01-01", amountPaise: 2 },
      { date: "2027-01-02", amountPaise: 2 },
    ]);
    expect(result.monthly).toEqual([{ month: "2026-12", amountPaise: 3 }, { month: "2027-01", amountPaise: 4 }]);
    expect(result.yearly).toEqual([{ year: "2026", amountPaise: 3 }, { year: "2027", amountPaise: 4 }]);
    expect(result.allocatedAmountPaise).toBe(7);
  });

  it("rejects non-reconciling derived sources", () => {
    const source = allocateComplianceCostV1("2026-01-01", compliance());
    expect(() => buildBusinessStartDateAllocationResultV1("2026-01-01", [{
      ...source, sourceAmountPaise: source.sourceAmountPaise + 1,
    }])).toThrow("business_start_date_allocation_source_reconciliation_failed");
  });
});
