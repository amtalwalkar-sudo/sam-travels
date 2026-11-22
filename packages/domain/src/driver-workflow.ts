import { DRIVER_EVENT_TYPES, type DriverStateProjection, type DriverTransitionCommand, type DriverEventType, type DriverWorkflowState } from "../../core/src/commands";
import type { GpsFix } from "../../core/src/types";
import { validateGpsFix } from "../../core/src/gps";
import type { RecordEnvelope } from "../../core/src/types";
import { resolveOperatingConfiguration } from "./work-driver-context";
export type DriverIntentStatus = "pending_location" | "needs_attention" | "recorded" | "rejected";
export type DriverIntent = { command: DriverTransitionCommand; status: DriverIntentStatus; createdAt: string; updatedAt: string; reason?: string };
export type DriverEvent = { eventId: string; command: DriverTransitionCommand; gps: GpsFix; committedAt: string; revision: number; createdBy?: { personId: string; role: "driver" } };
export type DriverTransitionError = "invalid_command" | "stale_revision" | "invalid_transition" | "duplicate_command" | "gps_required" | "gps_invalid" | "intent_missing";
export type DriverResult<T> = { ok: true; value: T } | { ok: false; error: DriverTransitionError };
export const GPS_RECOVERY_WINDOW_MS = 30_000;
export function isWithinGpsRecoveryWindow(transitionAt: string, nowMs = Date.now()): boolean {
 const transitionMs = Date.parse(transitionAt);
 return Number.isFinite(transitionMs) && Math.abs(nowMs - transitionMs) <= GPS_RECOVERY_WINDOW_MS;
}
export const EMPTY_DRIVER_STATE: DriverStateProjection = { schemaVersion: 1, revision: 0, state: "idle" };
const DRIVER_STATES = ["idle", "shift_active", "going_to_pickup", "trip_active", "approach_active", "needs_attention"] as const;
const DRIVER_INTENT_STATUSES = ["pending_location", "needs_attention", "recorded", "rejected"] as const;
function validInstant(value: unknown): value is string {
 if (typeof value !== "string") return false;
 const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
 if (!match || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) return false;
 const date = new Date(match[1] + "T00:00:00.000Z");
 return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === match[1] && Number.isFinite(Date.parse(value));
}
export type DriverContextV1 = Readonly<{schemaVersion:1;driverId:string;assignmentId:string;vehicleId:string;selectionRevision?:number;driverRevision?:number;vehicleRevision?:number;assignmentRevision?:number}>;
function validDriverContext(value: unknown): value is DriverContextV1 {
 if (!value || typeof value !== "object" || Array.isArray(value)) return false;
 const row = value as Record<string, unknown>;
 const keys = Object.keys(row).sort().join(",");
 const baseKeys = "assignmentId,driverId,schemaVersion,vehicleId";
 const revisionKeys = "assignmentId,assignmentRevision,driverId,driverRevision,schemaVersion,selectionRevision,vehicleId,vehicleRevision";
 const baseValid = row.schemaVersion === 1 && typeof row.driverId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(row.driverId) &&
  typeof row.assignmentId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(row.assignmentId) &&
  typeof row.vehicleId === "string" && /^feature:vehicle:[A-Za-z0-9_-]{1,128}$/.test(row.vehicleId);
 if (!baseValid) return false;
 if (keys === baseKeys) return true;
 return keys === revisionKeys && ["selectionRevision", "driverRevision", "vehicleRevision", "assignmentRevision"]
  .every(key => Number.isSafeInteger(row[key]) && (row[key] as number) >= 1);
}

