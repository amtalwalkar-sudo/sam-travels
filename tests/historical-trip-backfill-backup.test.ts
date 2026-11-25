import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { exportBrowserSnapshot, restoreBrowserSnapshot, markBrowserRestoreVerified, discardVerifiedBrowserCheckpoint } from "../packages/storage-browser/src/backup-snapshot";
import { registerBrowserBackupParticipants } from "../apps/web/src/register-browser-backup-participants";

describe("historical trip backfill backup portability", () => {
  let unregister: (() => void) | undefined;
  beforeEach(async () => {
    await browserDatabase.delete();
    await browserDatabase.open();
    unregister = registerBrowserBackupParticipants();
  });
  afterEach(async () => {
    unregister?.(); unregister = undefined;
    browserDatabase.close();
    await browserDatabase.delete();
  });

  it("exports and restores backfill records as portable platform records without converting them to Work events", async () => {
    const timestamp = "2026-11-11T10:00:00.000Z";
    const id = "historical-trip-backfill:paper-trip-1";
    const data = {
      schemaVersion: 1, kind: "historical_trip_backfill", backfillId: "paper-trip-1",
      status: "submitted", attribution: "admin_declared", driverId: "driver-1", vehicleId: "vehicle-1",
      operationalDate: "2026-11-10", startedAt: "2026-11-10T08:00:00.000Z",
      endedAt: "2026-11-10T08:30:00.000Z", farePaise: 12500,
      reason: "Reconciled from a paper trip sheet", recordedAt: timestamp,
      actor: { role: "admin", actorId: "admin-1" },
    };
    await browserDatabase.records.put({
      id, schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
      businessDate: "2026-11-10", source: "web", revision: 1,
      createdBy: { personId: "admin-1", role: "admin" }, data,
    });
    const exported = await exportBrowserSnapshot("0.1.0");
    expect(exported.data.records).toContainEqual(expect.objectContaining({ id, data }));
    expect(exported.manifest.participants).toContainEqual(expect.objectContaining({
      id: "platform-records", featureId: "platform",
    }));
    expect(exported.data.driverEvents).toHaveLength(0);

    await browserDatabase.records.delete(id);
    const restored = await restoreBrowserSnapshot({
      data: exported.data, manifest: { ...exported.manifest, format: "sam-travels-backup-v2", plaintextSha256: "0".repeat(64) },
      confirmed: true,
    });
    expect(await browserDatabase.records.get(id)).toMatchObject({ id, revision: 1, data });
    expect(restored.restoredCounts.records).toBe(1);
    await markBrowserRestoreVerified(restored.checkpointId);
    await discardVerifiedBrowserCheckpoint(restored.checkpointId);
  });
});
