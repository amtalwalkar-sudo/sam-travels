import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { HistoricalTripBackfillV1 } from "../../../../packages/domain/src/historical-trip-backfill";
import type { RecordEnvelope } from "../../../../packages/core/src/types";
import { useHistoricalTripBackfillService } from "./admin-services-context";
import "./AdminFormControls.css";

type BackfillRecord = RecordEnvelope<HistoricalTripBackfillV1>;
const localDateTime = () => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return get("year") + "-" + get("month") + "-" + get("day") + "T" + get("hour") + ":" + get("minute");
};
const toInstant = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Enter valid trip start and end times.");
  return new Date(value + ":00+05:30").toISOString();
};
const operationalDateFor = (value: string) => {
  try {
    const instant = Date.parse(toInstant(value));
    return new Date(instant + 90 * 60_000).toISOString().slice(0, 10);
  } catch { return "Enter a valid start time"; }
};
const rupees = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
const displayTime = (value: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function AdminHistoricalTripBackfillSection() {
  const service = useHistoricalTripBackfillService();
  const [records, setRecords] = useState<BackfillRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    backfillId: "", driverId: "", vehicleId: "", startedAt: localDateTime(),
    endedAt: "", fare: "", reason: "",
  });
  const refresh = useCallback(async () => {
    try { setRecords([...(await service.list())]); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not load historical trips."); }
  }, [service]);
  useEffect(() => { void refresh(); }, [refresh]);
  function change(field: keyof typeof form, value: string) { setForm(previous => ({ ...previous, [field]: value })); }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const startedAt = toInstant(form.startedAt), endedAt = toInstant(form.endedAt);
      const farePaise = Math.round(Number(form.fare) * 100);
      if (!Number.isSafeInteger(farePaise) || farePaise < 0) throw new Error("Enter a valid fare amount.");
      const operationalDate = operationalDateFor(form.startedAt);
      await service.submit({
        backfillId: form.backfillId.trim() || crypto.randomUUID(),
        driverId: form.driverId.trim(), vehicleId: form.vehicleId.trim(),
        operationalDate, startedAt, endedAt, farePaise, reason: form.reason.trim(),
      });
      setForm({ backfillId: "", driverId: "", vehicleId: "", startedAt: localDateTime(), endedAt: "", fare: "", reason: "" });
      setOpen(false);
      setMessage("Historical trip recorded as an Admin-declared entry. No Work, GPS or odometer events were created.");
      await refresh();
      window.dispatchEvent(new Event("historical-trip-backfill-updated"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Historical trip could not be saved."); }
    finally { setBusy(false); }
  }
  return <section className="admin-capability-panel" aria-label="Historical trip backfill">
    <p className="admin-hint">Use only when a real trip is missing from Work history. This creates a separately attributable historical record; it does not create a Work event, GPS fix, odometer reading or shift.</p>
    {!open && <button className="admin-primary" type="button" onClick={() => { setOpen(true); setMessage(""); }}>Add missing historical trip</button>}
    {open && <form className="admin-capability-form" onSubmit={save}>
      <div className="loan-form-grid">
        <label>Driver record ID<input required maxLength={128} value={form.driverId} onChange={e => change("driverId", e.target.value)} placeholder="Driver ID" /></label>
        <label>Vehicle record ID<input required maxLength={128} value={form.vehicleId} onChange={e => change("vehicleId", e.target.value)} placeholder="Vehicle ID" /></label>
        <label>Trip started (India time)<input required type="datetime-local" value={form.startedAt} onChange={e => change("startedAt", e.target.value)} /></label>
        <label>Trip ended (India time)<input required type="datetime-local" min={form.startedAt} value={form.endedAt} onChange={e => change("endedAt", e.target.value)} /></label>
        <label>Fare (₹)<input required type="number" min="0" step="0.01" value={form.fare} onChange={e => change("fare", e.target.value)} /></label>
        <label>Backfill reference (optional)<input maxLength={128} value={form.backfillId} onChange={e => change("backfillId", e.target.value)} placeholder="Generated if blank" /></label>
        <label className="loan-form-grid-full">Reason / source of historical information<textarea required maxLength={1000} value={form.reason} onChange={e => change("reason", e.target.value)} placeholder="For example, reconciled from the paper trip sheet" /></label>
      </div>
      <small className="admin-hint">Operational date is derived using the 04:00 Asia/Kolkata boundary: {form.startedAt ? operationalDateFor(form.startedAt) : "—"}</small>
      <div className="loan-form-actions"><button className="admin-primary" disabled={busy}>{busy ? "Saving…" : "Save historical trip"}</button><button className="admin-secondary" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button></div>
    </form>}
    {records.length > 0 && <div className="admin-record-list">{records.map(record => <article className="admin-capability-record" key={record.id}>
      <div><strong>{displayTime(record.data.startedAt)} · {rupees(record.data.farePaise)}</strong>
        <small>Driver {record.data.driverId} · Vehicle {record.data.vehicleId} · Operational date {record.data.operationalDate}</small>
        <small>Admin-declared by {record.data.actor.actorId} · entered {displayTime(record.data.recordedAt)}</small>
        <small>{record.data.reason}</small></div>
    </article>)}</div>}
    {message && <p className="admin-message" role="status">{message}</p>}
  </section>;
}
