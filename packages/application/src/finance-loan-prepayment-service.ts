import type { AtomicRecordBatchRepository } from "../../core/src/repositories";
import type { RecordEnvelope } from "../../core/src/types";
import type { FinanceLoanRecordV1 } from "./finance-loan-service";
import { assertFinancePaymentLedgerV1, FINANCE_PAYMENT_RECORD_PREFIX,
  type FinancePaymentEntryV1, type FinancePaymentLedgerV1 } from "./finance-loan-payment-service";

export const FINANCE_LOAN_PREPAYMENT_RECORD_PREFIX = "feature:finance:prepayments:";
export type FinanceLoanPrepaymentModeV1 = "reduce_tenure" | "reduce_emi";
type ScheduleRow = Readonly<{ installmentNumber: number; dueDate: string; openingPrincipalPaise: number;
  installmentAmountPaise: number; closingPrincipalPaise: number }>;
type ReamortizedOutput = Readonly<{ regularEmiPaise: number; rows: readonly ScheduleRow[];
  totalInterestPaise: number; interestSavedPaise: number; finalDueDate: string; remainingInstallmentCount: number }>;
export type FinanceLoanPrepaymentRevisionV1 = Readonly<{
  version: number; commandId: string; effectiveDate: string; createdAt: string; mode: FinanceLoanPrepaymentModeV1;
  principalBeforePaise: number; prepaymentAmountPaise: number; principalAfterPaise: number;
  calculationId: string; calculationVersion: 1; inputSchemaVersion: 1; outputSchemaVersion: 1;
  input: Readonly<{ principalPaise: number; baselinePrincipalPaise: number; annualInterestRateBasisPoints: number;
    regularEmiPaise: number; remainingDueDates: readonly string[]; mode: FinanceLoanPrepaymentModeV1 }>;
  output: ReamortizedOutput;
}>;
export type FinanceLoanPrepaymentStateV1 = Readonly<{ schemaVersion: 1; kind: "loan-prepayment-state";
  loanId: string; baseScheduleVersion: number; currentScheduleVersion: number;
  revisions: readonly FinanceLoanPrepaymentRevisionV1[] }>;
export type FinanceLoanPrepaymentRevisionBuilder = (input: {
  version: number; commandId: string; effectiveDate: string; createdAt: string; mode: FinanceLoanPrepaymentModeV1;
  principalBeforePaise: number; prepaymentAmountPaise: number; annualInterestRateBasisPoints: number;
  regularEmiPaise: number; remainingDueDates: readonly string[];
}) => FinanceLoanPrepaymentRevisionV1;
export type FinanceLoanPrepaymentStateValidator = (value: unknown, loan: FinanceLoanRecordV1, loanId: string) => void;
type Snapshot = { loan: RecordEnvelope<FinanceLoanRecordV1>; ledger?: RecordEnvelope<FinancePaymentLedgerV1>;
  state?: RecordEnvelope<FinanceLoanPrepaymentStateV1> };
