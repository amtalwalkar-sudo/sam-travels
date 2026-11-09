import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { BUSINESS_SETUP_FORM_V1, VEHICLE_FORM_V1, type AdminPresentationServices, type VehicleRecordV1 } from "../../../../packages/application/src";
import { useAdminServices } from "./admin-services-context";
import "./AdminWorkspace.css";

type BusinessSettings = Awaited<ReturnType<AdminPresentationServices["businessSettings"]["get"]>>;
type Vehicle = Awaited<ReturnType<AdminPresentationServices["vehicles"]["list"]>>[number];
type VehicleForm = {
  registrationNumber: string; make: string; model: string; vehicleType: string;
  fuelType: string; yearOfManufacture: string; ownership: string; lifecycleState: VehicleRecordV1["lifecycleState"];
};
const EMPTY_VEHICLE: VehicleForm = {
  registrationNumber: "", make: "", model: "", vehicleType: "Car",
  fuelType: "Diesel", yearOfManufacture: "", ownership: "Owned", lifecycleState: "active",
};

export function BusinessSetupSection() {
  const services = useAdminServices();
  const [record, setRecord] = useState<BusinessSettings | undefined>();
  const [copy, setCopy] = useState<Awaited<ReturnType<typeof services.formRuntime.open>>>();
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const current = await services.businessSettings.get();
      let workingCopy = await services.formRuntime.open(BUSINESS_SETUP_FORM_V1, "business-settings-singleton");
      if (workingCopy.values.businessStartDate === undefined && current) {
        workingCopy = await services.formRuntime.update(
          BUSINESS_SETUP_FORM_V1, workingCopy, "businessStartDate", current.data.businessStartDate,
        );
      }
      setRecord(current);
      setCopy(workingCopy);
      setDate(typeof workingCopy.values.businessStartDate === "string"
        ? workingCopy.values.businessStartDate : current?.data.businessStartDate ?? "");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load Business Setup.");
    } finally { setLoading(false); }
  }, [services]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setMessage("");
    try {
      let workingCopy = copy ?? await services.formRuntime.open(BUSINESS_SETUP_FORM_V1, "business-settings-singleton");
      if (workingCopy.values.businessStartDate !== date) {
        workingCopy = await services.formRuntime.update(
          BUSINESS_SETUP_FORM_V1, workingCopy, "businessStartDate", date,
        );
      }
      await services.formRuntime.save(BUSINESS_SETUP_FORM_V1, workingCopy);
      const saved = await services.businessSettings.get();
      setRecord(saved);
      setCopy(await services.formRuntime.open(BUSINESS_SETUP_FORM_V1, "business-settings-singleton"));
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
      {copy && <small className="admin-hint">Draft status · {copy.status.replaceAll("_", " ")}</small>}
    </form>}
    {message && <p className="admin-message" role="status">{message}</p>}
  </div>;
}

