import type { AtomicRecordBatchRepository } from "../../core/src/repositories";
import type { RecordEnvelope } from "../../core/src/types";
import type { FinanceLoanRecordV1 } from "./finance-loan-service";

export const FINANCE_PAYMENT_RECORD_PREFIX = "feature:finance:payments:";
export type FinancePaymentMethodV1 = "cash" | "bank_transfer" | "cheque" | "upi" | "other";
export type FinancePaymentAllocationV1 = Readonly<{
  id: string; paymentId: string; loanId: string; scheduleVersion: number;
  installmentNumber: number; amountPaise: number; createdAt: string; source: RecordEnvelope<unknown>["source"];
}>;
export type FinancePaymentEntryV1 =
  | Readonly<{ kind: "payment"; id: string; commandId: string; loanId: string; businessDate: string;
      amountPaise: number; method: FinancePaymentMethodV1; reference?: string; note?: string;
      scheduleVersion: number; createdAt: string; source: RecordEnvelope<unknown>["source"];
      allocations: readonly FinancePaymentAllocationV1[]; unallocatedCreditPaise: number; status: "committed" }>
  | Readonly<{ kind: "settlement"; id: string; commandId: string; loanId: string; businessDate: string;
      amountPaise: number; method: FinancePaymentMethodV1; reference?: string; scheduleVersion: number;
      paidThroughInstallment: number; createdAt: string; source: RecordEnvelope<unknown>["source"]; status: "committed" }>
  | Readonly<{ kind: "reversal"; id: string; commandId: string; loanId: string; paymentId: string;
      businessDate: string; reason: string; amountPaise: number; createdAt: string;
      source: RecordEnvelope<unknown>["source"]; status: "committed" }>;
