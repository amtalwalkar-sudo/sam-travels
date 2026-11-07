import { driverRecordId } from "./driver-record-identity";

export type DriverVehicleAssignmentV1 = Readonly<{
  assignmentId: string;
  vehicleId: string;
  assignedAt: string;
  unassignedAt?: string;
}>;
export type DriverAssignmentHistoryV1 = Readonly<{
  schemaVersion: 1;
  driverId: string;
  assignments: readonly DriverVehicleAssignmentV1[];
}>;

function validInstant(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value);
}

/** A single driver has at most one active assignment; closed history is immutable. */
export function assertDriverAssignmentHistoryV1(value: unknown): asserts value is DriverAssignmentHistoryV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("driver_assignment_history_invalid");
  const row = value as Record<string, unknown>;
  if (row.schemaVersion !== 1 || typeof row.driverId !== "string" || !Array.isArray(row.assignments)) {
    throw new Error("driver_assignment_history_invalid");
  }
  try { driverRecordId(row.driverId); } catch { throw new Error("driver_assignment_history_invalid"); }
  const ids = new Set<string>();
  let activeCount = 0;
  let previousAssignedAt = -Infinity;
  for (const item of row.assignments) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("driver_assignment_invalid");
    const assignment = item as Record<string, unknown>;
    const keys = Object.keys(assignment).sort();
    const allowed = ["assignedAt", "assignmentId", "unassignedAt", "vehicleId"];
    if (keys.some(key => !allowed.includes(key)) ||
        typeof assignment.assignmentId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(assignment.assignmentId) ||
        ids.has(assignment.assignmentId) ||
        typeof assignment.vehicleId !== "string" || !assignment.vehicleId.startsWith("feature:vehicle:") ||
        !validInstant(assignment.assignedAt)) throw new Error("driver_assignment_invalid");
    ids.add(assignment.assignmentId);
    const assignedAt = Date.parse(assignment.assignedAt);
    if (assignedAt < previousAssignedAt) throw new Error("driver_assignment_history_order_invalid");
    previousAssignedAt = assignedAt;
    if (assignment.unassignedAt !== undefined) {
      if (!validInstant(assignment.unassignedAt) || Date.parse(assignment.unassignedAt) < assignedAt) {
        throw new Error("driver_assignment_period_invalid");
      }
    } else activeCount++;
  }
  if (activeCount > 1) throw new Error("driver_multiple_active_assignments");
}

export function driverAssignmentHistoryId(driverId: string): string {
  return "feature:driver-records:assignment:" + driverRecordId(driverId).slice("feature:driver-records:driver:".length);
}
