import {
  buildLoanAmortizationSchedule,
  type LoanAmortizationSchedule,
  type LoanCalculationInput,
} from "./loan-calculation";

export const FINANCE_LOAN_RECORD_ID_PREFIX = "feature:finance:loan:";
export const FINANCE_LOAN_CALCULATION_ID = "finance.loan-monthly-reducing-balance.v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LoanDetailsV1 = Readonly<{
  loanName: string;
  lenderName: string;
  loanAccountReference?: string;
  vehicleId: string;
  principalPaise: number;
  annualInterestRateBasisPoints: number;
  loanStartDate: string;
  tenureMonths: number;
  firstEmiDate: string;
}>;

export type LoanScheduleVersionV1 = Readonly<{
  version: number;
  createdAt: string;
  effectiveDate: string;
  calculationId: typeof FINANCE_LOAN_CALCULATION_ID;
  calculationVersion: 1;
  inputSchemaVersion: 1;
  outputSchemaVersion: 1;
  input: LoanCalculationInput;
  output: LoanAmortizationSchedule;
}>;

export type FinanceLoanRecordV1 = Readonly<{
  schemaVersion: 1;
  kind: "loan";
  details: LoanDetailsV1;
  currentScheduleVersion: number;
  scheduleVersions: readonly LoanScheduleVersionV1[];
  lifecycleState?: "active" | "closed";
}>;

export function financeLoanRecordId(uuid: string): string {
  if (typeof uuid !== "string" || !UUID.test(uuid)) throw new Error("finance_loan_uuid_invalid");
  return FINANCE_LOAN_RECORD_ID_PREFIX + uuid.toLowerCase();
}

export function assertFinanceLoanRecordIdentity(id: string): void {
  if (typeof id !== "string" || !id.startsWith(FINANCE_LOAN_RECORD_ID_PREFIX) ||
      financeLoanRecordId(id.slice(FINANCE_LOAN_RECORD_ID_PREFIX.length)) !== id) {
    throw new Error("finance_loan_record_identity_invalid");
  }
}

export function loanCalculationInput(details: LoanDetailsV1): LoanCalculationInput {
  return {
    principalPaise: details.principalPaise,
    annualInterestRateBasisPoints: details.annualInterestRateBasisPoints,
    tenureMonths: details.tenureMonths,
    loanStartDate: details.loanStartDate,
    firstEmiDate: details.firstEmiDate,
  };
}

function sameCalculationInputs(left: LoanDetailsV1, right: LoanDetailsV1): boolean {
  const a = loanCalculationInput(left), b = loanCalculationInput(right);
  return a.principalPaise === b.principalPaise &&
    a.annualInterestRateBasisPoints === b.annualInterestRateBasisPoints &&
    a.tenureMonths === b.tenureMonths &&
    a.loanStartDate === b.loanStartDate && a.firstEmiDate === b.firstEmiDate;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function assertDetails(value: unknown): asserts value is LoanDetailsV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("finance_loan_details_invalid");
  const d = value as Record<string, unknown>;
  const required = ["loanName", "lenderName", "vehicleId", "principalPaise",
    "annualInterestRateBasisPoints", "loanStartDate", "tenureMonths", "firstEmiDate"];
  const allowed = new Set([...required, "loanAccountReference"]);
  if (required.some(key => !(key in d)) || Object.keys(d).some(key => !allowed.has(key)) ||
      typeof d.loanName !== "string" || !d.loanName.trim() ||
      typeof d.lenderName !== "string" || !d.lenderName.trim() ||
      (d.loanAccountReference !== undefined &&
        (typeof d.loanAccountReference !== "string" || !d.loanAccountReference.trim())) ||
      typeof d.vehicleId !== "string" || !d.vehicleId.startsWith("feature:vehicle:") ||
      !Number.isSafeInteger(d.principalPaise) || (d.principalPaise as number) <= 0 ||
      !Number.isSafeInteger(d.annualInterestRateBasisPoints) || (d.annualInterestRateBasisPoints as number) < 0 ||
      !Number.isSafeInteger(d.tenureMonths) || (d.tenureMonths as number) < 1 || (d.tenureMonths as number) > 1200 ||
      !validDate(d.loanStartDate) || !validDate(d.firstEmiDate)) {
    throw new Error("finance_loan_details_invalid");
  }
  if (d.firstEmiDate < d.loanStartDate || !d.firstEmiDate.endsWith("-01")) {
    throw new Error("finance_loan_dates_invalid");
  }
}