export type FinancePaymentLedgerV1 = Readonly<{ schemaVersion: 1; loanId: string; entries: readonly FinancePaymentEntryV1[] }>;
type LoanDirectory = { get(id: string): Promise<RecordEnvelope<FinanceLoanRecordV1> | undefined> };
type ScheduleRow = { installmentNumber: number; dueDate: string; installmentAmountPaise: number; closingPrincipalPaise?: number };
export type FinanceLoanScheduleResolver = {
  getScheduleRows(loanId: string, scheduleVersion: number): Promise<readonly ScheduleRow[] | undefined>;
  getScheduleVersionForDate(loanId: string, businessDate: string): Promise<number | undefined>;
};
const METHODS = new Set<FinancePaymentMethodV1>(["cash", "bank_transfer", "cheque", "upi", "other"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
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
function validInstant(value: string): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function assertLedger(value: unknown, loanId: string): asserts value is FinancePaymentLedgerV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("finance_payment_ledger_invalid");
  const ledger = value as FinancePaymentLedgerV1;
  if (ledger.schemaVersion !== 1 || ledger.loanId !== loanId || !Array.isArray(ledger.entries)) {
    throw new Error("finance_payment_ledger_invalid");
  }
  const ids = new Set<string>(), commands = new Set<string>();
  let settlementCount = 0;
  const payments = new Map<string, PaymentEntry>(), reversals = new Map<string, FinancePaymentEntryV1>();
  for (const entry of ledger.entries) {
    if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || !entry.id.trim() || ids.has(entry.id) ||
        typeof entry.commandId !== "string" || !entry.commandId.trim() || commands.has(entry.commandId) ||
        entry.loanId !== loanId || !validDate(entry.businessDate) ||
        !Number.isSafeInteger(entry.amountPaise) || entry.amountPaise <= 0 ||
        !validInstant(entry.createdAt) || entry.status !== "committed" ||
        typeof entry.source !== "string" || !entry.source.trim()) {
      throw new Error("finance_payment_entry_invalid");
    }
    ids.add(entry.id);
    commands.add(entry.commandId);
    if (entry.kind === "payment") {
      if (!Array.isArray(entry.allocations) || !METHODS.has(entry.method) ||
          !Number.isSafeInteger(entry.scheduleVersion) || entry.scheduleVersion < 1 ||
          !Number.isSafeInteger(entry.unallocatedCreditPaise) || entry.unallocatedCreditPaise < 0 ||
          (entry.reference !== undefined && (typeof entry.reference !== "string" || !entry.reference.trim())) ||
          (entry.note !== undefined && (typeof entry.note !== "string" || !entry.note.trim()))) {
        throw new Error("finance_payment_allocation_invalid");
      }
      let allocatedAmount = 0;
      const installments = new Set<number>();
      for (const allocation of entry.allocations) {
        if (!allocation || typeof allocation !== "object" ||
            typeof allocation.id !== "string" || !allocation.id.trim() || ids.has(allocation.id) ||
            allocation.paymentId !== entry.id || allocation.loanId !== loanId ||
            allocation.scheduleVersion !== entry.scheduleVersion ||
            !Number.isSafeInteger(allocation.installmentNumber) || allocation.installmentNumber < 1 ||
            !Number.isSafeInteger(allocation.amountPaise) || allocation.amountPaise <= 0 ||
            !validInstant(allocation.createdAt) || typeof allocation.source !== "string" ||
            !allocation.source.trim() || installments.has(allocation.installmentNumber)) {
          throw new Error("finance_payment_allocation_invalid");
        }
        ids.add(allocation.id);
        installments.add(allocation.installmentNumber);
        allocatedAmount += allocation.amountPaise;
        if (!Number.isSafeInteger(allocatedAmount)) throw new Error("finance_payment_allocation_invalid");
      }
      if (allocatedAmount > entry.amountPaise ||
          allocatedAmount + entry.unallocatedCreditPaise !== entry.amountPaise) {
        throw new Error("finance_payment_allocation_invalid");
      }
      payments.set(entry.id, entry);
    } else if (entry.kind === "settlement") {
      settlementCount++;
      if (settlementCount > 1 || !METHODS.has(entry.method) ||
          !Number.isSafeInteger(entry.scheduleVersion) || entry.scheduleVersion < 1 ||
          !Number.isSafeInteger(entry.paidThroughInstallment) || entry.paidThroughInstallment < 1 ||
          (entry.reference !== undefined && (typeof entry.reference !== "string" || !entry.reference.trim()))) {
        throw new Error("finance_payment_settlement_invalid");
      }
    } else if (entry.kind === "reversal") {
      if (typeof entry.paymentId !== "string" || !entry.paymentId.trim() ||
          typeof entry.reason !== "string" || !entry.reason.trim() ||
          reversals.has(entry.paymentId)) throw new Error("finance_payment_reversal_invalid");
      reversals.set(entry.paymentId, entry);
    } else {
      throw new Error("finance_payment_entry_kind_invalid");
    }
  }
  for (const [paymentId, reversal] of reversals) {
    const original = payments.get(paymentId);
    if (!original || original.amountPaise !== reversal.amountPaise) {
      throw new Error("finance_payment_reversal_link_invalid");
    }
  }
}
export function assertFinancePaymentLedgerV1(value: unknown, loanId: string): asserts value is FinancePaymentLedgerV1 {
  assertLedger(value, loanId);
}
function scheduleRows(loan: FinanceLoanRecordV1, version: number): readonly ScheduleRow[] {
  const selected = loan.scheduleVersions.find(item => item.version === version);
  if (!selected) throw new Error("finance_payment_schedule_version_not_found");
  const rows = (selected.output as { rows?: readonly ScheduleRow[] }).rows;
  if (!Array.isArray(rows)) throw new Error("finance_payment_schedule_invalid");
  return rows;
}
type PaymentEntry = Extract<FinancePaymentEntryV1, { kind: "payment" }>;
function activePayments(entries: readonly FinancePaymentEntryV1[]): PaymentEntry[] {
  const reversed = new Set<string>();
  for (const entry of entries) if (entry.kind === "reversal") reversed.add(entry.paymentId);
  const active: PaymentEntry[] = [];
  for (const entry of entries) if (entry.kind === "payment" && !reversed.has(entry.id)) active.push(entry);
  return active;
}
function allocationTotals(entries: readonly FinancePaymentEntryV1[], version: number): Map<number, number> {
  const totals = new Map<number, number>();
  for (const payment of activePayments(entries)) for (const allocation of payment.allocations) {
    if (allocation.scheduleVersion === version) totals.set(allocation.installmentNumber,
      (totals.get(allocation.installmentNumber) ?? 0) + allocation.amountPaise);
  }
  return totals;
}
function proposeFromScheduleRows(
  rows: readonly ScheduleRow[], entries: readonly FinancePaymentEntryV1[], scheduleVersion: number,
  businessDate: string, amountPaise: number,
): readonly { installmentNumber: number; amountPaise: number }[] {
  if (!validDate(businessDate) || !Number.isSafeInteger(amountPaise) || amountPaise <= 0) throw new Error("finance_payment_amount_or_date_invalid");
  const totals = allocationTotals(entries, scheduleVersion);
  let remaining = amountPaise;
  const proposed: Array<{ installmentNumber: number; amountPaise: number }> = [];
  for (const row of rows) {
    if (row.dueDate > businessDate || remaining === 0) continue;
    const left = row.installmentAmountPaise - (totals.get(row.installmentNumber) ?? 0);
    if (left <= 0) continue;
    const allocated = Math.min(left, remaining);
    proposed.push({ installmentNumber: row.installmentNumber, amountPaise: allocated });
    remaining -= allocated;
  }
  return proposed;
}
export function proposeFinancePaymentAllocationV1(
  loan: FinanceLoanRecordV1, entries: readonly FinancePaymentEntryV1[], scheduleVersion: number,
  businessDate: string, amountPaise: number,
): readonly { installmentNumber: number; amountPaise: number }[] {
  return proposeFromScheduleRows(scheduleRows(loan, scheduleVersion), entries, scheduleVersion, businessDate, amountPaise);
}

