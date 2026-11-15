import { useEffect, useRef, useState, type FormEvent } from "react";
import type { RecordEnvelope } from "../../../../packages/core/src/types";
import type { GeneralMaintenanceExpenseV1 } from "../../../../packages/application/src/maintenance-service";
import { projectHistoricalCorrectionsV1 } from "../../../../packages/domain/src/historical-correction";
import type { MaintenanceExpenseCorrectionAdapter } from "../maintenance-expense-correction-runtime";

const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100);

export function MaintenanceExpenseCorrection({ expense, service, onCorrected }: {
  expense: RecordEnvelope<GeneralMaintenanceExpenseV1>;
  service: MaintenanceExpenseCorrectionAdapter;
  onCorrected: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState((expense.data.amountPaise / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<Awaited<ReturnType<MaintenanceExpenseCorrectionAdapter["listForTarget"]>>>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  // Keep the same operation identity after an ambiguous submission failure so a retry replays safely.
  const correctionId = useRef<string | null>(null);
  const expectedChainRevision = useRef<number | null>(null);
  useEffect(() => {
    let live = true;
    void service.listForTarget(expense.id).then(rows => { if (live) setHistory(rows); })
      .catch(error => { if (live) setMessage(error instanceof Error ? error.message : "Correction history unavailable."); });
    return () => { live = false; };
  }, [expense.id, service]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const chain = await service.listForTarget(expense.id);
      const amountPaise = Math.round(Number(amount) * 100);
      if (!Number.isFinite(Number(amount)) || !Number.isSafeInteger(amountPaise) || amountPaise < 0) {
        throw new Error("Enter a valid amount.");
      }
      await service.submit({
        correctionId: correctionId.current ?? (correctionId.current = crypto.randomUUID().replaceAll("-", "")), targetRecordId: expense.id,
        expectedTargetRevision: expense.revision, expectedChainRevision: expectedChainRevision.current ?? (expectedChainRevision.current = chain.length),
        fieldPath: "amountPaise", afterValue: amountPaise, reason,
        businessEffectiveDate: expense.data.expenseDate,
      });
      setHistory(await service.listForTarget(expense.id));
      setOpen(false);
      setMessage("Correction appended. The original expense record remains unchanged.");
      await onCorrected();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Correction failed."); }
    finally { setBusy(false); }
  }
  return <div className="admin-capability-form">
    <button className="admin-secondary" type="button" disabled={busy} onClick={() => setOpen(value => !value)}>
      {open ? "Close correction" : "Correct amount / view history"}
    </button>
    {history.map(item => <small key={item.correctionId}>
      {item.recordedAt} · {money(Number(item.beforeValue))} → {money(Number(item.afterValue))} · {item.actor.role} · {item.reason}
    </small>)}
    {open && <form className="admin-capability-form" onSubmit={submit}>
      <label>Corrected amount (₹)<input required type="number" min="0" step="0.01" value={amount} onChange={event => { correctionId.current = null; expectedChainRevision.current = null; setAmount(event.target.value); }} /></label>
      <small>Before: {money(expense.data.amountPaise)} · After: {Number.isFinite(Number(amount)) && Number(amount) >= 0 ? money(Math.round(Number(amount) * 100)) : "Enter a valid amount"}</small>
      <label>Reason for correction<input required maxLength={1000} value={reason} onChange={event => { correctionId.current = null; expectedChainRevision.current = null; setReason(event.target.value); }} /></label>
      <div className="loan-form-actions">
        <button className="admin-primary" disabled={busy}>Append correction</button>
        <button className="admin-secondary" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>}
    {message && <small className="admin-hint" role="status">{message}</small>}
  </div>;
}
