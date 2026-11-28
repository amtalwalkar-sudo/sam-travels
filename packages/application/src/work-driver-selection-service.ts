import type {AtomicRecordRepository} from "../../core/src/repositories";
import type {RecordAuthorV1,RecordEnvelope} from "../../core/src/types";
import {assertWorkSelectedDriverV1,WORK_SELECTED_DRIVER_RECORD_ID,type WorkSelectedDriverV1} from "../../domain/src/work-driver-context";
import {driverRecordId} from "../../domain/src/driver-record-identity";
import type {DriverWorkflowRepository} from "./driver-workflow-service";
/** Work owns the selected Driver reference; Admin continues to own profile and assignment records. */
export class WorkDriverSelectionService {
 constructor(private readonly records:AtomicRecordRepository,private readonly workflow?:Pick<DriverWorkflowRepository,"getSnapshot">,private readonly now:()=>string=()=>new Date().toISOString(),private readonly currentAuthor?:()=>Promise<RecordAuthorV1>){}
 async getSelectedDriver():Promise<WorkSelectedDriverV1|undefined>{
  const record=await this.records.get<WorkSelectedDriverV1>(WORK_SELECTED_DRIVER_RECORD_ID);
  if(!record||record.deletedAt)return undefined;assertWorkSelectedDriverV1(record.data);return record.data;
 }
 async selectDriver(driverId:string,source:RecordEnvelope<unknown>["source"]="web"):Promise<WorkSelectedDriverV1>{
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(driverId))throw new Error("work_selected_driver_invalid");
  if(this.workflow&&(await this.workflow.getSnapshot()).state!=="idle")throw new Error("work_driver_selection_locked_during_shift");
  const driver=await this.records.get<{schemaVersion:number;driverId:string;name:string;lifecycleState:string}>(driverRecordId(driverId));
  if(!driver||driver.deletedAt||driver.data.schemaVersion!==1||driver.data.driverId!==driverId||!driver.data.name.trim()||driver.data.lifecycleState!=="active")throw new Error("driver_not_active");
  const current=await this.records.get<WorkSelectedDriverV1>(WORK_SELECTED_DRIVER_RECORD_ID);
  if(current){
   const rawData:unknown=current.data;
   const lockedShiftId=rawData&&typeof rawData==="object"&&"lockedShiftId" in rawData
    ? (rawData as {lockedShiftId?:unknown}).lockedShiftId : undefined;
   if(lockedShiftId!==undefined&&lockedShiftId!==null)throw new Error("work_driver_selection_locked_during_shift");
   if(!current.deletedAt){
    let validCurrent=false;
    try{assertWorkSelectedDriverV1(current.data);validCurrent=true;}catch{/* Explicit Admin setup may replace an invalid, unlocked selection. */}
    if(validCurrent&&current.data.driverId===driverId)return current.data;
   }
  }
  const data:WorkSelectedDriverV1={schemaVersion:1,driverId},now=this.now();
  const author=this.currentAuthor?await this.currentAuthor():undefined;
  if(this.currentAuthor&&!author)throw new Error("business_actor_not_active");
  let next:RecordEnvelope<WorkSelectedDriverV1>;
  if(current){
   const {deletedAt:_deletedAt,...base}=current;
   next={...base,updatedAt:now,revision:current.revision+1,...(author?{updatedBy:author}:{}),data};
  }else{
   next={id:WORK_SELECTED_DRIVER_RECORD_ID,schemaVersion:1,createdAt:now,updatedAt:now,source,revision:1,
    ...(author?{createdBy:author}:{}),data};
  }
  if(current){if(!await this.records.compareAndSet(WORK_SELECTED_DRIVER_RECORD_ID,current.revision,next))throw new Error("work_selected_driver_stale_revision");}
  else if(!await this.records.compareAndSet(WORK_SELECTED_DRIVER_RECORD_ID,null,next))throw new Error("work_selected_driver_stale_revision");
  return data;
 }
}
