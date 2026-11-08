import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  getApplicationFinanceLoanPaymentService,
  getApplicationFinanceLoanPrepaymentService,
  getApplicationRecordSource,
  type FinancePaymentEntryV1,
  type FinancePaymentMethodV1,
  type FinanceLoanPrepaymentPreviewV1,
  type FinanceLoanPrepaymentRevisionV1,
  type FinanceLoanPrepaymentModeV1,
} from "../../../../packages/application/src";
import type { FinanceLoanRecordV1 } from "../../../../packages/application/src/finance-loan-service";
import type { RecordEnvelope } from "../../../../packages/core/src/types";

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
  const [entries, setEntries] = useState<readonly FinancePaymentEntryV1[]>([]);
  const [schedules, setSchedules] = useState<readonly ScheduleView[]>([]);
  const [prepayments, setPrepayments] = useState<readonly FinanceLoanPrepaymentRevisionV1[]>([]);
  const [open, setOpen] = useState(false);
  const [prepaymentOpen, setPrepaymentOpen] = useState(false);
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
  const schedule = schedules.find(item => item.version === Number(scheduleVersion));
  const paidEntries = useMemo(() => activePayments(entries), [entries]);
  const refresh = useCallback(async () => {
    try {
      const [paymentRows, history] = await Promise.all([
        getApplicationFinanceLoanPaymentService().list(loan.id),
        getApplicationFinanceLoanPrepaymentService().getScheduleHistory(loan.id),
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
      const proposal = await getApplicationFinanceLoanPaymentService().propose({
        loanId: loan.id, scheduleVersion: Number(scheduleVersion), businessDate: date, amountPaise,
      });
      setAllocations(proposal.map(item => ({ installmentNumber: item.installmentNumber, amountPaise: item.amountPaise })));
      setMessage(proposal.length ? "Suggested oldest-due-first allocation. You can adjust the amounts before saving." : "No eligible due EMI was suggested; amount will remain unallocated unless you add an allocation.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Allocation could not be suggested."); }
    finally { setBusy(false); }
  }
  function addAllocation(installmentNumber: number) {
    if (allocations.some(item => item.installmentNumber === installmentNumber)) return;
    setAllocations(current => [...current, { installmentNumber, amountPaise: 0 }].sort((a,b) => a.installmentNumber-b.installmentNumber));
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountPaise = Math.round(Number(amount) * 100);
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) { setMessage("Payment amount must be positive."); return; }
    setBusy(true); setMessage("");
    try {
      await getApplicationFinanceLoanPaymentService().record({
        id: crypto.randomUUID(), commandId: crypto.randomUUID(), loanId: loan.id, businessDate: date,
        amountPaise, method, ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}), scheduleVersion: Number(scheduleVersion),
        allocations, source: getApplicationRecordSource(),
      });
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
      await getApplicationFinanceLoanPaymentService().reverse({
        id: crypto.randomUUID(), commandId: crypto.randomUUID(), loanId: loan.id, paymentId: payment.id,
        businessDate: indiaDate(), reason: reason.trim(), source: getApplicationRecordSource(),
      });
      setMessage("Full payment reversal recorded."); await refresh(); await onChanged?.();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Payment reversal failed."); }
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
      const preview = await getApplicationFinanceLoanPrepaymentService().preview({
        loanId: loan.id, commandId: crypto.randomUUID(), businessDate: prepaymentDate,
        amountPaise, mode: prepaymentMode, source: getApplicationRecordSource(),
      });
      setPrepaymentPreview(preview);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Prepayment preview failed."); }
    finally { setBusy(false); }
  }
  async function confirmPrepayment() {
    if (!prepaymentPreview) return;
    setBusy(true); setMessage("");
    try {
      await getApplicationFinanceLoanPrepaymentService().commit({
        preview: prepaymentPreview, source: getApplicationRecordSource(),
      });
      setPrepaymentPreview(null); setPrepaymentAmount(""); setPrepaymentOpen(false);
      setMessage("Principal prepayment and revised schedule committed atomically.");
      await refresh();
      onChanged?.();
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
        <button className="admin-secondary" type="button" disabled={busy} onClick={() => { setPrepaymentOpen(value => !value); setOpen(false); setMessage(""); }}>
          {prepaymentOpen ? "Cancel prepayment" : "Prepay principal"}
        </button>
        <button className="admin-secondary" type="button" disabled={busy} onClick={() => { setOpen(value => !value); setPrepaymentOpen(false); setMessage(""); }}>
          {open ? "Cancel payment" : "Record payment"}
        </button>
      </div>
    </div>
    {prepaymentOpen && <form className="loan-form" onSubmit={previewPrepayment}>
      <strong>Principal prepayment</strong>
      <div className="loan-form-grid">
        <label>Prepayment date<input required type="date" value={prepaymentDate} onChange={event => { setPrepaymentDate(event.target.value); setPrepaymentPreview(null); }} /></label>
        <label>Principal amount (₹)<input required type="number" min="0.01" step="0.01" value={prepaymentAmount} onChange={event => { setPrepaymentAmount(event.target.value); setPrepaymentPreview(null); }} /></label>
        <label>How should the loan change?<select value={prepaymentMode} onChange={event => { setPrepaymentMode(event.target.value as FinanceLoanPrepaymentModeV1); setPrepaymentPreview(null); }}>
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
          <button className="admin-secondary" type="button" disabled={busy} onClick={() => setPrepaymentPreview(null)}>Discard preview</button>
        </div>
      </div>}
    </form>}
    {open && <form className="loan-form" onSubmit={save}>
      <div className="loan-form-grid">
        <label>Payment date<input required type="date" value={date} onChange={event => { setDate(event.target.value); setAllocations([]); }} /></label>
        <label>Amount paid (₹)<input required type="number" min="0.01" step="0.01" value={amount} onChange={event => { setAmount(event.target.value); setAllocations([]); }} /></label>
        <label>Payment method<select value={method} onChange={event => setMethod(event.target.value as FinancePaymentMethodV1)}>{METHODS.map(value => <option key={value} value={value}>{value.replace("_"," ")}</option>)}</select></label>
        <label>Schedule version<select value={scheduleVersion} onChange={event => { setScheduleVersion(event.target.value); setAllocations([]); }}>
          {schedules.map(item => <option key={item.version} value={item.version}>Version {item.version} · {item.label} · effective {item.effectiveDate}</option>)}
        </select></label>
        <label>Transaction reference (optional)<input value={reference} onChange={event => setReference(event.target.value)} /></label>
        <label>Note (optional)<input value={note} onChange={event => setNote(event.target.value)} /></label>
      </div>
      <button className="admin-secondary" type="button" disabled={busy || !amount || !date} onClick={() => void suggest()}>Suggest oldest-due-first allocation</button>
      {allocations.length > 0 && <div className="loan-payment-allocation">
        <strong>Review allocation · {money(allocatedTotal)}</strong>
        {allocations.map(item => {
          const row = allRows.find(candidate => candidate.installmentNumber === item.installmentNumber);
          return <label key={item.installmentNumber}>EMI #{item.installmentNumber} · due {row?.dueDate ?? "—"} · scheduled {money(row?.installmentAmountPaise ?? 0)}
            <input type="number" min="0" step="1" value={item.amountPaise} onChange={event => setAllocations(current => current.map(entry => entry.installmentNumber === item.installmentNumber ? { ...entry, amountPaise: Number(event.target.value) } : entry))} />
          </label>;
        })}
        <label>Add an eligible due EMI<select value="" onChange={event => { if (event.target.value) addAllocation(Number(event.target.value)); }}>
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
        <div className="loan-payment-row" key={entry.id}><div><strong>{entry.businessDate} · {money(entry.amountPaise)}</strong><small>{entry.method.replace("_"," ")} · schedule v{entry.scheduleVersion} · allocated {money(entry.amountPaise-entry.unallocatedCreditPaise)} · unallocated {money(entry.unallocatedCreditPaise)}</small>{entry.reference && <small>Reference: {entry.reference}</small>}</div>
          {!entries.some(candidate => candidate.kind === "reversal" && candidate.paymentId === entry.id) && <button className="admin-secondary" type="button" disabled={busy} onClick={() => void reverse(entry)}>Reverse</button>}</div>)}
    </div>}
    {message && <p className="admin-message" role="status">{message}</p>}
  </section>;
}
