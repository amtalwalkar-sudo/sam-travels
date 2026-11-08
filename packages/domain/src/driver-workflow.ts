import { DRIVER_EVENT_TYPES, type DriverStateProjection, type DriverTransitionCommand, type DriverEventType, type DriverWorkflowState } from "../../core/src/commands";
import type { GpsFix } from "../../core/src/types";
import { validateGpsFix } from "../../core/src/gps";
import { assertDriverRecordV1, assertDriverAssignmentHistoryV1 } from "../../features/driver-records";
import { assertVehicleRecordV1 } from "../../features/vehicle";
import type { RecordEnvelope } from "../../core/src/types";
export type DriverIntentStatus = "pending_location" | "needs_attention" | "recorded" | "rejected";
export type DriverIntent = { command: DriverTransitionCommand; status: DriverIntentStatus; createdAt: string; updatedAt: string; reason?: string };
export type DriverEvent = { eventId: string; command: DriverTransitionCommand; gps: GpsFix; committedAt: string; revision: number };
export type DriverTransitionError = "invalid_command" | "stale_revision" | "invalid_transition" | "duplicate_command" | "gps_required" | "gps_invalid" | "intent_missing";
export type DriverResult<T> = { ok: true; value: T } | { ok: false; error: DriverTransitionError };
export const GPS_RECOVERY_WINDOW_MS = 30_000;
export function isWithinGpsRecoveryWindow(transitionAt: string, nowMs = Date.now()): boolean {
 const transitionMs = Date.parse(transitionAt);
 return Number.isFinite(transitionMs) && Math.abs(nowMs - transitionMs) <= GPS_RECOVERY_WINDOW_MS;
}
export const EMPTY_DRIVER_STATE: DriverStateProjection = { schemaVersion: 1, revision: 0, state: "idle" };
const DRIVER_STATES = ["idle", "shift_active", "trip_active", "approach_active", "needs_attention"] as const;
const DRIVER_INTENT_STATUSES = ["pending_location", "needs_attention", "recorded", "rejected"] as const;
function validInstant(value: unknown): value is string {
 if (typeof value !== "string") return false;
 const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
 if (!match || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) return false;
 const date = new Date(match[1] + "T00:00:00.000Z");
 return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === match[1] && Number.isFinite(Date.parse(value));
}
export type DriverContextV1 = Readonly<{schemaVersion:1;driverId:string;assignmentId:string;vehicleId:string}>;

/** Resolve selected Driver, active assignment and active Vehicle from the authoritative records at commit time. */
export function resolveDriverContextV1(records: readonly RecordEnvelope<unknown>[]): DriverContextV1 {
 const drivers=records.filter(record=>record.id.startsWith("feature:driver-records:driver:"));
 const selected=drivers.filter(record=>{assertDriverRecordV1(record.data);return record.data.selectedForWork===true&&record.data.lifecycleState==="active";});
 if(selected.length!==1)throw new Error(selected.length===0?"work_driver_selection_missing":"work_driver_selection_ambiguous");
 const driver=selected[0].data;
 if(selected[0].id!=="feature:driver-records:driver:"+driver.driverId)throw new Error("driver_record_identity_mismatch");
 const historyId="feature:driver-records:assignment:"+driver.driverId;
 const histories=records.filter(record=>record.id===historyId);
 if(histories.length!==1)throw new Error("work_driver_assignment_history_missing");
 assertDriverAssignmentHistoryV1(histories[0].data);
 const history=histories[0].data;
 if(history.driverId!==driver.driverId)throw new Error("driver_assignment_identity_mismatch");
 const active=history.assignments.filter(item=>item.unassignedAt===undefined);
 if(active.length!==1)throw new Error(active.length===0?"work_driver_assignment_missing":"work_driver_assignment_ambiguous");
 const assignment=active[0];
 const vehicles=records.filter(record=>record.id===assignment.vehicleId);
 if(vehicles.length!==1)throw new Error("work_driver_vehicle_missing");
 assertVehicleRecordV1(vehicles[0].data);
 if(vehicles[0].id!==assignment.vehicleId||vehicles[0].data.lifecycleState!=="active")throw new Error("work_driver_vehicle_inactive");
 return Object.freeze({schemaVersion:1,driverId:driver.driverId,assignmentId:assignment.assignmentId,vehicleId:assignment.vehicleId});
}

