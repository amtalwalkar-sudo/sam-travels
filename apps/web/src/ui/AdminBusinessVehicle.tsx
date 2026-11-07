import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  getApplicationBusinessSettingsService,
  getApplicationRecordSource,
  getApplicationVehicleService,
  type BusinessSettingsRecordV1,
  type VehicleRecordV1,
} from "../../../../packages/application/src";
import "./AdminWorkspace.css";

type BusinessSettings = Awaited<ReturnType<ReturnType<typeof getApplicationBusinessSettingsService>["get"]>>;
type Vehicle = Awaited<ReturnType<ReturnType<typeof getApplicationVehicleService>["list"]>>[number];
type VehicleForm = {
  registrationNumber: string; make: string; model: string; vehicleType: string;
  fuelType: string; yearOfManufacture: string; ownership: string; lifecycleState: VehicleRecordV1["lifecycleState"];
};
const EMPTY_VEHICLE: VehicleForm = {
  registrationNumber: "", make: "", model: "", vehicleType: "Car",
  fuelType: "Diesel", yearOfManufacture: "", ownership: "Owned", lifecycleState: "active",
};

export function BusinessSetupSection() {
  const [record, setRecord] = useState<BusinessSettings | undefined>();
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const current = await getApplicationBusinessSettingsService().get();
      setRecord(current);
      setDate(current?.data.businessStartDate ?? "");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load Business Setup.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setMessage("");
    try {
      const saved = await getApplicationBusinessSettingsService().setBusinessStartDate(date, getApplicationRecordSource());
      setRecord(saved);
      setMessage("Business start date saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Business settings could not be saved.");
    } finally { setSaving(false); }
  }

  return <div className="admin-capability-panel">
    <p className="admin-hint">Business-wide settings are owned by Business Settings. Historical finance and compliance dates remain allowed regardless of this date.</p>
    {loading ? <p className="admin-hint">Loading business settings…</p> : <form className="admin-capability-form" onSubmit={save}>
      <label>Business start date<input required type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <div className="loan-form-actions"><button className="admin-primary" type="submit" disabled={saving || !date}>{saving ? "Saving…" : record ? "Save changes" : "Set business start date"}</button></div>
      {record && <small className="admin-hint">Saved record · revision {record.revision}</small>}
    </form>}
    {message && <p className="admin-message" role="status">{message}</p>}
  </div>;
}

export function VehicleSection() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [form, setForm] = useState<VehicleForm>(EMPTY_VEHICLE);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setVehicles(await getApplicationVehicleService().list());
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load vehicles.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  function edit(vehicle: Vehicle) {
    setEditing(vehicle);
    setFormOpen(true);
    setForm({
      registrationNumber: vehicle.data.registrationNumber, make: vehicle.data.make,
      model: vehicle.data.model, vehicleType: vehicle.data.vehicleType, fuelType: vehicle.data.fuelType,
      yearOfManufacture: String(vehicle.data.yearOfManufacture), ownership: vehicle.data.ownership,
      lifecycleState: vehicle.data.lifecycleState,
    });
    setMessage("");
  }
  function closeForm() { setEditing(null); setForm(EMPTY_VEHICLE); setFormOpen(false); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const year = Number(form.yearOfManufacture);
    if (!Number.isSafeInteger(year) || year < 1) { setMessage("Enter a valid year of manufacture."); return; }
    const data: VehicleRecordV1 = {
      schemaVersion: 1, registrationNumber: form.registrationNumber.trim().toUpperCase(),
      make: form.make.trim(), model: form.model.trim(), vehicleType: form.vehicleType.trim(),
      fuelType: form.fuelType.trim(), yearOfManufacture: year, ownership: form.ownership.trim(),
      lifecycleState: form.lifecycleState,
    };
    setSaving(true); setMessage("");
    try {
      const service = getApplicationVehicleService();
      if (editing) {
        await service.update({ id: editing.id, expectedRevision: editing.revision, data });
        setMessage("Vehicle details updated.");
      } else {
        await service.create(data, getApplicationRecordSource());
        setMessage("Vehicle record created.");
      }
      closeForm();
      setVehicles(await service.list());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Vehicle could not be saved.");
    } finally { setSaving(false); }
  }

  return <div className="admin-capability-panel">
    <p className="admin-hint">Vehicle owns canonical registration identity and lifecycle. Registration number cannot be changed after creation.</p>
    {!formOpen && <button className="admin-primary" type="button" onClick={() => { setEditing(null); setForm(EMPTY_VEHICLE); setFormOpen(true); }}>Add vehicle</button>}
    {formOpen && <form className="admin-capability-form" onSubmit={save}>
      <div className="loan-form-grid">
        <label>Registration number<input required disabled={!!editing} value={form.registrationNumber} onChange={event => setForm({ ...form, registrationNumber: event.target.value })} /></label>
        <label>Make<input required value={form.make} onChange={event => setForm({ ...form, make: event.target.value })} /></label>
        <label>Model<input required value={form.model} onChange={event => setForm({ ...form, model: event.target.value })} /></label>
        <label>Vehicle type<input required value={form.vehicleType} onChange={event => setForm({ ...form, vehicleType: event.target.value })} /></label>
        <label>Fuel type<select value={form.fuelType} onChange={event => setForm({ ...form, fuelType: event.target.value })}><option>Diesel</option><option>Petrol</option><option>CNG</option><option>Electric</option><option>Hybrid</option><option>Other</option></select></label>
        <label>Year of manufacture<input required type="number" min="1" step="1" value={form.yearOfManufacture} onChange={event => setForm({ ...form, yearOfManufacture: event.target.value })} /></label>
        <label>Ownership<select value={form.ownership} onChange={event => setForm({ ...form, ownership: event.target.value })}><option>Owned</option><option>Financed</option><option>Leased</option><option>Attached</option><option>Other</option></select></label>
        <label>Lifecycle status<select value={form.lifecycleState} onChange={event => setForm({ ...form, lifecycleState: event.target.value as VehicleRecordV1["lifecycleState"] })}><option value="active">Active</option><option value="inactive">Inactive</option><option value="sold">Sold</option></select></label>
      </div>
      <div className="loan-form-actions"><button className="admin-primary" type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save vehicle" : "Create vehicle"}</button><button className="admin-secondary" type="button" disabled={saving} onClick={closeForm}>Cancel</button></div>
    </form>}
    {loading ? <p className="admin-hint">Loading vehicles…</p> : vehicles.length === 0
      ? <p className="admin-hint">No vehicle records yet.</p>
      : <div className="admin-capability-records">{vehicles.map(vehicle => <article className="admin-capability-record" key={vehicle.id}>
        <div><strong>{vehicle.data.registrationNumber}</strong><small>{vehicle.data.make} {vehicle.data.model} · {vehicle.data.yearOfManufacture}</small><small>{vehicle.data.vehicleType} · {vehicle.data.fuelType} · {vehicle.data.ownership}</small></div>
        <div className="admin-capability-record-actions"><span>{vehicle.data.lifecycleState}</span><button className="admin-secondary" type="button" onClick={() => edit(vehicle)}>Edit</button></div>
      </article>)}</div>}
    {message && <p className="admin-message" role="status">{message}</p>}
  </div>;
}
