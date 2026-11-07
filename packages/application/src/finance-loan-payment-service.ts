import type { AtomicRecordRepository } from "../../core/src/repositories";
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
  | Readonly<{ kind: "reversal"; id: string; commandId: string; loanId: string; paymentId: string;
      businessDate: string; reason: string; amountPaise: number; createdAt: string;
      source: RecordEnvelope<unknown>["source"]; status: "committed" }>;
export type FinancePaymentLedgerV1 = Readonly<{ schemaVersion: 1; loanId: string; entries: readonly FinancePaymentEntryV1[] }>;
type LoanDirectory = { get(id: string): Promise<RecordEnvelope<FinanceLoanRecordV1> | undefined> };
type ScheduleRow = { installmentNumber: number; dueDate: string; installmentAmountPaise: number };
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
function assertLedger(value: unknown, loanId: string): asserts value is FinancePaymentLedgerV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("finance_payment_ledger_invalid");
  const ledger = value as FinancePaymentLedgerV1;
  if (ledger.schemaVersion !== 1 || ledger.loanId !== loanId || !Array.isArray(ledger.entries)) {
    throw new Error("finance_payment_ledger_invalid");
  }
  const ids = new Set<string>(), commands = new Set<string>(), payments = new Map<string, FinancePaymentEntryV1>();
  for (const entry of ledger.entries) {
    if (!entry || typeof entry !== "object" || !entry.id || ids.has(entry.id) ||
        !entry.commandId || commands.has(entry.commandId) || entry.loanId !== loanId ||
        !validDate(entry.businessDate) || !Number.isSafeInteger(entry.amountPaise) || entry.amountPaise <= 0) {
      throw new Error("finance_payment_entry_invalid");
    }
    ids.add(entry.id); commands.add(entry.commandId);
    if (entry.kind === "payment") {
      if (!METHODS.has(entry.method) || !Number.isSafeInteger(entry.scheduleVersion) || entry.scheduleVersion < 1 ||
          !Array.isArray(entry.allocations) || !Number.isSafeInteger(entry.unallocatedCreditPaise) ||
          entry.unallocatedCreditPaise < 0 ||
          entry.allocations.reduce((sum, a) => sum + a.amountPaise, 0) + entry.unallocatedCreditPaise !== entry.amountPaise) {
        throw new Error("finance_payment_allocation_invalid");
      }
      payments.set(entry.id, entry);
    } else if (entry.kind !== "reversal" || !entry.paymentId || !entry.reason.trim()) {
      throw new Error("finance_payment_reversal_invalid");
    }
  }
  for (const entry of ledger.entries) if (entry.kind === "reversal") {
    const original = payments.get(entry.paymentId);
    if (!original || original.amountPaise !== entry.amountPaise ||
        ledger.entries.filter(candidate => candidate.kind === "reversal" && candidate.paymentId === entry.paymentId).length !== 1) {
      throw new Error("finance_payment_reversal_link_invalid");
    }
  }
}
export function assertFinancePaymentLedgerV1(value: unknown, loanId: string): asserts value is FinancePaymentLedgerV1 {\n  assertLedger(value, loanId);\n}\nfunction scheduleRows(loan: FinanceLoanRecordV1, version: number): readonly ScheduleRow[] {
  const selected = loan.scheduleVersions.find(item => item.version === version);
  if (!selected) throw new Error("finance_payment_schedule_version_not_found");
  const rows = (selected.output as { rows?: readonly ScheduleRow[] }).rows;
  if (!Array.isArray(rows)) throw new Error("finance_payment_schedule_invalid");
  return rows;
}
function activePayments(entries: readonly FinancePaymentEntryV1[]): FinancePaymentEntryV1[] {
  const reversed = new Set(entries.filter((e): e is Extract<FinancePaymentEntryV1, {kind:"reversal"}> => e.kind === "reversal").map(e => e.paymentId));
  return entries.filter((e): e is Extract<FinancePaymentEntryV1, {kind:"payment"}> => e.kind === "payment" && !reversed.has(e.id));
}
function allocationTotals(entries: readonly FinancePaymentEntryV1[], version: number): Map<number, number> {
  const totals = new Map<number, number>();
  for (const payment of activePayments(entries)) for (const allocation of payment.allocations) {
    if (allocation.scheduleVersion === version) totals.set(allocation.installmentNumber,
      (totals.get(allocation.installmentNumber) ?? 0) + allocation.amountPaise);
  }
  return totals;
}
export function proposeFinancePaymentAllocationV1(
  loan: FinanceLoanRecordV1, entries: readonly FinancePaymentEntryV1[], scheduleVersion: number,
  businessDate: string, amountPaise: number,
): readonly { installmentNumber: number; amountPaise: number }[] {
  if (!validDate(businessDate) || !Number.isSafeInteger(amountPaise) || amountPaise <= 0) throw new Error("finance_payment_amount_or_date_invalid");
  const rows = scheduleRows(loan, scheduleVersion), totals = allocationTotals(entries, scheduleVersion);
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

/** Finance-owned per-loan CAS ledger. All payment and allocation facts are committed as one record revision. */
export class FinanceLoanPaymentService {
  constructor(private readonly repository: AtomicRecordRepository, private readonly loans: LoanDirectory,
    private readonly now: () => string = () => new Date().toISOString()) {}

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
    return proposeFinancePaymentAllocationV1(loan.data, ledger?.data.entries ?? [], input.scheduleVersion, input.businessDate, input.amountPaise);
  }
  async record(input: { id: string; commandId: string; loanId: string; businessDate: string; amountPaise: number;
    method: FinancePaymentMethodV1; reference?: string; note?: string; scheduleVersion: number;
    allocations: readonly { installmentNumber: number; amountPaise: number }[]; source: RecordEnvelope<unknown>["source"] }) {
    if (!input.id.trim() || !input.commandId.trim() || !validDate(input.businessDate) ||
        !Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0 || !METHODS.has(input.method)) {
      throw new Error("finance_payment_input_invalid");
    }
    const { loan } = await this.load(input.loanId);
    const rows = scheduleRows(loan.data, input.scheduleVersion);
    if (!Array.isArray(input.allocations)) throw new Error("finance_payment_allocations_invalid");
    for (let attempt = 0; attempt < 12; attempt++) {
      const { ledger } = await this.load(input.loanId), entries = ledger?.data.entries ?? [];
      const replay = entries.find(entry => entry.commandId === input.commandId);
      if (replay) {
        if (replay.kind !== "payment" || replay.id !== input.id || replay.amountPaise !== input.amountPaise ||
            replay.businessDate !== input.businessDate || replay.scheduleVersion !== input.scheduleVersion) throw new Error("finance_payment_idempotency_conflict");
        return replay;
      }
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
      if (await this.repository.compareAndSet(id, ledger?.revision ?? null, next)) return payment;
    }
    throw new Error("finance_payment_concurrent_write_retry_exhausted");
  }
  async reverse(input: { id: string; commandId: string; loanId: string; paymentId: string; businessDate: string;
    reason: string; source: RecordEnvelope<unknown>["source"] }) {
    if (!input.id.trim() || !input.commandId.trim() || !validDate(input.businessDate) || !input.reason.trim()) throw new Error("finance_payment_reversal_input_invalid");
    for (let attempt = 0; attempt < 12; attempt++) {
      const { ledger } = await this.load(input.loanId), entries = ledger?.data.entries ?? [];
      const replay = entries.find(entry => entry.commandId === input.commandId);
      if (replay) {
        if (replay.kind !== "reversal" || replay.paymentId !== input.paymentId) throw new Error("finance_payment_idempotency_conflict");
        return replay;
      }
      const payment = entries.find((entry): entry is Extract<FinancePaymentEntryV1,{kind:"payment"}> => entry.kind === "payment" && entry.id === input.paymentId);
      if (!payment) throw new Error("finance_payment_not_found");
      if (entries.some(entry => entry.kind === "reversal" && entry.paymentId === input.paymentId)) throw new Error("finance_payment_already_reversed");
      const createdAt = this.now(), reversal: FinancePaymentEntryV1 = { kind: "reversal", id: input.id,
        commandId: input.commandId, loanId: input.loanId, paymentId: input.paymentId, businessDate: input.businessDate,
        reason: input.reason.trim(), amountPaise: payment.amountPaise, createdAt, source: input.source, status: "committed" };
      const data: FinancePaymentLedgerV1 = { schemaVersion: 1, loanId: input.loanId, entries: [...entries, reversal] };
      assertLedger(data, input.loanId);
      const id = ledgerId(input.loanId), next: RecordEnvelope<FinancePaymentLedgerV1> = {
        id, schemaVersion: 1, createdAt: ledger?.createdAt ?? createdAt, updatedAt: createdAt,
        businessDate: input.businessDate, source: input.source, revision: (ledger?.revision ?? 0) + 1, data };
      if (await this.repository.compareAndSet(id, ledger?.revision ?? null, next)) return reversal;
    }
    throw new Error("finance_payment_concurrent_write_retry_exhausted");
  }
}
