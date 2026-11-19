import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { VEHICLE_FORM_V1, type AdminPresentationServices, type VehicleRecordV1 } from "../../../../packages/application/src";
import { useAdminVehicleServices } from "./admin-services-context";
import { useWorkApplicationRuntime } from "./work-application-runtime-context";
import "./AdminFormControls.css";

type Vehicle = Awaited<ReturnType<AdminPresentationServices["vehicles"]["list"]>>[number];
type VehicleForm = {
  registrationNumber: string; make: string; model: string; vehicleType: string;
  fuelType: string; yearOfManufacture: string; ownership: string; lifecycleState: VehicleRecordV1["lifecycleState"];
};
const EMPTY_VEHICLE: VehicleForm = {
  registrationNumber: "", make: "", model: "", vehicleType: "Car",
  fuelType: "Diesel", yearOfManufacture: "", ownership: "Owned", lifecycleState: "active",
};

export function VehicleSection() {
  const services = useAdminVehicleServices();
  const workRuntime = useWorkApplicationRuntime();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [form, setForm] = useState<VehicleForm>(EMPTY_VEHICLE);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [copy, setCopy] = useState<Awaited<ReturnType<typeof services.formRuntime.open>>>();
  const copyRef = useRef<Awaited<ReturnType<typeof services.formRuntime.open>> | undefined>(undefined);
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
    const drafts = vehicle ? [] : await services.formRuntime.listDrafts(VEHICLE_FORM_V1);
    const resumable = [...drafts].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt) || b.revision - a.revision || b.instanceId.localeCompare(a.instanceId)
    )[0];
    const instanceId = vehicle?.id ?? resumable?.instanceId ?? "new:" + crypto.randomUUID();
    instanceIdRef.current = instanceId;
    updateQueue.current = Promise.resolve();
    let workingCopy = resumable ?? await services.formRuntime.open(VEHICLE_FORM_V1, instanceId);
    const initial: Record<string, unknown> = vehicle ? {
      registrationNumber: vehicle.data.registrationNumber, make: vehicle.data.make,
      model: vehicle.data.model, vehicleType: vehicle.data.vehicleType, fuelType: vehicle.data.fuelType,
      yearOfManufacture: vehicle.data.yearOfManufacture, ownership: vehicle.data.ownership,
      lifecycleState: vehicle.data.lifecycleState, _recordRevision: vehicle.revision,
    } : {
      registrationNumber: "", make: "", model: "", vehicleType: "Car",
      fuelType: "Diesel", yearOfManufacture: undefined, ownership: "Owned", lifecycleState: "active",
    };
    if (workingCopy.status !== "pending") {
      for (const [field, value] of Object.entries(initial)) {
        if (workingCopy.values[field] === undefined && value !== undefined) {
          workingCopy = await services.formRuntime.update(VEHICLE_FORM_V1, workingCopy, field, value);
        }
      }
    }
    const restoredValues = workingCopy.submission?.values ?? workingCopy.values;
    const display = { ...initial, ...restoredValues };
    copyRef.current = workingCopy;
    setCopy(workingCopy);
    setEditing(vehicle ?? null);
    setForm({
      registrationNumber: String(display.registrationNumber ?? ""),
      make: String(display.make ?? ""), model: String(display.model ?? ""),
      vehicleType: String(display.vehicleType ?? "Car"), fuelType: String(display.fuelType ?? "Diesel"),
      yearOfManufacture: display.yearOfManufacture === undefined ? "" : String(display.yearOfManufacture),
      ownership: String(display.ownership ?? "Owned"),
      lifecycleState: (display.lifecycleState ?? "active") as VehicleRecordV1["lifecycleState"],
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
      if ((!editing || form.lifecycleState !== editing.data.lifecycleState) && (await workRuntime.snapshot()).state !== "idle") {
        throw new Error("operating_configuration_locked_during_shift");
      }
      const current = copyRef.current;
      if (!current) throw new Error("vehicle_form_not_ready");
      if (form.lifecycleState === "active") {
        const existing = await services.vehicles.list();
        if (existing.some(row => row.data.lifecycleState === "active" && row.id !== editing?.id)) {
          throw new Error("operating_vehicle_already_configured");
        }
      }
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
        <label>Registration number<input required disabled={!!editing || copy?.status === "pending"} value={form.registrationNumber} onChange={event => updateField("registrationNumber", event.target.value)} /></label>
        <label>Make<input required disabled={copy?.status === "pending"} value={form.make} onChange={event => updateField("make", event.target.value)} /></label>
        <label>Model<input required disabled={copy?.status === "pending"} value={form.model} onChange={event => updateField("model", event.target.value)} /></label>
        <label>Vehicle type<input required disabled={copy?.status === "pending"} value={form.vehicleType} onChange={event => updateField("vehicleType", event.target.value)} /></label>
        <label>Fuel type<select disabled={copy?.status === "pending"} value={form.fuelType} onChange={event => updateField("fuelType", event.target.value)}><option>Diesel</option><option>Petrol</option><option>CNG</option><option>Electric</option><option>Hybrid</option><option>Other</option></select></label>
        <label>Year of manufacture<input required disabled={copy?.status === "pending"} type="number" min="1" step="1" value={form.yearOfManufacture} onChange={event => updateField("yearOfManufacture", event.target.value)} /></label>
        <label>Ownership<select disabled={copy?.status === "pending"} value={form.ownership} onChange={event => updateField("ownership", event.target.value)}><option>Owned</option><option>Financed</option><option>Leased</option><option>Attached</option><option>Other</option></select></label>
        <label>Lifecycle status<select disabled={copy?.status === "pending"} value={form.lifecycleState} onChange={event => updateField("lifecycleState", event.target.value as VehicleRecordV1["lifecycleState"])}><option value="active">Active</option><option value="inactive">Inactive</option><option value="sold">Sold</option></select></label>
      </div>
      <div className="loan-form-actions"><button className="admin-primary" type="submit" disabled={saving || !copy}>{saving ? "Saving…" : copy?.status === "pending" ? "Retry save" : editing ? "Save vehicle" : "Create vehicle"}</button><button className="admin-secondary" type="button" disabled={saving} onClick={closeForm}>Cancel</button></div>
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