export type FinanceLoanPrepaymentPreviewV1 = Readonly<{
  loanId: string; commandId: string; businessDate: string; mode: FinanceLoanPrepaymentModeV1;
  amountPaise: number; principalBeforePaise: number; principalAfterPaise: number;
  currentScheduleVersion: number; nextScheduleVersion: number; remainingInstallmentCount: number;
  regularEmiPaise: number; finalDueDate: string; interestSavedPaise: number;
  loanRevision: number; paymentLedgerRevision: number | null; prepaymentStateRevision: number | null;
  revision: FinanceLoanPrepaymentRevisionV1;
}>;
function validDate(value: string): boolean {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const time = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
function loanUuid(loanId: string): string {
  const prefix = "feature:finance:loan:", uuid = loanId.slice(prefix.length);
  if (!loanId.startsWith(prefix) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) {
    throw new Error("finance_loan_prepayment_loan_id_invalid");
  }
  return uuid.toLowerCase();
}
function prepaymentRecordId(loanId: string): string { return FINANCE_LOAN_PREPAYMENT_RECORD_PREFIX + loanUuid(loanId); }
function paymentRecordId(loanId: string): string { return FINANCE_PAYMENT_RECORD_PREFIX + loanUuid(loanId); }
function activePayments(entries: readonly FinancePaymentEntryV1[]) {
  const reversed = new Set(entries.filter(entry => entry.kind === "reversal").map(entry => entry.paymentId));
  return entries.filter((entry): entry is Extract<FinancePaymentEntryV1,{kind:"payment"}> =>
    entry.kind === "payment" && !reversed.has(entry.id));
}
function scheduleFrom(snapshot: Snapshot) {
  const state = snapshot.state?.data;
  if (state) {
    const revision = state.revisions[state.revisions.length - 1];
    return { version: state.currentScheduleVersion, rows: revision.output.rows, regularEmiPaise: revision.output.regularEmiPaise };
  }
  const version = snapshot.loan.data.currentScheduleVersion;
  const selected = snapshot.loan.data.scheduleVersions.find(item => item.version === version);
  if (!selected) throw new Error("finance_loan_schedule_version_not_found");
  const output = selected.output as { rows?: readonly ScheduleRow[]; regularEmiPaise?: number };
  if (!Array.isArray(output.rows) || !Number.isSafeInteger(output.regularEmiPaise)) throw new Error("finance_loan_schedule_invalid");
  return { version, rows: output.rows, regularEmiPaise: output.regularEmiPaise as number };
}
export class FinanceLoanPrepaymentService {
  constructor(private readonly repository: AtomicRecordBatchRepository,
    private readonly loans: { get(id: string): Promise<RecordEnvelope<FinanceLoanRecordV1> | undefined> },
    private readonly validateState: FinanceLoanPrepaymentStateValidator,
    private readonly buildRevision: FinanceLoanPrepaymentRevisionBuilder,
    private readonly now: () => string = () => new Date().toISOString()) {}

  private async load(loanId: string): Promise<Snapshot> {
    const loan = await this.loans.get(loanId);
    if (!loan) throw new Error("finance_loan_not_found");
    const [rawLedger, rawState] = await Promise.all([
      this.repository.get<unknown>(paymentRecordId(loanId)),
      this.repository.get<unknown>(prepaymentRecordId(loanId)),
    ]);
    if (rawLedger) assertFinancePaymentLedgerV1(rawLedger.data, loanId);
    if (rawState) this.validateState(rawState.data, loan.data, loanId);
    return { loan, ledger: rawLedger as RecordEnvelope<FinancePaymentLedgerV1> | undefined,
      state: rawState as RecordEnvelope<FinanceLoanPrepaymentStateV1> | undefined };
  }

  private previewFrom(snapshot: Snapshot, input: { loanId: string; commandId: string; businessDate: string;
    amountPaise: number; mode: FinanceLoanPrepaymentModeV1 }): FinanceLoanPrepaymentPreviewV1 {
    if (!input.commandId.trim() || !validDate(input.businessDate) ||
        !Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0 ||
        (input.mode !== "reduce_tenure" && input.mode !== "reduce_emi")) {
      throw new Error("finance_loan_prepayment_input_invalid");
    }
    const schedule = scheduleFrom(snapshot);
    const entries = snapshot.ledger?.data.entries ?? [];
    const reversed = new Set(entries.filter(entry => entry.kind === "reversal").map(entry => entry.paymentId));
    const allocations = new Map<number, number>();
    for (const payment of activePayments(entries)) for (const allocation of payment.allocations) {
      if (allocation.scheduleVersion === schedule.version) {
        allocations.set(allocation.installmentNumber, (allocations.get(allocation.installmentNumber) ?? 0) + allocation.amountPaise);
      }
    }
    const dueRows = schedule.rows.filter(row => row.dueDate <= input.businessDate);
    for (const row of dueRows) {
      if ((allocations.get(row.installmentNumber) ?? 0) !== row.installmentAmountPaise) {
        throw new Error("finance_loan_prepayment_due_emi_not_fully_paid");
      }
    }
    const principalBeforePaise = dueRows.length
      ? dueRows[dueRows.length - 1].closingPrincipalPaise
      : schedule.rows[0]?.openingPrincipalPaise;
    if (!Number.isSafeInteger(principalBeforePaise) || (principalBeforePaise as number) <= 0 ||
        input.amountPaise >= (principalBeforePaise as number)) {
      throw new Error("finance_loan_prepayment_amount_must_be_less_than_outstanding_principal");
    }
    const remainingDueDates = schedule.rows.filter(row => row.dueDate > input.businessDate).map(row => row.dueDate);
    if (!remainingDueDates.length) throw new Error("finance_loan_prepayment_no_remaining_installments");
    const createdAt = this.now();
    const revision = this.buildRevision({
      version: schedule.version + 1, commandId: input.commandId, effectiveDate: input.businessDate,
      createdAt, mode: input.mode, principalBeforePaise: principalBeforePaise as number,
      prepaymentAmountPaise: input.amountPaise,
      annualInterestRateBasisPoints: snapshot.loan.data.details.annualInterestRateBasisPoints,
      regularEmiPaise: schedule.regularEmiPaise, remainingDueDates,
    });
    return {
      loanId: input.loanId, commandId: input.commandId, businessDate: input.businessDate, mode: input.mode,
      amountPaise: input.amountPaise, principalBeforePaise: principalBeforePaise as number,
      principalAfterPaise: (principalBeforePaise as number) - input.amountPaise,
      currentScheduleVersion: schedule.version, nextScheduleVersion: schedule.version + 1,
      remainingInstallmentCount: revision.output.remainingInstallmentCount,
      regularEmiPaise: revision.output.regularEmiPaise, finalDueDate: revision.output.finalDueDate,
      interestSavedPaise: revision.output.interestSavedPaise, loanRevision: snapshot.loan.revision,
      paymentLedgerRevision: snapshot.ledger?.revision ?? null, prepaymentStateRevision: snapshot.state?.revision ?? null,
      revision,
    };
  }

  async preview(input: { loanId: string; commandId: string; businessDate: string; amountPaise: number;
    mode: FinanceLoanPrepaymentModeV1 }): Promise<FinanceLoanPrepaymentPreviewV1> {
    return this.previewFrom(await this.load(input.loanId), input);
  }

  async commit(input: { preview: FinanceLoanPrepaymentPreviewV1; source: RecordEnvelope<unknown>["source"] }) {
    const requested = input.preview;
    for (let attempt = 0; attempt < 12; attempt++) {
      const snapshot = await this.load(requested.loanId);
      const replay = snapshot.state?.data.revisions.find(item => item.commandId === requested.commandId);
      if (replay) {
        if (replay.prepaymentAmountPaise !== requested.amountPaise || replay.mode !== requested.mode ||
            replay.effectiveDate !== requested.businessDate) throw new Error("finance_loan_prepayment_idempotency_conflict");
        return replay;
      }
      const fresh = this.previewFrom(snapshot, requested);
      if (fresh.loanRevision !== requested.loanRevision ||
          fresh.paymentLedgerRevision !== requested.paymentLedgerRevision ||
          fresh.prepaymentStateRevision !== requested.prepaymentStateRevision ||
          fresh.currentScheduleVersion !== requested.currentScheduleVersion ||
          JSON.stringify(fresh.revision) !== JSON.stringify(requested.revision)) {
        throw new Error("finance_loan_prepayment_preview_stale");
      }
      const createdAt = fresh.revision.createdAt;
      const stateData: FinanceLoanPrepaymentStateV1 = {
        schemaVersion: 1, kind: "loan-prepayment-state", loanId: requested.loanId,
        baseScheduleVersion: snapshot.state?.data.baseScheduleVersion ?? snapshot.loan.data.currentScheduleVersion,
        currentScheduleVersion: fresh.nextScheduleVersion,
        revisions: [...(snapshot.state?.data.revisions ?? []), fresh.revision],
      };
      this.validateState(stateData, snapshot.loan.data, requested.loanId);
      const stateId = prepaymentRecordId(requested.loanId);
      const nextState: RecordEnvelope<FinanceLoanPrepaymentStateV1> = {
        id: stateId, schemaVersion: 1, createdAt: snapshot.state?.createdAt ?? createdAt,
        updatedAt: createdAt, businessDate: requested.businessDate, source: input.source,
        revision: (snapshot.state?.revision ?? 0) + 1, data: stateData,
      };
      const loanNext: RecordEnvelope<FinanceLoanRecordV1> = {
        ...snapshot.loan, updatedAt: createdAt, revision: snapshot.loan.revision + 1,
      };
      const ledgerId = paymentRecordId(requested.loanId);
      const ledgerData: FinancePaymentLedgerV1 = snapshot.ledger?.data ??
        { schemaVersion: 1, loanId: requested.loanId, entries: [] };
      const ledgerNext: RecordEnvelope<FinancePaymentLedgerV1> = {
        id: ledgerId, schemaVersion: 1, createdAt: snapshot.ledger?.createdAt ?? createdAt,
        updatedAt: createdAt, businessDate: requested.businessDate, source: input.source,
        revision: (snapshot.ledger?.revision ?? 0) + 1, data: ledgerData,
      };
      if (await this.repository.compareAndSetMany([
        { id: snapshot.loan.id, expectedRevision: snapshot.loan.revision, next: loanNext },
        { id: ledgerId, expectedRevision: snapshot.ledger?.revision ?? null, next: ledgerNext },
        { id: stateId, expectedRevision: snapshot.state?.revision ?? null, next: nextState },
      ])) return fresh.revision;
    }
    throw new Error("finance_loan_prepayment_concurrent_write_retry_exhausted");
  }
}
