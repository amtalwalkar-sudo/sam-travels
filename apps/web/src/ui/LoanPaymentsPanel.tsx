import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  FinancePaymentEntryV1,
  FinancePaymentMethodV1,
  FinanceLoanPrepaymentPreviewV1,
  FinanceLoanPrepaymentRevisionV1,
  FinanceLoanPrepaymentModeV1,
} from "../../../../packages/application/src";
import { useAdminServices } from "./admin-services-context";
import type { FinanceLoanRecordV1 } from "../../../../packages/application/src/finance-loan-service";
import type { RecordEnvelope } from "../../../../packages/core/src/types";
import { LOAN_PAYMENT_FORM_V1, LOAN_PREPAYMENT_FORM_V1, LOAN_SETTLEMENT_FORM_V1 } from "../../../../packages/application/src/admin-form-definitions";
import type { FormDefinition, FormWorkingCopy } from "../../../../packages/application/src/shared-form-runtime";

type LoanEnvelope = RecordEnvelope<FinanceLoanRecordV1>;
type Allocation = { installmentNumber: number; amountPaise: number };
type ScheduleRow = { installmentNumber: number; dueDate: string; installmentAmountPaise: number };
type ScheduleView = { version: number; effectiveDate: string; label: string; rows: readonly ScheduleRow[]; regularEmiPaise: number };
const METHODS: FinancePaymentMethodV1[] = ["cash", "bank_transfer", "cheque", "upi", "other"];
function money(paise: number) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(paise / 100); }
function indiaDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function activePayments(entries: readonly FinancePaymentEntryV1[]) {
  const reversed = new Set(entries.filter(entry => entry.kind === "reversal").map(entry => entry.paymentId));
  return entries.filter((entry): entry is Extract<FinancePaymentEntryV1, {kind:"payment"}> => entry.kind === "payment" && !reversed.has(entry.id));
}

