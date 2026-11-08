import { describe, expect, it } from "vitest";
import { calculateLoanEmiQuote, calculateLoanPrepaymentReamortizationV1 } from "../packages/features/finance";

const dates = ["2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01"];

describe("Finance loan prepayment re-amortization v1", () => {
  it("keeps EMI and shortens tenure in Reduce Tenure mode", () => {
    const baselineEmi = calculateLoanEmiQuote({
      principalPaise: 10_000_000, annualInterestRateBasisPoints: 1200,
      tenureMonths: 12, loanStartDate: "2026-02-01", firstEmiDate: "2026-02-01",
    }).regularEmiPaise;
    const result = calculateLoanPrepaymentReamortizationV1({
      baselinePrincipalPaise: 10_000_000, principalPaise: 9_000_000,
      annualInterestRateBasisPoints: 1200, regularEmiPaise: baselineEmi,
      remainingDueDates: Array.from({ length: 20 }, (_, index) => {
        const date = new Date(Date.UTC(2026, 1 + index, 1));
        return date.toISOString().slice(0, 10);
      }), mode: "reduce_tenure",
    });
    expect(result.regularEmiPaise).toBe(baselineEmi);
    expect(result.remainingInstallmentCount).toBeLessThan(20);
    expect(result.rows.at(-1)?.closingPrincipalPaise).toBe(0);
    expect(result.interestSavedPaise).toBeGreaterThan(0);
  });

  it("keeps the remaining installment dates and reduces EMI in Reduce EMI mode", () => {
    const baselineEmi = calculateLoanEmiQuote({
      principalPaise: 10_000_000, annualInterestRateBasisPoints: 1200,
      tenureMonths: 4, loanStartDate: dates[0], firstEmiDate: dates[0],
    }).regularEmiPaise;
    const result = calculateLoanPrepaymentReamortizationV1({
      baselinePrincipalPaise: 10_000_000, principalPaise: 9_000_000,
      annualInterestRateBasisPoints: 1200, regularEmiPaise: baselineEmi,
      remainingDueDates: dates, mode: "reduce_emi",
    });
    expect(result.regularEmiPaise).toBeLessThan(baselineEmi);
    expect(result.remainingInstallmentCount).toBe(dates.length);
    expect(result.rows.map(row => row.dueDate)).toEqual(dates);
    expect(result.rows.at(-1)?.closingPrincipalPaise).toBe(0);
    expect(result.interestSavedPaise).toBeGreaterThan(0);
  });

  it("handles zero interest with exact final installment adjustment", () => {
    const result = calculateLoanPrepaymentReamortizationV1({
      baselinePrincipalPaise: 1_200_000, principalPaise: 900_000,
      annualInterestRateBasisPoints: 0, regularEmiPaise: 333_300,
      remainingDueDates: dates, mode: "reduce_tenure",
    });
    expect(result.remainingInstallmentCount).toBe(3);
    expect(result.rows.map(row => row.installmentAmountPaise)).toEqual([333_300, 333_300, 233_400]);
    expect(result.totalInterestPaise).toBe(0);
    expect(result.interestSavedPaise).toBe(0);
  });

  it("rejects invalid principal, due dates, and a non-amortizing EMI", () => {
    const valid = {
      baselinePrincipalPaise: 1_200_000, principalPaise: 900_000,
      annualInterestRateBasisPoints: 0, regularEmiPaise: 333_300,
      remainingDueDates: dates, mode: "reduce_tenure" as const,
    };
    expect(() => calculateLoanPrepaymentReamortizationV1({ ...valid, principalPaise: 1_200_000 })).toThrow("input_invalid");
    expect(() => calculateLoanPrepaymentReamortizationV1({ ...valid, remainingDueDates: ["2026-02-02"] })).toThrow("due_dates_invalid");
    expect(() => calculateLoanPrepaymentReamortizationV1({
      ...valid, annualInterestRateBasisPoints: 120_000, regularEmiPaise: 100,
    })).toThrow("does_not_amortize");
  });
});
