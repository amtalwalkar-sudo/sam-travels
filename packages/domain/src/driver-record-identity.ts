/** Stable opaque identity for a Driver-owned record. */
export function driverRecordId(driverId: string): string {
  if (typeof driverId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(driverId)) {
    throw new Error("driver_id_invalid");
  }
  return "feature:driver-records:driver:" + driverId;
}
