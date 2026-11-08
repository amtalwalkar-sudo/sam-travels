import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  getApplicationDriverRecordsService, getApplicationDriverAssignmentService,
  getApplicationVehicleService, getApplicationRecordSource,
  getApplicationComplianceService,
  type DriverRecordV1, type ComplianceRecordV1,
} from "../../../../packages/application/src";
import type { RecordEnvelope } from "../../../../packages/core/src/types";
import "./AdminWorkspace.css";
export { MaintenanceSection } from "./AdminMaintenance";

type Driver = Awaited<ReturnType<ReturnType<typeof getApplicationDriverRecordsService>["list"]>>[number];
type Vehicle = Awaited<ReturnType<ReturnType<typeof getApplicationVehicleService>["list"]>>[number];
type Compliance = RecordEnvelope<ComplianceRecordV1>;
const today = () => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100);
const optional = (value: string) => value.trim() || undefined;

export function DriverSection() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [histories, setHistories] = useState<Record<string, Awaited<ReturnType<ReturnType<typeof getApplicationDriverAssignmentService>["getHistory"]>>>>({});
  const [editing, setEditing] = useState<Driver | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [licence, setLicence] = useState("");
  const [expiry, setExpiry] = useState("");
  const [mobile, setMobile] = useState("");
  const [status, setStatus] = useState<DriverRecordV1["lifecycleState"]>("active");
  const [assignVehicle, setAssignVehicle] = useState<Record<string,string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    try {
      const [d,v] = await Promise.all([getApplicationDriverRecordsService().list(), getApplicationVehicleService().list()]);
      const hs = await Promise.all(d.map(async x => [x.data.driverId, await getApplicationDriverAssignmentService().getHistory(x.data.driverId)] as const));
      setDrivers(d); setVehicles(v); setHistories(Object.fromEntries(hs));
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not load drivers."); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  function startEdit(driver?: Driver) {
    setEditing(driver ?? null); setName(driver?.data.name ?? ""); setLicence(driver?.data.licenceNumber ?? "");
    setExpiry(driver?.data.licenceExpiryDate ?? ""); setMobile(driver?.data.mobileNumber ?? "");
    setStatus(driver?.data.lifecycleState ?? "active"); setFormOpen(true); setMessage("");
  }
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMessage("");
    try {
      const driverId = editing?.data.driverId ?? crypto.randomUUID();
      const data: DriverRecordV1 = { schemaVersion:1, driverId, name:name.trim(), lifecycleState:status,
        ...(optional(licence) ? {licenceNumber:optional(licence)} : {}),
        ...(optional(expiry) ? {licenceExpiryDate:expiry} : {}),
        ...(optional(mobile) ? {mobileNumber:optional(mobile)} : {}),
        selectedForWork: status === "active" ? (editing?.data.selectedForWork ?? false) : false };
      if (editing) {
        if (status === "inactive") {
          const history = await getApplicationDriverAssignmentService().getHistory(driverId);
          if (history?.data.assignments.some(item => !item.unassignedAt)) {
            await getApplicationDriverAssignmentService().unassign({ driverId, expectedRevision: history.revision, unassignedAt: new Date().toISOString() });
          }
        }
        await getApplicationDriverRecordsService().update({driverId, expectedRevision:editing.revision, data});
      }
      else await getApplicationDriverRecordsService().create(data, getApplicationRecordSource());
      setFormOpen(false); setMessage(editing ? "Driver updated." : "Driver created."); await refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Driver could not be saved."); }
    finally { setBusy(false); }
  }
  async function assign(driver: Driver) {
    const vehicleId = assignVehicle[driver.data.driverId];
    if (!vehicleId) { setMessage("Choose an active vehicle first."); return; }
    setBusy(true); setMessage("");
    try {
      await getApplicationDriverAssignmentService().assign({
        driverId:driver.data.driverId, vehicleId, assignmentId:crypto.randomUUID(),
        assignedAt:new Date().toISOString(), source:getApplicationRecordSource(),
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
      const service = getApplicationDriverRecordsService();
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
      await getApplicationDriverAssignmentService().unassign({
        driverId:driver.data.driverId, expectedRevision:history.revision, unassignedAt:new Date().toISOString(),
      });
      setMessage("Driver unassigned."); await refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Unassignment failed."); }
    finally { setBusy(false); }
  }
  return <div className="admin-capability-panel">
    <p className="admin-hint">Driver profiles are separate from trip operations. Each driver can have one active vehicle assignment; reassignment preserves the previous assignment in history.</p>
    {!formOpen && <button className="admin-primary" type="button" onClick={() => startEdit()}>Add driver</button>}
    {formOpen && <form className="admin-capability-form" onSubmit={save}>
      <div className="loan-form-grid">
        <label>Driver name<input required value={name} onChange={e=>setName(e.target.value)} /></label>
        <label>Driving licence number<input value={licence} onChange={e=>setLicence(e.target.value)} /></label>
        <label>Licence expiry date<input type="date" value={expiry} onChange={e=>setExpiry(e.target.value)} /></label>
        <label>Mobile number<input value={mobile} onChange={e=>setMobile(e.target.value)} /></label>
        <label>Status<select value={status} onChange={e=>setStatus(e.target.value as DriverRecordV1["lifecycleState"])}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      </div>
      <div className="loan-form-actions"><button className="admin-primary" disabled={busy}>{busy ? "Saving…" : "Save driver"}</button><button className="admin-secondary" type="button" onClick={()=>setFormOpen(false)}>Cancel</button></div>
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
        <button className="admin-secondary" type="button" onClick={()=>startEdit(driver)}>Edit</button>
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
      const [v,r]=await Promise.all([getApplicationVehicleService().list(),getApplicationComplianceService().list()]);
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
      await getApplicationComplianceService().create({uuid:crypto.randomUUID(),data,source:getApplicationRecordSource(),businessDate:from});
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

