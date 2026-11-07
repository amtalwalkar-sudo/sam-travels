import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { exportBrowserSnapshot } from "../packages/storage-browser/src";
import { registerVehicleBrowserBackupParticipant } from "../apps/web/src/vehicle-backup";

describe("Vehicle browser backup participant", () => {
  let unregister: (() => void) | undefined;
  beforeEach(async () => {
    unregister = registerVehicleBrowserBackupParticipant();
    await browserDatabase.delete();
    await browserDatabase.open();
  });
  afterEach(() => { unregister?.(); unregister = undefined; });

  it("exports the required Vehicle participant and canonical record", async () => {
    const timestamp = "2026-11-07T00:00:00.000Z";
    await browserDatabase.records.put({
      id: "feature:vehicle:MH01AB1234", schemaVersion: 1,
      createdAt: timestamp, updatedAt: timestamp, source: "web", revision: 1,
      data: {
        schemaVersion: 1, registrationNumber: "MH01AB1234", make: "Example Make",
        model: "Example Model", vehicleType: "Sedan", fuelType: "Petrol",
        yearOfManufacture: 2022, ownership: "Owned", lifecycleState: "active",
      },
    });
    const snapshot = await exportBrowserSnapshot("0.1.0");
    expect(snapshot.manifest.participants).toContainEqual({
      id: "vehicle-records", featureId: "vehicle", snapshotVersion: 1,
      restoreValidatorId: "vehicle-records-v1",
    });
    expect(snapshot.data.records).toHaveLength(1);
  });

  it("rejects non-canonical stored identity before export", async () => {
    const timestamp = "2026-11-07T00:00:00.000Z";
    await browserDatabase.records.put({
      id: "feature:vehicle:MH01AB1234", schemaVersion: 1,
      createdAt: timestamp, updatedAt: timestamp, source: "web", revision: 1,
      data: {
        schemaVersion: 1, registrationNumber: "MH 01 AB 1234", make: "Example Make",
        model: "Example Model", vehicleType: "Sedan", fuelType: "Petrol",
        yearOfManufacture: 2022, ownership: "Owned", lifecycleState: "active",
      },
    });
    await expect(exportBrowserSnapshot("0.1.0")).rejects.toThrow("vehicle_record_invalid");
  });
});
