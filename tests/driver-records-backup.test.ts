import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { exportBrowserSnapshot } from "../packages/storage-browser/src";
import { registerDriverRecordsBrowserBackupParticipant } from "../apps/web/src/driver-records-backup";
import { registerVehicleBrowserBackupParticipant } from "../apps/web/src/vehicle-backup";

describe("Driver Records browser backup participant", () => {
  let unregister: (() => void) | undefined;
  let unregisterVehicle: (() => void) | undefined;
  beforeEach(async () => {
    unregisterVehicle = registerVehicleBrowserBackupParticipant();
    unregister = registerDriverRecordsBrowserBackupParticipant();
    await browserDatabase.delete();
    await browserDatabase.open();
  });
  afterEach(() => { unregister?.(); unregister = undefined; unregisterVehicle?.(); unregisterVehicle = undefined; });

  it("exports the required Driver Records participant and its profiles", async () => {
    const timestamp = "2026-11-07T00:00:00.000Z";
    await browserDatabase.records.put({
      id: "feature:driver-records:driver:driver-001", schemaVersion: 1,
      createdAt: timestamp, updatedAt: timestamp, source: "web", revision: 1,
      data: {
        schemaVersion: 1, driverId: "driver-001", name: "Example Driver",
        lifecycleState: "active",
      },
    });
    const snapshot = await exportBrowserSnapshot("0.1.0");
    expect(snapshot.manifest.participants).toContainEqual({
      id: "driver-records", featureId: "driver-records", snapshotVersion: 1,
      restoreValidatorId: "driver-records-v1",
    });
    expect(snapshot.data.records).toHaveLength(1);
  });

  it("rejects mismatched record identity before export", async () => {
    const timestamp = "2026-11-07T00:00:00.000Z";
    await browserDatabase.records.put({
      id: "feature:driver-records:driver:driver-002", schemaVersion: 1,
      createdAt: timestamp, updatedAt: timestamp, source: "web", revision: 1,
      data: {
        schemaVersion: 1, driverId: "driver-001", name: "Example Driver",
        lifecycleState: "active",
      },
    });
    await expect(exportBrowserSnapshot("0.1.0")).rejects.toThrow("driver_record_identity_mismatch");
  });
});
