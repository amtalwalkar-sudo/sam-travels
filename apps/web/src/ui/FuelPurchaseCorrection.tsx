import { useEffect, useRef, useState, type FormEvent } from "react";
import type { RecordEnvelope } from "../../../../packages/core/src/types";
import type { FuelPurchaseV1 } from "../../../../packages/application/src/business-expenses-service";
import type { BusinessExpensesService } from "../../../../packages/application/src/business-expenses-service";
import "./AdminFormControls.css";

type FuelCorrectionField = "amountPaise" | "pricePaisePerKg";

const money = (paise: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2,
}).format(paise / 100);

function rupeesToPaise(value: string): number {
  if (!/^[0-9]+(?:[.][0-9]{1,2})?$/.test(value)) throw new Error("Enter a valid amount.");
  const [whole, fraction = ""] = value.split(".");
  const paise = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  if (paise <= 0n || paise > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Enter a valid positive amount.");
  return Number(paise);
}

/** Append-only correction UI. The original purchase remains immutable. */
export function FuelPurchaseCorrection({ purchase, service, onCorrected }: {
  purchase: RecordEnvelope<FuelPurchaseV1>;
  service: Pick<BusinessExpensesService, "correctSource" | "listCorrectionHistory">;
  onCorrected: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<FuelCorrectionField>("amountPaise");
  const [value, setValue] = useState((purchase.data.amountPaise / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<Awaited<ReturnType<BusinessExpensesService["listCorrectionHistory"]>>>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const correctionId = useRef<string | null>(null);
  const expectedChainRevision = useRef<number | null>(null);

  useEffect(() => {
    let live = true;
    void service.listCorrectionHistory(purchase.id).then(rows => {
      if (live) { setHistory(rows); expectedChainRevision.current = rows.length; }
    }).catch(error => {
      if (live) setMessage(error instanceof Error ? error.message : "Correction history unavailable.");
    });
    return () => { live = false; };
  }, [purchase.id, service]);

  const currentValue = field === "amountPaise" ? purchase.data.amountPaise : purchase.data.pricePaisePerKg;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const afterValue = rupeesToPaise(value);
      const rows = await service.listCorrectionHistory(purchase.id);
      const chainRevision = expectedChainRevision.current ?? rows.length;
      const id = correctionId.current ?? (correctionId.current = crypto.randomUUID().replaceAll("-", ""));
      await service.correctSource({
        correctionId: id,
        targetRecordId: purchase.id,
        fieldPath: field,
        afterValue,
        reason: reason.trim(),
        expectedTargetRevision: purchase.revision,
        expectedChainRevision: chainRevision,
      });
      correctionId.current = null;
      expectedChainRevision.current = null;
      const updatedHistory = await service.listCorrectionHistory(purchase.id);
      setHistory(updatedHistory);
      expectedChainRevision.current = updatedHistory.length;
      setOpen(false);
      setMessage("Correction appended. The original fuel purchase remains unchanged.");
      try { await onCorrected(); }
      catch { setMessage("Correction saved. Reload the fuel list to refresh calculated values."); }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Correction could not be saved.");
    } finally { setBusy(false); }
  }

  return <div className="admin-capability-form">
    <button className="admin-secondary" type="button" disabled={busy} onClick={() => setOpen(previous => !previous)}>
      {open ? "Close correction" : "Correct amount / price"}
    </button>
    <small>Current amount: {money(purchase.data.amountPaise)} · Current price: {money(purchase.data.pricePaisePerKg)}/kg</small>
    {history.map(item => <small key={item.correctionId}>
      {item.recordedAt} · {field === "amountPaise" ? money(Number(item.beforeValue)) : money(Number(item.beforeValue))} → {money(Number(item.afterValue))} · {item.actor.role} · {item.reason}
    </small>)}
    {open && <form className="admin-capability-form" onSubmit={submit}>
      <label>Field to correct
        <select value={field} disabled={busy} onChange={event => {
          const next = event.target.value as FuelCorrectionField;
          setField(next);
          setValue(((next === "amountPaise" ? purchase.data.amountPaise : purchase.data.pricePaisePerKg) / 100).toFixed(2));
          correctionId.current = null; expectedChainRevision.current = null;
        }}>
          <option value="amountPaise">Total amount paid</option>
          <option value="pricePaisePerKg">Price per kg</option>
        </select>
      </label>
      <label>Corrected value (₹)<input required type="number" min="0.01" step="0.01" value={value} disabled={busy}
        onChange={event => { setValue(event.target.value); correctionId.current = null; expectedChainRevision.current = null; }} /></label>
      <small>Before: {money(currentValue)} · After: {value && Number.isFinite(Number(value)) ? money(Math.round(Number(value) * 100)) : "Enter a valid amount"}</small>
      <label>Reason for correction<input required maxLength={1000} value={reason} disabled={busy}
        onChange={event => { setReason(event.target.value); correctionId.current = null; expectedChainRevision.current = null; }} /></label>
      <div className="loan-form-actions">
        <button className="admin-primary" disabled={busy || !reason.trim()}>Append correction</button>
        <button className="admin-secondary" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>}
    {message && <small className="admin-hint" role="status">{message}</small>}
  </div>;
}
