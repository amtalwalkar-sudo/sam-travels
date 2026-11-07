import type { FinanceLoanRecordV1 } from "./loan-records";
import { calculateLoanPrepaymentReamortizationV1, LOAN_PREPAYMENT_CALCULATION_ID,
  type LoanPrepaymentCalculationInputV1, type LoanPrepaymentCalculationResultV1,
  type LoanPrepaymentModeV1 } from "./loan-prepayment-calculation";

export const FINANCE_LOAN_PREPAYMENT_RECORD_PREFIX = "feature:finance:prepayments:";
export type LoanPrepaymentRevisionV1 = Readonly<{
  version: number; commandId: string; effectiveDate: string; createdAt: string;
  mode: LoanPrepaymentModeV1; principalBeforePaise: number; prepaymentAmountPaise: number;
  principalAfterPaise: number; calculationId: typeof LOAN_PREPAYMENT_CALCULATION_ID;
  calculationVersion: 1; inputSchemaVersion: 1; outputSchemaVersion: 1;
  input: LoanPrepaymentCalculationInputV1; output: LoanPrepaymentCalculationResultV1;
}>;
export type FinanceLoanPrepaymentStateV1 = Readonly<{
  schemaVersion: 1; kind: "loan-prepayment-state"; loanId: string;
  baseScheduleVersion: number; currentScheduleVersion: number;
  revisions: readonly LoanPrepaymentRevisionV1[];
}>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const time = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
function validInstant(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join("|") === [...keys].sort().join("|");
}
export function financeLoanPrepaymentRecordId(uuid: string): string {
  if (typeof uuid !== "string" || !UUID.test(uuid)) throw new Error("finance_loan_prepayment_uuid_invalid");
  return FINANCE_LOAN_PREPAYMENT_RECORD_PREFIX + uuid.toLowerCase();
}
export function assertFinanceLoanPrepaymentRecordIdentity(id: string): void {
  if (typeof id !== "string" || !id.startsWith(FINANCE_LOAN_PREPAYMENT_RECORD_PREFIX) ||
      financeLoanPrepaymentRecordId(id.slice(FINANCE_LOAN_PREPAYMENT_RECORD_PREFIX.length)) !== id) {
    throw new Error("finance_loan_prepayment_record_identity_invalid");
  }
}
export function assertFinanceLoanPrepaymentStateV1(value: unknown, loan: FinanceLoanRecordV1,
  expectedLoanId?: string): asserts value is FinanceLoanPrepaymentStateV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("finance_loan_prepayment_state_invalid");
  const state = value as Record<string, unknown>;
  if (!exactKeys(state, ["schemaVersion","kind","loanId","baseScheduleVersion","currentScheduleVersion","revisions"]) ||
      state.schemaVersion !== 1 || state.kind !== "loan-prepayment-state" ||
      typeof state.loanId !== "string" || (expectedLoanId !== undefined && state.loanId !== expectedLoanId) ||
      !Number.isSafeInteger(state.baseScheduleVersion) ||
      !loan.scheduleVersions.some(item => item.version === state.baseScheduleVersion) ||
      !Array.isArray(state.revisions) || state.revisions.length < 1) {
    throw new Error("finance_loan_prepayment_state_invalid");
  }
  const base = state.baseScheduleVersion as number, revisions = state.revisions as unknown[];
  const commands = new Set<string>(); let previousCreatedAt = "";
  revisions.forEach((raw,index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("finance_loan_prepayment_revision_invalid");
    const r = raw as Record<string, unknown>;
    const keys = ["version","commandId","effectiveDate","createdAt","mode","principalBeforePaise",
      "prepaymentAmountPaise","principalAfterPaise","calculationId","calculationVersion",
      "inputSchemaVersion","outputSchemaVersion","input","output"];
    if (!exactKeys(r,keys) || r.version !== base + index + 1 ||
        typeof r.commandId !== "string" || !r.commandId.trim() || commands.has(r.commandId) ||
        !validDate(r.effectiveDate) || !validInstant(r.createdAt) || r.createdAt < previousCreatedAt ||
        (r.mode !== "reduce_tenure" && r.mode !== "reduce_emi") ||
        !Number.isSafeInteger(r.principalBeforePaise) || (r.principalBeforePaise as number) <= 0 ||
        !Number.isSafeInteger(r.prepaymentAmountPaise) || (r.prepaymentAmountPaise as number) <= 0 ||
        (r.prepaymentAmountPaise as number) >= (r.principalBeforePaise as number) ||
        r.principalAfterPaise !== (r.principalBeforePaise as number) - (r.prepaymentAmountPaise as number) ||
        r.calculationId !== LOAN_PREPAYMENT_CALCULATION_ID || r.calculationVersion !== 1 ||
        r.inputSchemaVersion !== 1 || r.outputSchemaVersion !== 1) {
      throw new Error("finance_loan_prepayment_revision_invalid");
    }
    commands.add(r.commandId as string); previousCreatedAt = r.createdAt as string;
    const input = r.input as LoanPrepaymentCalculationInputV1;
    if (!input || typeof input !== "object" ||
        input.principalPaise !== r.principalAfterPaise ||
        input.baselinePrincipalPaise !== r.principalBeforePaise ||
        input.annualInterestRateBasisPoints !== loan.details.annualInterestRateBasisPoints ||
        input.mode !== r.mode || !Number.isSafeInteger(input.regularEmiPaise) ||
        !Array.isArray(input.remainingDueDates) || input.remainingDueDates.length < 1 ||
        input.remainingDueDates.some(date => !validDate(date))) {
      throw new Error("finance_loan_prepayment_input_provenance_invalid");
    }
    const expected = calculateLoanPrepaymentReamortizationV1(input);
    if (JSON.stringify(expected) !== JSON.stringify(r.output)) throw new Error("finance_loan_prepayment_output_provenance_invalid");
  });
  if (!Number.isSafeInteger(state.currentScheduleVersion) ||
      state.currentScheduleVersion !== base + revisions.length) {
    throw new Error("finance_loan_prepayment_current_schedule_version_invalid");
  }
}
export function createLoanPrepaymentRevisionV1(input: {
  version: number; commandId: string; effectiveDate: string; createdAt: string;
  mode: LoanPrepaymentModeV1; principalBeforePaise: number; prepaymentAmountPaise: number;
  annualInterestRateBasisPoints: number; regularEmiPaise: number; remainingDueDates: readonly string[];
}): LoanPrepaymentRevisionV1 {
  if (!Number.isSafeInteger(input.version) || input.version < 2 || !input.commandId.trim() ||
      !validDate(input.effectiveDate) || !validInstant(input.createdAt) ||
      !Number.isSafeInteger(input.principalBeforePaise) || input.principalBeforePaise <= 0 ||
      !Number.isSafeInteger(input.prepaymentAmountPaise) || input.prepaymentAmountPaise <= 0 ||
      input.prepaymentAmountPaise >= input.principalBeforePaise) {
    throw new Error("finance_loan_prepayment_revision_input_invalid");
  }
  const principalAfterPaise = input.principalBeforePaise - input.prepaymentAmountPaise;
  const calculationInput: LoanPrepaymentCalculationInputV1 = Object.freeze({
    principalPaise: principalAfterPaise, baselinePrincipalPaise: input.principalBeforePaise,
    annualInterestRateBasisPoints: input.annualInterestRateBasisPoints,
    regularEmiPaise: input.regularEmiPaise, remainingDueDates: Object.freeze([...input.remainingDueDates]),
    mode: input.mode,
  });
  const output = calculateLoanPrepaymentReamortizationV1(calculationInput);
  return Object.freeze({
    version: input.version, commandId: input.commandId, effectiveDate: input.effectiveDate,
    createdAt: input.createdAt, mode: input.mode, principalBeforePaise: input.principalBeforePaise,
    prepaymentAmountPaise: input.prepaymentAmountPaise, principalAfterPaise,
    calculationId: LOAN_PREPAYMENT_CALCULATION_ID, calculationVersion: 1,
    inputSchemaVersion: 1, outputSchemaVersion: 1, input: calculationInput, output,
  });
}
