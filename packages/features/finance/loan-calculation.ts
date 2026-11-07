export type LoanCalculationInput = Readonly<{
  principalPaise: number;
  annualInterestRateBasisPoints: number;
  tenureMonths: number;
  loanStartDate: string;
  firstEmiDate: string;
}>;

export type LoanEmiQuote = Readonly<{
  currencyCode: "INR";
  monthlyRateNumerator: number;
  monthlyRateDenominator: number;
  regularEmiPaise: number;
}>;

export type LoanScheduleRow = Readonly<{
  installmentNumber: number;
  dueDate: string;
  openingPrincipalPaise: number;
  interestPaise: number;
  installmentAmountPaise: number;
  principalComponentPaise: number;
  closingPrincipalPaise: number;
  finalAdjusted: boolean;
}>;

export type LoanAmortizationSchedule = Readonly<{
  currencyCode: "INR";
  principalPaise: number;
  annualInterestRateBasisPoints: number;
  tenureMonths: number;
  monthlyRateNumerator: number;
  monthlyRateDenominator: number;
  regularEmiPaise: number;
  rows: readonly LoanScheduleRow[];
  totalInterestPaise: number;
  totalScheduledPaymentsPaise: number;
}>;

const MONTHLY_RATE_DENOMINATOR = 120_000n;
const PAISE_PER_RUPEE = 100n;
const MAX_TENURE_MONTHS = 1200;

function assertIsoDate(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Invalid " + field);
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("Invalid " + field);
  }
}

function assertInput(input: LoanCalculationInput): void {
  if (!Number.isSafeInteger(input.principalPaise) || input.principalPaise <= 0) {
    throw new Error("Loan principal must be a positive integer number of paise");
  }
  if (!Number.isSafeInteger(input.annualInterestRateBasisPoints) || input.annualInterestRateBasisPoints < 0) {
    throw new Error("Annual interest rate must be a non-negative integer number of basis points");
  }
  if (!Number.isSafeInteger(input.tenureMonths) || input.tenureMonths < 1 || input.tenureMonths > MAX_TENURE_MONTHS) {
    throw new Error("Loan tenure must be between 1 and " + MAX_TENURE_MONTHS + " months");
  }
  assertIsoDate(input.loanStartDate, "loan start date");
  assertIsoDate(input.firstEmiDate, "first EMI date");
  if (Number(input.firstEmiDate.replaceAll("-", "")) < Number(input.loanStartDate.replaceAll("-", ""))) {
    throw new Error("First EMI date cannot precede loan start date");
  }
  if (!input.firstEmiDate.endsWith("-01")) {
    throw new Error("First EMI date must be the first day of a calendar month");
  }
}

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) throw new Error("Invalid positive rounding operands");
  const whole = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * 2n >= denominator ? whole + 1n : whole;
}

function safeNumber(value: bigint, field: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error(field + " exceeds the supported integer range");
  return result;
}

function regularEmiPaise(input: LoanCalculationInput): bigint {
  const principal = BigInt(input.principalPaise);
  const rate = BigInt(input.annualInterestRateBasisPoints);
  const months = BigInt(input.tenureMonths);
  let emiNumerator: bigint;
  let emiDenominator: bigint;

  if (rate === 0n) {
    emiNumerator = principal;
    emiDenominator = months;
  } else {
    const denominator = MONTHLY_RATE_DENOMINATOR;
    const growth = denominator + rate;
    const growthPower = growth ** months;
    const denominatorPower = denominator ** months;
    emiNumerator = principal * rate * growthPower;
    emiDenominator = denominator * (growthPower - denominatorPower);
  }

  return roundHalfUp(emiNumerator, emiDenominator * PAISE_PER_RUPEE) * PAISE_PER_RUPEE;
}

/** Exact monthly interest in paise, rounded half-up from opening principal. */
export function calculateMonthlyInterestPaise(
  openingPrincipalPaise: number,
  annualInterestRateBasisPoints: number,
): number {
  if (!Number.isSafeInteger(openingPrincipalPaise) || openingPrincipalPaise < 0 ||
      !Number.isSafeInteger(annualInterestRateBasisPoints) || annualInterestRateBasisPoints < 0) {
    throw new Error("Invalid monthly interest inputs");
  }
  return safeNumber(
    roundHalfUp(
      BigInt(openingPrincipalPaise) * BigInt(annualInterestRateBasisPoints),
      MONTHLY_RATE_DENOMINATOR,
    ),
    "Monthly interest",
  );
}

