import type { Table } from "dexie";
import type { DriverStateProjection } from "../../core/src/commands";
import type { GpsFix } from "../../core/src/types";
import type { DriverEvent,DriverIntent } from "../../domain/src/driver-workflow";
import { EMPTY_DRIVER_STATE,validateDriverCompletion } from "../../domain/src/driver-workflow";
import type { DriverWorkflowRepository } from "../../application/src/driver-workflow-service";
import { browserDatabase } from "./database";
type SnapshotRow={id:"driver-state";value:DriverStateProjection};
type OutboxRow={id:string;eventId:string;revision:number;delivered:boolean;createdAt:string};
const states=()=>browserDatabase.table("driverState") as Table<SnapshotRow,string>;
const intents=()=>browserDatabase.table("driverIntents") as Table<DriverIntent,string>;
const events=()=>browserDatabase.table("driverEvents") as Table<DriverEvent,string>;
const outbox=()=>browserDatabase.table("driverOutbox") as Table<OutboxRow,string>;
export class DexieDriverWorkflowRepository implements DriverWorkflowRepository{
 private listeners=new Set<(s:DriverStateProjection)=>void>();
 async getSnapshot(){return(await states().get("driver-state"))?.value??EMPTY_DRIVER_STATE}
 async queueIntent(intent:DriverIntent){return browserDatabase.transaction("rw",states(),intents(),async()=>{const old=await intents().get(intent.command.eventId);if(old){if(old.command.commandId!==intent.command.commandId)throw new Error("duplicate_command_id_conflict");return old}const s=await this.getSnapshot();if(intent.command.expectedRevision!==s.revision||intent.command.expectedPriorState!==s.state)throw new Error("stale_revision");await intents().add(intent,intent.command.eventId);return intent})}
 getIntent(id:string){return intents().get(id)}
 listPending(){return intents().where("status").anyOf("pending_location","needs_attention").toArray()}
 async completeIntent(id:string,gps:GpsFix,now=new Date().toISOString()){
  const snapshot=await browserDatabase.transaction("rw",states(),intents(),events(),outbox(),async()=>{const intent=await intents().get(id);if(!intent)throw new Error("intent_missing");const current=await this.getSnapshot(),plan=validateDriverCompletion(current,intent,gps);if(!plan.ok)throw new Error(plan.error);const next=plan.value;
   await events().add({eventId:id,command:intent.command,gps,committedAt:now,revision:next.revision},id);await states().put({id:"driver-state",value:next});
   await intents().put({...intent,status:"recorded",updatedAt:now,reason:undefined});await outbox().put({id:"driver-state:"+next.revision,eventId:id,revision:next.revision,delivered:false,createdAt:now});return next});
  this.listeners.forEach(fn=>fn(snapshot));return snapshot;
 }
 async markNeedsAttention(id:string,reason:string){const i=await intents().get(id);if(i)await intents().put({...i,status:"needs_attention",reason,updatedAt:new Date().toISOString()})}
 listEvents(){return events().orderBy("committedAt").toArray()}
 subscribe(fn:(s:DriverStateProjection)=>void){this.listeners.add(fn);return()=>this.listeners.delete(fn)}
}