/** Finance-owned per-loan CAS ledger. All payment and allocation facts are committed as one record revision. */
export class FinanceLoanPaymentService {
  constructor(private readonly repository: AtomicRecordBatchRepository, private readonly loans: LoanDirectory,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly scheduleResolver?: FinanceLoanScheduleResolver) {}

  private async assertScheduleVersionForDate(loanId: string, version: number, businessDate: string): Promise<void> {
    const expected = await this.scheduleResolver?.getScheduleVersionForDate(loanId, businessDate);
    if (expected !== undefined && version !== expected) throw new Error("finance_payment_schedule_version_not_effective_for_date");
  }

  private async resolveScheduleRows(loanId: string, loan: FinanceLoanRecordV1, version: number): Promise<readonly ScheduleRow[]> {
    const original = loan.scheduleVersions.find(item => item.version === version);
    if (original) return scheduleRows(loan, version);
    const revised = await this.scheduleResolver?.getScheduleRows(loanId, version);
    if (!revised) throw new Error("finance_payment_schedule_version_not_found");
    return revised;
  }

  private async assertSettlementDateNotBeforeHistory(loanId: string, businessDate: string,
    entries: readonly FinancePaymentEntryV1[]): Promise<void> {
    if (entries.some(entry => entry.businessDate > businessDate)) {
      throw new Error("finance_payment_settlement_date_precedes_history");
    }
    const uuid = loanId.slice("feature:finance:loan:".length);
    const prepayment = await this.repository.get<{ revisions?: readonly { effectiveDate: string }[] }>(
      "feature:finance:prepayments:" + uuid);
    if (prepayment?.data.revisions?.some(revision => revision.effectiveDate > businessDate)) {
      throw new Error("finance_payment_settlement_date_precedes_history");
    }
  }

