import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import {
  discardVerifiedBrowserCheckpoint,
  exportBrowserSnapshot,
  listBrowserRecoveryCheckpoints,
  markBrowserRestoreVerified,
  restoreBrowserSnapshot,
  rollbackBrowserRecoveryCheckpoint,
} from "../packages/features/backup";

describe("browser consistent backup snapshots and recovery checkpoints", () => {
  beforeEach(async () => {
    await browserDatabase.delete();
    await browserDatabase.open();
  });

  it("exports all authoritative IndexedDB workflow tables at one transaction boundary", async () => {
    await browserDatabase.records.put({
      id: "sample",
      schemaVersion: 1,
      createdAt: "2026-11-04T00:00:00.000Z",
      updatedAt: "2026-11-04T00:00:00.000Z",
      source: "web",
      revision: 1,
      data: { value: "before" },
    });
    await browserDatabase.table("driverState").put({
      id: "driver-state",
      value: { schemaVersion: 1, revision: 4, state: "shift_active" },
    });
    const snapshot = await exportBrowserSnapshot("0.1.0");
    expect(snapshot.manifest.snapshotRevision).toBe(4);
    expect(snapshot.manifest.recordCounts.records).toBe(1);
    expect(snapshot.manifest.recordCounts.driverState).toBe(1);
    expect(new TextDecoder().decode(snapshot.plaintext)).toContain('"value":"before"');
  });

  it("checkpoints before replacement, verifies restored data, and retains the checkpoint until explicit verification", async () => {
    await browserDatabase.records.put({
      id: "business-record",
      schemaVersion: 1,
      createdAt: "2026-11-04T00:00:00.000Z",
      updatedAt: "2026-11-04T00:00:00.000Z",
      source: "web",
      revision: 1,
      data: { label: "original" },
    });
    const source = await exportBrowserSnapshot("0.1.0");
    await browserDatabase.records.put({
      id: "business-record",
      schemaVersion: 1,
      createdAt: "2026-11-04T00:00:00.000Z",
      updatedAt: "2026-11-04T00:01:00.000Z",
      source: "web",
      revision: 2,
      data: { label: "replacement" },
    });
    const manifest = {
      ...source.manifest,
      format: "backup-encryption-v1" as const,
      plaintextSha256: "validated-by-crypto-before-restore",
    };
    const result = await restoreBrowserSnapshot({ data: source.data, manifest, confirmed: true });
    expect((await browserDatabase.records.get("business-record"))?.data).toEqual({ label: "original" });
    expect(await listBrowserRecoveryCheckpoints()).toEqual([
      expect.objectContaining({ id: result.checkpointId, status: "restored_unverified" }),
    ]);
    await markBrowserRestoreVerified(result.checkpointId);
    await discardVerifiedBrowserCheckpoint(result.checkpointId);
    expect(await listBrowserRecoveryCheckpoints()).toHaveLength(0);
  });

  it("can roll back a restored dataset from its retained pre-restore checkpoint", async () => {
    await browserDatabase.records.put({
      id: "source",
      schemaVersion: 1,
      createdAt: "2026-11-04T00:00:00.000Z",
      updatedAt: "2026-11-04T00:00:00.000Z",
      source: "web",
      revision: 1,
      data: { label: "pre-restore" },
    });
    const source = await exportBrowserSnapshot("0.1.0");
    await browserDatabase.records.put({
      id: "source",
      schemaVersion: 1,
      createdAt: "2026-11-04T00:00:00.000Z",
      updatedAt: "2026-11-04T00:01:00.000Z",
      source: "web",
      revision: 2,
      data: { label: "temporary" },
    });
    const result = await restoreBrowserSnapshot({
      data: source.data,
      manifest: { ...source.manifest, format: "backup-encryption-v1", plaintextSha256: "verified-before-restore" },
      confirmed: true,
    });
    await rollbackBrowserRecoveryCheckpoint(result.checkpointId);
    expect((await browserDatabase.records.get("source"))?.data).toEqual({ label: "temporary" });
    expect(await listBrowserRecoveryCheckpoints()).toEqual([
      expect.objectContaining({ id: result.checkpointId, status: "rollback_complete" }),
    ]);
  });

  it("refuses replacement without confirmation and rejects mismatched record counts", async () => {
    await expect(restoreBrowserSnapshot({
      data: { records: [], driverState: [], driverIntents: [], driverEvents: [], driverOutbox: [] },
      manifest: {
        format: "backup-encryption-v1",
        applicationVersion: "0.1.0",
        schemaVersion: 1,
        createdAt: "2026-11-04T00:00:00.000Z",
        businessTimezone: "Asia/Kolkata",
        snapshotRevision: 0,
        recordCounts: { records: 0, driverState: 0, driverIntents: 0, driverEvents: 0, driverOutbox: 0 },
        plaintextSha256: "unused",
      },
      confirmed: false,
    })).rejects.toThrow("backup_restore_confirmation_required");
    expect(await listBrowserRecoveryCheckpoints()).toHaveLength(0);
  });
});
