import type { RecordEnvelope } from "../../core/src/types";
import { driverRecordId } from "./driver-record-identity";
import { assertDriverAssignmentHistoryV1, driverAssignmentHistoryId } from "./driver-assignment";
import { normalizeVehicleRegistrationNumber } from "./vehicle-identity";

export const WORK_SELECTED_DRIVER_RECORD_ID = "work:selected-driver";
const DRIVER_PREFIX = "feature:driver-records:driver:";
const ASSIGNMENT_PREFIX = "feature:driver-records:assignment:";
const VEHICLE_PREFIX = "feature:vehicle:";

export type WorkSelectedDriverV1 = Readonly<{ schemaVersion: 1; driverId: string; lockedShiftId?: string }>;
export type DriverContextV1 = Readonly<{ schemaVersion: 1; driverId: string; assignmentId: string; vehicleId: string }>;
export type OperatingConfigurationV1 = Readonly<{
  schemaVersion: 1;
  driverId: string;
  vehicleId: string;
  assignmentId: string;
  selectionRevision: number;
  driverRevision: number;
  vehicleRevision: number;
  assignmentRevision: number;
}>;

export function assertWorkSelectedDriverV1(value: unknown): asserts value is WorkSelectedDriverV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("work_selected_driver_invalid");
  const row = value as Record<string, unknown>;
  if (!["driverId,schemaVersion", "driverId,lockedShiftId,schemaVersion"].includes(Object.keys(row).sort().join(",")) ||
      row.schemaVersion !== 1 || typeof row.driverId !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(row.driverId) ||
      (row.lockedShiftId !== undefined &&
       (typeof row.lockedShiftId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(row.lockedShiftId)))) {
    throw new Error("work_selected_driver_invalid");
  }
}

export function assertDriverContextV1(value: unknown): asserts value is DriverContextV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_driver_context");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join(",") !== "assignmentId,driverId,schemaVersion,vehicleId" ||
      row.schemaVersion !== 1 || typeof row.driverId !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(row.driverId) ||
      typeof row.assignmentId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(row.assignmentId) ||
      typeof row.vehicleId !== "string" || !/^feature:vehicle:[A-Za-z0-9_-]{1,128}$/.test(row.vehicleId)) {
    throw new Error("invalid_driver_context");
  }
}

function dataOf(record: RecordEnvelope<unknown>): Record<string, unknown> {
  if (!record.data || typeof record.data !== "object" || Array.isArray(record.data)) {
    throw new Error("operating_configuration_record_invalid");
  }
  return record.data as Record<string, unknown>;
}

/**
 * Resolves the one permitted operating pair from one repository snapshot.
 * This function is read-only: it never creates or repairs configuration.
 */
