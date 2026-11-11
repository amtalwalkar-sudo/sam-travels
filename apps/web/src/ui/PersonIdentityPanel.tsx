import { useEffect, useState, type FormEvent } from "react";
import type { AtomicRecordRepository } from "../../../../packages/core/src/repositories";
import { getPlatformRecordSource } from "../native-store";
import { getPersonIdentityService } from "../person-identity-runtime";
import { getDriverPersonLink, saveDriverPersonLink } from "../person-identity-adapters";
import { useAdminServices } from "./admin-services-context";
import type { BusinessPersonV1, BusinessRoleV1 } from "../../../../packages/domain/src/person-identity";
import "./AdminWorkspace.css";

export function PersonIdentityPanel({ records }: { records: AtomicRecordRepository }) {
  const services = useAdminServices();
  const identity = getPersonIdentityService();
  const [people, setPeople] = useState<BusinessPersonV1[]>([]);
  const [drivers, setDrivers] = useState<Array<{driverId:string;name:string}>>([]);
  const [links, setLinks] = useState<Record<string,string>>({});
  const [name,setName]=useState("");
  const [roles,setRoles]=useState<BusinessRoleV1[]>(["driver"]);
  const [pin,setPin]=useState("");
  const [pinConfigured,setPinConfigured]=useState(false);
  const [selectedPerson,setSelectedPerson]=useState("");
  const [selectedRole,setSelectedRole]=useState<BusinessRoleV1>("driver");
  const [active,setActive]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  async function refresh(){
    const [p,d,configured]=await Promise.all([identity.listPeople(),services.driverRecords.list(),identityPinConfigured()]);
    const pairs=await Promise.all(d.map(async row=>[row.data.driverId,(await getDriverPersonLink(records,row.data.driverId))?.personId??""] as const));
    setPeople(p);setDrivers(d.map(row=>({driverId:row.data.driverId,name:row.data.name})));
    setLinks(Object.fromEntries(pairs));setPinConfigured(configured);
  }
  async function identityPinConfigured(){ return (identity as unknown as {isAdminPinConfigured?:()=>Promise<boolean>}).isAdminPinConfigured?.() ?? false; }
  useEffect(()=>{void refresh().catch(e=>setMessage(e instanceof Error?e.message:"Identity records unavailable"));},[]);
  async function enroll(e:FormEvent){
    e.preventDefault();setBusy(true);setMessage("");
    try{
      const personId=crypto.randomUUID().replaceAll("-","");
      await identity.registerPerson({schemaVersion:1,personId,displayName:name.trim(),roles,status:"active"});
      if(roles.includes("admin")&&!pinConfigured){await identity.configureInitialAdminPin(pin);setPin("");setPinConfigured(true);}
      setName("");setRoles(["driver"]);setMessage("Person enrolled.");await refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Person enrollment failed");}finally{setBusy(false);}
  }
  async function link(driverId:string,personId:string){
    setBusy(true);setMessage("");
    try{
      const person=people.find(p=>p.personId===personId);
      if(personId&&(!person||!person.roles.includes("driver")))throw new Error("Choose an enrolled person with the Driver role.");
      if(personId)await saveDriverPersonLink(records,getPlatformRecordSource(),driverId,personId);
      setLinks(current=>({...current,[driverId]:personId}));setMessage("Driver profile link saved.");
    }catch(e){setMessage(e instanceof Error?e.message:"Driver link failed");}finally{setBusy(false);}
  }
  async function activate(e:FormEvent){
    e.preventDefault();setBusy(true);setMessage("");
    try{if(selectedRole==="driver"&&!Object.values(links).includes(selectedPerson))throw new Error("Link this person to a Driver profile before activating Driver role.");const actor=await identity.activate(selectedPerson,selectedRole,selectedRole==="admin"?pin:undefined);setActive(actor.actorId+" · "+actor.role);setPin("");setMessage("Role activated.");}
    catch(e){setActive("");setMessage(e instanceof Error?e.message:"Role activation failed");}finally{setBusy(false);}
  }
  return <section className="admin-capability-panel" aria-label="People and roles">
    <h3>People & roles</h3>
    <p className="admin-hint">One person can hold Driver and Admin roles under the same person ID.</p>
    <form className="admin-capability-form" onSubmit={enroll}>
      <label>Person name<input required maxLength={120} value={name} onChange={e=>setName(e.target.value)} /></label>
      <div className="loan-form-grid">
        <label><input type="checkbox" checked={roles.includes("driver")} onChange={e=>setRoles(v=>e.target.checked?[...v,"driver"]:v.filter(x=>x!=="driver"))}/> Driver role</label>
        <label><input type="checkbox" checked={roles.includes("admin")} onChange={e=>setRoles(v=>e.target.checked?[...v,"admin"]:v.filter(x=>x!=="admin"))}/> Admin role</label>
      </div>
      {roles.includes("admin")&&!pinConfigured&&<label>Set initial Admin PIN<input required minLength={4} maxLength={12} inputMode="numeric" type="password" value={pin} onChange={e=>setPin(e.target.value)}/></label>}
      <button className="admin-primary" disabled={busy||!name.trim()||!roles.length||(roles.includes("admin")&&!pinConfigured&&!/^\d{4,12}$/.test(pin))}>Enroll person</button>
    </form>
    {drivers.map(d=><label key={d.driverId}>Link {d.name} to person
      <select disabled={busy} value={links[d.driverId]??""} onChange={e=>void link(d.driverId,e.target.value)}>
        <option value="">Not linked</option>{people.filter(p=>p.roles.includes("driver")&&p.status==="active").map(p=><option key={p.personId} value={p.personId}>{p.displayName}</option>)}
      </select>
    </label>)}
    <form className="admin-capability-form" onSubmit={activate}>
      <label>Person<select required value={selectedPerson} onChange={e=>setSelectedPerson(e.target.value)}><option value="">Select person</option>{people.filter(p=>p.status==="active").map(p=><option key={p.personId} value={p.personId}>{p.displayName}</option>)}</select></label>
      <label>Active role<select value={selectedRole} onChange={e=>setSelectedRole(e.target.value as BusinessRoleV1)}><option value="driver">Driver</option><option value="admin">Admin</option></select></label>
      {selectedRole==="admin"&&<label>Admin PIN<input required type="password" inputMode="numeric" value={pin} onChange={e=>setPin(e.target.value)}/></label>}
      <button className="admin-primary" disabled={busy||!selectedPerson}>Activate role</button>
      <button className="admin-secondary" type="button" disabled={busy} onClick={()=>{identity.clear();setActive("");setMessage("Role deactivated.");}}>Deactivate</button>
    </form>
    {active&&<p className="admin-hint">Active: {active}</p>}
    {message&&<p role="status" className="admin-hint">{message}</p>}
  </section>;
}