/** Resolve selected Driver, active assignment and active Vehicle from the authoritative records at commit time. */
export function resolveDriverContextV1(records: readonly RecordEnvelope<unknown>[]): DriverContextV1 {
 return resolveOperatingConfiguration(records);


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
  if (!((command.eventType === "trip_start" && command.workflowVersion !== 2) || (command.eventType === "shift_start" && command.workflowVersion === 2)) || !context || typeof context !== "object" || Array.isArray(context)) throw new Error("invalid_driver_context");
  if (!validDriverContext(context)) throw new Error("invalid_driver_context");
 }
 if (command.workflowVersion !== undefined && command.workflowVersion !== 2) throw new Error("invalid_workflow_version");
 if (["trip_create","start_ride","end_ride","cancel_ride"].includes(String(command.eventType)) && command.workflowVersion !== 2) throw new Error("invalid_workflow_version");
 if (command.workflowVersion === 2 && !["shift_start","shift_end","shift_rotate","trip_create","start_ride","end_ride","cancel_ride"].includes(String(command.eventType))) throw new Error("invalid_workflow_version");
 if (command.workflowVersion === 2 && (command.eventType === "shift_start" || command.eventType === "shift_end" || command.eventType === "shift_rotate")) {
  const odometer = command.odometer as Record<string, unknown> | undefined;
  if (!odometer || Object.keys(odometer).some(key => !["schemaVersion","readingKm","previousConfirmedKm","personalKm","businessKm"].includes(key)) ||
      odometer.schemaVersion !== 1 || !Number.isSafeInteger(odometer.readingKm) || (odometer.readingKm as number) < 0) throw new Error("shift_odometer_required");
  for (const key of ["previousConfirmedKm","personalKm","businessKm"] as const) {
   if (odometer[key] !== undefined && (!Number.isSafeInteger(odometer[key]) || (odometer[key] as number) < 0)) throw new Error("shift_odometer_invalid");
  }
  if (command.eventType === "shift_start" && odometer.businessKm !== undefined) throw new Error("shift_start_odometer_invalid");
  if ((command.eventType === "shift_end" || command.eventType === "shift_rotate") && (odometer.businessKm === undefined || odometer.personalKm !== undefined || odometer.previousConfirmedKm !== undefined)) throw new Error("shift_end_odometer_invalid");
 } else if (command.odometer !== undefined) throw new Error("unexpected_shift_odometer");
 if(command.eventType==="shift_rotate"){
  const r=command.rotation as Record<string,unknown>|undefined;
  if(command.workflowVersion!==2||!r||Object.keys(r).sort().join(",")!=="boundaryAt,outgoingShiftId,outgoingShiftStartedAt,outgoingStartOdometerKm,schemaVersion"||r.schemaVersion!==1||typeof r.outgoingShiftId!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(r.outgoingShiftId)||!validInstant(r.outgoingShiftStartedAt)||!validInstant(r.boundaryAt)||!Number.isSafeInteger(r.outgoingStartOdometerKm)||(r.outgoingStartOdometerKm as number)<0)throw new Error("invalid_shift_rotation");
 } else if(command.rotation!==undefined)throw new Error("unexpected_shift_rotation");

 const tripContext = command.tripContext;
 if (tripContext !== undefined) {
  if (command.workflowVersion !== 2 || command.eventType !== "trip_create" || !tripContext || typeof tripContext !== "object" || Array.isArray(tripContext)) throw new Error("invalid_trip_context");
  const row = tripContext as Record<string, unknown>;
  if (Object.keys(row).sort().join(",") !== "assignmentId,driverId,operationalDate,schemaVersion,shiftId,vehicleId" ||
      row.schemaVersion !== 1 || typeof row.shiftId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(row.shiftId) ||
      typeof row.driverId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(row.driverId) ||
      typeof row.assignmentId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(row.assignmentId) ||
      typeof row.vehicleId !== "string" || !/^feature:vehicle:[A-Za-z0-9_-]{1,128}$/.test(row.vehicleId) ||
      typeof row.operationalDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.operationalDate)) throw new Error("invalid_trip_context");
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
 if (state.shiftId !== undefined && (typeof state.shiftId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(state.shiftId))) throw new Error("invalid_driver_state_shift_id");
 if (state.shiftContext !== undefined && !validDriverContext(state.shiftContext)) throw new Error("invalid_driver_state_context");
 if (state.tripContext !== undefined) {
  const row=state.tripContext as Record<string,unknown>;
  if (!row || Object.keys(row).sort().join(",")!=="assignmentId,driverId,operationalDate,schemaVersion,shiftId,vehicleId" || row.schemaVersion!==1 ||
      typeof row.shiftId!=="string" || !/^[A-Za-z0-9_-]{1,128}$/.test(row.shiftId) ||
      typeof row.driverId!=="string" || !/^[A-Za-z0-9_-]{1,128}$/.test(row.driverId) ||
      typeof row.assignmentId!=="string" || !/^[A-Za-z0-9_-]{1,128}$/.test(row.assignmentId) ||
      typeof row.vehicleId!=="string" || !/^feature:vehicle:[A-Za-z0-9_-]{1,128}$/.test(row.vehicleId) ||
      typeof row.operationalDate!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.operationalDate)) throw new Error("invalid_driver_state_trip_context");
 }
 if (state.activeTripId !== undefined && (typeof state.activeTripId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(state.activeTripId))) throw new Error("invalid_driver_state_trip_id");
 for (const key of ["shiftStartOdometerKm","shiftStartPersonalKm","lastConfirmedOdometerKm"] as const) {
  if (state[key] !== undefined && (typeof state[key] !== "number" || !Number.isSafeInteger(state[key]) || (state[key] as number) < 0)) throw new Error("invalid_driver_state_odometer");
 }
 if (state.state !== "idle" && typeof state.shiftStartOdometerKm === "number" && typeof state.lastConfirmedOdometerKm === "number" &&
     state.shiftStartOdometerKm < state.lastConfirmedOdometerKm) throw new Error("invalid_driver_state_odometer_order");

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
 if ((event.command as DriverTransitionCommand).workflowVersion === 2 &&
     (((event.command as DriverTransitionCommand).eventType === "shift_start" && !(event.command as DriverTransitionCommand).driverContext) ||
      ((event.command as DriverTransitionCommand).eventType === "trip_create" && !(event.command as DriverTransitionCommand).tripContext))) throw new Error("missing_lifecycle_snapshot");
 if (event.createdBy !== undefined) {
  const author = event.createdBy as Record<string, unknown>;
  if (!author || Object.keys(author).sort().join(",") !== "personId,role" || typeof author.personId !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(author.personId) || author.role !== "driver") throw new Error("invalid_driver_event_author");
 }
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
/** Next 04:00 Asia/Kolkata boundary strictly after a shift start. */
export function nextOperationalBoundaryAt(shiftStartedAt:string):string {const start=Date.parse(shiftStartedAt);if(!Number.isFinite(start))throw new Error("invalid_transition_timestamp");const local=new Date(start+330*60_000);const y=local.getUTCFullYear(),m=local.getUTCMonth(),d=local.getUTCDate();let boundary=Date.UTC(y,m,d,4)-330*60_000;if(boundary<=start)boundary=Date.UTC(y,m,d+1,4)-330*60_000;return new Date(boundary).toISOString();}
export function isOperationalBoundaryPending(shiftStartedAt:string|undefined,nowMs=Date.now()):boolean{return !!shiftStartedAt&&nowMs>=Date.parse(nextOperationalBoundaryAt(shiftStartedAt));}
export function validateDriverCommand(command: DriverTransitionCommand): DriverResult<DriverTransitionCommand> {
 try {
  assertDriverCommandContract(command);
  return {ok:true,value:command};
 } catch {
  return {ok:false,error:"invalid_command"};
 }
}
export function transitionTarget(state:DriverWorkflowState,event:DriverEventType):DriverWorkflowState|null {
 const allowed:Record<DriverWorkflowState,Partial<Record<DriverEventType,DriverWorkflowState>>>={
  idle:{shift_start:"shift_active"},
  shift_active:{shift_end:"idle",shift_rotate:"shift_active",trip_start:"trip_active",trip_create:"going_to_pickup"},
  going_to_pickup:{start_ride:"trip_active",cancel_ride:"shift_active"},
  trip_active:{trip_end:"shift_active",ride_cancel:"shift_active",end_ride:"shift_active"},
  approach_active:{trip_start:"trip_active",ride_cancel:"shift_active"},
  needs_attention:{},
 };
 return allowed[state][event]??null;
}
export function validateDriverCompletion(snapshot:DriverStateProjection,intent:DriverIntent,gps:GpsFix|null,nowMs=Date.now()):DriverResult<DriverStateProjection>{
 if(!gps)return{ok:false,error:"gps_required"};
 const c=intent.command;if(intent.status!=="pending_location")return{ok:false,error:"intent_missing"};
 if(c.expectedRevision!==snapshot.revision||c.expectedPriorState!==snapshot.state)return{ok:false,error:"stale_revision"};
 const target=transitionTarget(snapshot.state,c.eventType);if(!target)return{ok:false,error:"invalid_transition"};
 if(c.workflowVersion===2&&c.eventType==="shift_start"&&c.odometer){
  const previous=snapshot.lastConfirmedOdometerKm;
  if(previous!==undefined&&(c.odometer.readingKm<previous||c.odometer.previousConfirmedKm!==previous||c.odometer.personalKm!==c.odometer.readingKm-previous))return{ok:false,error:"invalid_command"};
  if(previous===undefined&&(c.odometer.previousConfirmedKm!==undefined||c.odometer.personalKm!==undefined))return{ok:false,error:"invalid_command"};
 }
 if(c.workflowVersion===2&&(c.eventType==="shift_end"||c.eventType==="shift_rotate")&&c.odometer){
  if(snapshot.shiftStartOdometerKm===undefined||c.odometer.readingKm<snapshot.shiftStartOdometerKm||
     c.odometer.businessKm!==c.odometer.readingKm-snapshot.shiftStartOdometerKm)return{ok:false,error:"invalid_command"};
 }
 if(c.eventType==="shift_rotate"){const r=c.rotation;if(!r||snapshot.state!=="shift_active"||snapshot.shiftId!==r.outgoingShiftId||snapshot.shiftStartedAt!==r.outgoingShiftStartedAt||snapshot.shiftStartOdometerKm!==r.outgoingStartOdometerKm||Date.parse(c.transitionAt)<Date.parse(r.boundaryAt)||Date.parse(r.boundaryAt)<=Date.parse(r.outgoingShiftStartedAt))return{ok:false,error:"invalid_command"};}

 if(!validateGpsFix(gps,c.transitionAt,nowMs).accepted)return{ok:false,error:"gps_invalid"};
 const next:DriverStateProjection={...snapshot,schemaVersion:1,revision:snapshot.revision+1,state:target,lastEventId:c.eventId};
 if(c.eventType==="shift_start"){
  next.shiftStartedAt=c.transitionAt;
  if(c.workflowVersion===2&&c.odometer){next.shiftStartOdometerKm=c.odometer.readingKm;next.shiftStartPersonalKm=c.odometer.personalKm??0;next.lastConfirmedOdometerKm=c.odometer.readingKm;}
 } else if(c.eventType==="shift_end"){
  next.shiftStartedAt=undefined;next.shiftId=undefined;next.shiftContext=undefined;next.shiftStartOdometerKm=undefined;next.shiftStartPersonalKm=undefined;
  if(c.workflowVersion===2&&c.odometer)next.lastConfirmedOdometerKm=c.odometer.readingKm;
 } else if(c.eventType==="shift_rotate"&&c.odometer&&c.rotation){next.shiftStartedAt=c.rotation.boundaryAt;next.shiftId=c.eventId;next.shiftStartOdometerKm=c.odometer.readingKm;next.shiftStartPersonalKm=0;next.lastConfirmedOdometerKm=c.odometer.readingKm;
 }
 if(c.eventType==="trip_start"||c.eventType==="start_ride")next.tripStartedAt=c.transitionAt;
 else if(c.eventType==="trip_end"||c.eventType==="ride_cancel"||c.eventType==="end_ride"||c.eventType==="cancel_ride"){next.tripStartedAt=undefined;next.activeTripId=undefined;next.tripContext=undefined;}
 return{ok:true,value:next};
}
