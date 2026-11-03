import type{RecordEnvelope}from"../../core/src/types";
import type{RecordRepository}from"../../core/src/repositories";
import{validateBusinessRecord,type BusinessRecord,type BusinessModuleId}from"../../domain/src/business-modules";
const moduleFor=(record:BusinessRecord):BusinessModuleId=>record.kind==="trip"?"logbook":record.kind==="finance"?"finance":record.kind==="vehicle"?"vehicle":record.kind==="maintenance"?"maintenance":record.kind==="compliance"?"compliance":record.kind==="loan"?"loans":"admin";
const prefix=(module:BusinessModuleId)=>"business:"+module+":";
export class BusinessModuleService{
 constructor(private readonly repository:RecordRepository,private readonly source:"web"|"android"="web",private readonly makeId=()=>crypto.randomUUID()){}
 async create<T extends BusinessRecord>(record:T,now=new Date().toISOString()):Promise<RecordEnvelope<T>>{
  const issues=validateBusinessRecord(record);if(issues.length)throw new Error("validation:"+issues.map(i=>i.field+"."+i.code).join(","));
  const module=moduleFor(record),id=prefix(module)+this.makeId();const envelope:RecordEnvelope<T>={id,schemaVersion:1,createdAt:now,updatedAt:now,businessDate:"businessDate"in record?record.businessDate:"startDate"in record?record.startDate:"expiryDate"in record?record.expiryDate:now.slice(0,10),source:this.source,revision:1,data:record};
  await this.repository.put(envelope);return envelope;
 }
 async list<T extends BusinessRecord>(module:BusinessModuleId):Promise<Array<RecordEnvelope<T>>>{
  return(await this.repository.list<T>()).filter(r=>r.id.startsWith(prefix(module))&&!r.deletedAt).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 }
 async update<T extends BusinessRecord>(id:string,record:T,now=new Date().toISOString()):Promise<RecordEnvelope<T>>{
  const previous=await this.repository.get<T>(id);if(!previous||previous.deletedAt)throw new Error("record_not_found");
  if(moduleFor(record)!==id.split(":")[1])throw new Error("module_record_type_mismatch");
  const issues=validateBusinessRecord(record);if(issues.length)throw new Error("validation:"+issues.map(i=>i.field+"."+i.code).join(","));
  const businessDate="businessDate"in record?record.businessDate:"startDate"in record?record.startDate:"expiryDate"in record?record.expiryDate:previous.businessDate;const next={...previous,businessDate,updatedAt:now,revision:previous.revision+1,data:record};await this.repository.put(next);return next;
 }
 async archive(id:string,now=new Date().toISOString()){
  const previous=await this.repository.get(id);if(!previous||!id.startsWith("business:"))throw new Error("record_not_found");
  await this.repository.put({...previous,updatedAt:now,revision:previous.revision+1,deletedAt:now});
 }
}
