import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { listBrowserRecoveryCheckpoints, restoreBrowserSnapshot } from "../packages/storage-browser/src";
import { assertBackupRecordCount, MAX_BACKUP_RECORD_COUNT } from "../packages/core/src/persistence-contract";

describe("backup record-count limits", () => {
  beforeEach(async () => {
    await browserDatabase.delete();
    await browserDatabase.open();
  });

  afterEach(async () => {
    browserDatabase.close();
    await browserDatabase.delete();
  });

  it("accepts the inclusive limit and rejects the first record over it before restore mutation", async () => {
    expect(MAX_BACKUP_RECORD_COUNT).toBe(1_000_000);
    expect(() => assertBackupRecordCount(MAX_BACKUP_RECORD_COUNT)).not.toThrow();
    expect(() => assertBackupRecordCount(MAX_BACKUP_RECORD_COUNT + 1)).toThrow("backup_record_count_limit");
    await expect(restoreBrowserSnapshot({
      data: { records: [], driverState: [], driverIntents: [], driverEvents: [], driverOutbox: [] },
      manifest: {
        applicationVersion: "0.1.0",
        schemaVersion: 1,
        createdAt: "2026-11-18T00:00:00.000Z",
        businessTimezone: "Asia/Kolkata",
        snapshotRevision: 0,
        recordCounts: { records: 1_000_001, driverState: 0, driverIntents: 0, driverEvents: 0, driverOutbox: 0 },
      },
      confirmed: true,
    })).rejects.toThrow("backup_record_count_limit");
    expect(await listBrowserRecoveryCheckpoints()).toHaveLength(0);
  });
});
