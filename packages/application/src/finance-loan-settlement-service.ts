import type { AtomicRecordBatchRepository } from "../../core/src/repositories";
import type { RecordEnvelope } from "../../core/src/types";
import type { FinanceLoanRecordV1 } from "./finance-loan-service";
import {
  assertFinancePaymentLedgerV1, FINANCE_PAYMENT_RECORD_PREFIX,
  type FinanceLoanScheduleResolver, type FinancePaymentEntryV1, type FinancePaymentLedgerV1,
  type FinancePaymentMethodV1,
} from "./finance-loan-payment-service";

type ScheduleRow = Readonly<{
  installmentNumber: number; dueDate: string; installmentAmountPaise: number; closingPrincipalPaise?: number;
}>;
type LoanDirectory = { get(id: string): Promise<RecordEnvelope<FinanceLoanRecordV1> | undefined> };
type SettlementPreview = Readonly<{
  amountPaise: number; scheduleVersion: number; paidThroughInstallment: number;
  loanRevision: number; paymentLedgerRevision: number | null;
}>;
const METHODS = new Set<FinancePaymentMethodV1>(["cash", "bank_transfer", "cheque", "upi", "other"]);
const DATE = /^\\d{4}-\\d{2}-\\d{2}$/;
function validDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const time = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
function ledgerId(loanId: string): string {
  if (!loanId.startsWith("feature:finance:loan:")) throw new Error("finance_payment_loan_id_invalid");
  const uuid = loanId.slice("feature:finance:loan:".length);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) {
    throw new Error("finance_payment_loan_id_invalid");
  }
  return FINANCE_PAYMENT_RECORD_PREFIX + uuid.toLowerCase();
}
function activeAllocationTotals(entries: readonly FinancePaymentEntryV1[], version: number): Map<number, number> {
  const reversed = new Set(entries.filter(entry => entry.kind === "reversal").map(entry => entry.paymentId));
  const totals = new Map<number, number>();
  for (const entry of entries) if (entry.kind === "payment" && !reversed.has(entry.id)) {
    for (const allocation of entry.allocations) if (allocation.scheduleVersion === version) {
      totals.set(allocation.installmentNumber, (totals.get(allocation.installmentNumber) ?? 0) + allocation.amountPaise);
    }
  }
  return totals;
}

