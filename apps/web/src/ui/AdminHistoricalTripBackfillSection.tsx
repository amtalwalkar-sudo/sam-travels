import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { HistoricalTripBackfillV1 } from "../../../../packages/domain/src/historical-trip-backfill";
import type { RecordEnvelope } from "../../../../packages/core/src/types";
import { useHistoricalTripBackfillService, useAdminDriverServices } from "./admin-services-context";
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
  const { driverRecords, vehicles } = useAdminDriverServices();
  const [records, setRecords] = useState<BackfillRecord[]>([]);
  const [drivers, setDrivers] = useState<Awaited<ReturnType<typeof driverRecords.list>>>([]);
  const [vehicleRecords, setVehicleRecords] = useState<Awaited<ReturnType<typeof vehicles.list>>>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    backfillId: "", driverId: "", vehicleId: "", startedAt: localDateTime(),
    endedAt: "", fare: "", toll: "", tollPayer: "", parking: "", parkingPayer: "", reason: "",
  });
  const refresh = useCallback(async () => {
    try {
      const [backfills, driverRows, vehicleRows] = await Promise.all([
        service.list(), driverRecords.list(), vehicles.list(),
      ]);
      setRecords([...backfills]); setDrivers(driverRows); setVehicleRecords(vehicleRows);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load historical trips."); }
  }, [service, driverRecords, vehicles]);
  useEffect(() => { void refresh(); }, [refresh]);
  function change(field: keyof typeof form, value: string) { setForm(previous => ({ ...previous, [field]: value })); }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const startedAt = toInstant(form.startedAt), endedAt = toInstant(form.endedAt);
      const farePaise = Math.round(Number(form.fare) * 100);
      if (!Number.isSafeInteger(farePaise) || farePaise < 0) throw new Error("Enter a valid fare amount.");
      const optionalCharge = (amount: string, payer: string, label: string): { amountPaise?: number; payer?: string } => {
        if (!amount.trim()) {
          if (payer) throw new Error(label + " payer requires an amount.");
          return {};
        }
        const parsed = Number(amount);
        if (!Number.isFinite(parsed) || parsed < 0 || Math.round(parsed * 100) / 100 !== parsed) {
          throw new Error("Enter a non-negative " + label.toLowerCase() + " amount with at most two decimal places.");
        }
        if (payer !== "driver" && payer !== "customer") throw new Error("Choose who paid the " + label.toLowerCase() + ".");
        return { amountPaise: Math.round(parsed * 100), payer };
      };
      const toll = optionalCharge(form.toll, form.tollPayer, "Toll");
      const parking = optionalCharge(form.parking, form.parkingPayer, "Parking");
      const operationalDate = operationalDateFor(form.startedAt);
      await service.submit({
        backfillId: form.backfillId.trim() || crypto.randomUUID(),
        driverId: form.driverId.trim(), vehicleId: form.vehicleId.trim(),
        operationalDate, startedAt, endedAt, farePaise,
        ...(toll.amountPaise !== undefined ? { tollPaise: toll.amountPaise, tollPayer: toll.payer as "driver" | "customer" } : {}),
        ...(parking.amountPaise !== undefined ? { parkingPaise: parking.amountPaise, parkingPayer: parking.payer as "driver" | "customer" } : {}),
        reason: form.reason.trim(),
      });
      setForm({ backfillId: "", driverId: "", vehicleId: "", startedAt: localDateTime(), endedAt: "", fare: "", toll: "", tollPayer: "", parking: "", parkingPayer: "", reason: "" });
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
        <label>Driver<select required value={form.driverId} onChange={e => change("driverId", e.target.value)}>
          <option value="">Select historical Driver</option>
          {drivers.map(driver => <option key={driver.id} value={driver.data.driverId}>{driver.data.name} · {driver.data.lifecycleState}</option>)}
        </select></label>
        <label>Vehicle<select required value={form.vehicleId} onChange={e => change("vehicleId", e.target.value)}>
          <option value="">Select historical Vehicle</option>
          {vehicleRecords.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.data.registrationNumber} · {vehicle.data.lifecycleState}</option>)}
        </select></label>
        <label>Trip started (India time)<input required type="datetime-local" value={form.startedAt} onChange={e => change("startedAt", e.target.value)} /></label>
        <label>Trip ended (India time)<input required type="datetime-local" min={form.startedAt} value={form.endedAt} onChange={e => change("endedAt", e.target.value)} /></label>
        <label>Fare (₹)<input required type="number" min="0" step="0.01" value={form.fare} onChange={e => change("fare", e.target.value)} /></label>
        <label>Toll (₹, optional)<input type="number" min="0" step="0.01" value={form.toll} onChange={e => change("toll", e.target.value)} /></label>
        <label>Toll paid by<select value={form.tollPayer} onChange={e => change("tollPayer", e.target.value)}><option value="">Not applicable</option><option value="driver">Driver</option><option value="customer">Customer</option></select></label>
        <label>Parking (₹, optional)<input type="number" min="0" step="0.01" value={form.parking} onChange={e => change("parking", e.target.value)} /></label>
        <label>Parking paid by<select value={form.parkingPayer} onChange={e => change("parkingPayer", e.target.value)}><option value="">Not applicable</option><option value="driver">Driver</option><option value="customer">Customer</option></select></label>
        <label>Backfill reference (optional)<input maxLength={128} value={form.backfillId} onChange={e => change("backfillId", e.target.value)} placeholder="Generated if blank" /></label>
        <label className="loan-form-grid-full">Reason / source of historical information<textarea required maxLength={1000} value={form.reason} onChange={e => change("reason", e.target.value)} placeholder="For example, reconciled from the paper trip sheet" /></label>
      </div>
      <small className="admin-hint">Operational date is derived using the 04:00 Asia/Kolkata boundary: {form.startedAt ? operationalDateFor(form.startedAt) : "—"}</small>
      <div className="loan-form-actions"><button className="admin-primary" disabled={busy}>{busy ? "Saving…" : "Save historical trip"}</button><button className="admin-secondary" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button></div>
    </form>}
    {records.length > 0 && <div className="admin-record-list">{records.map(record => <article className="admin-capability-record" key={record.id}>
      <div><strong>{displayTime(record.data.startedAt)} · {rupees(record.data.farePaise)}</strong>
        <small>Driver {record.data.driverId} · Vehicle {record.data.vehicleId} · Operational date {record.data.operationalDate}</small>
        {(record.data.tollPaise !== undefined || record.data.parkingPaise !== undefined) && <small>Toll {record.data.tollPaise === undefined ? "—" : rupees(record.data.tollPaise) + " · " + record.data.tollPayer} · Parking {record.data.parkingPaise === undefined ? "—" : rupees(record.data.parkingPaise) + " · " + record.data.parkingPayer}</small>}
        <small>Admin-declared by {record.data.actor.actorId} · entered {displayTime(record.data.recordedAt)}</small>
        <small>{record.data.reason}</small></div>
    </article>)}</div>}
    {message && <p className="admin-message" role="status">{message}</p>}
  </section>;
}