export function resolveOperatingConfiguration(
  records: readonly RecordEnvelope<unknown>[],
  transitionAt?: string,
): OperatingConfigurationV1 {
  const selections = records.filter(record => record.id === WORK_SELECTED_DRIVER_RECORD_ID);
  if (selections.length !== 1) throw new Error("operating_driver_selection_missing_or_ambiguous");
  const selectionRecord = selections[0];
  assertWorkSelectedDriverV1(selectionRecord.data);
  const selection = selectionRecord.data;
  if (selection.lockedShiftId !== undefined) throw new Error("operating_driver_selection_locked");

  const activeDrivers: Array<{ record: RecordEnvelope<unknown>; data: Record<string, unknown> }> = [];
  for (const record of records.filter(item => item.id.startsWith(DRIVER_PREFIX))) {
    const data = dataOf(record);
    if (data.lifecycleState !== "active" && data.lifecycleState !== "inactive") throw new Error("operating_driver_invalid");
    if (data.lifecycleState === "active") {
      let expectedId = "";
      try { expectedId = driverRecordId(String(data.driverId)); } catch { throw new Error("operating_driver_invalid"); }
      if (record.id !== expectedId || data.schemaVersion !== 1 ||
          typeof data.name !== "string" || !data.name.trim()) throw new Error("operating_driver_invalid");
      activeDrivers.push({ record, data });
    }
  }
  if (activeDrivers.length === 0) throw new Error("operating_driver_missing");
  if (activeDrivers.length !== 1) throw new Error("operating_driver_ambiguous");
  const driver = activeDrivers[0];
  const driverId = String(driver.data.driverId);
  if (driverId !== selection.driverId) throw new Error("operating_driver_selection_mismatch");

  const activeVehicles: Array<{ record: RecordEnvelope<unknown>; data: Record<string, unknown> }> = [];
  for (const record of records.filter(item => item.id.startsWith(VEHICLE_PREFIX))) {
    const data = dataOf(record);
    if (data.lifecycleState !== "active" && data.lifecycleState !== "inactive" && data.lifecycleState !== "sold") throw new Error("operating_vehicle_invalid");
    if (data.lifecycleState === "active") {
      const expectedKeys = ["fuelType", "lifecycleState", "make", "model", "ownership", "registrationNumber", "schemaVersion", "vehicleType", "yearOfManufacture"];
      let registration = "";
      try {
        if (typeof data.registrationNumber === "string") registration = normalizeVehicleRegistrationNumber(data.registrationNumber);
      } catch { throw new Error("operating_vehicle_invalid"); }
      if (Object.keys(data).sort().join(",") !== expectedKeys.sort().join(",") || data.schemaVersion !== 1 ||
          typeof data.registrationNumber !== "string" || data.registrationNumber !== registration ||
          record.id !== VEHICLE_PREFIX + registration ||
          !["make", "model", "vehicleType", "fuelType", "ownership"].every(key => typeof data[key] === "string" && (data[key] as string).trim()) ||
          !Number.isSafeInteger(data.yearOfManufacture) || (data.yearOfManufacture as number) < 1) {
        throw new Error("operating_vehicle_invalid");
      }
      activeVehicles.push({ record, data });
    }
  }
  if (activeVehicles.length === 0) throw new Error("operating_vehicle_missing");
  if (activeVehicles.length !== 1) throw new Error("operating_vehicle_ambiguous");
  const vehicle = activeVehicles[0];
  const vehicleId = vehicle.record.id;

  const activeAssignments: Array<{ record: RecordEnvelope<unknown>; assignment: { assignmentId: string; vehicleId: string; assignedAt: string } }> = [];
  for (const record of records.filter(item => item.id.startsWith(ASSIGNMENT_PREFIX))) {
    const data = dataOf(record);
    try { assertDriverAssignmentHistoryV1(data); } catch { throw new Error("operating_assignment_invalid"); }
    if (record.id !== driverAssignmentHistoryId(data.driverId)) throw new Error("operating_assignment_invalid");
    for (const assignment of data.assignments) {
      if (assignment.unassignedAt === undefined) activeAssignments.push({ record, assignment });
    }
  }
  if (activeAssignments.length === 0) throw new Error("operating_assignment_missing");
  if (activeAssignments.length !== 1) throw new Error("operating_assignment_ambiguous");
  const active = activeAssignments[0];
  if (active.record.id !== driverAssignmentHistoryId(driverId) || active.assignment.vehicleId !== vehicleId) {
    throw new Error("operating_assignment_pair_mismatch");
  }
  if (transitionAt !== undefined) {
    const transitionMs = Date.parse(transitionAt);
    if (!Number.isFinite(transitionMs)) throw new Error("invalid_transition_timestamp");
    if (Date.parse(active.assignment.assignedAt) > transitionMs) throw new Error("operating_assignment_not_effective");
  }

  return Object.freeze({
    schemaVersion: 1,
    driverId,
    vehicleId,
    assignmentId: active.assignment.assignmentId,
    selectionRevision: selectionRecord.revision,
    driverRevision: driver.record.revision,
    vehicleRevision: vehicle.record.revision,
    assignmentRevision: active.record.revision,
  });
}

/** Compatibility projection for existing Work transition consumers. */
export function resolveWorkDriverContext(
  records: readonly RecordEnvelope<unknown>[],
  transitionAt?: string,
): DriverContextV1 {
  const resolved = resolveOperatingConfiguration(records, transitionAt);
  return Object.freeze({
    schemaVersion: 1,
    driverId: resolved.driverId,
    assignmentId: resolved.assignmentId,
    vehicleId: resolved.vehicleId,
  });
}

/** India operational date: local times before 04:00 belong to the previous date. */
export function operationalDateAt(value: string): string {
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) throw new Error("invalid_transition_timestamp");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return new Date(Date.UTC(Number(part("year")), Number(part("month")) - 1,
    Number(part("day")) - (Number(part("hour")) < 4 ? 1 : 0))).toISOString().slice(0, 10);
}
