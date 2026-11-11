import { useEffect, useRef, useState } from "react";
import { useAdminServices } from "./admin-services-context";
import {
  LOAN_PAYMENT_FORM_V1, LOAN_PREPAYMENT_FORM_V1, LOAN_SETTLEMENT_FORM_V1,
} from "../../../../packages/application/src/admin-form-definitions";
import type { FormDefinition, FormWorkingCopy } from "../../../../packages/application/src/shared-form-runtime";
import type {
  FinanceLoanPrepaymentPreviewV1, FinanceLoanPrepaymentModeV1, FinancePaymentMethodV1, FinancePaymentEntryV1,
} from "../../../../packages/application/src";

type DraftKind = "payment" | "prepayment" | "settlement";
type Allocation = { installmentNumber: number; amountPaise: number };
type SettlementPreview = { amountPaise: number; scheduleVersion: number; paidThroughInstallment: number;
  loanRevision: number; paymentLedgerRevision: number | null };
type SetValue<T> = (value: T) => void;
type Inputs = {
  loanId: string; currentScheduleVersion: number;
  setDate: SetValue<string>; setAmount: SetValue<string>; setMethod: SetValue<FinancePaymentMethodV1>;
  setReference: SetValue<string>; setNote: SetValue<string>; setScheduleVersion: SetValue<string>;
  setAllocations: SetValue<Allocation[]>;
  setPrepaymentDate: SetValue<string>; setPrepaymentAmount: SetValue<string>;
  setPrepaymentMode: SetValue<FinanceLoanPrepaymentModeV1>;
  setPrepaymentPreview: SetValue<FinanceLoanPrepaymentPreviewV1 | null>;
  setSettlementDate: SetValue<string>; setSettlementMethod: SetValue<FinancePaymentMethodV1>;
  setSettlementReference: SetValue<string>; setSettlementPreview: SetValue<SettlementPreview | null>;
};
const DEFINITIONS: Record<DraftKind, FormDefinition> = {
  payment: LOAN_PAYMENT_FORM_V1, prepayment: LOAN_PREPAYMENT_FORM_V1, settlement: LOAN_SETTLEMENT_FORM_V1,
};
export function indiaDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function money(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(paise / 100);
}
export function activePayments(entries: readonly FinancePaymentEntryV1[]) {
  const reversed = new Set(entries.filter(entry => entry.kind === "reversal").map(entry => entry.paymentId));
  return entries.filter((entry): entry is Extract<FinancePaymentEntryV1, { kind: "payment" }> =>
    entry.kind === "payment" && !reversed.has(entry.id));
}

