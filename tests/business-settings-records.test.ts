import { describe, expect, it } from "vitest";
import { assertBusinessSettingsRecordV1 } from "../packages/features/business-settings";

describe("Business Settings record v1", () => {
  it("accepts a valid business start date", () => {
    expect(() => assertBusinessSettingsRecordV1({
      schemaVersion: 1,
      businessStartDate: "2020-02-29",
    })).not.toThrow();
  });

  it.each(["2026-02-29", "2026-13-01", "2026-04-31", "07-11-2026", ""])(
    "rejects invalid calendar date %s",
    businessStartDate => {
      expect(() => assertBusinessSettingsRecordV1({
        schemaVersion: 1,
        businessStartDate,
      })).toThrow("business_settings_record_invalid");
    },
  );

  it("rejects extra fields so this owner cannot silently grow into a general settings bucket", () => {
    expect(() => assertBusinessSettingsRecordV1({
      schemaVersion: 1,
      businessStartDate: "2020-01-01",
      businessName: "Not approved in this contract",
    })).toThrow("business_settings_record_invalid");
  });
});
