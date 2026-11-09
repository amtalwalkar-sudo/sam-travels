import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { AdminPresentationServices, DriverRecordV1, ComplianceRecordV1 } from "../../../../packages/application/src";
import { DRIVER_FORM_V1 } from "../../../../packages/application/src";
import { useAdminServices } from "./admin-services-context";
import type { RecordEnvelope } from "../../../../packages/core/src/types";
import "./AdminWorkspace.css";
export { MaintenanceSection } from "./AdminMaintenance";

type Driver = Awaited<ReturnType<AdminPresentationServices["driverRecords"]["list"]>>[number];
type Vehicle = Awaited<ReturnType<AdminPresentationServices["vehicles"]["list"]>>[number];
type Compliance = RecordEnvelope<ComplianceRecordV1>;
const today = () => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100);
const optional = (value: string) => value.trim() || undefined;

export function DriverSection() {
  const services = useAdminServices();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [histories, setHistories] = useState<Record<string, Awaited<ReturnType<AdminPresentationServices["driverAssignments"]["getHistory"]>>>>({});
  const [editing, setEditing] = useState<Driver | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: "", licenceNumber: "", licenceExpiryDate: "", mobileNumber: "", lifecycleState: "active" as DriverRecordV1["lifecycleState"] });
  const [copy, setCopy] = useState<Awaited<ReturnType<typeof services.formRuntime.open>>>();
  const copyRef = useRef<Awaited<ReturnType<typeof services.formRuntime.open>> | undefined>(undefined);
  const updateQueue = useRef<Promise<void>>(Promise.resolve());
  const [assignVehicle, setAssignVehicle] = useState<Record<string,string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    try {
      const [d,v] = await Promise.all([services.driverRecords.list(), services.vehicles.list()]);
      const hs = await Promise.all(d.map(async x => [x.data.driverId, await services.driverAssignments.getHistory(x.data.driverId)] as const));
      setDrivers(d); setVehicles(v); setHistories(Object.fromEntries(hs));
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

  async function assign(driver: Driver) {
    const vehicleId = assignVehicle[driver.data.driverId];
    if (!vehicleId) { setMessage("Choose an active vehicle first."); return; }
    setBusy(true); setMessage("");
    try {
      await services.driverAssignments.assign({
        driverId:driver.data.driverId, vehicleId, assignmentId:crypto.randomUUID(),
        assignedAt:new Date().toISOString(), source:services.recordSource,
      });
      setMessage("Vehicle assignment saved. Previous active assignment, if any, was closed in history.");
      await refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Assignment failed."); }
    finally { setBusy(false); }
  }
  async function selectForWork(driver: Driver) {
    if (driver.data.lifecycleState !== "active") return;
    setBusy(true); setMessage("");
    try {
      const service = services.driverRecords;
      const all = await service.list();
      for (const current of all) {
        const selectedForWork = current.data.driverId === driver.data.driverId;
        if (Boolean(current.data.selectedForWork) !== selectedForWork) {
          await service.update({ driverId: current.data.driverId, expectedRevision: current.revision, data: { ...current.data, selectedForWork } });
        }
      }
      setMessage(driver.data.selectedForWork ? "Driver selection cleared." : driver.data.name + " selected for Work.");
      await refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Work driver selection failed."); }
    finally { setBusy(false); }
  }
  async function unassign(driver: Driver) {
    const history = histories[driver.data.driverId];
    if (!history) return;
    setBusy(true); setMessage("");
    try {
      await services.driverAssignments.unassign({ driverId:driver.data.driverId, expectedRevision:history.revision, unassignedAt:new Date().toISOString() });
      setMessage("Driver unassigned."); await refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Unassignment failed."); }
    finally { setBusy(false); }
  }
  return <div className="admin-capability-panel">
    <p className="admin-hint">Driver profiles are separate from trip operations. Each driver can have one active vehicle assignment; reassignment preserves the previous assignment in history.</p>
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
          <small>{activeVehicle ? "Assigned: "+activeVehicle.data.registrationNumber : "No active vehicle assignment"} · {driver.data.lifecycleState}{driver.data.selectedForWork ? " · Selected for Work" : ""}</small>
          {driver.data.lifecycleState === "active" && <button className="admin-secondary" type="button" disabled={busy} onClick={()=>void selectForWork(driver)}>{driver.data.selectedForWork ? "Clear Work selection" : "Select for Work"}</button>}
          {driver.data.lifecycleState==="active" && <div className="loan-form-actions">
            <select aria-label={"Vehicle for "+driver.data.name} value={assignVehicle[driver.data.driverId] ?? ""} onChange={e=>setAssignVehicle(p=>({...p,[driver.data.driverId]:e.target.value}))}>
              <option value="">Select active vehicle</option>{vehicles.filter(v=>v.data.lifecycleState==="active").map(v=><option key={v.id} value={v.id}>{v.data.registrationNumber} · {v.data.make} {v.data.model}</option>)}
            </select>
            <button className="admin-secondary" type="button" disabled={busy} onClick={()=>void assign(driver)}>Assign / reassign</button>
            {active && <button className="admin-secondary" type="button" disabled={busy} onClick={()=>void unassign(driver)}>Unassign</button>}
          </div>}
          {history?.data.assignments.length ? <details className="loan-schedule"><summary>Assignment history ({history.data.assignments.length})</summary>{history.data.assignments.map(a=><small key={a.assignmentId}>{vehicles.find(v=>v.id===a.vehicleId)?.data.registrationNumber ?? a.vehicleId} · {a.assignedAt} → {a.unassignedAt ?? "Active"}</small>)}</details> : null}
        </div>
        <button className="admin-secondary" type="button" onClick={()=>{ void startEdit(driver); }}>Edit</button>
      </article>;
    })}
    {message && <p className="admin-message" role="status">{message}</p>}
  </div>;
}

