import { useEffect, useRef, useState, type FormEvent } from "react";
import type { RecordEnvelope } from "../../../../packages/core/src/types";
import type { MaintenanceVisitV1 } from "../../../../packages/application/src/maintenance-service";
import type { MaintenanceExpenseCorrectionAdapter } from "../maintenance-expense-correction-runtime";
import "./AdminFormControls.css";

const money = (paise: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2,
}).format(paise / 100);

/** Corrects the visit total without rewriting its original itemised service evidence. */
export function MaintenanceVisitCorrection({ visit, service, onCorrected }: {
  visit: RecordEnvelope<MaintenanceVisitV1>;
  service: MaintenanceExpenseCorrectionAdapter;
  onCorrected: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState((visit.data.totalPaise / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<Awaited<ReturnType<MaintenanceExpenseCorrectionAdapter["listForTarget"]>>>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const correctionId = useRef<string | null>(null);
  const expectedChainRevision = useRef<number | null>(null);

  useEffect(() => {
    let live = true;
    void service.listForTarget(visit.id).then(rows => { if (live) setHistory(rows); })
      .catch(error => { if (live) setMessage(error instanceof Error ? error.message : "Correction history unavailable."); });
    return () => { live = false; };
  }, [visit.id, service]);

  // Reconcile the editable amount with the latest corrected projection when
  // the record refreshes or the correction panel is closed/reopened. Without
  // this, a successful correction leaves the next edit seeded from stale data.
  useEffect(() => {
    if (!open) setAmount((visit.data.totalPaise / 100).toFixed(2));
  }, [visit.id, visit.revision, visit.data.totalPaise, open]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const chain = await service.listForTarget(visit.id);
      const parsed = Number(amount);
      const amountPaise = Math.round(parsed * 100);
      if (!Number.isFinite(parsed) || !Number.isSafeInteger(amountPaise) || amountPaise < 0) {
        throw new Error("Enter a valid non-negative visit total.");
      }
      if (amountPaise === visit.data.totalPaise) throw new Error("The corrected total is unchanged.");
      if (!reason.trim()) throw new Error("A correction reason is required.");
      correctionId.current ??= crypto.randomUUID().replaceAll("-", "");
      expectedChainRevision.current ??= chain.length;
      await service.submit({
        correctionId: correctionId.current,
        targetRecordId: visit.id,
        expectedTargetRevision: visit.revision,
        expectedChainRevision: expectedChainRevision.current,
        fieldPath: "totalPaise",
        afterValue: amountPaise,
        reason: reason.trim(),
        businessEffectiveDate: visit.data.maintenanceDate,
      });
      setHistory(await service.listForTarget(visit.id));
      correctionId.current = null; expectedChainRevision.current = null;
      setOpen(false); setReason("");
      setMessage("Visit correction appended. The original visit and itemised evidence remain unchanged.");
      await onCorrected();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Visit correction could not be saved.");
    } finally { setBusy(false); }
  }

  return <div className="admin-capability-form">
    <button className="admin-secondary" type="button" disabled={busy} onClick={() => setOpen(value => !value)}>
      {open ? "Close visit correction" : "Correct visit total / view history"}
    </button>
    {history.map(item => <small key={item.correctionId}>
      {item.recordedAt} · {money(Number(item.beforeValue))} → {money(Number(item.afterValue))} · {item.actor.role} · {item.reason}
    </small>)}
    {open && <form className="admin-capability-form" onSubmit={submit}>
      <p className="admin-hint">Only the recorded visit total is corrected here. Original item descriptions and amounts remain preserved as entered.</p>
      <label>Corrected visit total (₹)<input required type="number" min="0" step="0.01" value={amount}
        onChange={event => { correctionId.current = null; expectedChainRevision.current = null; setAmount(event.target.value); }} /></label>
      <small>Current total: {money(visit.data.totalPaise)}</small>
      <label>Reason for correction<input required maxLength={1000} value={reason}
        onChange={event => { correctionId.current = null; expectedChainRevision.current = null; setReason(event.target.value); }} /></label>
      <div className="loan-form-actions">
        <button className="admin-primary" disabled={busy || !reason.trim()}>{busy ? "Appending correction…" : "Append correction"}</button>
        <button className="admin-secondary" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>}
    {message && <small className="admin-hint" role="status">{message}</small>}
  </div>;
}
