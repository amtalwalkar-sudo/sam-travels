import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { registerVehicleBrowserBackupParticipant } from "../apps/web/src/vehicle-backup";
import { exportBrowserSnapshot } from "../packages/storage-browser/src";
import { toCanonicalBackupSnapshotV1 } from "../packages/storage-browser/src/canonical-backup-snapshot";

describe("portable browser backup exclusions", () => {
  let unregister: (() => void) | undefined;
  beforeEach(async () => {
    unregister = registerVehicleBrowserBackupParticipant();
    await browserDatabase.delete();
    await browserDatabase.open();
  });
  afterEach(() => { unregister?.(); unregister = undefined; });

  it("excludes local credentials, diagnostics, recovery material and non-portable person identity from portable snapshots", async () => {
    const timestamp = "2026-11-24T00:00:00.000Z";
    await browserDatabase.records.bulkPut([
      { id: "portable-business-record", schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp, source: "web", revision: 1, data: { value: "portable" } },
      { id: "work:selected-driver", schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp, source: "web", revision: 1, data: { driverId: "driver-1" } },
      { id: "identity:driver-person-link:driver-1", schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp, source: "web", revision: 1, data: { personId: "person-1" } },
      { id: "identity:person:person-1", schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp, source: "web", revision: 1, data: { displayName: "Local only" } },
      { id: "__sam_travels_recovery_checkpoint__:restore-1", schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp, source: "web", revision: 1, data: { checkpoint: true } },
      { id: "__sam_travels_recovery_journal__:restore-1", schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp, source: "web", revision: 1, data: { status: "checkpoint" } },
    ] as never);
    await browserDatabase.table("backupCheckpoints").put({ id: "checkpoint-1", createdAt: timestamp, status: "checkpoint", snapshot: {} });
    await browserDatabase.table("credentialVault").put({ name: "dropbox", nonce: "secret-nonce", ciphertext: "secret-ciphertext", updatedAt: timestamp });
    await browserDatabase.table("credentialVaultMeta").put({ id: "credential-vault", salt: "secret-salt", checkNonce: "secret-check", checkCiphertext: "secret-proof" });
    await browserDatabase.table("diagnostics").put({ id: "diagnostic-1", timestamp, subsystem: "backup", operation: "restore", outcome: "failure", failureCategory: "test", recoveryResult: "none", appVersion: "test", schemaVersion: 1 });

    const snapshot = await exportBrowserSnapshot("0.1.0");
    expect(snapshot.data.records.map((row: any) => row.id)).toEqual(expect.arrayContaining([
      "portable-business-record", "work:selected-driver", "identity:driver-person-link:driver-1",
    ]));
    expect(snapshot.data.records).toHaveLength(3);
    const canonical = toCanonicalBackupSnapshotV1(snapshot.data, snapshot.manifest as never);
    expect(canonical.records.map(row => row.id)).toContain("portable-business-record");
    expect(canonical.records.map(row => row.id)).not.toEqual(expect.arrayContaining([
      "work:selected-driver", "identity:driver-person-link:driver-1",
    ]));
    const serialized = JSON.stringify(canonical);
    for (const secret of ["secret-nonce", "secret-ciphertext", "secret-salt", "secret-proof", "diagnostic-1", "checkpoint-1", "restore-1", "Local only"]) {
      expect(serialized).not.toContain(secret);
    }
    expect(await browserDatabase.table("credentialVault").count()).toBe(1);
    expect(await browserDatabase.table("diagnostics").count()).toBe(1);
  });


});
