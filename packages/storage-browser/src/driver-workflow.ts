import type { Table } from "dexie";
import type { DriverStateProjection } from "../../core/src/commands";
import type { GpsFix } from "../../core/src/types";
import type { DriverEvent,DriverIntent } from "../../domain/src/driver-workflow";
import { EMPTY_DRIVER_STATE,assertDriverEventContract,assertDriverIntentContract,assertDriverOutboxContract,assertDriverStateContract,validateDriverCompletion } from "../../domain/src/driver-workflow";
import type { DriverWorkflowRepository } from "../../application/src/driver-workflow-service";
import { browserDatabase } from "./database";
import { operationalDateAt, resolveWorkDriverContext } from "../../domain/src/work-driver-context";
import { resolveDriverContextV1 } from "../../domain/src/driver-workflow";
type SnapshotRow={id:"driver-state";value:DriverStateProjection};
type OutboxRow={id:string;eventId:string;revision:number;integrationId:string;contractVersion:number;eventName:string;payloadVersion:number;delivered:boolean;createdAt:string};
const states=()=>browserDatabase.table("driverState") as Table<SnapshotRow,string>;
const intents=()=>browserDatabase.table("driverIntents") as Table<DriverIntent,string>;
const events=()=>browserDatabase.table("driverEvents") as Table<DriverEvent,string>;
const outbox=()=>browserDatabase.table("driverOutbox") as Table<OutboxRow,string>;
const sameCommand=(left:DriverIntent["command"],right:DriverIntent["command"])=>JSON.stringify(left)===JSON.stringify(right);
export class DexieDriverWorkflowRepository implements DriverWorkflowRepository{
 private listeners=new Set<(s:DriverStateProjection)=>void>();
 async getSnapshot(){const value=(await states().get("driver-state"))?.value??EMPTY_DRIVER_STATE;assertDriverStateContract(value);return value}
 async queueIntent(intent:DriverIntent){assertDriverIntentContract(intent);if(intent.status!=="pending_location")throw new Error("invalid_driver_intent");return browserDatabase.transaction("rw",browserDatabase.records,states(),intents(),async()=>{const old=await intents().get(intent.command.eventId);if(old){assertDriverIntentContract(old);if(!sameCommand(old.command,intent.command))throw new Error("duplicate_command_id_conflict");return old}const existing=await intents().toArray();existing.forEach(assertDriverIntentContract);if(existing.some(i=>i.command.eventId!==intent.command.eventId&&(i.command.commandId===intent.command.commandId||i.command.idempotencyKey===intent.command.idempotencyKey)))throw new Error("duplicate_command_identity_conflict");const s=await this.getSnapshot();
 if(intent.command.workflowVersion===2&&intent.command.eventType==="shift_start"&&intent.command.odometer){
  const previous=s.lastConfirmedOdometerKm,odometer=intent.command.odometer;
  if(previous!==undefined&&(odometer.readingKm<previous||odometer.previousConfirmedKm!==previous||odometer.personalKm!==odometer.readingKm-previous))throw new Error("shift_start_odometer_invalid");
  if(previous===undefined&&(odometer.previousConfirmedKm!==undefined||odometer.personalKm!==undefined))throw new Error("shift_start_odometer_invalid");
 }
 if(intent.command.workflowVersion===2&&(intent.command.eventType==="shift_end"||intent.command.eventType==="shift_rotate")&&intent.command.odometer){
  const start=s.shiftStartOdometerKm,odometer=intent.command.odometer;
  if(start===undefined||odometer.readingKm<start||odometer.businessKm!==odometer.readingKm-start)throw new Error("shift_end_odometer_invalid");
 }
 if(intent.command.eventType==="shift_end"||intent.command.eventType==="shift_rotate"){
  const outstanding=(await browserDatabase.records.toArray()).some(record=>
   record.id.startsWith("work:trip-financial-obligation:")&&
   (record.data as {kind?:string;status?:string}).kind==="cancellation_fee"&&
   (record.data as {kind?:string;status?:string}).status==="pending");
  if(outstanding)throw new Error("trip_cancellation_fee_required");
 }
 if(intent.command.expectedRevision!==s.revision||intent.command.expectedPriorState!==s.state)throw new Error("stale_revision");const active=existing.find(i=>(i.status==="pending_location"||(i.status==="needs_attention"&&i.reason!=="gps_recovery_window_expired"))&&i.command.expectedRevision===s.revision);if(active)throw new Error("competing_transition_pending");await intents().add(intent);return intent})}
 async getIntent(id:string){const intent=await intents().get(id);if(intent)assertDriverIntentContract(intent);return intent}
 async reactivateIntent(id:string){return browserDatabase.transaction("rw",states(),intents(),async()=>{const i=await intents().get(id);if(!i)throw new Error("intent_missing");assertDriverIntentContract(i);if(i.status!=="needs_attention"&&i.status!=="pending_location")throw new Error("intent_not_recoverable");const s=await this.getSnapshot();if(i.command.expectedRevision!==s.revision||i.command.expectedPriorState!==s.state)throw new Error("stale_revision");const next={...i,status:"pending_location" as const,updatedAt:new Date().toISOString(),reason:undefined};assertDriverIntentContract(next);await intents().put(next);return next})}
 async listPending(){const pending=await intents().where("status").anyOf("pending_location","needs_attention").toArray();pending.forEach(assertDriverIntentContract);return pending}
 async completeIntent(id:string,gps:GpsFix,now=new Date().toISOString()){
  const snapshot=await browserDatabase.transaction("rw",browserDatabase.records,states(),intents(),events(),outbox(),async()=>{const intent=await intents().get(id);if(!intent)throw new Error("intent_missing");assertDriverIntentContract(intent);if(intent.status==="recorded"){const recorded=await events().get(id);if(!recorded)throw new Error("recorded_event_missing");assertDriverEventContract(recorded);if(!sameCommand(recorded.command,intent.command))throw new Error("recorded_event_identity_conflict");const durableOutbox=await outbox().get("driver-state:"+recorded.revision);if(!durableOutbox)throw new Error("recorded_outbox_missing");assertDriverOutboxContract(durableOutbox);if(durableOutbox.eventId!==id)throw new Error("recorded_outbox_identity_conflict");return this.getSnapshot()}if(intent.status!=="pending_location")throw new Error("intent_not_pending");const current=await this.getSnapshot();
   if(intent.command.eventType==="shift_end"||intent.command.eventType==="shift_rotate"){
    const outstanding=(await browserDatabase.records.toArray()).some(record=>
     record.id.startsWith("work:trip-financial-obligation:")&&
     (record.data as {kind?:string;status?:string}).kind==="cancellation_fee"&&
     (record.data as {kind?:string;status?:string}).status==="pending");
    if(outstanding)throw new Error("trip_cancellation_fee_required");
   }
   const plan=validateDriverCompletion(current,intent,gps,Date.parse(now));if(!plan.ok)throw new Error(plan.error);const next=plan.value;assertDriverStateContract(next);let command=intent.command;
   if(command.workflowVersion===2&&command.eventType==="shift_start")command={...command,driverContext:resolveWorkDriverContext(await browserDatabase.records.toArray(),command.transitionAt)};
   else if(command.workflowVersion===2&&command.eventType==="trip_create"){
    if(!current.shiftId||!current.shiftContext)throw new Error("work_shift_context_missing");
    command={...command,tripContext:{schemaVersion:1,shiftId:current.shiftId,driverId:current.shiftContext.driverId,assignmentId:current.shiftContext.assignmentId,vehicleId:current.shiftContext.vehicleId,operationalDate:operationalDateAt(command.transitionAt)}};
   } else if(command.eventType==="trip_start")command={...command,driverContext:resolveDriverContextV1(await browserDatabase.records.toArray())};
   if(command.eventType==="cancel_ride"){
    const tripId=current.activeTripId;
    if(!tripId)throw new Error("cancelled_trip_identity_missing");
    const obligationId="work:trip-financial-obligation:"+tripId;
    const existingObligation=await browserDatabase.records.get(obligationId);
    if(existingObligation)throw new Error("trip_financial_obligation_already_exists");
    await browserDatabase.records.put({
     id:obligationId,schemaVersion:1,createdAt:now,updatedAt:now,source:"integration",revision:1,
     data:{schemaVersion:1,tripId,kind:"cancellation_fee",status:"pending",cancellationEventId:id,createdAt:now,tripContext:current.tripContext},
    });
   }
   if(command.eventType==="end_ride"){
    const tripId=current.activeTripId;
    if(!tripId)throw new Error("completed_trip_identity_missing");
    const obligationId="work:trip-financial-obligation:"+tripId;
    if(await browserDatabase.records.get(obligationId))throw new Error("trip_financial_obligation_already_exists");
    await browserDatabase.records.put({id:obligationId,schemaVersion:1,createdAt:now,updatedAt:now,source:"integration",revision:1,
     data:{schemaVersion:1,tripId,kind:"completed_ride_financials",status:"pending",endRideEventId:id,createdAt:now,tripContext:current.tripContext}});
   }
   if(command.workflowVersion===2&&(command.eventType==="shift_end"||command.eventType==="shift_rotate")){
    if(!current.shiftId||!current.shiftContext||!current.shiftStartedAt||current.shiftStartOdometerKm===undefined||!command.odometer)throw new Error("shift_odometer_snapshot_missing");
    const vehicleId=current.shiftContext.vehicleId;
    const operationalDate=operationalDateAt(current.shiftStartedAt);
    const id="work:daily-business-km:"+encodeURIComponent(vehicleId)+":"+operationalDate;
    const existing=await browserDatabase.records.get(id);
    const previousData=existing?.data as {schemaVersion?:number;kind?:string;vehicleId?:string;operationalDate?:string;entries?:Array<Record<string,unknown>>;totalBusinessKm?:number;unallocatedBusinessKm?:number}|undefined;
    if(existing&&(!previousData||previousData.schemaVersion!==1||previousData.kind!=="daily_business_kilometres"||previousData.vehicleId!==vehicleId||previousData.operationalDate!==operationalDate||!Array.isArray(previousData.entries)))throw new Error("daily_business_km_record_invalid");
    const entries=[...(previousData?.entries??[])];
    if(entries.some(entry=>entry.shiftId===current.shiftId))throw new Error("daily_business_km_duplicate_shift");
    const allocationStatus=command.eventType==="shift_rotate"||operationalDateAt(command.transitionAt)===operationalDate?"allocated":"awaiting_operational_boundary";
    const shiftEndedAt=command.eventType==="shift_rotate"?command.rotation!.boundaryAt:command.transitionAt;
    entries.push({shiftId:current.shiftId,shiftStartEventId:current.shiftId,shiftEndEventId:command.eventId,shiftStartedAt:current.shiftStartedAt,shiftEndedAt,
      startOdometerKm:current.shiftStartOdometerKm,endOdometerKm:command.odometer.readingKm,businessKm:command.odometer.businessKm,personalKm:current.shiftStartPersonalKm??0,allocationStatus});
    const totalBusinessKm=entries.reduce((sum,entry)=>sum+(entry.allocationStatus==="allocated"?Number(entry.businessKm):0),0);
    const unallocatedBusinessKm=entries.reduce((sum,entry)=>sum+(entry.allocationStatus==="awaiting_operational_boundary"?Number(entry.businessKm):0),0);
    if(!Number.isSafeInteger(totalBusinessKm)||!Number.isSafeInteger(unallocatedBusinessKm))throw new Error("daily_business_km_total_out_of_range");
    await browserDatabase.records.put({id,schemaVersion:1,createdAt:existing?.createdAt??now,updatedAt:now,source:"integration",revision:(existing?.revision??0)+1,
      data:{schemaVersion:1,kind:"daily_business_kilometres",vehicleId,operationalDate,entries,totalBusinessKm,unallocatedBusinessKm}});
   }
   if(command.workflowVersion===2){
    if(command.eventType==="shift_start"){
     const selected=await browserDatabase.records.get("work:selected-driver");
     if(!selected)throw new Error("work_driver_not_selected");
     const data=selected.data as {schemaVersion:number;driverId:string;lockedShiftId?:string};
     if(data.lockedShiftId)throw new Error("work_driver_selection_locked_during_shift");
     await browserDatabase.records.put({...selected,revision:selected.revision+1,updatedAt:now,data:{...data,lockedShiftId:command.eventId}});
     next.shiftId=command.eventId;next.shiftContext=command.driverContext;
    } else if(command.eventType==="shift_rotate"){
     const selected=await browserDatabase.records.get("work:selected-driver");
     if(!selected||!current.shiftId||!current.shiftContext||!command.rotation||!command.odometer)throw new Error("work_shift_context_missing");
     const data=selected.data as {schemaVersion:number;driverId:string;lockedShiftId?:string};
     if(data.lockedShiftId!==current.shiftId)throw new Error("work_driver_shift_lock_mismatch");
     await browserDatabase.records.put({...selected,revision:selected.revision+1,updatedAt:now,data:{...data,lockedShiftId:command.eventId}});
     next.shiftStartedAt=command.rotation.boundaryAt;next.shiftId=command.eventId;next.shiftContext=current.shiftContext;
     next.shiftStartOdometerKm=command.odometer.readingKm;next.lastConfirmedOdometerKm=command.odometer.readingKm;
    } else if(command.eventType==="shift_end"){
     const selected=await browserDatabase.records.get("work:selected-driver");
     if(current.shiftId){
      if(!selected)throw new Error("work_driver_not_selected");
      const data=selected.data as {schemaVersion:number;driverId:string;lockedShiftId?:string};
      if(data.lockedShiftId!==current.shiftId)throw new Error("work_driver_shift_lock_mismatch");
      const unlocked={...data};delete unlocked.lockedShiftId;
      await browserDatabase.records.put({...selected,revision:selected.revision+1,updatedAt:now,data:unlocked});
     }
     next.shiftId=undefined;next.shiftContext=undefined;
    } else if(command.eventType==="trip_create"){next.activeTripId=command.eventId;next.tripContext=command.tripContext;}
    else if(command.eventType==="start_ride")next.tripStartedAt=command.transitionAt;
    else if(command.eventType==="end_ride"||command.eventType==="cancel_ride"){next.activeTripId=undefined;next.tripContext=undefined;next.tripStartedAt=undefined;}
   }
   assertDriverStateContract(next);
   intent.command=command;
   const event={eventId:id,command,gps,committedAt:now,revision:next.revision};assertDriverEventContract(event);
   await events().add(event);await states().put({id:"driver-state",value:next});
   const completedIntent={...intent,status:"recorded" as const,updatedAt:now,reason:undefined};assertDriverIntentContract(completedIntent);await intents().put(completedIntent);const outboxRecord={id:"driver-state:"+next.revision,eventId:id,revision:next.revision,integrationId:"logbook.work-driver-events.v1",contractVersion:1,eventName:"work.driver-event-committed",payloadVersion:1,delivered:false,createdAt:now};assertDriverOutboxContract(outboxRecord);await outbox().put(outboxRecord);return next});
  this.listeners.forEach(fn=>fn(snapshot));return snapshot;
 }
 async markNeedsAttention(id:string,reason:string){await browserDatabase.transaction("rw",states(),intents(),async()=>{const i=await intents().get(id);if(i){assertDriverIntentContract(i);if(i.status!=="recorded"){const next={...i,status:"needs_attention" as const,reason,updatedAt:new Date().toISOString()};assertDriverIntentContract(next);await intents().put(next)}}})}
 async listEvents(){const result=await events().orderBy("committedAt").toArray();result.forEach(assertDriverEventContract);return result}
 async listUndeliveredEvents(){
  const pending=(await outbox().toArray()).filter(row=>!row.delivered).sort((a,b)=>a.revision-b.revision);
  const result:DriverEvent[]=[];
  for(const row of pending){assertDriverOutboxContract(row);const event=await events().get(row.eventId);if(!event)throw new Error("outbox_event_missing");assertDriverEventContract(event);result.push(event)}
  return result;
 }
 async markEventDelivered(eventId:string){
  await browserDatabase.transaction("rw",outbox(),async()=>{
   const row=await outbox().where("eventId").equals(eventId).first();
   if(!row)throw new Error("outbox_event_missing");
   assertDriverOutboxContract(row);
   await outbox().put({...row,delivered:true});
  });
 }
 subscribe(fn:(s:DriverStateProjection)=>void){this.listeners.add(fn);return()=>this.listeners.delete(fn)}
}
