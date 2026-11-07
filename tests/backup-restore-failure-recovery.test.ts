import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { registerVehicleBrowserBackupParticipant } from "../apps/web/src/vehicle-backup";
import {
  exportBrowserSnapshot,
  listBrowserRecoveryCheckpoints,
  restoreBrowserSnapshot,
} from "../packages/storage-browser/src";

describe("backup restore failure recovery", () => {
  let unregisterVehicle: (() => void) | undefined;
  beforeEach(async () => {
    unregisterVehicle = registerVehicleBrowserBackupParticipant();
    await browserDatabase.delete();
    await browserDatabase.open();
  });

  afterEach(() => { unregisterVehicle?.(); unregisterVehicle = undefined; });

  it("does not return a partial backup when snapshot export is interrupted", async () => {
    const timestamp = "2026-11-04T00:00:00.000Z";
    await browserDatabase.records.put({
      id: "backup-source", schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
      source: "web", revision: 1, data: { label: "source-survives" },
    });
    const database = browserDatabase as unknown as { transaction: (...args: any[]) => any };
    const originalTransaction = database.transaction;
    let injected = false;
    database.transaction = function (...args: any[]) {
      if (args[0] === "r" && !injected) {
        injected = true;
        const scope = args[2];
        args[2] = async (...scopeArgs: any[]) => {
          await scope(...scopeArgs);
          throw new Error("simulated_snapshot_interruption");
        };
      }
      return originalTransaction.apply(this, args);
    };
    try {
      await expect(exportBrowserSnapshot("0.1.0")).rejects.toThrow("simulated_snapshot_interruption");
    } finally {
      database.transaction = originalTransaction;
    }
    expect((await browserDatabase.records.get("backup-source"))?.data).toEqual({ label: "source-survives" });
    expect(await listBrowserRecoveryCheckpoints()).toHaveLength(0);
  });

  it("rejects malformed feature rows before replacing current data", async () => {
    const timestamp = "2026-11-04T00:00:00.000Z";
    await browserDatabase.records.put({
      id: "current-business-data",
      schemaVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      source: "web",
      revision: 9,
      data: { label: "must-survive" },
    });
    const source = await exportBrowserSnapshot("0.1.0");
    const malformed = {
      ...source.data,
      driverOutbox: [{ delivered: false, revision: 1, eventId: "missing-primary-key" }],
    };

    await expect(restoreBrowserSnapshot({
      data: malformed,
      manifest: {
        ...source.manifest,
        recordCounts: { ...source.manifest.recordCounts, driverOutbox: 1 },
      },
      confirmed: true,
    })).rejects.toThrow("backup_invalid_or_duplicate_row_id:driverOutbox");

    expect((await browserDatabase.records.get("current-business-data"))?.data).toEqual({
      label: "must-survive",
    });
    expect(await listBrowserRecoveryCheckpoints()).toHaveLength(0);
  });

  it("rolls back to the pre-restore snapshot when a table write is interrupted", async () => {
    const timestamp = "2026-11-04T00:00:00.000Z";
    await browserDatabase.records.put({
      id: "business-record", schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
      source: "web", revision: 1, data: { label: "backup" },
    });
    const source = await exportBrowserSnapshot("0.1.0");
    await browserDatabase.records.put({
      id: "business-record", schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
      source: "web", revision: 2, data: { label: "current" },
    });

    // Inject a failure after the restore callback has written all replacement
    // tables but before IndexedDB can commit its transaction.
    const database = browserDatabase as unknown as { transaction: (...args: any[]) => any };
    const originalTransaction = database.transaction;
    let injected = false;
    database.transaction = function (...args: any[]) {
      if (args[0] === "rw" && !injected) {
        injected = true;
        const scope = args[2];
        args[2] = async (...scopeArgs: any[]) => {
          await scope(...scopeArgs);
          throw new Error("simulated_restore_interruption");
        };
      }
      return originalTransaction.apply(this, args);
    };
    try {
      await expect(restoreBrowserSnapshot({
        data: source.data, manifest: source.manifest, confirmed: true,
      })).rejects.toThrow("simulated_restore_interruption");
    } finally {
      database.transaction = originalTransaction;
    }

    expect((await browserDatabase.records.get("business-record"))?.data).toEqual({ label: "current" });
    expect(await listBrowserRecoveryCheckpoints()).toEqual([
      expect.objectContaining({ status: "rollback_complete" }),
    ]);
  });
});
