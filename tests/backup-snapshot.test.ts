import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { DexieRecordRepository } from "../packages/storage-browser/src";
import { FeatureLifecycleCoordinator } from "../packages/application/src/feature-lifecycle-coordinator";
import { registerFeatures } from "../packages/core/src/features";
import {
  BROWSER_BACKUP_PARTICIPANTS,
  assertBrowserBackupTableCoverage,
  discardVerifiedBrowserCheckpoint,
  exportBrowserSnapshot,
  listBrowserRecoveryCheckpoints,
  markBrowserRestoreVerified,
  restoreBrowserSnapshot,
  registerBrowserFeatureBackupParticipant,
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
        tableNames: ["driverState", "driverIntents", "driverOutbox"],
      },
      {
        id: "logbook-events",
        featureId: "logbook",
        schemaVersion: 1,
        tableNames: ["driverEvents"],
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
  it("onboards an isolated persistent feature through participant-owned IndexedDB backup and clean-store restore", async () => {
    const feature = {
      id: "sample-addon", label: "Sample Add-on", dataPolicy: "persistent" as const,
      contractVersion: 1, dependencies: [{ id: "platform", contractVersion: 1 }],
      persistence: {
        schemaVersion: 1, migrations: [],
        backup: { participantId: "sample-addon-records", snapshotVersion: 1, required: true as const },
        restore: { validatorId: "sample-addon-records-v1", required: true as const },
        lifecycle: { disableRetainsData: true as const, removalRequiresMigration: true as const },
      },
    };
    const unregister = registerBrowserFeatureBackupParticipant({
      feature, participantId: "sample-addon-records", recordIdPrefix: "feature:sample-addon:",
      validateRecord(record) {
        if (!record.data || typeof record.data !== "object" ||
            typeof (record.data as { kind?: unknown }).kind !== "string") throw new Error("sample_addon_invalid_record");
      },
      validateSnapshot(records) {
        const owned = records.filter(record => record.id.startsWith("feature:sample-addon:"));
        const ids = new Set(owned.map(record => record.id));
        for (const record of owned) {
          const parentId = (record.data as { parentId?: unknown }).parentId;
          if (parentId !== undefined && (typeof parentId !== "string" || !ids.has(parentId))) {
            throw new Error("sample_addon_relationship_missing");
          }
        }
      },
    });
    try {
      const timestamp = "2026-11-06T00:00:00.000Z";
      await browserDatabase.records.bulkPut([
        { id: "feature:sample-addon:parent", schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp, source: "web", revision: 1, data: { kind: "parent" } },
        { id: "feature:sample-addon:child", schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp, source: "web", revision: 1, data: { kind: "child", parentId: "feature:sample-addon:parent" } },
      ]);
      const snapshot = await exportBrowserSnapshot("0.1.0");
      expect(snapshot.manifest.participants).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "sample-addon-records", featureId: "sample-addon", snapshotVersion: 1 }),
      ]));
      await browserDatabase.records.clear();
      const restored = await restoreBrowserSnapshot({
        data: snapshot.data, manifest: snapshot.manifest as import("../packages/core/src/backup").SnapshotManifest, confirmed: true,
      });
      expect((await browserDatabase.records.get("feature:sample-addon:parent"))?.data).toEqual({ kind: "parent" });
      expect((await browserDatabase.records.get("feature:sample-addon:child"))?.data).toEqual({ kind: "child", parentId: "feature:sample-addon:parent" });
      expect(restored.restoredCounts.records).toBe(2);
    } finally { unregister(); }
  });

  it("rejects a feature-owned snapshot with a broken relationship before checkpointing", async () => {
    const feature = {
      id: "relationship-addon", label: "Relationship Add-on", dataPolicy: "persistent" as const,
      contractVersion: 1, dependencies: [{ id: "platform", contractVersion: 1 }],
      persistence: {
        schemaVersion: 1, migrations: [],
        backup: { participantId: "relationship-addon-records", snapshotVersion: 1, required: true as const },
        restore: { validatorId: "relationship-addon-v1", required: true as const },
        lifecycle: { disableRetainsData: true as const, removalRequiresMigration: true as const },
      },
    };
    const unregister = registerBrowserFeatureBackupParticipant({
      feature, participantId: "relationship-addon-records", recordIdPrefix: "feature:relationship-addon:",
      validateRecord() {},
      validateSnapshot(records) {
        const owned = records.filter(record => record.id.startsWith("feature:relationship-addon:"));
        const ids = new Set(owned.map(record => record.id));
        for (const record of owned) {
          const parentId = (record.data as { parentId?: unknown }).parentId;
          if (typeof parentId === "string" && !ids.has(parentId)) throw new Error("relationship_addon_parent_missing");
        }
      },
    });
    try {
      const timestamp = "2026-11-06T00:00:00.000Z";
      await browserDatabase.records.put({
        id: "feature:relationship-addon:child", schemaVersion: 1, createdAt: timestamp,
        updatedAt: timestamp, source: "web", revision: 1, data: { parentId: "feature:relationship-addon:missing" },
      });
      await expect(exportBrowserSnapshot("0.1.0")).rejects.toThrow("relationship_addon_parent_missing");
      expect(await listBrowserRecoveryCheckpoints()).toHaveLength(0);
    } finally { unregister(); }
  });

  it("fails closed when feature-owned browser records have no registered adapter", async () => {
    await browserDatabase.records.put({
      id: "feature:orphan-addon:row", schemaVersion: 1,
      createdAt: "2026-11-06T00:00:00.000Z", updatedAt: "2026-11-06T00:00:00.000Z",
      source: "web", revision: 1, data: { retained: true },
    });
    await expect(exportBrowserSnapshot("0.1.0")).rejects.toThrow("backup_unregistered_feature_record:feature:orphan-addon:row");
  });

  it("backs up retained feature records after disable and retirement", async () => {
    const feature = {
      id: "retained-backup-addon", label: "Retained Backup Add-on", dataPolicy: "persistent" as const,
      contractVersion: 1, dependencies: [{ id: "platform", contractVersion: 1 }],
      persistence: {
        schemaVersion: 1, migrations: [],
        backup: { participantId: "retained-backup-addon-records", snapshotVersion: 1, required: true as const },
        restore: { validatorId: "retained-backup-addon-v1", required: true as const },
        lifecycle: { disableRetainsData: true as const, removalRequiresMigration: true as const },
      },
    };
    const unregister = registerBrowserFeatureBackupParticipant({
      feature, participantId: "retained-backup-addon-records", recordIdPrefix: "feature:retained-backup-addon:",
      validateRecord() {},
    });
    try {
      const timestamp = "2026-11-06T00:00:00.000Z";
      await browserDatabase.records.put({
        id: "feature:retained-backup-addon:row", schemaVersion: 1,
        createdAt: timestamp, updatedAt: timestamp, source: "web", revision: 1,
        data: { retained: true },
      });
      const lifecycle = new FeatureLifecycleCoordinator(
        new DexieRecordRepository(), registerFeatures([feature]),
      );
      await lifecycle.transition("retained-backup-addon", "disable");
      await lifecycle.transition("retained-backup-addon", "retire");
      const snapshot = await exportBrowserSnapshot("0.1.0");
      expect(snapshot.data.records).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "feature:retained-backup-addon:row" }),
      ]));
      expect((await lifecycle.list()).get("retained-backup-addon")?.state).toBe("retired");
    } finally { unregister(); }
  });

  it("recovers feature-owned records when restore is interrupted after writes", async () => {
    const feature = {
      id: "failure-addon", label: "Failure Add-on", dataPolicy: "persistent" as const,
      contractVersion: 1, dependencies: [{ id: "platform", contractVersion: 1 }],
      persistence: {
        schemaVersion: 1, migrations: [],
        backup: { participantId: "failure-addon-records", snapshotVersion: 1, required: true as const },
        restore: { validatorId: "failure-addon-v1", required: true as const },
        lifecycle: { disableRetainsData: true as const, removalRequiresMigration: true as const },
      },
    };
    const unregister = registerBrowserFeatureBackupParticipant({
      feature, participantId: "failure-addon-records", recordIdPrefix: "feature:failure-addon:",
      validateRecord() {},
    });
    try {
      const timestamp = "2026-11-06T00:00:00.000Z";
      await browserDatabase.records.put({
        id: "feature:failure-addon:row", schemaVersion: 1, createdAt: timestamp,
        updatedAt: timestamp, source: "web", revision: 1, data: { value: "snapshot" },
      });
      const source = await exportBrowserSnapshot("0.1.0");
      await browserDatabase.records.put({
        id: "feature:failure-addon:row", schemaVersion: 1, createdAt: timestamp,
        updatedAt: "2026-11-06T00:01:00.000Z", source: "web", revision: 2, data: { value: "current" },
      });
      const database = browserDatabase as unknown as { transaction: (...args: any[]) => any };
      const originalTransaction = database.transaction;
      let injected = false;
      database.transaction = function (...args: any[]) {
        if (args[0] === "rw" && !injected) {
          injected = true;
          const scope = args[2];
          args[2] = async (...scopeArgs: any[]) => {
            await scope(...scopeArgs);
            throw new Error("sample_addon_restore_interrupted");
          };
        }
        return originalTransaction.apply(this, args);
      };
      try {
        await expect(restoreBrowserSnapshot({
          data: source.data, manifest: source.manifest, confirmed: true,
        })).rejects.toThrow("sample_addon_restore_interrupted");
      } finally {
        database.transaction = originalTransaction;
      }
      expect((await browserDatabase.records.get("feature:failure-addon:row"))?.data).toEqual({ value: "current" });
      expect(await listBrowserRecoveryCheckpoints()).toEqual([
        expect.objectContaining({ status: "rollback_complete" }),
      ]);
    } finally { unregister(); }
  });

});
