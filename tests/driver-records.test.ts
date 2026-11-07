import { describe, expect, it } from "vitest";
import { assertDriverRecordV1, driverRecordId } from "../packages/features/driver-records";

const valid = {
  schemaVersion: 1,
  driverId: "driver-001",
  name: "Example Driver",
  licenceNumber: "DL-12345",
  licenceExpiryDate: "2030-02-28",
  mobileNumber: "+919876543210",
  lifecycleState: "active" as const,
};

describe("Driver record v1", () => {
  it("accepts the approved driver-owned profile fields", () => {
    expect(() => assertDriverRecordV1(valid)).not.toThrow();
    expect(driverRecordId("driver-001")).toBe("feature:driver-records:driver:driver-001");
  });

  it("allows optional licence and contact fields to be absent", () => {
    expect(() => assertDriverRecordV1({
      schemaVersion: 1, driverId: "driver-002", name: "Another Driver", lifecycleState: "inactive",
    })).not.toThrow();
  });

  it("accepts active and inactive lifecycle states", () => {
    expect(() => assertDriverRecordV1({ ...valid, lifecycleState: "inactive" })).not.toThrow();
  });

  it("rejects malformed identities, dates, lifecycle states, and unknown fields", () => {
    expect(() => assertDriverRecordV1({ ...valid, driverId: "bad/id" })).toThrow("driver_record_invalid");
    expect(() => assertDriverRecordV1({ ...valid, licenceExpiryDate: "2025-02-29" })).toThrow("driver_record_invalid");
    expect(() => assertDriverRecordV1({ ...valid, lifecycleState: "archived" })).toThrow("driver_record_invalid");
    expect(() => assertDriverRecordV1({ ...valid, salaryPaise: 1000 })).toThrow("driver_record_invalid");
  });
});