export function assertDriverCommandContract(value: unknown): asserts value is DriverTransitionCommand {
 if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_command");
 const command = value as Record<string, unknown>;
 if (command.schemaVersion !== 1 || typeof command.commandId !== "string" || !command.commandId.trim() || command.commandId !== command.commandId.trim() ||
     typeof command.eventId !== "string" || !command.eventId.trim() || command.eventId !== command.eventId.trim() ||
     typeof command.idempotencyKey !== "string" || !command.idempotencyKey.trim() || command.idempotencyKey !== command.idempotencyKey.trim() ||
     typeof command.eventType !== "string" || !DRIVER_EVENT_TYPES.includes(command.eventType as DriverEventType) ||
     typeof command.originSurface !== "string" || !["pwa", "native_overlay"].includes(command.originSurface) ||
     typeof command.expectedPriorState !== "string" || !DRIVER_STATES.includes(command.expectedPriorState as DriverWorkflowState) ||
     !Number.isSafeInteger(command.expectedRevision) || (command.expectedRevision as number) < 0 ||
     !validInstant(command.transitionAt)) throw new Error("invalid_command");
 const context = command.driverContext;
 if (context !== undefined) {
  if (command.eventType !== "trip_start" || !context || typeof context !== "object" || Array.isArray(context)) throw new Error("invalid_driver_context");
  const row = context as Record<string, unknown>;
  if (Object.keys(row).sort().join(",") !== "assignmentId,driverId,schemaVersion,vehicleId" ||
      row.schemaVersion !== 1 || typeof row.driverId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(row.driverId) ||
      typeof row.assignmentId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(row.assignmentId) ||
      typeof row.vehicleId !== "string" || !/^feature:vehicle:[A-Za-z0-9_-]{1,128}$/.test(row.vehicleId)) throw new Error("invalid_driver_context");
 }
}
export function assertDriverStateContract(value: unknown): asserts value is DriverStateProjection {
 if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_driver_state");
 const state = value as Record<string, unknown>;
 if (state.schemaVersion !== 1 || !Number.isSafeInteger(state.revision) || (state.revision as number) < 0 ||
     typeof state.state !== "string" || !DRIVER_STATES.includes(state.state as DriverWorkflowState)) {
  throw new Error("invalid_driver_state");
 }
 for (const key of ["shiftStartedAt", "tripStartedAt", "approachStartedAt"] as const) {
  if (state[key] !== undefined && !validInstant(state[key])) throw new Error("invalid_driver_state_timestamp");
 }
 if (state.lastEventId !== undefined && (typeof state.lastEventId !== "string" || !state.lastEventId.trim())) {
  throw new Error("invalid_driver_state_event_id");
 }
}
export function assertDriverIntentContract(value: unknown): asserts value is DriverIntent {
 if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_driver_intent");
 const intent = value as Record<string, unknown>;
 assertDriverCommandContract(intent.command);
 if (typeof intent.status !== "string" || !DRIVER_INTENT_STATUSES.includes(intent.status as DriverIntentStatus) ||
     !validInstant(intent.createdAt) || !validInstant(intent.updatedAt) ||
     Date.parse(intent.updatedAt) < Date.parse(intent.createdAt) ||
     (intent.reason !== undefined && typeof intent.reason !== "string")) {
  throw new Error("invalid_driver_intent");
 }
}
export type DriverOutboxRecord = {
 id: string; eventId: string; revision: number; integrationId: string;
 contractVersion: number; eventName: string; payloadVersion: number;
 delivered: boolean; createdAt: string;
};
export function assertDriverOutboxContract(value: unknown): asserts value is DriverOutboxRecord {
 if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_driver_outbox");
 const row = value as Record<string, unknown>;
 if (typeof row.id !== "string" || !row.id.trim() ||
     typeof row.eventId !== "string" || !row.eventId.trim() ||
     !Number.isSafeInteger(row.revision) || (row.revision as number) < 1 || row.id !== "driver-state:" + (row.revision as number) ||
     row.integrationId !== "logbook.work-driver-events.v1" ||
     row.contractVersion !== 1 || row.eventName !== "work.driver-event-committed" ||
     row.payloadVersion !== 1 || typeof row.delivered !== "boolean" ||
     !validInstant(row.createdAt)) throw new Error("invalid_driver_outbox");
}
export function assertDriverEventContract(value: unknown): asserts value is DriverEvent {
 if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_driver_event");
 const event = value as Record<string, unknown>;
 assertDriverCommandContract(event.command);
 if (event.eventId !== (event.command as DriverTransitionCommand).eventId ||
     !validInstant(event.committedAt) ||
     !Number.isSafeInteger(event.revision) || (event.revision as number) < 1 || (event.revision as number) !== (event.command as DriverTransitionCommand).expectedRevision + 1) {
  throw new Error("invalid_driver_event");
 }
 const gps = event.gps as Record<string, unknown> | undefined;
 if (!gps || typeof gps !== "object" || typeof gps.provider !== "string" || !gps.provider.trim() ||
     !validInstant(gps.fixAt) || typeof gps.latitude !== "number" || typeof gps.longitude !== "number" ||
     typeof gps.horizontalAccuracyM !== "number" ||
     !validateGpsFix(gps as unknown as GpsFix, (event.command as DriverTransitionCommand).transitionAt, Date.parse(gps.fixAt)).accepted) {
  throw new Error("invalid_driver_event_gps");
 }
}
export function validateDriverCommand(command: DriverTransitionCommand): DriverResult<DriverTransitionCommand> {
 try {
  assertDriverCommandContract(command);
  return {ok:true,value:command};
 } catch {
  return {ok:false,error:"invalid_command"};
 }
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
