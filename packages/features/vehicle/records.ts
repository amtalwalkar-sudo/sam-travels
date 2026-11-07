/** Vehicle v1 owns identity, approved descriptive fields, and lifecycle state only. */
export type VehicleLifecycleState = "active" | "inactive" | "sold";

export type VehicleRecordV1 = Readonly<{
  schemaVersion: 1;
  registrationNumber: string;
  make: string;
  model: string;
  vehicleType: string;
  fuelType: string;
  yearOfManufacture: number;
  ownership: string;
  lifecycleState: VehicleLifecycleState;
}>;

/** Canonical identity: uppercase and remove all whitespace and hyphens. */
export function normalizeVehicleRegistrationNumber(value: string): string {
  if (typeof value !== "string") throw new Error("vehicle_registration_number_invalid");
  const normalized = value.toUpperCase().replace(/[\s-]+/g, "");
  if (!normalized) {
    throw new Error("vehicle_registration_number_invalid");
  }
  return normalized;
}

function requiredText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Fail-closed validator. Persisted registration numbers must already be canonical. */
export function assertVehicleRecordV1(value: unknown): asserts value is VehicleRecordV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("vehicle_record_invalid");
  }
  const record = value as Record<string, unknown>;
  const expectedKeys = [
    "fuelType", "lifecycleState", "make", "model", "ownership",
    "registrationNumber", "schemaVersion", "vehicleType", "yearOfManufacture",
  ];
  const keys = Object.keys(record).sort();
  let normalized = "";
  try {
    if (typeof record.registrationNumber === "string") {
      normalized = normalizeVehicleRegistrationNumber(record.registrationNumber);
    }
  } catch {
    throw new Error("vehicle_record_invalid");
  }
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index]) ||
      record.schemaVersion !== 1 ||
      !requiredText(record.registrationNumber) || record.registrationNumber !== normalized ||
      !requiredText(record.make) ||
      !requiredText(record.model) ||
      !requiredText(record.vehicleType) ||
      !requiredText(record.fuelType) ||
      !requiredText(record.ownership) ||
      !Number.isSafeInteger(record.yearOfManufacture) ||
      (record.yearOfManufacture as number) < 1 ||
      !["active", "inactive", "sold"].includes(String(record.lifecycleState))) {
    throw new Error("vehicle_record_invalid");
  }
}