export function LoanPaymentsPanel({ loan, onChanged }: { loan: LoanEnvelope; onChanged?: () => void }) {
  const services = useAdminServices();
  const [entries, setEntries] = useState<readonly FinancePaymentEntryV1[]>([]);
  const [schedules, setSchedules] = useState<readonly ScheduleView[]>([]);
  const [prepayments, setPrepayments] = useState<readonly FinanceLoanPrepaymentRevisionV1[]>([]);
  const [open, setOpen] = useState(false);
  const [prepaymentOpen, setPrepaymentOpen] = useState(false);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [settlementDate, setSettlementDate] = useState(indiaDate());
  const [settlementMethod, setSettlementMethod] = useState<FinancePaymentMethodV1>("bank_transfer");
  const [settlementReference, setSettlementReference] = useState("");
  const [settlementPreview, setSettlementPreview] = useState<{ amountPaise: number; scheduleVersion: number; paidThroughInstallment: number; loanRevision: number; paymentLedgerRevision: number | null } | null>(null);
  const [date, setDate] = useState(indiaDate());
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<FinancePaymentMethodV1>("bank_transfer");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [scheduleVersion, setScheduleVersion] = useState(String(loan.data.currentScheduleVersion));
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [prepaymentDate, setPrepaymentDate] = useState(indiaDate());
  const [prepaymentAmount, setPrepaymentAmount] = useState("");
  const [prepaymentMode, setPrepaymentMode] = useState<FinanceLoanPrepaymentModeV1>("reduce_tenure");
  const [prepaymentPreview, setPrepaymentPreview] = useState<FinanceLoanPrepaymentPreviewV1 | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  type DraftKind = "payment" | "prepayment" | "settlement";
  const draftDefinitions: Record<DraftKind, FormDefinition> = {
    payment: LOAN_PAYMENT_FORM_V1, prepayment: LOAN_PREPAYMENT_FORM_V1, settlement: LOAN_SETTLEMENT_FORM_V1,
  };
  const [formCopies, setFormCopies] = useState<Record<DraftKind, FormWorkingCopy | null>>({
    payment: null, prepayment: null, settlement: null,
  });
  const formCopyRefs = useRef<Record<DraftKind, FormWorkingCopy | null>>({
    payment: null, prepayment: null, settlement: null,
  });
  const formQueues = useRef<Record<DraftKind, Promise<void>>>({
    payment: Promise.resolve(), prepayment: Promise.resolve(), settlement: Promise.resolve(),
  });
  const activateDraft = (kind: DraftKind, next: FormWorkingCopy) => {
    formCopyRefs.current[kind] = next;
    setFormCopies(current => ({ ...current, [kind]: next }));
    formQueues.current[kind] = Promise.resolve();
  };
  const updateDraftField = async (kind: DraftKind, field: string, value: unknown) => {
    const current = formCopyRefs.current[kind];
    if (!current) return;
    const operation = formQueues.current[kind].then(async () => {
      const latest = formCopyRefs.current[kind];
      if (!latest) return;
      const next = await services.formRuntime.update(draftDefinitions[kind], latest, field, value);
      formCopyRefs.current[kind] = next;
      setFormCopies(state => ({ ...state, [kind]: next }));
    });
    formQueues.current[kind] = operation.catch(() => undefined);
    await operation;
  };
  const clearDraftView = (kind: DraftKind) => {
    formCopyRefs.current[kind] = null;
    setFormCopies(current => ({ ...current, [kind]: null }));
  };
  const openDraft = async (kind: DraftKind, initial: Readonly<Record<string, unknown>>) => {
    const definition = draftDefinitions[kind];
    const drafts = await services.formRuntime.listDrafts(definition);
    const existing = drafts.find(draft => draft.values.loanId === loan.id);
    let next = await services.formRuntime.open(definition, existing?.instanceId ?? crypto.randomUUID());
    if (!existing) {
      for (const [field, value] of Object.entries(initial)) {
        if (next.values[field] === undefined) next = await services.formRuntime.update(definition, next, field, value);
      }
    }
    activateDraft(kind, next);
    if (kind === "payment") {
      setDate(String(next.values.businessDate ?? indiaDate()));
      setAmount(typeof next.values.amountPaise === "number" ? String(next.values.amountPaise / 100) : "");
      setMethod((next.values.method as FinancePaymentMethodV1) ?? "bank_transfer");
      setReference(String(next.values.reference ?? ""));
      setNote(String(next.values.note ?? ""));
      setScheduleVersion(String(next.values.scheduleVersion ?? loan.data.currentScheduleVersion));
      try { setAllocations(JSON.parse(String(next.values.allocationsJson ?? "[]"))); } catch { setAllocations([]); }
    } else if (kind === "prepayment") {
      setPrepaymentDate(String(next.values.businessDate ?? indiaDate()));
      setPrepaymentAmount(typeof next.values.amountPaise === "number" ? String(next.values.amountPaise / 100) : "");
      setPrepaymentMode((next.values.mode as FinanceLoanPrepaymentModeV1) ?? "reduce_tenure");
      try { setPrepaymentPreview(next.values.previewJson ? JSON.parse(String(next.values.previewJson)) : null); } catch { setPrepaymentPreview(null); }
    } else {
      setSettlementDate(String(next.values.businessDate ?? indiaDate()));
      setSettlementMethod((next.values.method as FinancePaymentMethodV1) ?? "bank_transfer");
      setSettlementReference(String(next.values.reference ?? ""));
      try { setSettlementPreview(next.values.previewJson ? JSON.parse(String(next.values.previewJson)) : null); } catch { setSettlementPreview(null); }
    }
  };
  const openPaymentDraft = async () => {
    const businessDate = date || indiaDate();
    await openDraft("payment", { loanId: loan.id, businessDate, amountPaise: undefined, method,
      scheduleVersion: Number(scheduleVersion), allocationsJson: "[]", reference: "", note: "" });
    setOpen(true); setPrepaymentOpen(false); setSettlementOpen(false);
  };
  const openPrepaymentDraft = async () => {
    await openDraft("prepayment", { loanId: loan.id, businessDate: prepaymentDate || indiaDate(),
      amountPaise: undefined, mode: prepaymentMode, previewJson: "" });
    setPrepaymentOpen(true); setOpen(false); setSettlementOpen(false);
  };
  const openSettlementDraft = async () => {
    await openDraft("settlement", { loanId: loan.id, businessDate: settlementDate || indiaDate(),
      method: settlementMethod, reference: "", previewJson: "" });
    setSettlementOpen(true); setOpen(false); setPrepaymentOpen(false);
  };
  const schedule = schedules.find(item => item.version === Number(scheduleVersion));
  const paidEntries = useMemo(() => activePayments(entries), [entries]);
  const refresh = useCallback(async () => {
    try {
      const [paymentRows, history] = await Promise.all([
        services.financeLoanPayments.list(loan.id),
        services.financeLoanPrepayments.getScheduleHistory(loan.id),
      ]);
      setEntries(paymentRows);
      setSchedules(history.versions);
      setPrepayments(history.prepayments);
      setScheduleVersion(String(history.currentScheduleVersion));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load Loan history."); }
  }, [loan.id]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function suggest() {
    const amountPaise = Math.round(Number(amount) * 100);
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0 || !date) { setMessage("Enter a valid payment amount and date."); return; }
    setBusy(true); setMessage("");
    try {
      await formQueues.current.payment;
      const proposal = await services.financeLoanPayments.propose({
        loanId: loan.id, scheduleVersion: Number(scheduleVersion), businessDate: date, amountPaise,
      });
      setAllocations(proposal.map(item => ({ installmentNumber: item.installmentNumber, amountPaise: item.amountPaise })));
      await updateDraftField("payment", "allocationsJson", JSON.stringify(proposal));
      setMessage(proposal.length ? "Suggested oldest-due-first allocation. You can adjust the amounts before saving." : "No eligible due EMI was suggested; amount will remain unallocated unless you add an allocation.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Allocation could not be suggested."); }
    finally { setBusy(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      await formQueues.current.payment;
      const current = formCopyRefs.current.payment;
      if (!current) throw new Error("finance_payment_form_not_ready");
      await services.formRuntime.save(LOAN_PAYMENT_FORM_V1, current);
      clearDraftView("payment");
      setAmount(""); setReference(""); setNote(""); setAllocations([]); setOpen(false);
      setMessage("Payment recorded atomically. Unallocated credit remains separate from prepayment.");
      await refresh(); await onChanged?.();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Payment could not be saved."); }
    finally { setBusy(false); }
  }

  async function reverse(payment: Extract<FinancePaymentEntryV1,{kind:"payment"}>) {
    const reason = window.prompt("Reason for full payment reversal (original record remains in history):");
    if (!reason?.trim()) return;
    if (!window.confirm("Reverse this full payment? Allocations will be released and the payment retained in history.")) return;
    setBusy(true); setMessage("");
    try {
      await services.financeLoanPayments.reverse({
        id: crypto.randomUUID(), commandId: crypto.randomUUID(), loanId: loan.id, paymentId: payment.id,
        businessDate: indiaDate(), reason: reason.trim(), source: services.recordSource,
      });
      setMessage("Full payment reversal recorded."); await refresh(); await onChanged?.();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Payment reversal failed."); }
    finally { setBusy(false); }
  }
  async function previewSettlement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setSettlementPreview(null);
    try {
      await formQueues.current.settlement;
      const current = formCopyRefs.current.settlement;
      if (!current) throw new Error("finance_payment_settlement_form_not_ready");
      const preview = await services.financeLoanSettlements.preview({ loanId: loan.id, businessDate: settlementDate });
      setSettlementPreview(preview);
      await updateDraftField("settlement", "previewJson", JSON.stringify(preview));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Settlement preview failed."); }
    finally { setBusy(false); }
  }

  async function confirmSettlement() {
    setBusy(true); setMessage("");
    try {
      await formQueues.current.settlement;
      const current = formCopyRefs.current.settlement;
      if (!current) throw new Error("finance_payment_settlement_form_not_ready");
      await services.formRuntime.submit(LOAN_SETTLEMENT_FORM_V1, current);
      clearDraftView("settlement");
      setSettlementPreview(null); setSettlementOpen(false);
      setMessage("Final settlement recorded and Loan closed.");
      await refresh(); await onChanged?.();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Settlement could not be committed."); }
    finally { setBusy(false); }
  }

  async function previewPrepayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountPaise = Math.round(Number(prepaymentAmount) * 100);
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0 || !prepaymentDate) {
      setMessage("Enter a valid principal prepayment amount and date."); return;
    }
    setBusy(true); setMessage(""); setPrepaymentPreview(null);
    try {
      await formQueues.current.prepayment;
      const current = formCopyRefs.current.prepayment;
      if (!current) throw new Error("finance_loan_prepayment_form_not_ready");
      const preview = await services.financeLoanPrepayments.preview({
        loanId: loan.id, commandId: current.operationId, businessDate: prepaymentDate,
        amountPaise, mode: prepaymentMode, source: services.recordSource,
      });
      setPrepaymentPreview(preview);
      await updateDraftField("prepayment", "previewJson", JSON.stringify(preview));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Prepayment preview failed."); }
    finally { setBusy(false); }
  }

  async function confirmPrepayment() {
    setBusy(true); setMessage("");
    try {
      await formQueues.current.prepayment;
      const current = formCopyRefs.current.prepayment;
      if (!current) throw new Error("finance_loan_prepayment_form_not_ready");
      await services.formRuntime.submit(LOAN_PREPAYMENT_FORM_V1, current);
      clearDraftView("prepayment");
      setPrepaymentPreview(null); setPrepaymentAmount(""); setPrepaymentOpen(false);
      setMessage("Principal prepayment and revised schedule committed atomically.");
      await refresh(); onChanged?.();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Prepayment could not be committed."); }
    finally { setBusy(false); }
  }


  const allRows = schedule?.rows ?? [];
  const allocatedTotal = allocations.reduce((sum, item) => sum + item.amountPaise, 0);
  const amountPaise = Math.round(Number(amount) * 100);
  const unallocated = Number.isSafeInteger(amountPaise) && amountPaise > 0 ? Math.max(0, amountPaise - allocatedTotal) : 0;
  return <section className="loan-payment-panel">
    <div className="loan-payment-head">
      <strong>Payment history ({paidEntries.length} active)</strong>
      <div className="loan-form-actions">
        <button className="admin-secondary" type="button" disabled={busy || loan.data.lifecycleState === "closed"} onClick={() => { if (settlementOpen) { clearDraftView("settlement"); setSettlementOpen(false); setSettlementPreview(null); } else void openSettlementDraft().catch(error => setMessage(error instanceof Error ? error.message : "Could not open settlement draft.")); setMessage(""); }}>
          {settlementOpen ? "Cancel settlement" : "Settle & close"}
        </button>
        <button className="admin-secondary" type="button" disabled={busy || loan.data.lifecycleState === "closed"} onClick={() => { if (prepaymentOpen) { clearDraftView("prepayment"); setPrepaymentOpen(false); setPrepaymentPreview(null); } else void openPrepaymentDraft().catch(error => setMessage(error instanceof Error ? error.message : "Could not open prepayment draft.")); setMessage(""); }}>
          {prepaymentOpen ? "Cancel prepayment" : "Prepay principal"}
        </button>
        <button className="admin-secondary" type="button" disabled={busy || loan.data.lifecycleState === "closed"} onClick={() => { if (open) { clearDraftView("payment"); setOpen(false); } else void openPaymentDraft().catch(error => setMessage(error instanceof Error ? error.message : "Could not open payment draft.")); setMessage(""); }}>
          {open ? "Cancel payment" : "Record payment"}
        </button>
      </div>
    </div>
    {loan.data.lifecycleState === "closed" && <p className="admin-message" role="status">Loan closed. Payment and prepayment actions are disabled; history remains available.</p>}
    {settlementOpen && <form className="loan-form" onSubmit={previewSettlement}>
      <strong>Final settlement</strong>
      {formCopies.settlement && <small>Recoverable draft · revision {formCopies.settlement.revision}</small>}
      <div className="loan-form-grid">
        <label>Settlement date<input required type="date" value={settlementDate} onChange={event => { setSettlementDate(event.target.value); setSettlementPreview(null); void updateDraftField("settlement", "businessDate", event.target.value); void updateDraftField("settlement", "previewJson", ""); }} /></label>
        <label>Payment method<select value={settlementMethod} onChange={event => { const value = event.target.value as FinancePaymentMethodV1; setSettlementMethod(value); void updateDraftField("settlement", "method", value); void updateDraftField("settlement", "previewJson", ""); setSettlementPreview(null); }}>{METHODS.map(value => <option key={value} value={value}>{value.replace("_"," ")}</option>)}</select></label>
        <label>Reference (optional)<input value={settlementReference} onChange={event => { setSettlementReference(event.target.value); void updateDraftField("settlement", "reference", event.target.value); }} /></label>
      </div>
      <button className="admin-secondary" type="submit" disabled={busy}>{busy ? "Checking…" : "Check settlement amount"}</button>
      {settlementPreview && <div className="loan-payment-allocation">
        <strong>Settlement amount: {money(settlementPreview.amountPaise)}</strong>
        <small>Schedule version {settlementPreview.scheduleVersion} · all EMIs paid through installment #{settlementPreview.paidThroughInstallment}</small>
        <div className="loan-form-actions"><button className="admin-primary" type="button" disabled={busy} onClick={() => void confirmSettlement()}>Confirm settlement and close Loan</button></div>
      </div>}
    </form>}
    {prepaymentOpen && <form className="loan-form" onSubmit={previewPrepayment}>
      <strong>Principal prepayment</strong>
      {formCopies.prepayment && <small>Recoverable draft · revision {formCopies.prepayment.revision}</small>}
      <div className="loan-form-grid">
        <label>Prepayment date<input required type="date" value={prepaymentDate} onChange={event => { setPrepaymentDate(event.target.value); setPrepaymentPreview(null); void updateDraftField("prepayment", "businessDate", event.target.value); void updateDraftField("prepayment", "previewJson", ""); }} /></label>
        <label>Principal amount (₹)<input required type="number" min="0.01" step="0.01" value={prepaymentAmount} onChange={event => { setPrepaymentAmount(event.target.value); setPrepaymentPreview(null); const value = event.target.value === "" ? undefined : Math.round(Number(event.target.value) * 100); void updateDraftField("prepayment", "amountPaise", value); void updateDraftField("prepayment", "previewJson", ""); }} /></label>
        <label>How should the loan change?<select value={prepaymentMode} onChange={event => { const value = event.target.value as FinanceLoanPrepaymentModeV1; setPrepaymentMode(value); setPrepaymentPreview(null); void updateDraftField("prepayment", "mode", value); void updateDraftField("prepayment", "previewJson", ""); }}>
          <option value="reduce_tenure">Reduce tenure · keep EMI unchanged</option>
          <option value="reduce_emi">Reduce EMI · keep remaining dates</option>
        </select></label>
      </div>
      <button className="admin-secondary" type="submit" disabled={busy}>{busy ? "Calculating…" : "Preview prepayment"}</button>
      {prepaymentPreview && <div className="loan-payment-allocation">
        <strong>Review before confirmation</strong>
        <div className="loan-form-grid">
          <span>Principal before: {money(prepaymentPreview.principalBeforePaise)}</span>
          <span>Prepayment: {money(prepaymentPreview.amountPaise)}</span>
          <span>Principal after: {money(prepaymentPreview.principalAfterPaise)}</span>
          <span>New regular EMI: {money(prepaymentPreview.regularEmiPaise)}</span>
          <span>Remaining instalments: {prepaymentPreview.remainingInstallmentCount}</span>
          <span>Final due date: {prepaymentPreview.finalDueDate}</span>
          <span>Estimated interest saved: {money(prepaymentPreview.interestSavedPaise)}</span>
        </div>
        <div className="loan-form-actions">
          <button className="admin-primary" type="button" disabled={busy} onClick={() => void confirmPrepayment()}>Confirm prepayment</button>
          <button className="admin-secondary" type="button" disabled={busy} onClick={() => { setPrepaymentPreview(null); void updateDraftField("prepayment", "previewJson", ""); }}>Discard preview</button>
        </div>
      </div>}
    </form>}
    {open && <form className="loan-form" onSubmit={save}>
      <small>Recoverable payment draft · revision {formCopies.payment?.revision ?? 0}</small>
      <div className="loan-form-grid">
        <label>Payment date<input required type="date" value={date} onChange={event => { setDate(event.target.value); setAllocations([]); void updateDraftField("payment", "businessDate", event.target.value); void updateDraftField("payment", "allocationsJson", "[]"); }} /></label>
        <label>Amount paid (₹)<input required type="number" min="0.01" step="0.01" value={amount} onChange={event => { setAmount(event.target.value); setAllocations([]); const value = event.target.value === "" ? undefined : Math.round(Number(event.target.value) * 100); void updateDraftField("payment", "amountPaise", value); void updateDraftField("payment", "allocationsJson", "[]"); }} /></label>
        <label>Payment method<select value={method} onChange={event => { const value = event.target.value as FinancePaymentMethodV1; setMethod(value); void updateDraftField("payment", "method", value); }}>{METHODS.map(value => <option key={value} value={value}>{value.replace("_"," ")}</option>)}</select></label>
        <label>Schedule version<select value={scheduleVersion} onChange={event => { setScheduleVersion(event.target.value); setAllocations([]); void updateDraftField("payment", "scheduleVersion", Number(event.target.value)); void updateDraftField("payment", "allocationsJson", "[]"); }}>
          {schedules.map(item => <option key={item.version} value={item.version}>Version {item.version} · {item.label} · effective {item.effectiveDate}</option>)}
        </select></label>
        <label>Transaction reference (optional)<input value={reference} onChange={event => { setReference(event.target.value); void updateDraftField("payment", "reference", event.target.value); }} /></label>
        <label>Note (optional)<input value={note} onChange={event => { setNote(event.target.value); void updateDraftField("payment", "note", event.target.value); }} /></label>
      </div>
      <button className="admin-secondary" type="button" disabled={busy || !amount || !date} onClick={() => void suggest()}>Suggest oldest-due-first allocation</button>
      {allocations.length > 0 && <div className="loan-payment-allocation">
        <strong>Review allocation · {money(allocatedTotal)}</strong>
        {allocations.map(item => {
          const row = allRows.find(candidate => candidate.installmentNumber === item.installmentNumber);
          return <label key={item.installmentNumber}>EMI #{item.installmentNumber} · due {row?.dueDate ?? "—"} · scheduled {money(row?.installmentAmountPaise ?? 0)}
            <input type="number" min="0" step="1" value={item.amountPaise} onChange={event => setAllocations(current => { const next = current.map(entry => entry.installmentNumber === item.installmentNumber ? { ...entry, amountPaise: Number(event.target.value) } : entry); void updateDraftField("payment", "allocationsJson", JSON.stringify(next)); return next; })} />
          </label>;
        })}
        <label>Add an eligible due EMI<select value="" onChange={event => { if (event.target.value) { const installmentNumber = Number(event.target.value); setAllocations(current => { if (current.some(item => item.installmentNumber === installmentNumber)) return current; const next = [...current, { installmentNumber, amountPaise: 0 }].sort((a,b) => a.installmentNumber-b.installmentNumber); void updateDraftField("payment", "allocationsJson", JSON.stringify(next)); return next; }); } }}>
          <option value="">Select installment…</option>{allRows.filter(row => row.dueDate <= date && !allocations.some(item => item.installmentNumber === row.installmentNumber)).map(row => <option key={row.installmentNumber} value={row.installmentNumber}>#{row.installmentNumber} · {row.dueDate}</option>)}
        </select></label>
        <small>Unallocated credit: {money(unallocated)} · not treated as prepayment or future EMI</small>
      </div>}
      <div className="loan-form-actions"><button className="admin-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save payment"}</button></div>
    </form>}
    {prepayments.length > 0 && <div className="loan-payment-list">
      <strong>Principal prepayment history</strong>
      {prepayments.map(item => <div className="loan-payment-row" key={item.commandId}>
        <div><strong>{item.effectiveDate} · {money(item.prepaymentAmountPaise)}</strong>
          <small>{item.mode === "reduce_tenure" ? "Reduce tenure" : "Reduce EMI"} · principal {money(item.principalBeforePaise)} → {money(item.principalAfterPaise)}</small>
          <small>Schedule v{item.version} · EMI {money(item.output.regularEmiPaise)} · interest saved {money(item.output.interestSavedPaise)}</small>
        </div>
      </div>)}
    </div>}
    {paidEntries.length === 0 ? <p className="admin-hint">No payments recorded yet.</p> : <div className="loan-payment-list">
      {entries.map(entry => entry.kind === "reversal" ? <div className="loan-payment-row" key={entry.id}><strong>Reversal · {entry.businessDate}</strong><span>{money(entry.amountPaise)} · {entry.reason}</span></div> :
        entry.kind === "settlement" ? <div className="loan-payment-row" key={entry.id}><div><strong>Final settlement · {entry.businessDate} · {money(entry.amountPaise)}</strong><small>Loan closed · schedule v{entry.scheduleVersion} · paid through EMI #{entry.paidThroughInstallment}</small>{entry.reference && <small>Reference: {entry.reference}</small>}</div></div> :
        <div className="loan-payment-row" key={entry.id}><div><strong>{entry.businessDate} · {money(entry.amountPaise)}</strong><small>{entry.method.replace("_"," ")} · schedule v{entry.scheduleVersion} · allocated {money(entry.amountPaise-entry.unallocatedCreditPaise)} · unallocated {money(entry.unallocatedCreditPaise)}</small>{entry.reference && <small>Reference: {entry.reference}</small>}</div>
          {!entries.some(candidate => candidate.kind === "reversal" && candidate.paymentId === entry.id) && <button className="admin-secondary" type="button" disabled={busy || loan.data.lifecycleState === "closed"} onClick={() => void reverse(entry)}>Reverse</button>}</div>)}
    </div>}
    {message && <p className="admin-message" role="status">{message}</p>}
  </section>;
}
