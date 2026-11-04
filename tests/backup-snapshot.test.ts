import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import {
  BROWSER_BACKUP_PARTICIPANTS,
  assertBrowserBackupTableCoverage,
  discardVerifiedBrowserCheckpoint,
  exportBrowserSnapshot,
  listBrowserRecoveryCheckpoints,
  markBrowserRestoreVerified,
  restoreBrowserSnapshot,
  rollbackBrowserRecoveryCheckpoint,
} from "../packages/storage-browser/src";

describe("browser consistent backup snapshots and recovery checkpoints", () => {
  it("derives the browser snapshot participant set from registered feature obligations", () => {
    expect(BROWSER_BACKUP_PARTICIPANTS).toEqual([
      { id: "platform-records", featureId: "platform", schemaVersion: 1, tableNames: ["records"] },
      {
        id: "work-driver-state",
        featureId: "work",
        schemaVersion: 1,
        tableNames: ["driverState", "driverIntents", "driverEvents", "driverOutbox"],
      },
    ]);
    expect(() => assertBrowserBackupTableCoverage()).not.toThrow();
  });

  it("requires every Dexie table to have an explicit backup or internal-exclusion policy", () => {
    expect(() => assertBrowserBackupTableCoverage()).not.toThrow();
    expect(() => assertBrowserBackupTableCoverage([
      ...browserDatabase.tables.map(table => table.name),
      "new-business-feature",
    ])).toThrow("backup_table_registration_mismatch:unclassified:new-business-feature");
  });

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

  it("restores equivalent snapshots even when serialized row order differs", async () => {
    const timestamp = "2026-11-04T00:00:00.000Z";
    await browserDatabase.records.bulkPut(["alpha", "zeta"].map(id => ({
      id,
      schemaVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      source: "web",
      revision: 1,
      data: { id },
    })));
    const source = await exportBrowserSnapshot("0.1.0");
    const reordered = { ...source.data, records: [...source.data.records].reverse() };

    const result = await restoreBrowserSnapshot({
      data: reordered,
      manifest: source.manifest,
      confirmed: true,
    });

    expect((await browserDatabase.records.toArray()).map(row => row.id)).toEqual(["alpha", "zeta"]);
    expect(await listBrowserRecoveryCheckpoints()).toEqual([
      expect.objectContaining({ id: result.checkpointId, status: "restored_unverified" }),
    ]);
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
    const manifest = source.manifest;
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
      manifest: source.manifest,
      confirmed: true,
    });
    await rollbackBrowserRecoveryCheckpoint(result.checkpointId);
    expect((await browserDatabase.records.get("source"))?.data).toEqual({ label: "temporary" });
    expect(await listBrowserRecoveryCheckpoints()).toEqual([
      expect.objectContaining({ id: result.checkpointId, status: "rollback_complete" }),
    ]);
  });

  it("rejects backup participant ownership or snapshot-version drift", async () => {
    const snapshot = await exportBrowserSnapshot("0.1.0");
    const altered = {
      ...snapshot.manifest,
      participants: snapshot.manifest.participants?.map(item =>
        item.id === "logbook-events" ? { ...item, snapshotVersion: item.snapshotVersion + 1 } : item),
    };
    await expect(restoreBrowserSnapshot({ data: snapshot.data, manifest: altered, confirmed: true }))
      .rejects.toThrow("backup_participant_manifest_mismatch");
    expect(await listBrowserRecoveryCheckpoints()).toHaveLength(0);
  });

  it("refuses replacement without confirmation and rejects mismatched record counts", async () => {
    await expect(restoreBrowserSnapshot({
      data: { records: [], driverState: [], driverIntents: [], driverEvents: [], driverOutbox: [] },
      manifest: {
        applicationVersion: "0.1.0",
        schemaVersion: 1,
        createdAt: "2026-11-04T00:00:00.000Z",
        businessTimezone: "Asia/Kolkata",
        snapshotRevision: 0,
        recordCounts: { records: 0, driverState: 0, driverIntents: 0, driverEvents: 0, driverOutbox: 0 },
      },
      confirmed: false,
    })).rejects.toThrow("backup_restore_confirmation_required");
    await expect(restoreBrowserSnapshot({
      data: { records: [], driverState: [], driverIntents: [], driverEvents: [], driverOutbox: [] },
      manifest: {
        applicationVersion: "0.1.0",
        schemaVersion: 1,
        createdAt: "2026-11-04T00:00:00.000Z",
        businessTimezone: "Asia/Kolkata",
        snapshotRevision: 0,
        recordCounts: { records: 1, driverState: 0, driverIntents: 0, driverEvents: 0, driverOutbox: 0 },
      },
      confirmed: true,
    })).rejects.toThrow("backup_record_count_mismatch:records");
    expect(await listBrowserRecoveryCheckpoints()).toHaveLength(0);
  });
});
