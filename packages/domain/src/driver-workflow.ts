import type { DriverStateProjection, DriverTransitionCommand, DriverEventType, DriverWorkflowState } from "../../core/src/commands";
import type { GpsFix } from "../../core/src/types";
import { validateGpsFix } from "../../core/src/gps";
export type DriverIntentStatus = "pending_location" | "needs_attention" | "recorded" | "rejected";
export type DriverIntent = { command: DriverTransitionCommand; status: DriverIntentStatus; createdAt: string; updatedAt: string; reason?: string };
export type DriverEvent = { eventId: string; command: DriverTransitionCommand; gps: GpsFix; committedAt: string; revision: number };
export type DriverTransitionError = "invalid_command" | "stale_revision" | "invalid_transition" | "duplicate_command" | "gps_required" | "gps_invalid" | "intent_missing";
export type DriverResult<T> = { ok: true; value: T } | { ok: false; error: DriverTransitionError };
export const EMPTY_DRIVER_STATE: DriverStateProjection = { schemaVersion: 1, revision: 0, state: "idle" };
export function validateDriverCommand(command: DriverTransitionCommand): DriverResult<DriverTransitionCommand> {
 if (command.schemaVersion!==1 || !command.commandId.trim() || !command.eventId.trim() || !command.idempotencyKey.trim() || !Number.isInteger(command.expectedRevision) || !Number.isFinite(Date.parse(command.transitionAt)) || !["shift_start","shift_end","trip_start","trip_end","ride_cancel"].includes(command.eventType) || !["pwa","native_overlay"].includes(command.originSurface)) return {ok:false,error:"invalid_command"};
 return {ok:true,value:command};
}
export function transitionTarget(state:DriverWorkflowState,event:DriverEventType):DriverWorkflowState|null {
 const allowed:Record<DriverWorkflowState,Partial<Record<DriverEventType,DriverWorkflowState>>>={idle:{shift_start:"shift_active"},shift_active:{shift_end:"idle",trip_start:"trip_active"},trip_active:{trip_end:"shift_active",ride_cancel:"shift_active"},approach_active:{trip_start:"trip_active",ride_cancel:"shift_active"},needs_attention:{}};
 return allowed[state][event]??null;
}
export function validateDriverCompletion(snapshot:DriverStateProjection,intent:DriverIntent,gps:GpsFix|null,nowMs=Date.now()):DriverResult<DriverStateProjection>{
 if(!gps)return{ok:false,error:"gps_required"};
 const c=intent.command;if(intent.status!=="pending_location")return{ok:false,error:"intent_missing"};
 if(c.expectedRevision!==snapshot.revision||c.expectedPriorState!==snapshot.state)return{ok:false,error:"stale_revision"};
 const target=transitionTarget(snapshot.state,c.eventType);if(!target)return{ok:false,error:"invalid_transition"};
 if(!validateGpsFix(gps,c.transitionAt,nowMs).accepted)return{ok:false,error:"gps_invalid"};
 const next:DriverStateProjection={schemaVersion:1,revision:snapshot.revision+1,state:target,lastEventId:c.eventId};
 if(c.eventType==="shift_start")next.shiftStartedAt=c.transitionAt;else if(c.eventType==="shift_end")next.shiftStartedAt=undefined;
 if(c.eventType==="trip_start")next.tripStartedAt=c.transitionAt;else if(c.eventType==="trip_end"||c.eventType==="ride_cancel")next.tripStartedAt=undefined;
 return{ok:true,value:next};
}
