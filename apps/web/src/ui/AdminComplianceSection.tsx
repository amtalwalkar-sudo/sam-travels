import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { AdminPresentationServices, ComplianceRecordV1 } from "../../../../packages/application/src";
import { COMPLIANCE_FORM_V1 } from "../../../../packages/application/src";
import type { RecordEnvelope } from "../../../../packages/core/src/types";
import { useAdminComplianceServices } from "./admin-services-context";
import { AdminComplianceOverview } from "./AdminComplianceOverview";
import "./AdminFormControls.css";
import "./AdminCompliance.css";

type Compliance = RecordEnvelope<ComplianceRecordV1>;
const today = () => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100);
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
  const services = useAdminComplianceServices();
  const [records,setRecords]=useState<Compliance[]>([]);
  const [vehicleId,setVehicleId]=useState("");
  const [formOpen,setFormOpen]=useState(false);
  const [form,setForm]=useState({complianceName:"",validFrom:today(),validTo:"",cost:"",supportingDocumentRef:"",renewedFromRecordId:""});
  const [copy,setCopy]=useState<Awaited<ReturnType<typeof services.formRuntime.open>>>();
  const copyRef=useRef<Awaited<ReturnType<typeof services.formRuntime.open>>|undefined>(undefined);
  const updateQueue=useRef<Promise<void>>(Promise.resolve());
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const refresh=useCallback(async()=>{
    try{
      const [operatingVehicleId,overview]=await Promise.all([services.compliance.getOperatingVehicleId(),services.complianceAnalysis.getOverview()]);
      setRecords([...overview.records]);setVehicleId(operatingVehicleId);
    }catch(e){setMessage(e instanceof Error?e.message:"Could not load compliance records.");}
  },[services]);
  useEffect(()=>{void refresh();},[refresh]);
  const vehicleRecords=useMemo(()=>records.filter(r=>r.data.vehicleId===vehicleId).sort((a,b)=>b.data.validTo.localeCompare(a.data.validTo)),[records,vehicleId]);

  async function beginForm(){
    updateQueue.current=Promise.resolve();
    const instanceId=crypto.randomUUID();
    let workingCopy=await services.formRuntime.open(COMPLIANCE_FORM_V1,instanceId);
    const initial:Record<string,unknown>={complianceName:"",validFrom:today(),validTo:"",totalCostPaise:undefined,supportingDocumentRef:"",renewedFromRecordId:"",vehicleId};
    for(const [field,value] of Object.entries(initial)){
      if(value!==undefined&&workingCopy.values[field]===undefined) workingCopy=await services.formRuntime.update(COMPLIANCE_FORM_V1,workingCopy,field,value);
    }
    copyRef.current=workingCopy;setCopy(workingCopy);
    setForm({complianceName:"",validFrom:String(initial.validFrom),validTo:"",cost:"",supportingDocumentRef:"",renewedFromRecordId:""});
    setFormOpen(true);setMessage("");
  }
  function updateField(field:keyof typeof form,value:string){
    setForm(previous=>({...previous,[field]:value}));
    updateQueue.current=updateQueue.current.then(async()=>{
      const current=copyRef.current;if(!current)return;
      let stored:unknown=value;
      if(field==="cost") stored=value===""?undefined:Math.round(Number(value)*100);
      const next=await services.formRuntime.update(COMPLIANCE_FORM_V1,current,field==="cost"?"totalCostPaise":field,stored);
      copyRef.current=next;setCopy(next);
    }).catch(e=>setMessage(e instanceof Error?e.message:"Compliance draft could not be saved."));
  }
  function closeForm(){
    setFormOpen(false);setCopy(undefined);copyRef.current=undefined;
    setForm({complianceName:"",validFrom:today(),validTo:"",cost:"",supportingDocumentRef:"",renewedFromRecordId:""});
  }
  async function save(e:FormEvent){
    e.preventDefault();setBusy(true);setMessage("");
    try{
      await updateQueue.current;
      const current=copyRef.current;if(!current)throw new Error("compliance_form_not_ready");
      if(!vehicleId)throw new Error("compliance_vehicle_required");
      if(form.validTo<form.validFrom)throw new Error("compliance_validity_period_invalid");
      const paise=Math.round(Number(form.cost)*100);
      if(!Number.isSafeInteger(paise)||paise<0)throw new Error("Enter a valid compliance cost.");
      await services.formRuntime.save(COMPLIANCE_FORM_V1,current);
      closeForm();setMessage("Compliance record saved.");await refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Compliance record could not be saved.");}
    finally{setBusy(false);}
  }
  return <div className="admin-capability-panel">
    <AdminComplianceOverview />
    <p className="admin-hint">Expiry warning is 15 calendar days: Valid (&gt;15 days), Expiring soon (1–15 days), Expired (past valid-to date). This is an operational warning only, not a legal grace period. Renewals create a new immutable record linked to the previous coverage.</p>
    <div className="admin-vehicle-context"><strong>Configured operating vehicle</strong><span>{vehicleId ? vehicleId.replace("feature:vehicle:", "") : "Configuration unavailable"}</span></div>
    {vehicleId&&!formOpen&&<button className="admin-primary" type="button" onClick={()=>void beginForm()}>Add compliance / renewal</button>}
    {formOpen&&<form className="admin-capability-form" onSubmit={save}>
      <div className="loan-form-grid">
        <label>Compliance type / name<input required maxLength={120} value={form.complianceName} onChange={e=>updateField("complianceName",e.target.value)} placeholder="Insurance, permit, fitness…" /></label>
        <label>Valid from<input required type="date" value={form.validFrom} onChange={e=>updateField("validFrom",e.target.value)} /></label>
        <label>Valid until<input required type="date" min={form.validFrom} value={form.validTo} onChange={e=>updateField("validTo",e.target.value)} /></label>
        <label>Total cost (₹)<input required type="number" min="0" step="0.01" value={form.cost} onChange={e=>updateField("cost",e.target.value)} /></label>
        <label>Document reference (optional)<input maxLength={240} value={form.supportingDocumentRef} onChange={e=>updateField("supportingDocumentRef",e.target.value)} /></label>
        <label>Renewing previous record<select value={form.renewedFromRecordId} onChange={e=>updateField("renewedFromRecordId",e.target.value)}><option value="">New record (not a renewal)</option>{vehicleRecords.filter(r=>r.data.complianceName===form.complianceName.trim()).map(r=><option key={r.id} value={r.id}>{r.data.complianceName} · valid to {r.data.validTo}</option>)}</select></label>
      </div>
      <div className="loan-form-actions"><button className="admin-primary" disabled={busy||!copy}>{busy?"Saving…":"Save record"}</button><button className="admin-secondary" type="button" disabled={busy} onClick={closeForm}>Cancel</button></div>
      {copy&&<small className="admin-hint">Draft status · {copy.status.replaceAll("_"," ")} · revision {copy.revision}</small>}
    </form>}
    {!vehicleId?<p className="admin-hint">Configure one active Vehicle and its Work Driver assignment before recording compliance.</p>:vehicleRecords.length===0?<p className="admin-hint">No compliance records for this vehicle.</p>:vehicleRecords.map(r=><article className="admin-capability-record" key={r.id}>
      <div><strong>{r.data.complianceName} · {complianceStatus(r.data.validTo)}</strong><small>{r.data.validFrom} to {r.data.validTo} · {money(r.data.totalCostPaise)}</small><small>{r.data.renewedFromRecordId?"Renewal linked to previous record":"Original record"}{r.data.supportingDocumentRef?" · "+r.data.supportingDocumentRef:""}</small></div>
    </article>)}
    {message&&<p className="admin-message" role="status">{message}</p>}
  </div>;
}
