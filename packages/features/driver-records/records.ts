import { driverRecordId } from "../../domain/src/driver-record-identity";
export { driverRecordId } from "../../domain/src/driver-record-identity";

export type DriverLifecycleState = "active" | "inactive";
export type DriverRecordV1 = Readonly<{
  schemaVersion: 1;
  driverId: string;
  name: string;
  licenceNumber?: string;
  licenceExpiryDate?: string;
  mobileNumber?: string;
  lifecycleState: DriverLifecycleState;
  selectedForWork?: boolean;
}>;

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Validate the Driver-owned profile without inventing uniqueness rules for contact or licence fields. */
export function assertDriverRecordV1(value: unknown): asserts value is DriverRecordV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("driver_record_invalid");
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const required = ["driverId", "lifecycleState", "name", "schemaVersion"];
  const allowed = new Set([...required, "licenceExpiryDate", "licenceNumber", "mobileNumber", "selectedForWork"]);
  if (keys.some(key => !allowed.has(key)) || required.some(key => !keys.includes(key)) ||
      record.schemaVersion !== 1 || typeof record.driverId !== "string" ||
      !record.name || typeof record.name !== "string" || !record.name.trim() ||
      !["active", "inactive"].includes(String(record.lifecycleState))) {
    throw new Error("driver_record_invalid");
  }
  try { driverRecordId(record.driverId); } catch { throw new Error("driver_record_invalid"); }
  if (record.selectedForWork !== undefined && typeof record.selectedForWork !== "boolean") throw new Error("driver_record_invalid");
  if (record.licenceNumber !== undefined &&
      (typeof record.licenceNumber !== "string" || !record.licenceNumber.trim())) {
    throw new Error("driver_record_invalid");
  }
  if (record.mobileNumber !== undefined &&
      (typeof record.mobileNumber !== "string" || !record.mobileNumber.trim())) {
    throw new Error("driver_record_invalid");
  }
  if (record.licenceExpiryDate !== undefined && !isCalendarDate(record.licenceExpiryDate)) {
    throw new Error("driver_record_invalid");
  }
}
