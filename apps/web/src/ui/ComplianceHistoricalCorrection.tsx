import { useEffect, useRef, useState } from "react";
import "./AdminFormControls.css";
import "./AdminCompliance.css";
import type { RecordEnvelope } from "../../../../packages/core/src/types";
import type { ComplianceRecordV1 } from "../../../../packages/application/src/compliance-service";
import type { ComplianceHistoricalCorrectionAdapter } from "../compliance-historical-correction";

type ComplianceField = "validFrom" | "validTo" | "totalCostPaise" | "supportingDocumentRef";
type CorrectionInput = Parameters<ComplianceHistoricalCorrectionAdapter["submit"]>[0];

function currentValue(record: ComplianceRecordV1, field: ComplianceField): string {
  if (field === "totalCostPaise") return (record.totalCostPaise / 100).toFixed(2);
  return String(record[field] ?? "");
}
function paiseFromRupees(value: string): number {
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(value.trim())) throw new Error("Enter a valid amount with up to two decimal places.");
  const [whole, fraction = ""] = value.trim().split(".");
  const paise = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  if (paise > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("The amount is too large.");
  return Number(paise);
}
function displayValue(field: ComplianceField, value: string): string {
  return field === "totalCostPaise" ? "₹" + value : value || "Not recorded";
}

export function ComplianceHistoricalCorrection({ record, service, onCorrected }: {
  record: RecordEnvelope<ComplianceRecordV1>;
  service: ComplianceHistoricalCorrectionAdapter;
  onCorrected: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<ComplianceField>("validTo");
  const [value, setValue] = useState(currentValue(record.data, "validTo"));
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<Awaited<ReturnType<ComplianceHistoricalCorrectionAdapter["listForTarget"]>>>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const correctionId = useRef<string | null>(null);
  const expectedChainRevision = useRef<number | null>(null);

  const fields: ComplianceField[] = [
    "validFrom", "validTo", "totalCostPaise",
    ...(record.data.supportingDocumentRef !== undefined ? ["supportingDocumentRef" as const] : []),
  ];
  const resetIntent = () => { correctionId.current = null; expectedChainRevision.current = null; };

  useEffect(() => {
    let live = true;
    void service.listForTarget(record.id).then(rows => { if (live) setHistory(rows); })
      .catch(error => { if (live) setMessage(error instanceof Error ? error.message : "Correction history unavailable."); });
    return () => { live = false; };
  }, [record.id, service]);

  function chooseField(next: ComplianceField) {
    resetIntent(); setField(next); setValue(currentValue(record.data, next)); setMessage("");
  }

  async function submit() {
    setBusy(true); setMessage("");
    try {
      const chain = await service.listForTarget(record.id);
      expectedChainRevision.current ??= chain.length;
      correctionId.current ??= crypto.randomUUID().replaceAll("-", "");
      let afterValue: CorrectionInput["afterValue"];
      if (field === "totalCostPaise") afterValue = paiseFromRupees(value);
      else if (field === "validFrom" || field === "validTo") {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Choose a valid business date.");
        if (field === "validFrom" && value > record.data.validTo) throw new Error("Valid from must not be after the current valid-until date.");
        if (field === "validTo" && value < record.data.validFrom) throw new Error("Valid until must not be before the current valid-from date.");
        afterValue = value;
      } else {
        if (!value.trim() || value.trim().length > 240) throw new Error("Enter a document reference of up to 240 characters.");
        afterValue = value.trim();
      }
      if (afterValue === record.data[field]) throw new Error("The proposed value is unchanged.");
      if (!reason.trim()) throw new Error("A correction reason is required.");
      await service.submit({
        correctionId: correctionId.current,
        targetRecordId: record.id,
        expectedTargetRevision: record.revision,
        expectedChainRevision: expectedChainRevision.current,
        fieldPath: field,
        afterValue,
        reason: reason.trim(),
        businessEffectiveDate: field === "validFrom" || field === "validTo" ? String(afterValue) : record.data.validFrom,
      });
      const updatedHistory = await service.listForTarget(record.id);
      setHistory(updatedHistory); resetIntent(); setOpen(false); setReason("");
      setMessage("Correction appended. The original Compliance record remains unchanged.");
      await onCorrected();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Compliance correction could not be saved.");
    } finally { setBusy(false); }
  }

  return <div className="compliance-correction">
    <button className="admin-secondary" type="button" disabled={busy} onClick={() => setOpen(current => !current)}>
      {open ? "Close correction" : "Correct details / history"}
    </button>
    {open && <div className="compliance-correction-editor">
      <p className="admin-hint">A correction is a new, attributable history entry. The submitted Compliance record is never overwritten.</p>
      <label>Field to correct<select value={field} onChange={event => chooseField(event.target.value as ComplianceField)}>
        {fields.map(item => <option key={item} value={item}>{
          item === "validFrom" ? "Valid from" : item === "validTo" ? "Valid until" :
            item === "totalCostPaise" ? "Total cost" : "Document reference"
        }</option>)}
      </select></label>
      <label>{field === "validFrom" ? "Corrected valid-from date" : field === "validTo" ? "Corrected valid-until date" :
        field === "totalCostPaise" ? "Corrected total cost (₹)" : "Corrected document reference"}
        <input type={field === "validFrom" || field === "validTo" ? "date" : field === "totalCostPaise" ? "number" : "text"}
          min={field === "totalCostPaise" ? "0" : undefined} step={field === "totalCostPaise" ? "0.01" : undefined}
          maxLength={field === "supportingDocumentRef" ? 240 : undefined} value={value}
          onChange={event => { resetIntent(); setValue(event.target.value); }} />
      </label>
      <div className="compliance-correction-preview">
        <small>Current value · {displayValue(field, currentValue(record.data, field))}</small>
        <strong>Proposed value · {displayValue(field, value)}</strong>
      </div>
      <label>Reason for correction<textarea rows={2} maxLength={1000} value={reason}
        onChange={event => { resetIntent(); setReason(event.target.value); }} /></label>
      <button className="admin-primary" type="button" disabled={busy || !reason.trim()} onClick={() => void submit()}>
        {busy ? "Appending correction…" : "Append correction"}
      </button>
    </div>}
    {history.length > 0 && <details className="compliance-correction-history">
      <summary>Correction history ({history.length})</summary>
      {history.map(item => <article key={item.correctionId}>
        <strong>{item.fieldPath.replaceAll(/([A-Z])/g, " $1")} · {item.actor.role}</strong>
        <small>{String(item.beforeValue)} → {String(item.afterValue)}</small>
        <small>{item.recordedAt} · {item.actor.actorId}</small>
        <small>{item.reason}</small>
      </article>)}
    </details>}
    {message && <p className="admin-hint" role="status">{message}</p>}
  </div>;
}