function daysUntil(date: string): number {
  const [y,m,d]=date.split("-").map(Number);
  const [ty,tm,td]=today().split("-").map(Number);
  return Math.floor((Date.UTC(y,m-1,d)-Date.UTC(ty,tm-1,td))/86400000);
}
function complianceStatus(date: string): "Valid"|"Expiring soon"|"Expired" {
  const days=daysUntil(date);
  return days<0 ? "Expired" : days<=15 ? "Expiring soon" : "Valid";
}
export function ComplianceSection() {
  const services = useAdminServices();
  const [vehicles,setVehicles]=useState<Vehicle[]>([]);
  const [records,setRecords]=useState<Compliance[]>([]);
  const [vehicleId,setVehicleId]=useState("");
  const [name,setName]=useState("");
  const [from,setFrom]=useState(today());
  const [to,setTo]=useState("");
  const [cost,setCost]=useState("");
  const [documentRef,setDocumentRef]=useState("");
  const [renewFrom,setRenewFrom]=useState("");
  const [formOpen,setFormOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const refresh=useCallback(async()=>{
    try{
      const [v,r]=await Promise.all([services.vehicles.list(),services.compliance.list()]);
      setVehicles(v);setRecords(r);setVehicleId(current=>current||v.find(x=>x.data.lifecycleState==="active")?.id||v[0]?.id||"");
    }catch(e){setMessage(e instanceof Error?e.message:"Could not load compliance records.");}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  const vehicleRecords=useMemo(()=>records.filter(r=>r.data.vehicleId===vehicleId).sort((a,b)=>b.data.validTo.localeCompare(a.data.validTo)),[records,vehicleId]);
  async function save(e:FormEvent){
    e.preventDefault();setBusy(true);setMessage("");
    try{
      const paise=Math.round(Number(cost)*100);
      if(!Number.isSafeInteger(paise)||paise<0)throw new Error("Enter a valid compliance cost.");
      const data:ComplianceRecordV1={schemaVersion:1,vehicleId,complianceName:name.trim(),validFrom:from,validTo:to,totalCostPaise:paise,
        ...(optional(documentRef)?{supportingDocumentRef:optional(documentRef)}:{}),
        ...(renewFrom?{renewedFromRecordId:renewFrom}:{})};
      await services.compliance.create({uuid:crypto.randomUUID(),data,source:services.recordSource,businessDate:from});
      setFormOpen(false);setName("");setCost("");setDocumentRef("");setRenewFrom("");setMessage("Compliance record saved.");await refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Compliance record could not be saved.");}
    finally{setBusy(false);}
  }
  return <div className="admin-capability-panel">
    <p className="admin-hint">Expiry warning is 15 calendar days: Valid (&gt;15 days), Expiring soon (1–15 days), Expired (past valid-to date). This is an operational warning only, not a legal grace period.</p>
    <div className="admin-vehicle-context"><label>Vehicle</label><select value={vehicleId} onChange={e=>{setVehicleId(e.target.value);setFormOpen(false);}}><option value="">Select vehicle</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.data.registrationNumber}</option>)}</select></div>
    {vehicleId && !formOpen && <button className="admin-primary" type="button" onClick={()=>{setFrom(today());setTo("");setFormOpen(true);}}>Add compliance / renewal</button>}
    {formOpen && <form className="admin-capability-form" onSubmit={save}>
      <div className="loan-form-grid">
        <label>Compliance type / name<input required value={name} onChange={e=>setName(e.target.value)} placeholder="Insurance, permit, fitness…" /></label>
        <label>Valid from<input required type="date" value={from} onChange={e=>setFrom(e.target.value)} /></label>
        <label>Valid until<input required type="date" min={from} value={to} onChange={e=>setTo(e.target.value)} /></label>
        <label>Total cost (₹)<input required type="number" min="0" step="0.01" value={cost} onChange={e=>setCost(e.target.value)} /></label>
        <label>Document reference (optional)<input value={documentRef} onChange={e=>setDocumentRef(e.target.value)} /></label>
        <label>Renewing previous record<select value={renewFrom} onChange={e=>setRenewFrom(e.target.value)}><option value="">New record (not a renewal)</option>{vehicleRecords.filter(r=>r.data.complianceName===name.trim()).map(r=><option key={r.id} value={r.id}>{r.data.complianceName} · valid to {r.data.validTo}</option>)}</select></label>
      </div>
      <div className="loan-form-actions"><button className="admin-primary" disabled={busy}>{busy?"Saving…":"Save record"}</button><button className="admin-secondary" type="button" onClick={()=>setFormOpen(false)}>Cancel</button></div>
    </form>}
    {!vehicleId ? <p className="admin-hint">Add a vehicle before recording compliance.</p> : vehicleRecords.length===0 ? <p className="admin-hint">No compliance records for this vehicle.</p> : vehicleRecords.map(r=><article className="admin-capability-record" key={r.id}>
      <div><strong>{r.data.complianceName} · {complianceStatus(r.data.validTo)}</strong><small>{r.data.validFrom} to {r.data.validTo} · {money(r.data.totalCostPaise)}</small><small>{r.data.renewedFromRecordId?"Renewal linked to previous record":"Original record"}{r.data.supportingDocumentRef?" · "+r.data.supportingDocumentRef:""}</small></div>
    </article>)}
    {message&&<p className="admin-message" role="status">{message}</p>}
  </div>;
}

