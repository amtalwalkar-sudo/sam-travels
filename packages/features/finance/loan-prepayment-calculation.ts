import { buildLoanAmortizationSchedule, calculateMonthlyInterestPaise } from "./loan-calculation";

export const LOAN_PREPAYMENT_CALCULATION_ID = "finance.loan-prepayment-reamortization.v1" as const;
export type LoanPrepaymentModeV1 = "reduce_tenure" | "reduce_emi";
export type LoanPrepaymentCalculationInputV1 = Readonly<{
  principalPaise: number;
  annualInterestRateBasisPoints: number;
  regularEmiPaise: number;
  remainingDueDates: readonly string[];
  mode: LoanPrepaymentModeV1;
}>;
export type LoanPrepaymentScheduleRowV1 = Readonly<{
  installmentNumber: number;
  dueDate: string;
  openingPrincipalPaise: number;
  interestPaise: number;
  installmentAmountPaise: number;
  principalComponentPaise: number;
  closingPrincipalPaise: number;
  finalAdjusted: boolean;
}>;
export type LoanPrepaymentCalculationResultV1 = Readonly<{
  calculationId: typeof LOAN_PREPAYMENT_CALCULATION_ID;
  calculationVersion: 1;
  mode: LoanPrepaymentModeV1;
  openingPrincipalPaise: number;
  regularEmiPaise: number;
  remainingInstallmentCount: number;
  finalDueDate: string;
  rows: readonly LoanPrepaymentScheduleRowV1[];
  totalInterestPaise: number;
  totalScheduledPaymentsPaise: number;
  baselineRemainingInterestPaise: number;
  interestSavedPaise: number;
}>;

const MAX_TENURE_MONTHS = 1200;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function safeNumber(value: bigint, field: string): number {
  if (value < 0n || value > MAX_SAFE) throw new Error("finance_loan_prepayment_" + field + "_out_of_range");
  return Number(value);
}
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
function monthAfter(value: string, offset: number): string {
  const [year, month] = value.split("-").map(Number);
  const absolute = year * 12 + month - 1 + offset;
  return String(Math.floor(absolute / 12)).padStart(4, "0") + "-" +
    String(absolute % 12 + 1).padStart(2, "0") + "-01";
}
function assertInput(input: LoanPrepaymentCalculationInputV1): void {
  if (!Number.isSafeInteger(input.principalPaise) || input.principalPaise <= 0 ||
      !Number.isSafeInteger(input.annualInterestRateBasisPoints) || input.annualInterestRateBasisPoints < 0 ||
      !Number.isSafeInteger(input.regularEmiPaise) || input.regularEmiPaise <= 0 ||
      !Array.isArray(input.remainingDueDates) || input.remainingDueDates.length < 1 ||
      input.remainingDueDates.length > MAX_TENURE_MONTHS ||
      (input.mode !== "reduce_tenure" && input.mode !== "reduce_emi")) {
    throw new Error("finance_loan_prepayment_input_invalid");
  }
  input.remainingDueDates.forEach((date, index) => {
    if (!validDate(date) || !date.endsWith("-01") ||
        date !== monthAfter(input.remainingDueDates[0], index)) {
      throw new Error("finance_loan_prepayment_due_dates_invalid");
    }
  });
}