/** Calculate the Finance-owned regular EMI quote using exact rational arithmetic. */
export function calculateLoanEmiQuote(input: LoanCalculationInput): LoanEmiQuote {
  assertInput(input);
  const emi = regularEmiPaise(input);
  if (emi < PAISE_PER_RUPEE) throw new Error("Rounded scheduled EMI must be at least one rupee");
  const firstInterest = BigInt(calculateMonthlyInterestPaise(
    input.principalPaise,
    input.annualInterestRateBasisPoints,
  ));
  if (emi <= firstInterest) throw new Error("Rounded scheduled EMI does not amortize principal");

  return Object.freeze({
    currencyCode: "INR",
    monthlyRateNumerator: input.annualInterestRateBasisPoints,
    monthlyRateDenominator: Number(MONTHLY_RATE_DENOMINATOR),
    regularEmiPaise: safeNumber(emi, "Scheduled EMI"),
  });
}

function dueDateAt(firstEmiDate: string, installmentIndex: number): string {
  const [year, month] = firstEmiDate.split("-").map(Number);
  const absoluteMonth = year * 12 + (month - 1) + installmentIndex;
  const dueYear = Math.floor(absoluteMonth / 12);
  const dueMonth = absoluteMonth % 12 + 1;
  return String(dueYear).padStart(4, "0") + "-" + String(dueMonth).padStart(2, "0") + "-01";
}

/** Build the original fixed-rate monthly schedule; actual payments are separate records. */
export function buildLoanAmortizationSchedule(input: LoanCalculationInput): LoanAmortizationSchedule {
  const quote = calculateLoanEmiQuote(input);
  const regularEmi = BigInt(quote.regularEmiPaise);
  let opening = BigInt(input.principalPaise);
  let totalInterest = 0n;
  let totalPayments = 0n;
  const rows: LoanScheduleRow[] = [];

  for (let index = 0; index < input.tenureMonths && opening > 0n; index += 1) {
    const interest = BigInt(calculateMonthlyInterestPaise(
      safeNumber(opening, "Opening principal"),
      input.annualInterestRateBasisPoints,
    ));
    const amountDue = opening + interest;
    const finalAdjusted = index === input.tenureMonths - 1 || regularEmi >= amountDue;
    const payment = finalAdjusted ? amountDue : regularEmi;
    const principalComponent = payment - interest;
    if (principalComponent <= 0n) throw new Error("Scheduled EMI does not amortize principal");
    const closing = opening - principalComponent;
    if (closing < 0n) throw new Error("Scheduled EMI exceeds outstanding principal");
    const row = Object.freeze({
      installmentNumber: index + 1,
      dueDate: dueDateAt(input.firstEmiDate, index),
      openingPrincipalPaise: safeNumber(opening, "Opening principal"),
      interestPaise: safeNumber(interest, "Monthly interest"),
      installmentAmountPaise: safeNumber(payment, "Instalment amount"),
      principalComponentPaise: safeNumber(principalComponent, "Principal component"),
      closingPrincipalPaise: safeNumber(closing, "Closing principal"),
      finalAdjusted,
    });
    rows.push(row);
    opening = closing;
    totalInterest += interest;
    totalPayments += payment;
    if (finalAdjusted) break;
  }

  if (opening !== 0n) throw new Error("Loan schedule did not close within the approved tenure");
  return Object.freeze({
    currencyCode: "INR",
    principalPaise: input.principalPaise,
    annualInterestRateBasisPoints: input.annualInterestRateBasisPoints,
    tenureMonths: input.tenureMonths,
    monthlyRateNumerator: quote.monthlyRateNumerator,
    monthlyRateDenominator: quote.monthlyRateDenominator,
    regularEmiPaise: quote.regularEmiPaise,
    rows: Object.freeze(rows),
    totalInterestPaise: safeNumber(totalInterest, "Total interest"),
    totalScheduledPaymentsPaise: safeNumber(totalPayments, "Total scheduled payments"),
  });
}