export function VehicleSection() {
  const services = useAdminServices();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [form, setForm] = useState<VehicleForm>(EMPTY_VEHICLE);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [copy, setCopy] = useState<Awaited<ReturnType<typeof services.formRuntime.open>>>();
  const copyRef = useRef<typeof copy>();
  const updateQueue = useRef<Promise<void>>(Promise.resolve());
  const instanceIdRef = useRef("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setVehicles(await services.vehicles.list());
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load vehicles.");
    } finally { setLoading(false); }
  }, [services]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function beginForm(vehicle?: Vehicle) {
    const instanceId = vehicle?.id ?? "new:" + crypto.randomUUID();
    instanceIdRef.current = instanceId;
    updateQueue.current = Promise.resolve();
    let workingCopy = await services.formRuntime.open(VEHICLE_FORM_V1, instanceId);
    const initial: Record<string, unknown> = vehicle ? {
      registrationNumber: vehicle.data.registrationNumber, make: vehicle.data.make,
      model: vehicle.data.model, vehicleType: vehicle.data.vehicleType, fuelType: vehicle.data.fuelType,
      yearOfManufacture: vehicle.data.yearOfManufacture, ownership: vehicle.data.ownership,
      lifecycleState: vehicle.data.lifecycleState, _recordRevision: vehicle.revision,
    } : {
      registrationNumber: "", make: "", model: "", vehicleType: "Car",
      fuelType: "Diesel", yearOfManufacture: undefined, ownership: "Owned", lifecycleState: "active",
    };
    for (const [field, value] of Object.entries(initial)) {
      if (workingCopy.values[field] === undefined && value !== undefined) {
        workingCopy = await services.formRuntime.update(VEHICLE_FORM_V1, workingCopy, field, value);
      }
    }
    copyRef.current = workingCopy;
    setCopy(workingCopy);
    setEditing(vehicle ?? null);
    setForm({
      registrationNumber: String(initial.registrationNumber ?? ""),
      make: String(initial.make ?? ""), model: String(initial.model ?? ""),
      vehicleType: String(initial.vehicleType ?? "Car"), fuelType: String(initial.fuelType ?? "Diesel"),
      yearOfManufacture: initial.yearOfManufacture === undefined ? "" : String(initial.yearOfManufacture),
      ownership: String(initial.ownership ?? "Owned"),
      lifecycleState: (initial.lifecycleState ?? "active") as VehicleRecordV1["lifecycleState"],
    });
    setFormOpen(true);
    setMessage("");
  }

  function updateField<K extends keyof VehicleForm>(field: K, value: VehicleForm[K]) {
    setForm(previous => ({ ...previous, [field]: value }));
    updateQueue.current = updateQueue.current.then(async () => {
      const current = copyRef.current;
      if (!current) return;
      const storedValue = field === "yearOfManufacture" ? (value === "" ? undefined : Number(value)) : value;
      const next = await services.formRuntime.update(VEHICLE_FORM_V1, current, field, storedValue);
      copyRef.current = next;
      setCopy(next);
    }).catch(error => {
      setMessage(error instanceof Error ? error.message : "Vehicle draft could not be saved.");
    });
  }

  function closeForm() {
    setEditing(null); setForm(EMPTY_VEHICLE); setFormOpen(false);
    setCopy(undefined); copyRef.current = undefined; instanceIdRef.current = "";
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setMessage("");
    try {
      await updateQueue.current;
      const current = copyRef.current;
      if (!current) throw new Error("vehicle_form_not_ready");
      await services.formRuntime.save(VEHICLE_FORM_V1, current);
      closeForm();
      setMessage(editing ? "Vehicle details updated." : "Vehicle record created.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Vehicle could not be saved.");
    } finally { setSaving(false); }
  }

  return <div className="admin-capability-panel">
    <p className="admin-hint">Vehicle owns canonical registration identity and lifecycle. Registration number cannot be changed after creation.</p>
    {!formOpen && <button className="admin-primary" type="button" onClick={() => { void beginForm(); }}>Add vehicle</button>}
    {formOpen && <form className="admin-capability-form" onSubmit={save}>
      <div className="loan-form-grid">
        <label>Registration number<input required disabled={!!editing} value={form.registrationNumber} onChange={event => updateField("registrationNumber", event.target.value)} /></label>
        <label>Make<input required value={form.make} onChange={event => updateField("make", event.target.value)} /></label>
        <label>Model<input required value={form.model} onChange={event => updateField("model", event.target.value)} /></label>
        <label>Vehicle type<input required value={form.vehicleType} onChange={event => updateField("vehicleType", event.target.value)} /></label>
        <label>Fuel type<select value={form.fuelType} onChange={event => updateField("fuelType", event.target.value)}><option>Diesel</option><option>Petrol</option><option>CNG</option><option>Electric</option><option>Hybrid</option><option>Other</option></select></label>
        <label>Year of manufacture<input required type="number" min="1" step="1" value={form.yearOfManufacture} onChange={event => updateField("yearOfManufacture", event.target.value)} /></label>
        <label>Ownership<select value={form.ownership} onChange={event => updateField("ownership", event.target.value)}><option>Owned</option><option>Financed</option><option>Leased</option><option>Attached</option><option>Other</option></select></label>
        <label>Lifecycle status<select value={form.lifecycleState} onChange={event => updateField("lifecycleState", event.target.value as VehicleRecordV1["lifecycleState"])}><option value="active">Active</option><option value="inactive">Inactive</option><option value="sold">Sold</option></select></label>
      </div>
      <div className="loan-form-actions"><button className="admin-primary" type="submit" disabled={saving || !copy}>{saving ? "Saving…" : editing ? "Save vehicle" : "Create vehicle"}</button><button className="admin-secondary" type="button" disabled={saving} onClick={closeForm}>Cancel</button></div>
      {copy && <small className="admin-hint">Draft status · {copy.status.replaceAll("_", " ")} · revision {copy.revision}</small>}
    </form>}
    {loading ? <p className="admin-hint">Loading vehicles…</p> : vehicles.length === 0
      ? <p className="admin-hint">No vehicle records yet.</p>
      : <div className="admin-capability-records">{vehicles.map(vehicle => <article className="admin-capability-record" key={vehicle.id}>
        <div><strong>{vehicle.data.registrationNumber}</strong><small>{vehicle.data.make} {vehicle.data.model} · {vehicle.data.yearOfManufacture}</small><small>{vehicle.data.vehicleType} · {vehicle.data.fuelType} · {vehicle.data.ownership}</small></div>
        <div className="admin-capability-record-actions"><span>{vehicle.data.lifecycleState}</span><button className="admin-secondary" type="button" onClick={() => { void beginForm(vehicle); }}>Edit</button></div>
      </article>)}</div>}
    {message && <p className="admin-message" role="status">{message}</p>}
  </div>;
}