/** Settlement is a Finance payment-ledger entry plus one atomic Loan close. */
export class FinanceLoanSettlementService {
  constructor(
    private readonly repository: AtomicRecordBatchRepository,
    private readonly loans: LoanDirectory,
    private readonly schedules: FinanceLoanScheduleResolver,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  private async load(loanId: string) {
    const loan = await this.loans.get(loanId);
    if (!loan) throw new Error("finance_payment_loan_not_found");
    const raw = await this.repository.get<unknown>(ledgerId(loanId));
    if (raw) assertFinancePaymentLedgerV1(raw.data, loanId);
    return { loan, ledger: raw as RecordEnvelope<FinancePaymentLedgerV1> | undefined };
  }

  private async rows(loanId: string, loan: FinanceLoanRecordV1, version: number): Promise<readonly ScheduleRow[]> {
    const original = loan.scheduleVersions.find(item => item.version === version);
    if (original) {
      const rows = (original.output as { rows?: readonly ScheduleRow[] }).rows;
      if (!Array.isArray(rows)) throw new Error("finance_payment_schedule_invalid");
      return rows;
    }
    const revised = await this.schedules.getScheduleRows(loanId, version);
    if (!revised) throw new Error("finance_payment_schedule_version_not_found");
    return revised;
  }

  private async assertDateNotBeforeHistory(loanId: string, businessDate: string,
    entries: readonly FinancePaymentEntryV1[]): Promise<void> {
    if (entries.some(entry => entry.businessDate > businessDate)) {
      throw new Error("finance_payment_settlement_date_precedes_history");
    }
    const uuid = loanId.slice("feature:finance:loan:".length);
    const state = await this.repository.get<{ revisions?: readonly { effectiveDate: string }[] }>(
      "feature:finance:prepayments:" + uuid);
    if (state?.data.revisions?.some(item => item.effectiveDate > businessDate)) {
      throw new Error("finance_payment_settlement_date_precedes_history");
    }
  }

  async preview(input: { loanId: string; businessDate: string }): Promise<SettlementPreview> {
    if (!validDate(input.businessDate)) throw new Error("finance_payment_settlement_input_invalid");
    const { loan, ledger } = await this.load(input.loanId);
    const entries = ledger?.data.entries ?? [];
    await this.assertDateNotBeforeHistory(input.loanId, input.businessDate, entries);
    if (loan.data.lifecycleState === "closed" || entries.some(entry => entry.kind === "settlement")) {
      throw new Error("finance_loan_already_settled");
    }
    const version = await this.schedules.getScheduleVersionForDate(input.loanId, input.businessDate);
    if (version === undefined) throw new Error("finance_payment_settlement_not_emi_date");
    const rows = await this.rows(input.loanId, loan.data, version);
    const settlementRow = rows.find(row => row.dueDate === input.businessDate);
    if (!settlementRow || !Number.isSafeInteger(settlementRow.closingPrincipalPaise) ||
        (settlementRow.closingPrincipalPaise as number) <= 0) {
      throw new Error("finance_payment_settlement_not_emi_date");
    }
    const totals = activeAllocationTotals(entries, version);
    for (const row of rows.filter(item => item.dueDate <= input.businessDate)) {
      if ((totals.get(row.installmentNumber) ?? 0) !== row.installmentAmountPaise) {
        throw new Error("finance_payment_settlement_due_emi_not_fully_paid");
      }
    }
    return {
      amountPaise: settlementRow.closingPrincipalPaise as number,
      scheduleVersion: version, paidThroughInstallment: settlementRow.installmentNumber,
      loanRevision: loan.revision, paymentLedgerRevision: ledger?.revision ?? null,
    };
  }

  async commit(input: {
    id: string; commandId: string; loanId: string; businessDate: string; method: FinancePaymentMethodV1;
    reference?: string; source: RecordEnvelope<unknown>["source"]; preview: SettlementPreview;
  }) {
    if (!input.id.trim() || !input.commandId.trim() || !validDate(input.businessDate) || !METHODS.has(input.method)) {
      throw new Error("finance_payment_settlement_input_invalid");
    }
    if (input.preview.loanRevision < 1 || !Number.isSafeInteger(input.preview.amountPaise) ||
        input.preview.amountPaise <= 0 || input.preview.businessDate !== undefined) {
      // The preview is intentionally ephemeral; its captured revisions and amount are revalidated below.
      if (!Number.isSafeInteger(input.preview.amountPaise) || input.preview.amountPaise <= 0) {
        throw new Error("finance_payment_settlement_preview_invalid");
      }
    }
    for (let attempt = 0; attempt < 12; attempt++) {
      const { loan, ledger } = await this.load(input.loanId);
      const entries = ledger?.data.entries ?? [];
      const replay = entries.find(entry => entry.commandId === input.commandId);
      if (replay) {
        if (replay.kind !== "settlement" || replay.id !== input.id || replay.businessDate !== input.businessDate ||
            replay.method !== input.method || replay.reference !== (input.reference?.trim() || undefined) ||
            replay.amountPaise !== input.preview.amountPaise ||
            replay.scheduleVersion !== input.preview.scheduleVersion ||
            replay.paidThroughInstallment !== input.preview.paidThroughInstallment) {
          throw new Error("finance_payment_idempotency_conflict");
        }
        return replay;
      }
      if (loan.data.lifecycleState === "closed" || entries.some(entry => entry.kind === "settlement")) {
        throw new Error("finance_loan_already_settled");
      }
      if (loan.revision !== input.preview.loanRevision ||
          (ledger?.revision ?? null) !== input.preview.paymentLedgerRevision) {
        throw new Error("finance_payment_settlement_preview_stale");
      }
      await this.assertDateNotBeforeHistory(input.loanId, input.businessDate, entries);
      const version = await this.schedules.getScheduleVersionForDate(input.loanId, input.businessDate);
      if (version === undefined) throw new Error("finance_payment_settlement_not_emi_date");
      const rows = await this.rows(input.loanId, loan.data, version);
      const settlementRow = rows.find(row => row.dueDate === input.businessDate);
      if (!settlementRow || !Number.isSafeInteger(settlementRow.closingPrincipalPaise) ||
          (settlementRow.closingPrincipalPaise as number) <= 0) {
        throw new Error("finance_payment_settlement_not_emi_date");
      }
      if (version !== input.preview.scheduleVersion ||
          settlementRow.installmentNumber !== input.preview.paidThroughInstallment ||
          settlementRow.closingPrincipalPaise !== input.preview.amountPaise) {
        throw new Error("finance_payment_settlement_preview_stale");
      }
      const totals = activeAllocationTotals(entries, version);
      for (const row of rows.filter(item => item.dueDate <= input.businessDate)) {
        if ((totals.get(row.installmentNumber) ?? 0) !== row.installmentAmountPaise) {
          throw new Error("finance_payment_settlement_due_emi_not_fully_paid");
        }
      }
      const createdAt = this.now();
      const settlement: FinancePaymentEntryV1 = {
        kind: "settlement", id: input.id, commandId: input.commandId, loanId: input.loanId,
        businessDate: input.businessDate, amountPaise: settlementRow.closingPrincipalPaise as number,
        method: input.method, ...(input.reference?.trim() ? { reference: input.reference.trim() } : {}),
        scheduleVersion: version, paidThroughInstallment: settlementRow.installmentNumber,
        createdAt, source: input.source, status: "committed",
      };
      if (entries.some(entry => entry.id === input.id)) throw new Error("finance_payment_id_conflict");
      const data: FinancePaymentLedgerV1 = { schemaVersion: 1, loanId: input.loanId, entries: [...entries, settlement] };
      assertFinancePaymentLedgerV1(data, input.loanId);
      const id = ledgerId(input.loanId);
      const nextLedger: RecordEnvelope<FinancePaymentLedgerV1> = {
        id, schemaVersion: 1, createdAt: ledger?.createdAt ?? createdAt, updatedAt: createdAt,
        businessDate: input.businessDate, source: input.source, revision: (ledger?.revision ?? 0) + 1, data,
      };
      const nextLoan: RecordEnvelope<FinanceLoanRecordV1> = {
        ...loan, updatedAt: createdAt, revision: loan.revision + 1,
        data: { ...loan.data, lifecycleState: "closed" },
      };
      if (await this.repository.compareAndSetMany([
        { id: loan.id, expectedRevision: loan.revision, next: nextLoan },
        { id, expectedRevision: ledger?.revision ?? null, next: nextLedger },
      ])) return settlement;
    }
    throw new Error("finance_payment_settlement_concurrent_write_retry_exhausted");
  }
}