  private async load(loanId: string): Promise<{ loan: RecordEnvelope<FinanceLoanRecordV1>; ledger?: RecordEnvelope<FinancePaymentLedgerV1> }> {
    const loan = await this.loans.get(loanId);
    if (!loan) throw new Error("finance_payment_loan_not_found");
    const id = ledgerId(loanId), raw = await this.repository.get<unknown>(id);
    if (raw) assertLedger(raw.data, loanId);
    return { loan, ledger: raw as RecordEnvelope<FinancePaymentLedgerV1> | undefined };
  }
  async list(loanId: string): Promise<readonly FinancePaymentEntryV1[]> {
    const { ledger } = await this.load(loanId); return ledger?.data.entries ?? [];
  }
  async propose(input: { loanId: string; scheduleVersion: number; businessDate: string; amountPaise: number }) {
    const { loan, ledger } = await this.load(input.loanId);
    if (loan.data.lifecycleState === "closed") throw new Error("finance_loan_closed");
    await this.assertScheduleVersionForDate(input.loanId, input.scheduleVersion, input.businessDate);
    const rows = await this.resolveScheduleRows(input.loanId, loan.data, input.scheduleVersion);
    return proposeFromScheduleRows(rows, ledger?.data.entries ?? [], input.scheduleVersion, input.businessDate, input.amountPaise);
  }
  async record(input: { id: string; commandId: string; loanId: string; businessDate: string; amountPaise: number;
    method: FinancePaymentMethodV1; reference?: string; note?: string; scheduleVersion: number;
    allocations: readonly { installmentNumber: number; amountPaise: number }[]; source: RecordEnvelope<unknown>["source"] }) {
    if (!input.id.trim() || !input.commandId.trim() || !validDate(input.businessDate) ||
        !Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0 || !METHODS.has(input.method)) {
      throw new Error("finance_payment_input_invalid");
    }
    if (!Array.isArray(input.allocations)) throw new Error("finance_payment_allocations_invalid");
    for (let attempt = 0; attempt < 12; attempt++) {
      const { loan, ledger } = await this.load(input.loanId);
      await this.assertScheduleVersionForDate(input.loanId, input.scheduleVersion, input.businessDate);
      const rows = await this.resolveScheduleRows(input.loanId, loan.data, input.scheduleVersion);
      const entries = ledger?.data.entries ?? [];
      const replay = entries.find(entry => entry.commandId === input.commandId);
      if (replay) {
        const requestedAllocations = input.allocations.map(item => ({ installmentNumber: item.installmentNumber, amountPaise: item.amountPaise }))
          .sort((left, right) => left.installmentNumber - right.installmentNumber);
        const storedAllocations = replay.kind === "payment" ? replay.allocations
          .map(item => ({ installmentNumber: item.installmentNumber, amountPaise: item.amountPaise }))
          .sort((left, right) => left.installmentNumber - right.installmentNumber) : [];
        if (replay.kind !== "payment" || replay.id !== input.id || replay.amountPaise !== input.amountPaise ||
            replay.businessDate !== input.businessDate || replay.scheduleVersion !== input.scheduleVersion ||
            replay.method !== input.method || replay.reference !== (input.reference?.trim() || undefined) ||
            replay.note !== (input.note?.trim() || undefined) ||
            JSON.stringify(storedAllocations) !== JSON.stringify(requestedAllocations)) {
          throw new Error("finance_payment_idempotency_conflict");
        }
        return replay;
      }
      if (loan.data.lifecycleState === "closed") throw new Error("finance_loan_closed");
      const totals = allocationTotals(entries, input.scheduleVersion), seen = new Set<number>();
      let allocatedSum = 0;
      const createdAt = this.now();
      const allocations = input.allocations.map((allocation, index) => {
        const row = rows.find(item => item.installmentNumber === allocation.installmentNumber);
        if (!row || row.dueDate > input.businessDate || seen.has(row.installmentNumber) ||
            !Number.isSafeInteger(allocation.amountPaise) || allocation.amountPaise <= 0) {
          throw new Error("finance_payment_allocation_invalid");
        }
        seen.add(row.installmentNumber);
        if ((totals.get(row.installmentNumber) ?? 0) + allocation.amountPaise > row.installmentAmountPaise) throw new Error("finance_payment_installment_overallocated");
        allocatedSum += allocation.amountPaise;
        return { id: input.id + ":allocation:" + (index + 1), paymentId: input.id, loanId: input.loanId,
          scheduleVersion: input.scheduleVersion, installmentNumber: row.installmentNumber, amountPaise: allocation.amountPaise,
          createdAt, source: input.source };
      });
      if (allocatedSum > input.amountPaise) throw new Error("finance_payment_allocations_exceed_amount");
      const payment: FinancePaymentEntryV1 = { kind: "payment", id: input.id, commandId: input.commandId,
        loanId: input.loanId, businessDate: input.businessDate, amountPaise: input.amountPaise, method: input.method,
        ...(input.reference?.trim() ? { reference: input.reference.trim() } : {}),
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        scheduleVersion: input.scheduleVersion, createdAt, source: input.source, allocations,
        unallocatedCreditPaise: input.amountPaise - allocatedSum, status: "committed" };
      if (entries.some(entry => entry.id === input.id)) throw new Error("finance_payment_id_conflict");
      const data: FinancePaymentLedgerV1 = { schemaVersion: 1, loanId: input.loanId, entries: [...entries, payment] };
      assertLedger(data, input.loanId);
      const id = ledgerId(input.loanId), next: RecordEnvelope<FinancePaymentLedgerV1> = {
        id, schemaVersion: 1, createdAt: ledger?.createdAt ?? createdAt, updatedAt: createdAt,
        businessDate: input.businessDate, source: input.source, revision: (ledger?.revision ?? 0) + 1, data };
      const nextLoan: RecordEnvelope<FinanceLoanRecordV1> = {
        ...loan, updatedAt: createdAt, revision: loan.revision + 1,
      };
      if (await this.repository.compareAndSetMany([
        { id: loan.id, expectedRevision: loan.revision, next: nextLoan },
        { id, expectedRevision: ledger?.revision ?? null, next },
      ])) return payment;
    }
    throw new Error("finance_payment_concurrent_write_retry_exhausted");
  }
  async previewSettlement(input: { loanId: string; businessDate: string }) {
    if (!validDate(input.businessDate)) throw new Error("finance_payment_settlement_input_invalid");
    if (!this.scheduleResolver) throw new Error("finance_payment_schedule_resolver_required");
    const { loan, ledger } = await this.load(input.loanId), entries = ledger?.data.entries ?? [];
    await this.assertSettlementDateNotBeforeHistory(input.loanId, input.businessDate, entries);
    if (loan.data.lifecycleState === "closed" || entries.some(entry => entry.kind === "settlement")) {
      throw new Error("finance_loan_already_settled");
    }
    const version = await this.scheduleResolver.getScheduleVersionForDate(input.loanId, input.businessDate);
    if (version === undefined) throw new Error("finance_payment_settlement_not_emi_date");
    const rows = await this.resolveScheduleRows(input.loanId, loan.data, version);
    const settlementRow = rows.find(row => row.dueDate === input.businessDate);
    if (!settlementRow || !Number.isSafeInteger(settlementRow.closingPrincipalPaise) ||
        (settlementRow.closingPrincipalPaise as number) <= 0) throw new Error("finance_payment_settlement_not_emi_date");
    const totals = allocationTotals(entries, version);
    for (const row of rows.filter(row => row.dueDate <= input.businessDate)) {
      if ((totals.get(row.installmentNumber) ?? 0) !== row.installmentAmountPaise) {
        throw new Error("finance_payment_settlement_due_emi_not_fully_paid");
      }
    }
    return { amountPaise: settlementRow.closingPrincipalPaise as number, scheduleVersion: version,
      paidThroughInstallment: settlementRow.installmentNumber, loanRevision: loan.revision,
      paymentLedgerRevision: ledger?.revision ?? null };
  }