export function assertFinanceLoanRecordV1(value: unknown): asserts value is FinanceLoanRecordV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("finance_loan_record_invalid");
  const record = value as Record<string, unknown>;
  const allowedKeys = ["currentScheduleVersion", "details", "kind", "scheduleVersions", "schemaVersion", "lifecycleState"];
  if (Object.keys(record).some(key => !allowedKeys.includes(key)) ||
      (record.lifecycleState !== undefined && record.lifecycleState !== "active" && record.lifecycleState !== "closed") ||
      Object.keys(record).filter(key => key !== "lifecycleState").sort().join("|") !==
      ["currentScheduleVersion", "details", "kind", "scheduleVersions", "schemaVersion"].sort().join("|") ||
      record.schemaVersion !== 1 || record.kind !== "loan" ||
      !Array.isArray(record.scheduleVersions) || record.scheduleVersions.length < 1) {
    throw new Error("finance_loan_record_invalid");
  }
  assertDetails(record.details);
  const versions = record.scheduleVersions as unknown[];
  let previousCreatedAt = "";
  versions.forEach((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("finance_loan_schedule_version_invalid");
    const v = raw as Record<string, unknown>;
    const keys = ["version", "createdAt", "effectiveDate", "calculationId", "calculationVersion",
      "inputSchemaVersion", "outputSchemaVersion", "input", "output"];
    if (Object.keys(v).sort().join("|") !== keys.sort().join("|") ||
        v.version !== index + 1 || typeof v.createdAt !== "string" ||
        !Number.isFinite(Date.parse(v.createdAt)) || v.createdAt < previousCreatedAt ||
        !validDate(v.effectiveDate) || v.calculationId !== FINANCE_LOAN_CALCULATION_ID ||
        v.calculationVersion !== 1 || v.inputSchemaVersion !== 1 || v.outputSchemaVersion !== 1) {
      throw new Error("finance_loan_schedule_version_invalid");
    }
    previousCreatedAt = v.createdAt;
    const input = v.input as LoanCalculationInput;
    const output = v.output as LoanAmortizationSchedule;
    const expected = buildLoanAmortizationSchedule(input);
    if (JSON.stringify(expected) !== JSON.stringify(output) ||
        v.effectiveDate !== input.loanStartDate) {
      throw new Error("finance_loan_schedule_provenance_invalid");
    }
  });
  const current = record.currentScheduleVersion;
  if (!Number.isSafeInteger(current) || current !== versions.length) {
    throw new Error("finance_loan_current_schedule_version_invalid");
  }
  const last = versions[versions.length - 1] as LoanScheduleVersionV1;
  if (!sameCalculationInputs(record.details as LoanDetailsV1, {
    ...record.details as LoanDetailsV1,
    principalPaise: last.input.principalPaise,
    annualInterestRateBasisPoints: last.input.annualInterestRateBasisPoints,
    tenureMonths: last.input.tenureMonths,
    loanStartDate: last.input.loanStartDate,
    firstEmiDate: last.input.firstEmiDate,
  })) throw new Error("finance_loan_current_schedule_details_mismatch");
}

export function createLoanScheduleVersion(
  version: number,
  details: LoanDetailsV1,
  createdAt: string,
): LoanScheduleVersionV1 {
  const input = loanCalculationInput(details);
  return Object.freeze({
    version,
    createdAt,
    effectiveDate: input.loanStartDate,
    calculationId: FINANCE_LOAN_CALCULATION_ID,
    calculationVersion: 1,
    inputSchemaVersion: 1,
    outputSchemaVersion: 1,
    input: Object.freeze(input),
    output: buildLoanAmortizationSchedule(input),
  });
}

export function loanCalculationInputsChanged(left: LoanDetailsV1, right: LoanDetailsV1): boolean {
  return !sameCalculationInputs(left, right);
}
