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

function requiredText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validate approved Vehicle v1 fields without guessing jurisdiction-specific
 * registration normalization or imposing an unapproved enum on descriptive data.
 */
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
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index]) ||
      record.schemaVersion !== 1 ||
      !requiredText(record.registrationNumber) ||
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
