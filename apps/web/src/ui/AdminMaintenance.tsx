import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  getApplicationVehicleService, getApplicationRecordSource, getApplicationMaintenanceService,
  type MaintenanceExpenseItemV1,
} from "../../../../packages/application/src";
import "./AdminWorkspace.css";

type Vehicle = Awaited<ReturnType<ReturnType<typeof getApplicationVehicleService>["list"]>>[number];
type Maintenance = Awaited<ReturnType<ReturnType<typeof getApplicationMaintenanceService>["listVehicleRecords"]>>;
const today = () => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100);
const optional = (value: string) => value.trim() || undefined;

type ItemDraft={id:string;description:string;amount:string};
const newItem=():ItemDraft=>({id:crypto.randomUUID(),description:"",amount:""});
export function MaintenanceSection(){
  const [vehicles,setVehicles]=useState<Vehicle[]>([]);
  const [vehicleId,setVehicleId]=useState("");
  const [records,setRecords]=useState<Maintenance|null>(null);
  const [reminders,setReminders]=useState<Awaited<ReturnType<ReturnType<typeof getApplicationMaintenanceService>["getServiceReminderStates"]>>>([]);
  const [mode,setMode]=useState<"visit"|"expense">("visit");
  const [date,setDate]=useState(today());
  const [title,setTitle]=useState("");
  const [description,setDescription]=useState("");
  const [provider,setProvider]=useState("");
  const [odometer,setOdometer]=useState("");
  const [nextDate,setNextDate]=useState("");
  const [nextKm,setNextKm]=useState("");
  const [amount,setAmount]=useState("");
  const [items,setItems]=useState<ItemDraft[]>([newItem()]);
  const [rate,setRate]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const refresh=useCallback(async(id:string)=>{
    try{
      const v=await getApplicationVehicleService().list();setVehicles(v);
      const chosen=id||v.find(x=>x.data.lifecycleState==="active")?.id||v[0]?.id||"";
      setVehicleId(chosen);
      if(chosen){
        const service = getApplicationMaintenanceService();
        const [history, states] = await Promise.all([service.listVehicleRecords(chosen), service.getServiceReminderStates(chosen, today())]);
        setRecords(history); setReminders(states.filter(item => item.dateDue || item.kilometreStatus === "due" || item.kilometreStatus === "odometer_unavailable"));
      } else { setRecords(null); setReminders([]); }
    }catch(e){setMessage(e instanceof Error?e.message:"Could not load maintenance records.");}
  },[]);
  useEffect(()=>{void refresh("");},[refresh]);
  async function changeVehicle(id:string){
    setVehicleId(id);
    if(!id){setRecords(null);setReminders([]);return;}
    const service=getApplicationMaintenanceService();
    const [history,states]=await Promise.all([service.listVehicleRecords(id),service.getServiceReminderStates(id,today())]);
    setRecords(history);setReminders(states.filter(item=>item.dateDue||item.kilometreStatus==="due"||item.kilometreStatus==="odometer_unavailable"));
  }
  async function save(e:FormEvent){
    e.preventDefault();if(!vehicleId)return;setBusy(true);setMessage("");
    try{
      const service=getApplicationMaintenanceService();
      const km=odometer.trim()?Number(odometer):undefined;
      if(km!==undefined&&(!Number.isSafeInteger(km)||km<0))throw new Error("Enter a valid odometer reading.");
      if(mode==="visit"){
        const mapped:MaintenanceExpenseItemV1[]=items.map(x=>({id:x.id,description:x.description.trim(),amountPaise:Math.round(Number(x.amount)*100)}));
        await service.createVisit({uuid:crypto.randomUUID(),source:getApplicationRecordSource(),data:{
          vehicleId,maintenanceDate:date,maintenanceType:title.trim(),description:description.trim(),items:mapped,
          ...(km!==undefined?{odometerKm:km}:{}),...(optional(provider)?{provider:optional(provider)}:{}),
          ...(nextDate?{nextServiceDate:nextDate}:{}),...(nextKm.trim()?{nextServiceKm:Number(nextKm)}:{})
        }});
      }else{
        const paise=Math.round(Number(amount)*100);if(!Number.isSafeInteger(paise)||paise<0)throw new Error("Enter a valid expense amount.");
        await service.createExpense({uuid:crypto.randomUUID(),source:getApplicationRecordSource(),data:{
          vehicleId,expenseDate:date,expenseName:title.trim(),description:description.trim(),amountPaise:paise,
          ...(km!==undefined?{odometerKm:km}:{}),...(optional(provider)?{provider:optional(provider)}:{})
        }});
      }
      setTitle("");setDescription("");setProvider("");setOdometer("");setNextDate("");setNextKm("");setAmount("");setItems([newItem()]);
      setMessage(mode==="visit"?"Service visit saved.":"Maintenance expense saved.");
      const [history,states]=await Promise.all([service.listVehicleRecords(vehicleId),service.getServiceReminderStates(vehicleId,today())]);
      setRecords(history);setReminders(states.filter(item=>item.dateDue||item.kilometreStatus==="due"||item.kilometreStatus==="odometer_unavailable"));
    }catch(e){setMessage(e instanceof Error?e.message:"Maintenance record could not be saved.");}
    finally{setBusy(false);}
  }
  async function saveRate(e:FormEvent){
    e.preventDefault();setBusy(true);setMessage("");
    try{
      const paise=Math.round(Number(rate)*100);if(!Number.isSafeInteger(paise)||paise<0)throw new Error("Enter a valid rate.");
      await getApplicationMaintenanceService().setRate({vehicleId,ratePaisePerKm:paise,commandId:crypto.randomUUID(),source:getApplicationRecordSource()});
      setRate("");setMessage("Per-kilometre rate saved with effective-date history.");setRecords(await getApplicationMaintenanceService().listVehicleRecords(vehicleId));
    }catch(e){setMessage(e instanceof Error?e.message:"Rate could not be saved.");}
    finally{setBusy(false);}
  }
  const total=(records?.visits.reduce((s,x)=>s+x.data.totalPaise,0)??0)+(records?.expenses.reduce((s,x)=>s+x.data.amountPaise,0)??0);
  return <div className="admin-capability-panel">
    <p className="admin-hint">Record actual service visits and itemised costs, general expenses, odometer readings and next-service reminders. Historical dates are accepted by the Maintenance service.</p>
    <div className="admin-vehicle-context"><label>Vehicle</label><select value={vehicleId} onChange={e=>void changeVehicle(e.target.value)}><option value="">Select vehicle</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.data.registrationNumber}</option>)}</select></div>
    {vehicleId&&<>
      <div className="loan-metrics"><div><small>Total recorded maintenance cost</small><strong>{money(total)}</strong></div><div><small>Service visits</small><strong>{records?.visits.length??0}</strong></div><div><small>General expenses</small><strong>{records?.expenses.length??0}</strong></div><div><small>Rate history</small><strong>{records?.rateHistory.length??0} entries</strong></div></div>
      <form className="admin-capability-form" onSubmit={save}>
        <div className="admin-vehicle-context"><label>Record type</label><select value={mode} onChange={e=>setMode(e.target.value as "visit"|"expense")}><option value="visit">Service visit</option><option value="expense">General expense</option></select></div>
        <div className="loan-form-grid">
          <label>{mode==="visit"?"Maintenance type":"Expense name"}<input required value={title} onChange={e=>setTitle(e.target.value)} /></label>
          <label>Date<input required type="date" value={date} onChange={e=>setDate(e.target.value)} /></label>
          <label>Provider / garage (optional)<input value={provider} onChange={e=>setProvider(e.target.value)} /></label>
          <label>Odometer km (optional)<input type="number" min="0" step="1" value={odometer} onChange={e=>setOdometer(e.target.value)} /></label>
          {mode==="expense"&&<label>Amount (₹)<input required type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} /></label>}
          {mode==="visit"&&<>
            <label>Next service date (optional)<input type="date" min={date} value={nextDate} onChange={e=>setNextDate(e.target.value)} /></label>
            <label>Next service at km (optional)<input type="number" min="0" step="1" value={nextKm} onChange={e=>setNextKm(e.target.value)} /></label>
          </>}
          <label className="admin-wide-field">Description<input required value={description} onChange={e=>setDescription(e.target.value)} /></label>
        </div>
        {mode==="visit"&&<div className="admin-capability-form"><strong>Itemised service costs</strong>{items.map((item,i)=><div className="loan-form-grid" key={item.id}>
          <label>Item {i+1}<input required value={item.description} onChange={e=>setItems(p=>p.map(x=>x.id===item.id?{...x,description:e.target.value}:x))} /></label>
          <label>Amount (₹)<input required type="number" min="0" step="0.01" value={item.amount} onChange={e=>setItems(p=>p.map(x=>x.id===item.id?{...x,amount:e.target.value}:x))} /></label>
        </div>)}<button className="admin-secondary" type="button" onClick={()=>setItems(p=>[...p,newItem()])}>Add cost item</button></div>}
        <div className="loan-form-actions"><button className="admin-primary" disabled={busy}>{busy?"Saving…":"Save maintenance record"}</button></div>
      </form>
      <form className="admin-capability-form" onSubmit={saveRate}><strong>Per-kilometre rate</strong><p className="admin-hint">Current rate history: {records?.rateHistory.map(x=>money(x.ratePaisePerKm)+"/km from "+x.effectiveFrom).join(" · ")}</p><label>New rate (₹ per km)<input required type="number" min="0" step="0.01" value={rate} onChange={e=>setRate(e.target.value)} /></label><button className="admin-secondary" disabled={busy}>Save rate</button></form>
      {reminders.length>0&&<div className="admin-capability-form"><strong>Service reminders</strong>{reminders.map(item=><small key={item.visit.id}>{item.visit.data.maintenanceType} · {item.dateDue ? "Date due "+(item.visit.data.nextServiceDate ?? "") : ""}{item.kilometreStatus==="due" ? " · Kilometre threshold reached ("+(item.latestOdometerKm ?? "unknown")+" km)" : item.kilometreStatus==="odometer_unavailable" ? " · Odometer reading unavailable" : ""}</small>)}</div>}
      <details className="loan-schedule"><summary>Maintenance history ({(records?.visits.length??0)+(records?.expenses.length??0)} records)</summary>
        {records?.visits.map(v=><article className="admin-capability-record" key={v.id}><div><strong>{v.data.maintenanceType} · {money(v.data.totalPaise)}</strong><small>{v.data.maintenanceDate} · {v.data.provider??"No provider"} · {v.data.odometerKm??"No odometer"} km</small><small>{v.data.items.map(i=>i.description+" "+money(i.amountPaise)).join(" · ")}</small></div></article>)}
        {records?.expenses.map(v=><article className="admin-capability-record" key={v.id}><div><strong>{v.data.expenseName} · {money(v.data.amountPaise)}</strong><small>{v.data.expenseDate} · {v.data.description}</small></div></article>)}
      </details>
    </>}
    {!vehicleId&&<p className="admin-hint">Add a vehicle before recording maintenance.</p>}
    {message&&<p className="admin-message" role="status">{message}</p>}
  </div>;
}
