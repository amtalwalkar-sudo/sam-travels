import { describe, expect, it } from "vitest";
import { executeRegisteredCalculation, initializeRuntimeRegistry } from "../packages/core/src/index";
import {
  buildLoanAmortizationSchedule,
  calculateLoanEmiQuote,
  calculateMonthlyInterestPaise,
  FINANCE_FEATURE_EXTENSION,
  LOAN_EMI_CALCULATION,
  type LoanCalculationInput,
} from "../packages/features/finance";

const standardInput: LoanCalculationInput = {
  principalPaise: 10_000_000,
  annualInterestRateBasisPoints: 1200,
  tenureMonths: 12,
  loanStartDate: "2026-01-10",
  firstEmiDate: "2026-02-01",
};

describe("Finance monthly reducing-balance loan calculation v1", () => {
  it("converts nominal annual rate to monthly by dividing by twelve", () => {
    expect(calculateLoanEmiQuote(standardInput)).toEqual({
      currencyCode: "INR",
      monthlyRateNumerator: 1200,
      monthlyRateDenominator: 120000,
      regularEmiPaise: 888500,
    });
  });

  it("builds the reducing-balance schedule and adjusts the final instalment to zero", () => {
    const schedule = buildLoanAmortizationSchedule(standardInput);
    expect(schedule.rows).toHaveLength(12);
    expect(schedule.rows[0]).toMatchObject({
      dueDate: "2026-02-01",
      openingPrincipalPaise: 10_000_000,
      interestPaise: 100_000,
      installmentAmountPaise: 888_500,
      principalComponentPaise: 788_500,
      closingPrincipalPaise: 9_211_500,
    });
    expect(schedule.rows[11]).toMatchObject({
      dueDate: "2027-01-01",
      openingPrincipalPaise: 879_550,
      interestPaise: 8_796,
      installmentAmountPaise: 888_346,
      principalComponentPaise: 879_550,
      closingPrincipalPaise: 0,
      finalAdjusted: true,
    });
    expect(schedule.totalInterestPaise).toBe(661_846);
    expect(schedule.totalScheduledPaymentsPaise).toBe(10_661_846);
    expect(schedule.rows.reduce((sum, row) => sum + row.principalComponentPaise, 0)).toBe(standardInput.principalPaise);
    expect(schedule.rows.every(row => row.closingPrincipalPaise >= 0)).toBe(true);
  });

  it("handles zero-interest loans and a final instalment adjustment", () => {
    const schedule = buildLoanAmortizationSchedule({
      ...standardInput,
      principalPaise: 1_000_000,
      annualInterestRateBasisPoints: 0,
      tenureMonths: 3,
    });
    expect(schedule.regularEmiPaise).toBe(333_300);
    expect(schedule.rows.map(row => row.installmentAmountPaise)).toEqual([333_300, 333_300, 333_400]);
    expect(schedule.totalInterestPaise).toBe(0);
    expect(schedule.rows[2].closingPrincipalPaise).toBe(0);
  });

  it("rounds an exact half-rupee EMI tie upward", () => {
    const input = {
      ...standardInput,
      principalPaise: 100,
      annualInterestRateBasisPoints: 0,
      tenureMonths: 2,
      loanStartDate: "2026-01-01",
      firstEmiDate: "2026-01-01",
    };
    expect(calculateLoanEmiQuote(input).regularEmiPaise).toBe(100);
    const schedule = buildLoanAmortizationSchedule(input);
    expect(schedule.rows).toHaveLength(1);
    expect(schedule.rows[0].finalAdjusted).toBe(true);
    expect(schedule.rows[0].closingPrincipalPaise).toBe(0);
  });

  it("rounds monthly interest to paise using half-up arithmetic", () => {
    expect(calculateMonthlyInterestPaise(1, 60_000)).toBe(1);
    expect(calculateMonthlyInterestPaise(1, 59_999)).toBe(0);
  });

  it("keeps due dates on the first across calendar and year boundaries", () => {
    const schedule = buildLoanAmortizationSchedule({
      ...standardInput,
      tenureMonths: 3,
      firstEmiDate: "2026-12-01",
    });
    expect(schedule.rows.map(row => row.dueDate)).toEqual([
      "2026-12-01", "2027-01-01", "2027-02-01",
    ]);
  });

  it("registers and executes the exact Finance calculation version with provenance", () => {
    const runtime = initializeRuntimeRegistry({ extensions: [FINANCE_FEATURE_EXTENSION] });
    expect(runtime.calculations.get(LOAN_EMI_CALCULATION.id)?.ownerFeatureId).toBe("finance");
    const result = executeRegisteredCalculation(
      runtime.calculations,
      LOAN_EMI_CALCULATION.id,
      standardInput,
      { version: 1, inputSchemaVersion: 1, outputSchemaVersion: 1 },
    );
    expect(result).toMatchObject({
      calculationId: "finance.loan-monthly-reducing-balance.v1",
      ownerFeatureId: "finance",
      version: 1,
      effectiveDate: "2026-01-10",
      unit: "INR-paise-monthly-EMI-quote",
      value: { regularEmiPaise: 888_500 },
    });
    expect(() => executeRegisteredCalculation(
      runtime.calculations,
      LOAN_EMI_CALCULATION.id,
      standardInput,
      { version: 2, inputSchemaVersion: 1, outputSchemaVersion: 1 },
    )).toThrow("Incompatible calculation version");
  });

  it("rejects invalid principal, rate, tenure, and date inputs", () => {
    expect(() => calculateLoanEmiQuote({ ...standardInput, principalPaise: 0 })).toThrow("positive integer");
    expect(() => calculateLoanEmiQuote({ ...standardInput, annualInterestRateBasisPoints: -1 })).toThrow("non-negative");
    expect(() => calculateLoanEmiQuote({ ...standardInput, tenureMonths: 0 })).toThrow("tenure");
    expect(() => calculateLoanEmiQuote({ ...standardInput, firstEmiDate: "2026-02-02" })).toThrow("first day");
    expect(() => calculateLoanEmiQuote({ ...standardInput, firstEmiDate: "2026-01-01" })).toThrow("cannot precede loan start");
    expect(() => calculateLoanEmiQuote({ ...standardInput, loanStartDate: "2026-02-01", firstEmiDate: "2026-02-01" })).not.toThrow();
    expect(() => calculateLoanEmiQuote({ ...standardInput, loanStartDate: "2026-02-30" })).toThrow("loan start date");
  });

  it("rejects a rounded EMI that cannot amortize the principal", () => {
    expect(() => calculateLoanEmiQuote({
      ...standardInput,
      principalPaise: 1,
      annualInterestRateBasisPoints: 0,
      tenureMonths: 1200,
    })).toThrow("at least one rupee");
  });
});
