import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  getApplicationFinanceLoanPaymentService,
  getApplicationRecordSource,
  type FinancePaymentEntryV1,
  type FinancePaymentMethodV1,
} from "../../../../packages/application/src";
import type { FinanceLoanRecordV1 } from "../../../../packages/application/src/finance-loan-service";
import type { RecordEnvelope } from "../../../../packages/core/src/types";
import type { LoanAmortizationSchedule } from "../../../../packages/features/finance";

type LoanEnvelope = RecordEnvelope<FinanceLoanRecordV1>;
type Allocation = { installmentNumber: number; amountPaise: number };
const METHODS: FinancePaymentMethodV1[] = ["cash", "bank_transfer", "cheque", "upi", "other"];
function money(paise: number) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(paise / 100); }
function indiaDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function activePayments(entries: readonly FinancePaymentEntryV1[]) {
  const reversed = new Set(entries.filter(entry => entry.kind === "reversal").map(entry => entry.paymentId));
  return entries.filter((entry): entry is Extract<FinancePaymentEntryV1, {kind:"payment"}> => entry.kind === "payment" && !reversed.has(entry.id));
}

export function LoanPaymentsPanel({ loan }: { loan: LoanEnvelope }) {
  const [entries, setEntries] = useState<readonly FinancePaymentEntryV1[]>([]);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(indiaDate());
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<FinancePaymentMethodV1>("bank_transfer");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [scheduleVersion, setScheduleVersion] = useState(String(loan.data.currentScheduleVersion));
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const schedule = loan.data.scheduleVersions.find(item => item.version === Number(scheduleVersion))?.output as LoanAmortizationSchedule | undefined;
  const paidEntries = useMemo(() => activePayments(entries), [entries]);
  const refresh = useCallback(async () => {
    try { setEntries(await getApplicationFinanceLoanPaymentService().list(loan.id)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not load payment history."); }
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
      await refresh();
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
      setMessage("Full payment reversal recorded."); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Payment reversal failed."); }
    finally { setBusy(false); }
  }

  const allRows = schedule?.rows ?? [];
  const allocatedTotal = allocations.reduce((sum, item) => sum + item.amountPaise, 0);
  const amountPaise = Math.round(Number(amount) * 100);
  const unallocated = Number.isSafeInteger(amountPaise) && amountPaise > 0 ? Math.max(0, amountPaise - allocatedTotal) : 0;
  return <section className="loan-payment-panel">
    <div className="loan-payment-head"><strong>Payment history ({paidEntries.length} active)</strong><button className="admin-secondary" type="button" onClick={() => { setOpen(value => !value); setMessage(""); }}>{open ? "Cancel payment" : "Record payment"}</button></div>
    {open && <form className="loan-form" onSubmit={save}>
      <div className="loan-form-grid">
        <label>Payment date<input required type="date" value={date} onChange={event => { setDate(event.target.value); setAllocations([]); }} /></label>
        <label>Amount paid (₹)<input required type="number" min="0.01" step="0.01" value={amount} onChange={event => { setAmount(event.target.value); setAllocations([]); }} /></label>
        <label>Payment method<select value={method} onChange={event => setMethod(event.target.value as FinancePaymentMethodV1)}>{METHODS.map(value => <option key={value} value={value}>{value.replace("_"," ")}</option>)}</select></label>
        <label>Schedule version<select value={scheduleVersion} onChange={event => { setScheduleVersion(event.target.value); setAllocations([]); }}>{loan.data.scheduleVersions.map(item => <option key={item.version} value={item.version}>Version {item.version} · effective {item.effectiveDate}</option>)}</select></label>
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
    {paidEntries.length === 0 ? <p className="admin-hint">No payments recorded yet.</p> : <div className="loan-payment-list">
      {entries.map(entry => entry.kind === "reversal" ? <div className="loan-payment-row" key={entry.id}><strong>Reversal · {entry.businessDate}</strong><span>{money(entry.amountPaise)} · {entry.reason}</span></div> :
        <div className="loan-payment-row" key={entry.id}><div><strong>{entry.businessDate} · {money(entry.amountPaise)}</strong><small>{entry.method.replace("_"," ")} · schedule v{entry.scheduleVersion} · allocated {money(entry.amountPaise-entry.unallocatedCreditPaise)} · unallocated {money(entry.unallocatedCreditPaise)}</small>{entry.reference && <small>Reference: {entry.reference}</small>}</div>
          {!entries.some(candidate => candidate.kind === "reversal" && candidate.paymentId === entry.id) && <button className="admin-secondary" type="button" disabled={busy} onClick={() => void reverse(entry)}>Reverse</button>}</div>)}
    </div>}
    {message && <p className="admin-message" role="status">{message}</p>}
  </section>;
}