  async settle(input: { id: string; commandId: string; loanId: string; businessDate: string;
    method: FinancePaymentMethodV1; reference?: string; source: RecordEnvelope<unknown>["source"];
    expectedLoanRevision: number; expectedPaymentLedgerRevision: number | null;
    expectedAmountPaise: number; expectedScheduleVersion: number; expectedPaidThroughInstallment: number }) {
    if (!input.id.trim() || !input.commandId.trim() || !validDate(input.businessDate) || !METHODS.has(input.method)) {
      throw new Error("finance_payment_settlement_input_invalid");
    }
    if (!this.scheduleResolver) throw new Error("finance_payment_schedule_resolver_required");
    for (let attempt = 0; attempt < 12; attempt++) {
      const { loan, ledger } = await this.load(input.loanId), entries = ledger?.data.entries ?? [];
      const replay = entries.find(entry => entry.commandId === input.commandId);
      if (replay) {
        if (replay.kind !== "settlement" || replay.id !== input.id || replay.businessDate !== input.businessDate ||
            replay.method !== input.method || replay.reference !== (input.reference?.trim() || undefined)) {
          throw new Error("finance_payment_idempotency_conflict");
        }
        return replay;
      }
      if (loan.revision !== input.expectedLoanRevision ||
          (ledger?.revision ?? null) !== input.expectedPaymentLedgerRevision) {
        throw new Error("finance_payment_settlement_preview_stale");
      }
      if (loan.data.lifecycleState === "closed" || entries.some(entry => entry.kind === "settlement")) {
        throw new Error("finance_loan_already_settled");
      }
      await this.assertSettlementDateNotBeforeHistory(input.loanId, input.businessDate, entries);
      const version = await this.scheduleResolver.getScheduleVersionForDate(input.loanId, input.businessDate);
      if (version === undefined) throw new Error("finance_payment_settlement_not_emi_date");
      const rows = await this.resolveScheduleRows(input.loanId, loan.data, version);
      const settlementRow = rows.find(row => row.dueDate === input.businessDate);
      if (!settlementRow || !Number.isSafeInteger(settlementRow.closingPrincipalPaise) ||
          (settlementRow.closingPrincipalPaise as number) <= 0) {
        throw new Error("finance_payment_settlement_not_emi_date");
      }
      if (version !== input.expectedScheduleVersion ||
          settlementRow.installmentNumber !== input.expectedPaidThroughInstallment ||
          settlementRow.closingPrincipalPaise !== input.expectedAmountPaise) {
        throw new Error("finance_payment_settlement_preview_stale");
      }
      const totals = allocationTotals(entries, version);
      const dueRows = rows.filter(row => row.dueDate <= input.businessDate);
      for (const row of dueRows) {
        if ((totals.get(row.installmentNumber) ?? 0) !== row.installmentAmountPaise) {
          throw new Error("finance_payment_settlement_due_emi_not_fully_paid");
        }
      }
      const createdAt = this.now();
      const settlement: FinancePaymentEntryV1 = { kind: "settlement", id: input.id, commandId: input.commandId,
        loanId: input.loanId, businessDate: input.businessDate, amountPaise: settlementRow.closingPrincipalPaise as number,
        method: input.method, ...(input.reference?.trim() ? { reference: input.reference.trim() } : {}),
        scheduleVersion: version, paidThroughInstallment: settlementRow.installmentNumber,
        createdAt, source: input.source, status: "committed" };
      if (entries.some(entry => entry.id === input.id)) throw new Error("finance_payment_id_conflict");
      const data: FinancePaymentLedgerV1 = { schemaVersion: 1, loanId: input.loanId, entries: [...entries, settlement] };
      assertLedger(data, input.loanId);
      const id = ledgerId(input.loanId);
      const nextLedger: RecordEnvelope<FinancePaymentLedgerV1> = {
        id, schemaVersion: 1, createdAt: ledger?.createdAt ?? createdAt, updatedAt: createdAt,
        businessDate: input.businessDate, source: input.source, revision: (ledger?.revision ?? 0) + 1, data };
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

  async reverse(input: { id: string; commandId: string; loanId: string; paymentId: string; businessDate: string;
    reason: string; source: RecordEnvelope<unknown>["source"] }) {
    if (!input.id.trim() || !input.commandId.trim() || !validDate(input.businessDate) || !input.reason.trim()) throw new Error("finance_payment_reversal_input_invalid");
    for (let attempt = 0; attempt < 12; attempt++) {
      const { loan, ledger } = await this.load(input.loanId), entries = ledger?.data.entries ?? [];
      const replay = entries.find(entry => entry.commandId === input.commandId);
      if (replay) {
        if (replay.kind !== "reversal" || replay.id !== input.id || replay.paymentId !== input.paymentId ||
            replay.businessDate !== input.businessDate || replay.reason !== input.reason.trim()) {
          throw new Error("finance_payment_idempotency_conflict");
        }
        return replay;
      }
      if (loan.data.lifecycleState === "closed") throw new Error("finance_loan_closed");
      const payment = entries.find((entry): entry is Extract<FinancePaymentEntryV1,{kind:"payment"}> => entry.kind === "payment" && entry.id === input.paymentId);
      if (!payment) throw new Error("finance_payment_not_found");
      if (entries.some(entry => entry.kind === "reversal" && entry.paymentId === input.paymentId)) throw new Error("finance_payment_already_reversed");
      if (entries.some(entry => entry.id === input.id)) throw new Error("finance_payment_id_conflict");
      const createdAt = this.now(), reversal: FinancePaymentEntryV1 = { kind: "reversal", id: input.id,
        commandId: input.commandId, loanId: input.loanId, paymentId: input.paymentId, businessDate: input.businessDate,
        reason: input.reason.trim(), amountPaise: payment.amountPaise, createdAt, source: input.source, status: "committed" };
      const data: FinancePaymentLedgerV1 = { schemaVersion: 1, loanId: input.loanId, entries: [...entries, reversal] };
      assertLedger(data, input.loanId);
      const id = ledgerId(input.loanId), next: RecordEnvelope<FinancePaymentLedgerV1> = {
        id, schemaVersion: 1, createdAt: ledger?.createdAt ?? createdAt, updatedAt: createdAt,
        businessDate: input.businessDate, source: input.source, revision: (ledger?.revision ?? 0) + 1, data };
      const nextLoan: RecordEnvelope<FinanceLoanRecordV1> = {
        ...loan, updatedAt: createdAt, revision: loan.revision + 1,
      };
      if (await this.repository.compareAndSetMany([
        { id: loan.id, expectedRevision: loan.revision, next: nextLoan },
        { id, expectedRevision: ledger?.revision ?? null, next },
      ])) return reversal;
    }
    throw new Error("finance_payment_concurrent_write_retry_exhausted");
  }
}
