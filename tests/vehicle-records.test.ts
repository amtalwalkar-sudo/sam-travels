import { describe, expect, it } from "vitest";
import { assertVehicleRecordV1 } from "../packages/features/vehicle";

const validVehicle = {
  schemaVersion: 1,
  registrationNumber: "MH01AB1234",
  make: "Example Make",
  model: "Example Model",
  vehicleType: "Sedan",
  fuelType: "Petrol",
  yearOfManufacture: 2022,
  ownership: "Owned",
  lifecycleState: "active" as const,
};

describe("Vehicle record v1", () => {
  it("accepts the approved descriptive fields and active lifecycle state", () => {
    expect(() => assertVehicleRecordV1(validVehicle)).not.toThrow();
  });

  it.each(["active", "inactive", "sold"] as const)("accepts lifecycle state %s", lifecycleState => {
    expect(() => assertVehicleRecordV1({ ...validVehicle, lifecycleState })).not.toThrow();
  });

  it("rejects missing identity and descriptive fields", () => {
    expect(() => assertVehicleRecordV1({ ...validVehicle, registrationNumber: " " }))
      .toThrow("vehicle_record_invalid");
    expect(() => assertVehicleRecordV1({ ...validVehicle, make: "" }))
      .toThrow("vehicle_record_invalid");
  });

  it("rejects unsupported lifecycle states and invalid manufacture years", () => {
    expect(() => assertVehicleRecordV1({ ...validVehicle, lifecycleState: "archived" }))
      .toThrow("vehicle_record_invalid");
    expect(() => assertVehicleRecordV1({ ...validVehicle, yearOfManufacture: 1885 }))
      .toThrow("vehicle_record_invalid");
    expect(() => assertVehicleRecordV1({ ...validVehicle, yearOfManufacture: 2022.5 }))
      .toThrow("vehicle_record_invalid");
  });

  it("rejects fields outside the approved Vehicle v1 payload", () => {
    expect(() => assertVehicleRecordV1({ ...validVehicle, loanBalancePaise: 100 }))
      .toThrow("vehicle_record_invalid");
  });
});