/** Shared-runtime draft lifecycle for all Loan payment, prepayment and settlement forms. */
export function useLoanFormDrafts(input: Inputs) {
  const services = useAdminServices();
  const [draftAvailability, setDraftAvailability] = useState<Record<DraftKind, boolean>>({
    payment: false, prepayment: false, settlement: false,
  });
  const [formCopies, setFormCopies] = useState<Record<DraftKind, FormWorkingCopy | null>>({
    payment: null, prepayment: null, settlement: null,
  });
  const formCopyRefs = useRef<Record<DraftKind, FormWorkingCopy | null>>({
    payment: null, prepayment: null, settlement: null,
  });
  const formQueues = useRef<Record<DraftKind, Promise<void>>>({
    payment: Promise.resolve(), prepayment: Promise.resolve(), settlement: Promise.resolve(),
  });
  useEffect(() => {
    let active = true;
    void Promise.all((Object.keys(DEFINITIONS) as DraftKind[]).map(async kind => {
      const drafts = await services.formRuntime.listDrafts(DEFINITIONS[kind]);
      if (active) setDraftAvailability(current => ({
        ...current, [kind]: drafts.some(draft => draft.values.loanId === input.loanId),
      }));
    })).catch(() => undefined);
    return () => { active = false; };
  }, [services, input.loanId]);

  function activate(kind: DraftKind, next: FormWorkingCopy) {
    formCopyRefs.current[kind] = next;
    setFormCopies(current => ({ ...current, [kind]: next }));
    formQueues.current[kind] = Promise.resolve();
  }
  async function updateDraftField(kind: DraftKind, field: string, value: unknown) {
    if (!formCopyRefs.current[kind]) return;
    const operation = formQueues.current[kind].then(async () => {
      const latest = formCopyRefs.current[kind];
      if (!latest) return;
      const next = await services.formRuntime.update(DEFINITIONS[kind], latest, field, value);
      formCopyRefs.current[kind] = next;
      setFormCopies(state => ({ ...state, [kind]: next }));
    });
    formQueues.current[kind] = operation.catch(() => undefined);
    await operation;
  }
  function clearDraftView(kind: DraftKind) {
    formCopyRefs.current[kind] = null;
    setFormCopies(current => ({ ...current, [kind]: null }));
  }
  function markCompleted(kind: DraftKind) {
    clearDraftView(kind);
    setDraftAvailability(current => ({ ...current, [kind]: false }));
  }
  async function openDraft(kind: DraftKind, initial: Readonly<Record<string, unknown>>) {
    const drafts = await services.formRuntime.listDrafts(DEFINITIONS[kind]);
    const existing = drafts.filter(draft => draft.values.loanId === input.loanId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    setDraftAvailability(current => ({ ...current, [kind]: true }));
    let next = await services.formRuntime.open(DEFINITIONS[kind], existing?.instanceId ?? crypto.randomUUID());
    if (!existing) {
      for (const [field, value] of Object.entries(initial)) {
        if (next.values[field] === undefined) next = await services.formRuntime.update(DEFINITIONS[kind], next, field, value);
      }
    }
    activate(kind, next);
    if (kind === "payment") {
      input.setDate(String(next.values.businessDate ?? indiaDate()));
      input.setAmount(typeof next.values.amountPaise === "number" ? String(next.values.amountPaise / 100) : "");
      input.setMethod((next.values.method as FinancePaymentMethodV1) ?? "bank_transfer");
      input.setReference(String(next.values.reference ?? ""));
      input.setNote(String(next.values.note ?? ""));
      input.setScheduleVersion(String(next.values.scheduleVersion ?? input.currentScheduleVersion));
      try { input.setAllocations(JSON.parse(String(next.values.allocationsJson ?? "[]"))); } catch { input.setAllocations([]); }
    } else if (kind === "prepayment") {
      input.setPrepaymentDate(String(next.values.businessDate ?? indiaDate()));
      input.setPrepaymentAmount(typeof next.values.amountPaise === "number" ? String(next.values.amountPaise / 100) : "");
      input.setPrepaymentMode((next.values.mode as FinanceLoanPrepaymentModeV1) ?? "reduce_tenure");
      try { input.setPrepaymentPreview(next.values.previewJson ? JSON.parse(String(next.values.previewJson)) : null); }
      catch { input.setPrepaymentPreview(null); }
    } else {
      input.setSettlementDate(String(next.values.businessDate ?? indiaDate()));
      input.setSettlementMethod((next.values.method as FinancePaymentMethodV1) ?? "bank_transfer");
      input.setSettlementReference(String(next.values.reference ?? ""));
      try { input.setSettlementPreview(next.values.previewJson ? JSON.parse(String(next.values.previewJson)) : null); }
      catch { input.setSettlementPreview(null); }
    }
  }
  async function openPaymentDraft() {
    await openDraft("payment", { loanId: input.loanId, businessDate: indiaDate(), amountPaise: undefined,
      method: "bank_transfer", scheduleVersion: input.currentScheduleVersion, allocationsJson: "[]", reference: "", note: "" });
  }
  async function openPrepaymentDraft() {
    await openDraft("prepayment", { loanId: input.loanId, businessDate: indiaDate(), amountPaise: undefined,
      mode: "reduce_tenure", previewJson: "" });
  }
  async function openSettlementDraft() {
    await openDraft("settlement", { loanId: input.loanId, businessDate: indiaDate(), method: "bank_transfer",
      reference: "", previewJson: "" });
  }
  async function waitFor(kind: DraftKind) { await formQueues.current[kind]; }
  function getCopy(kind: DraftKind) { return formCopyRefs.current[kind]; }
  return {
    draftAvailability, formCopies, updateDraftField, clearDraftView, markCompleted,
    openPaymentDraft, openPrepaymentDraft, openSettlementDraft, waitFor, getCopy,
  };
}
