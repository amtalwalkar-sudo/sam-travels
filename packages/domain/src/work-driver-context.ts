import type { RecordEnvelope } from "../../core/src/types";
import { driverRecordId } from "./driver-record-identity";
import { assertDriverAssignmentHistoryV1, driverAssignmentHistoryId } from "./driver-assignment";
export const WORK_SELECTED_DRIVER_RECORD_ID = "work:selected-driver";
export type WorkSelectedDriverV1 = Readonly<{ schemaVersion: 1; driverId: string }>;
export type DriverContextV1 = Readonly<{ schemaVersion: 1; driverId: string; assignmentId: string; vehicleId: string }>;
export function assertWorkSelectedDriverV1(value: unknown): asserts value is WorkSelectedDriverV1 {
 if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("work_selected_driver_invalid");
 const row=value as Record<string,unknown>;
 if(Object.keys(row).sort().join(",")!=="driverId,schemaVersion"||row.schemaVersion!==1||
 typeof row.driverId!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(row.driverId))throw new Error("work_selected_driver_invalid");
}
export function assertDriverContextV1(value: unknown): asserts value is DriverContextV1 {
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("invalid_driver_context");
 const row=value as Record<string,unknown>;
 if(Object.keys(row).sort().join(",")!=="assignmentId,driverId,schemaVersion,vehicleId"||row.schemaVersion!==1||
 typeof row.driverId!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(row.driverId)||
 typeof row.assignmentId!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(row.assignmentId)||
 typeof row.vehicleId!=="string"||!row.vehicleId.startsWith("feature:vehicle:")||row.vehicleId.trim()!==row.vehicleId)
 throw new Error("invalid_driver_context");
}
export function resolveWorkDriverContext(records:readonly RecordEnvelope<unknown>[]):DriverContextV1{
 const selected=records.find(record=>record.id===WORK_SELECTED_DRIVER_RECORD_ID);
 if(!selected)throw new Error("work_driver_not_selected");
 assertWorkSelectedDriverV1(selected.data);
 const driverId=selected.data.driverId;
 const driver=records.find(record=>record.id===driverRecordId(driverId));
 if(!driver||!driver.data||typeof driver.data!=="object")throw new Error("driver_not_active");
 const driverData=driver.data as Record<string,unknown>;
 if(driverData.schemaVersion!==1||driverData.driverId!==driverId||typeof driverData.name!=="string"||
 !driverData.name.trim()||driverData.lifecycleState!=="active")throw new Error("driver_not_active");
 const history=records.find(record=>record.id===driverAssignmentHistoryId(driverId));
 if(!history)throw new Error("driver_assignment_missing");
 assertDriverAssignmentHistoryV1(history.data);
 if(history.data.driverId!==driverId)throw new Error("driver_assignment_identity_mismatch");
 const active=history.data.assignments.filter(item=>item.unassignedAt===undefined);
 if(active.length!==1)throw new Error(active.length===0?"driver_assignment_missing":"driver_multiple_active_assignments");
 const assignment=active[0];
 const vehicle=records.find(record=>record.id===assignment.vehicleId);
 if(!vehicle||!vehicle.data||typeof vehicle.data!=="object")throw new Error("vehicle_not_active");
 const vehicleData=vehicle.data as Record<string,unknown>;
 if(vehicleData.schemaVersion!==1||vehicleData.lifecycleState!=="active"||
 typeof vehicleData.registrationNumber!=="string"||vehicle.id!=="feature:vehicle:"+vehicleData.registrationNumber)
 throw new Error("vehicle_not_active");
 const context:DriverContextV1={schemaVersion:1,driverId,assignmentId:assignment.assignmentId,vehicleId:assignment.vehicleId};
 assertDriverContextV1(context);return context;
}