/** Build a schedule while retaining the current EMI; it may finish before the baseline horizon. */
function buildFixedEmiSchedule(
  principalPaise: number, rate: number, emiPaise: number, firstDueDate: string,
): readonly LoanPrepaymentScheduleRowV1[] {
  let opening = BigInt(principalPaise);
  const emi = BigInt(emiPaise);
  const rows: LoanPrepaymentScheduleRowV1[] = [];
  for (let index = 0; opening > 0n && index < MAX_TENURE_MONTHS; index += 1) {
    const interest = BigInt(calculateMonthlyInterestPaise(safeNumber(opening, "principal"), rate));
    if (emi <= interest) throw new Error("finance_loan_prepayment_emi_does_not_amortize");
    const amountDue = opening + interest;
    const finalAdjusted = emi >= amountDue;
    const amount = finalAdjusted ? amountDue : emi;
    const principal = amount - interest;
    const closing = opening - principal;
    if (principal <= 0n || closing < 0n) throw new Error("finance_loan_prepayment_schedule_invalid");
    rows.push(Object.freeze({
      installmentNumber: index + 1, dueDate: monthAfter(firstDueDate, index),
      openingPrincipalPaise: safeNumber(opening, "principal"),
      interestPaise: safeNumber(interest, "interest"),
      installmentAmountPaise: safeNumber(amount, "payment"),
      principalComponentPaise: safeNumber(principal, "principal_component"),
      closingPrincipalPaise: safeNumber(closing, "principal"),
      finalAdjusted,
    }));
    opening = closing;
    if (finalAdjusted) break;
  }
  if (opening !== 0n) throw new Error("finance_loan_prepayment_horizon_exceeded");
  return Object.freeze(rows);
}

/**
 * Versioned Finance re-amortization. Uses v1 monthly interest rounding and
 * integer-paise arithmetic without changing the original loan calculator.
 */
export function calculateLoanPrepaymentReamortizationV1(
  input: LoanPrepaymentCalculationInputV1,
): LoanPrepaymentCalculationResultV1 {
  assertInput(input);
  const baselineRows = buildFixedEmiSchedule(
    input.principalPaise, input.annualInterestRateBasisPoints,
    input.regularEmiPaise, input.remainingDueDates[0],
  );
  const baselineInterest = baselineRows.reduce((sum, row) => sum + BigInt(row.interestPaise), 0n);
  let rows: readonly LoanPrepaymentScheduleRowV1[];
  let regularEmiPaise: number;
  if (input.mode === "reduce_tenure") {
    regularEmiPaise = input.regularEmiPaise;
    rows = buildFixedEmiSchedule(input.principalPaise, input.annualInterestRateBasisPoints,
      regularEmiPaise, input.remainingDueDates[0]);
  } else {
    const schedule = buildLoanAmortizationSchedule({
      principalPaise: input.principalPaise,
      annualInterestRateBasisPoints: input.annualInterestRateBasisPoints,
      tenureMonths: input.remainingDueDates.length,
      loanStartDate: input.remainingDueDates[0],
      firstEmiDate: input.remainingDueDates[0],
    });
    regularEmiPaise = schedule.regularEmiPaise;
    rows = Object.freeze(schedule.rows.map((row, index) => Object.freeze({
      ...row, dueDate: input.remainingDueDates[index],
    })));
    if (regularEmiPaise > input.regularEmiPaise) {
      throw new Error("finance_loan_prepayment_reduced_emi_exceeds_previous");
    }
  }
  const revisedInterest = rows.reduce((sum, row) => sum + BigInt(row.interestPaise), 0n);
  const saved = baselineInterest - revisedInterest;
  if (saved < 0n) throw new Error("finance_loan_prepayment_interest_saving_invalid");
  const totalPayments = rows.reduce((sum, row) => sum + BigInt(row.installmentAmountPaise), 0n);
  return Object.freeze({
    calculationId: LOAN_PREPAYMENT_CALCULATION_ID, calculationVersion: 1,
    mode: input.mode, openingPrincipalPaise: input.principalPaise, regularEmiPaise,
    remainingInstallmentCount: rows.length, finalDueDate: rows[rows.length - 1].dueDate,
    rows, totalInterestPaise: safeNumber(revisedInterest, "total_interest"),
    totalScheduledPaymentsPaise: safeNumber(totalPayments, "total_payments"),
    baselineRemainingInterestPaise: safeNumber(baselineInterest, "baseline_interest"),
    interestSavedPaise: safeNumber(saved, "interest_saved"),
  });
}
