import type { DriverStateProjection, DriverTransitionCommand } from "../../core/src/commands";
import type { GpsFix } from "../../core/src/types";
import { validateDriverCommand, validateDriverCompletion, type DriverEvent, type DriverIntent } from "../../domain/src/driver-workflow";
export interface DriverWorkflowRepository {
 getSnapshot():Promise<DriverStateProjection>; queueIntent(intent:DriverIntent):Promise<DriverIntent>; getIntent(eventId:string):Promise<DriverIntent|undefined>;
 listPending():Promise<DriverIntent[]>; completeIntent(eventId:string,gps:GpsFix,now?:string):Promise<DriverStateProjection>;
 markNeedsAttention(eventId:string,reason:string):Promise<void>; listEvents():Promise<DriverEvent[]>;
 subscribe(listener:(snapshot:DriverStateProjection)=>void):()=>void;
}
export interface EventLocationProvider{capture():Promise<GpsFix>}
export class DriverWorkflowService{
 constructor(private readonly repository:DriverWorkflowRepository,private readonly location:EventLocationProvider){}
 snapshot(){return this.repository.getSnapshot()} pending(){return this.repository.listPending()} events(){return this.repository.listEvents()}
 subscribe(listener:(snapshot:DriverStateProjection)=>void){return this.repository.subscribe(listener)}
 async dispatch(command:DriverTransitionCommand):Promise<{status:"pending_location"|"recorded"|"needs_attention";snapshot:DriverStateProjection;reason?:string}>{
  const checked=validateDriverCommand(command);if(!checked.ok)throw new Error(checked.error);
  const before=await this.repository.getSnapshot();if(command.expectedRevision!==before.revision||command.expectedPriorState!==before.state)throw new Error("stale_revision");
  const now=new Date().toISOString(),intent:DriverIntent={command,status:"pending_location",createdAt:now,updatedAt:now};
  const queued=await this.repository.queueIntent(intent);if(queued.status==="recorded")return{status:"recorded",snapshot:await this.snapshot()};
  try{const gps=await this.location.capture(),latest=await this.snapshot(),plan=validateDriverCompletion(latest,queued,gps);if(!plan.ok)throw new Error(plan.error);const snapshot=await this.repository.completeIntent(command.eventId,gps);return{status:"recorded",snapshot}}
  catch(error){const reason=error instanceof Error?error.message:"location_unavailable";await this.repository.markNeedsAttention(command.eventId,reason);return{status:"needs_attention",snapshot:await this.snapshot(),reason}}
 }
}
export function createDriverCommand(snapshot:DriverStateProjection,eventType:DriverTransitionCommand["eventType"],originSurface:DriverTransitionCommand["originSurface"],id:string,now=new Date().toISOString()):DriverTransitionCommand{
 return{schemaVersion:1,commandId:id,eventId:id,eventType,originSurface,transitionAt:now,expectedPriorState:snapshot.state,expectedRevision:snapshot.revision,idempotencyKey:id};
}
