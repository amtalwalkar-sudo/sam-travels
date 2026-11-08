import type { RecordEnvelope } from "../../core/src/types";
import { driverRecordId } from "./driver-record-identity";
import { assertDriverAssignmentHistoryV1, driverAssignmentHistoryId } from "./driver-assignment";
import { normalizeVehicleRegistrationNumber } from "./vehicle-identity";
export const WORK_SELECTED_DRIVER_RECORD_ID = "work:selected-driver";
export type WorkSelectedDriverV1 = Readonly<{schemaVersion:1;driverId:string;lockedShiftId?:string}>;
export type DriverContextV1 = Readonly<{schemaVersion:1;driverId:string;assignmentId:string;vehicleId:string}>;
export function assertWorkSelectedDriverV1(value:unknown):asserts value is WorkSelectedDriverV1 {
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("work_selected_driver_invalid");
 const row=value as Record<string,unknown>;
 if(!["driverId,schemaVersion","driverId,lockedShiftId,schemaVersion"].includes(Object.keys(row).sort().join(","))||row.schemaVersion!==1||typeof row.driverId!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(row.driverId)||(row.lockedShiftId!==undefined&&(typeof row.lockedShiftId!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(row.lockedShiftId))))throw new Error("work_selected_driver_invalid");
}
export function assertDriverContextV1(value:unknown):asserts value is DriverContextV1 {
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("invalid_driver_context");
 const row=value as Record<string,unknown>;
 if(Object.keys(row).sort().join(",")!=="assignmentId,driverId,schemaVersion,vehicleId"||row.schemaVersion!==1||
  typeof row.driverId!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(row.driverId)||
  typeof row.assignmentId!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(row.assignmentId)||
  typeof row.vehicleId!=="string"||!/^feature:vehicle:[A-Za-z0-9_-]{1,128}$/.test(row.vehicleId))throw new Error("invalid_driver_context");
}
export function resolveWorkDriverContext(records:readonly RecordEnvelope<unknown>[],transitionAt?:string):DriverContextV1 {
 const selected=records.find(record=>record.id===WORK_SELECTED_DRIVER_RECORD_ID);
 if(!selected)throw new Error("work_driver_not_selected");
 assertWorkSelectedDriverV1(selected.data);
 if(selected.data.lockedShiftId!==undefined)throw new Error("work_driver_selection_locked_during_shift");
 const driverId=selected.data.driverId;
 const driver=records.find(record=>record.id===driverRecordId(driverId));
 if(!driver||!driver.data||typeof driver.data!=="object")throw new Error("driver_not_active");
 const data=driver.data as Record<string,unknown>;
 if(data.schemaVersion!==1||data.driverId!==driverId||typeof data.name!=="string"||!data.name.trim()||data.lifecycleState!=="active")throw new Error("driver_not_active");
 const history=records.find(record=>record.id===driverAssignmentHistoryId(driverId));
 if(!history)throw new Error("driver_assignment_missing");
 assertDriverAssignmentHistoryV1(history.data);
 if(history.data.driverId!==driverId)throw new Error("driver_assignment_identity_mismatch");
 const active=history.data.assignments.filter(item=>item.unassignedAt===undefined);
 if(active.length!==1)throw new Error(active.length===0?"driver_assignment_missing":"driver_multiple_active_assignments");
 const assignment=active[0];
 if(transitionAt!==undefined&&(!Number.isFinite(Date.parse(transitionAt))||Date.parse(assignment.assignedAt)>Date.parse(transitionAt)))throw new Error("driver_assignment_not_active_at_shift_start");
 const vehicle=records.find(record=>record.id===assignment.vehicleId);
 if(!vehicle||!vehicle.data||typeof vehicle.data!=="object")throw new Error("vehicle_not_active");
 const v=vehicle.data as Record<string,unknown>;
 const expected=["fuelType","lifecycleState","make","model","ownership","registrationNumber","schemaVersion","vehicleType","yearOfManufacture"].sort();
 if(Object.keys(v).sort().join(",")!==expected.join(",")||v.schemaVersion!==1||v.lifecycleState!=="active"||
  typeof v.registrationNumber!=="string"||v.registrationNumber!==normalizeVehicleRegistrationNumber(v.registrationNumber)||
  vehicle.id!=="feature:vehicle:"+v.registrationNumber||
  !["make","model","vehicleType","fuelType","ownership"].every(key=>typeof v[key]==="string"&&(v[key] as string).trim())||
  !Number.isSafeInteger(v.yearOfManufacture)||(v.yearOfManufacture as number)<1)throw new Error("vehicle_not_active");
 return Object.freeze({schemaVersion:1,driverId,assignmentId:assignment.assignmentId,vehicleId:assignment.vehicleId});
}

/** India operational date: local times before 04:00 belong to the previous date. */
export function operationalDateAt(value:string):string {
 const instant=Date.parse(value);
 if(!Number.isFinite(instant))throw new Error("invalid_transition_timestamp");
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(new Date(instant));
 const part=(type:string)=>parts.find(item=>item.type===type)?.value??"";
 return new Date(Date.UTC(Number(part("year")),Number(part("month"))-1,Number(part("day"))-(Number(part("hour"))<4?1:0))).toISOString().slice(0,10);
}
