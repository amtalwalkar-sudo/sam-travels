import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { AdminPresentationServices, DriverRecordV1 } from "../../../../packages/application/src";
import { DRIVER_FORM_V1 } from "../../../../packages/application/src";
import { useAdminDriverServices } from "./admin-services-context";
import "./AdminFormControls.css";

type Driver = Awaited<ReturnType<AdminPresentationServices["driverRecords"]["list"]>>[number];
type Vehicle = Awaited<ReturnType<AdminPresentationServices["vehicles"]["list"]>>[number];
export function DriverSection() {
  const services = useAdminDriverServices();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [histories, setHistories] = useState<Record<string, Awaited<ReturnType<AdminPresentationServices["driverAssignments"]["getHistory"]>>>>({});
  const [editing, setEditing] = useState<Driver | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: "", licenceNumber: "", licenceExpiryDate: "", mobileNumber: "", lifecycleState: "active" as DriverRecordV1["lifecycleState"] });
  const [copy, setCopy] = useState<Awaited<ReturnType<typeof services.formRuntime.open>>>();
  const copyRef = useRef<Awaited<ReturnType<typeof services.formRuntime.open>> | undefined>(undefined);
  const updateQueue = useRef<Promise<void>>(Promise.resolve());
  const [selectedWorkDriverId, setSelectedWorkDriverId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    try {
      const [d,v,selected] = await Promise.all([services.driverRecords.list(), services.vehicles.list(), services.workDriverSelection.getSelectedDriver()]);
      const hs = await Promise.all(d.map(async x => [x.data.driverId, await services.driverAssignments.getHistory(x.data.driverId)] as const));
      setDrivers(d); setVehicles(v); setHistories(Object.fromEntries(hs)); setSelectedWorkDriverId(selected?.driverId ?? "");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not load drivers."); }
  }, [services]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function startEdit(driver?: Driver) {
    updateQueue.current = Promise.resolve();
    const instanceId = driver?.data.driverId ?? "new:" + crypto.randomUUID();
    let workingCopy = await services.formRuntime.open(DRIVER_FORM_V1, instanceId);
    const initial: Record<string, unknown> = driver ? {
      name: driver.data.name, licenceNumber: driver.data.licenceNumber ?? "",
      licenceExpiryDate: driver.data.licenceExpiryDate ?? "", mobileNumber: driver.data.mobileNumber ?? "",
      lifecycleState: driver.data.lifecycleState, _selectedForWork: driver.data.selectedForWork ?? false,
      _recordRevision: driver.revision,
    } : { name: "", licenceNumber: "", licenceExpiryDate: "", mobileNumber: "", lifecycleState: "active", _selectedForWork: false };
    for (const [field, value] of Object.entries(initial)) {
      if (workingCopy.values[field] === undefined) workingCopy = await services.formRuntime.update(DRIVER_FORM_V1, workingCopy, field, value);
    }
    copyRef.current = workingCopy; setCopy(workingCopy); setEditing(driver ?? null);
    setForm({
      name: String(initial.name ?? ""), licenceNumber: String(initial.licenceNumber ?? ""),
      licenceExpiryDate: String(initial.licenceExpiryDate ?? ""), mobileNumber: String(initial.mobileNumber ?? ""),
      lifecycleState: initial.lifecycleState as DriverRecordV1["lifecycleState"],
    });
    setFormOpen(true); setMessage("");
  }

  function updateField(field: keyof typeof form, value: string) {
    setForm(previous => ({ ...previous, [field]: value }));
    updateQueue.current = updateQueue.current.then(async () => {
      const current = copyRef.current;
      if (!current) return;
      const next = await services.formRuntime.update(DRIVER_FORM_V1, current, field, value);
      copyRef.current = next; setCopy(next);
    }).catch(error => setMessage(error instanceof Error ? error.message : "Driver draft could not be saved."));
  }

  function closeForm() {
    setEditing(null); setForm({ name: "", licenceNumber: "", licenceExpiryDate: "", mobileNumber: "", lifecycleState: "active" });
    setFormOpen(false); setCopy(undefined); copyRef.current = undefined;
  }

  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMessage("");
    try {
      await updateQueue.current;
      const current = copyRef.current;
      if (!current) throw new Error("driver_form_not_ready");
      if (form.lifecycleState === "active") {
        const activeDrivers = await services.driverRecords.list();
        if (activeDrivers.some(row => row.data.lifecycleState === "active" && row.data.driverId !== editing?.data.driverId)) {
          throw new Error("operating_driver_already_configured");
        }
      }
      if (editing && form.lifecycleState === "inactive") {
        const history = await services.driverAssignments.getHistory(editing.data.driverId);
        if (history?.data.assignments.some(item => !item.unassignedAt)) {
          await services.driverAssignments.unassign({ driverId: editing.data.driverId, expectedRevision: history.revision, unassignedAt: new Date().toISOString() });
        }
      }
      await services.formRuntime.save(DRIVER_FORM_V1, current);
      closeForm(); setMessage(editing ? "Driver updated." : "Driver created."); await refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Driver could not be saved."); }
    finally { setBusy(false); }
  }

  async function configureOperatingPair(driver: Driver) {
    if (driver.data.lifecycleState !== "active") return;
    setBusy(true); setMessage("");
    try {
      const [allDrivers, allVehicles, selected] = await Promise.all([
        services.driverRecords.list(), services.vehicles.list(), services.workDriverSelection.getSelectedDriver(),
      ]);
      const activeDrivers = allDrivers.filter(row => row.data.lifecycleState === "active");
      const activeVehicles = allVehicles.filter(row => row.data.lifecycleState === "active");
      if (activeDrivers.length !== 1 || activeDrivers[0].data.driverId !== driver.data.driverId) {
        throw new Error("operating_driver_missing_or_ambiguous");
      }
      if (activeVehicles.length !== 1) throw new Error("operating_vehicle_missing_or_ambiguous");
      if (selected?.lockedShiftId) throw new Error("work_driver_selection_locked_during_shift");
      const vehicle = activeVehicles[0];
      const history = await services.driverAssignments.getHistory(driver.data.driverId);
      const current = history?.data.assignments.find(item => !item.unassignedAt);
      if (!current || current.vehicleId !== vehicle.id) {
        await services.driverAssignments.assign({
          driverId: driver.data.driverId, vehicleId: vehicle.id, assignmentId: crypto.randomUUID(),
          assignedAt: new Date().toISOString(), source: services.recordSource,
        });
      }
      await services.workDriverSelection.selectDriver(driver.data.driverId, services.recordSource);
      setSelectedWorkDriverId(driver.data.driverId);
      window.dispatchEvent(new Event("work-operating-configuration-updated"));
      setMessage(driver.data.name + " is configured with " + vehicle.data.registrationNumber + " for Work.");
      await refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Operating configuration could not be saved."); }
    finally { setBusy(false); }
  }
  return <div className="admin-capability-panel">
    <p className="admin-hint">Configure one active Driver with the single active Vehicle. Assignment history is retained for reference; routine driver and vehicle reassignment is not part of daily operations.</p>
    {!formOpen && <button className="admin-primary" type="button" onClick={() => { void startEdit(); }}>Add driver</button>}
    {formOpen && <form className="admin-capability-form" onSubmit={save}>
      <div className="loan-form-grid">
        <label>Driver name<input required maxLength={120} value={form.name} onChange={e=>updateField("name",e.target.value)} /></label>
        <label>Driving licence number<input maxLength={64} value={form.licenceNumber} onChange={e=>updateField("licenceNumber",e.target.value)} /></label>
        <label>Licence expiry date<input type="date" value={form.licenceExpiryDate} onChange={e=>updateField("licenceExpiryDate",e.target.value)} /></label>
        <label>Mobile number<input maxLength={32} value={form.mobileNumber} onChange={e=>updateField("mobileNumber",e.target.value)} /></label>
        <label>Status<select value={form.lifecycleState} onChange={e=>updateField("lifecycleState",e.target.value as DriverRecordV1["lifecycleState"])}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      </div>
      <div className="loan-form-actions"><button className="admin-primary" disabled={busy || !copy}>{busy ? "Saving…" : "Save driver"}</button><button className="admin-secondary" type="button" disabled={busy} onClick={closeForm}>Cancel</button></div>
      {copy && <small className="admin-hint">Draft status · {copy.status.replaceAll("_", " ")} · revision {copy.revision}</small>}
    </form>}
    {drivers.length===0 ? <p className="admin-hint">No driver records yet.</p> : drivers.map(driver=>{
      const history=histories[driver.data.driverId];
      const active=history?.data.assignments.find(x=>!x.unassignedAt);
      const activeVehicle=vehicles.find(v=>v.id===active?.vehicleId);
      return <article className="admin-capability-record" key={driver.id}>
        <div style={{flex:1}}>
          <strong>{driver.data.name}</strong>
          <small>{driver.data.mobileNumber ?? "No mobile"} · Licence {driver.data.licenceNumber ?? "not recorded"}{driver.data.licenceExpiryDate ? " · Expires "+driver.data.licenceExpiryDate : ""}</small>
          <small>{activeVehicle ? "Assigned: "+activeVehicle.data.registrationNumber : "No active vehicle assignment"} · {driver.data.lifecycleState}{selectedWorkDriverId === driver.data.driverId ? " · Configured for Work" : ""}</small>
          {driver.data.lifecycleState === "active" && <button className="admin-secondary" type="button" disabled={busy} onClick={()=>void configureOperatingPair(driver)}>{selectedWorkDriverId === driver.data.driverId ? "Verify operating configuration" : "Configure for Work"}</button>}
          {history?.data.assignments.length ? <details className="loan-schedule"><summary>Assignment history ({history.data.assignments.length})</summary>{history.data.assignments.map(a=><small key={a.assignmentId}>{vehicles.find(v=>v.id===a.vehicleId)?.data.registrationNumber ?? a.vehicleId} · {a.assignedAt} → {a.unassignedAt ?? "Active"}</small>)}</details> : null}
        </div>
        <button className="admin-secondary" type="button" onClick={()=>{ void startEdit(driver); }}>Edit</button>
      </article>;
    })}
    {message && <p className="admin-message" role="status">{message}</p>}
  </div>;
}
