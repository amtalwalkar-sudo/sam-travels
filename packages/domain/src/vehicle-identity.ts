/** Canonical vehicle registration identity shared across domain and application services. */
export function normalizeVehicleRegistrationNumber(value: string): string {
  if (typeof value !== "string") throw new Error("vehicle_registration_number_invalid");
  const normalized = value.toUpperCase().replace(/[\s-]+/g, "");
  if (!normalized) throw new Error("vehicle_registration_number_invalid");
  return normalized;
}
