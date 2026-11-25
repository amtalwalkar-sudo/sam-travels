import { useCallback, useEffect, useMemo, useState } from "react";
import type { SubmittedTripFinancialRecordV1 } from "../../../../packages/application/src/trip-financial-service";
import { useTripFinancialFormRuntime } from "./trip-financial-form-context";

type Field = "feePaise" | "farePaise" | "tollPaise" | "tollPayer" | "parkingPaise" | "parkingPayer";
const fields: readonly { value: Field; label: string; kind: "money" | "payer" }[] = [
  { value: "feePaise", label: "Cancellation fee", kind: "money" },
  { value: "farePaise", label: "Fare", kind: "money" },
  { value: "tollPaise", label: "Toll amount", kind: "money" },
  { value: "tollPayer", label: "Toll payer", kind: "payer" },
  { value: "parkingPaise", label: "Parking amount", kind: "money" },
  { value: "parkingPayer", label: "Parking payer", kind: "payer" },
];
const rupees = (value: unknown) => typeof value === "number" ? (value / 100).toFixed(2) : "—";

export function TripFinancialCorrectionSection() {
  const runtime = useTripFinancialFormRuntime();
  const [rows, setRows] = useState<readonly SubmittedTripFinancialRecordV1[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [field, setField] = useState<Field>("farePaise");
  const [after, setAfter] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const next = await runtime.listSubmittedTripFinancialRecords();
    setRows(next);
    setSelectedId(current => next.some(row => row.id === current) ? current : next[0]?.id ?? "");
  }, [runtime]);
  useEffect(() => { void refresh().catch(error => setMessage(error instanceof Error ? error.message : "Unable to load trip financial records")); }, [refresh]);
  const selected = useMemo(() => rows.find(row => row.id === selectedId), [rows, selectedId]);
  useEffect(() => { setField(selected?.data.kind === "cancellation_fee" ? "feePaise" : "farePaise"); setAfter(""); }, [selectedId]);
  const selectedField = fields.find(item => item.value === field)!;

  async function submit() {
    if (!selected || !runtime.corrections) return;
    setBusy(true); setMessage("");
    try {
      let value: string | number;
      if (selectedField.kind === "money") {
        const parsed = Number(after);
        if (!after.trim() || !Number.isFinite(parsed) || parsed < 0 || Math.round(parsed * 100) / 100 !== parsed) {
          throw new Error("Enter a non-negative amount with at most two decimal places.");
        }
        value = Math.round(parsed * 100);
      } else {
        if (after !== "driver" && after !== "customer") throw new Error("Choose Driver or Customer.");
        value = after;
      }
      await runtime.corrections.submit({
        correctionId: crypto.randomUUID(),
        targetRecordId: selected.id,
        expectedTargetRevision: selected.revision,
        expectedChainRevision: selected.correctionChainRevision ?? 0,
        fieldPath: field,
        afterValue: value,
        reason: reason.trim(),
      });
      setAfter(""); setReason("");
      await refresh();
      setMessage("Trip financial correction recorded. Original Work and GPS events remain unchanged.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Correction was not recorded"); }
    finally { setBusy(false); }
  }

  return <section className="admin-capability-panel" aria-label="Trip financial corrections">
    <p className="admin-hint">Correct submitted fare, toll and parking values through the append-only correction chain. Corrections require an active Driver-author or PIN-verified Admin identity; original Work, GPS and odometer events are never edited.</p>
    {!rows.length && <p className="admin-hint">No submitted trip financial records are available to correct.</p>}
    {rows.length > 0 && <>
      <label>Submitted trip
        <select value={selectedId} onChange={event => { setSelectedId(event.target.value); setAfter(""); }}>
          {rows.map(row => <option key={row.id} value={row.id}>{row.data.tripId} · {row.data.kind === "cancellation_fee" ? "Cancellation fee" : "Completed trip"}</option>)}
        </select>
      </label>
      {selected && <div className="admin-record-list">
        <article className="admin-capability-record">
          <strong>Source revision {selected.revision} · correction chain {selected.correctionChainRevision ?? 0}</strong>
          <small>Trip {selected.data.tripId} · {selected.data.kind}</small>
          {selected.data.kind === "completed_ride_financials" && <>
            <small>Fare ₹{rupees(selected.data.farePaise)} · Toll ₹{rupees(selected.data.tollPaise)} ({selected.data.tollPayer ?? "payer unset"}) · Parking ₹{rupees(selected.data.parkingPaise)} ({selected.data.parkingPayer ?? "payer unset"})</small>
          </>}
          {selected.correctionRefs?.map(ref => <small key={ref.sourceId}>Correction {ref.sourceId} · chain revision {ref.chainRevision}</small>)}
        </article>
      </div>}
      <div className="loan-form-grid">
        <label>Field to correct
          <select value={field} onChange={event => { setField(event.target.value as Field); setAfter(""); }}>
            {fields.filter(item => selected?.data.kind === "completed_ride_financials" ? item.value !== "feePaise" : item.value === "feePaise").map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>Correct value
          {selectedField.kind === "money"
            ? <input type="number" min="0" step="0.01" value={after} onChange={event => setAfter(event.target.value)} />
            : <select value={after} onChange={event => setAfter(event.target.value)}><option value="">Choose payer</option><option value="driver">Driver</option><option value="customer">Customer</option></select>}
        </label>
        <label className="loan-form-grid-full">Reason for correction
          <textarea maxLength={1000} required value={reason} onChange={event => setReason(event.target.value)} />
        </label>
      </div>
      <button className="admin-primary" type="button" disabled={busy || !selected || !after.trim() || !reason.trim()} onClick={() => void submit()}>{busy ? "Recording…" : "Record correction"}</button>
    </>}
    {message && <p className="admin-message" role="status">{message}</p>}
  </section>;
}
