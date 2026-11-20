import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { registerVehicleBrowserBackupParticipant } from "../apps/web/src/vehicle-backup";
import { createBackupForCurrentRuntime, restoreBackupForCurrentRuntime } from "../apps/web/src/backup-runtime";
import tsFixture from "../fixtures/cross-platform-backup-v2.json";
import fixture from "../fixtures/native-backup-v2.json";
import { createEncryptedBackup, decryptBackupWithRecoveryKey, parseBackupPackage } from "../packages/features/backup";

describe("native backup-encryption-v2 interoperability", () => {
  it("decrypts and validates the Android-generated v2 package in TypeScript (without restoring a snapshot)", async () => {
    const serialized = new TextEncoder().encode(JSON.stringify(fixture.backup));
    const parsed = parseBackupPackage(serialized);
    const plaintext = await decryptBackupWithRecoveryKey(parsed, fixture.recoveryKey);

    expect(new TextDecoder().decode(plaintext)).toBe(
      `{"records":[{"id":"driver-state","json":"{}","schemaVersion":1,"updatedAt":"2026-11-04T00:00:00.000Z"}],"snapshotRevision":7,"schemaVersion":1}`,
    );
    expect(parsed.manifest.format).toBe("backup-encryption-v2");
    expect(parsed.keyEnvelopes.passphrase).toBeUndefined();
  });
});


describe("cross-runtime encryption writer parity", () => {
  it("matches the Android v2 writer package with the same deterministic test entropy", async () => {
    const plaintext = new TextEncoder().encode(
      `{"records":[{"id":"driver-state","json":"{}","schemaVersion":1,"updatedAt":"2026-11-04T00:00:00.000Z"}],"snapshotRevision":7,"schemaVersion":1}`,
    );
    const recoveryKey = fixture.recoveryKey;
    const manifest = {
      applicationVersion: "0.1.0",
      schemaVersion: 1,
      createdAt: "2026-11-04T00:00:00.000Z",
      businessTimezone: "Asia/Kolkata",
      snapshotRevision: 7,
      recordCounts: { records: 1 },
    };
    // createEncryptedBackup requests salt, DEK, payload nonce and wrapped-key
    // nonce in that order. Salt is unused for recovery-only v2 packages.
    const deterministicEntropy = new Uint8Array([
      ...Array.from({ length: 16 }, (_, index) => 65 + index),
      ...Array.from({ length: 32 }, (_, index) => 33 + index),
      ...Array.from({ length: 12 }, (_, index) => 1 + index),
      ...Array.from({ length: 12 }, (_, index) => 13 + index),
    ]);
    let offset = 0;
    const random = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((target) => {
      const bytes = new Uint8Array(target.buffer, target.byteOffset, target.byteLength);
      bytes.set(deterministicEntropy.subarray(offset, offset + bytes.length));
      offset += bytes.length;
      return target;
    });
    try {
      const generated = await createEncryptedBackup({
        plaintext, manifest, mode: "recovery-key-only", recoveryKey,
      });
      expect(generated.backup).toEqual(fixture.backup);
      expect(offset).toBe(deterministicEntropy.length);
    } finally {
      random.mockRestore();
    }
  });
});

describe("TypeScript backup-encryption-v2 package fixture", () => {
  it("decrypts the recovery-only package shared with Android", async () => {
    const parsed = parseBackupPackage(new TextEncoder().encode(JSON.stringify(tsFixture.backup)));
    const plaintext = await decryptBackupWithRecoveryKey(parsed, tsFixture.recoveryKey);
    expect(new TextDecoder().decode(plaintext)).toBe(tsFixture.expectedPlaintext);
  });
});

describe("encrypted package production restore integration", () => {
  let unregisterVehicle: (() => void) | undefined;

  beforeEach(async () => {
    unregisterVehicle = registerVehicleBrowserBackupParticipant();
    await browserDatabase.delete();
    await browserDatabase.open();
  });

  afterEach(() => {
    unregisterVehicle?.();
    unregisterVehicle = undefined;
  });

  it("restores a TypeScript-produced v2 package through the production Browser coordinator and rejects failures before checkpointing", async () => {
    const timestamp = "2026-11-20T08:00:00.000Z";
    await browserDatabase.records.put({
      id: "synthetic-interoperability-source",
      schemaVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      source: "web",
      revision: 1,
      data: { value: "source-snapshot" },
    });

    const { backup, recoveryKey } = await createBackupForCurrentRuntime({
      applicationVersion: "0.1.0",
      recoveryKey: "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=",
    });
    await browserDatabase.records.put({
      id: "synthetic-interoperability-source",
      schemaVersion: 1,
      createdAt: timestamp,
      updatedAt: "2026-11-20T08:01:00.000Z",
      source: "web",
      revision: 2,
      data: { value: "destination-must-survive-rejection" },
    });
    await browserDatabase.records.put({
      id: "destination-only-sentinel",
      schemaVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      source: "web",
      revision: 1,
      data: { value: "unchanged-until-authenticated" },
    });

    const wrongKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    await expect(restoreBackupForCurrentRuntime({
      backup, secret: { recoveryKey: wrongKey }, confirmed: true,
    })).rejects.toBeDefined();
    expect((await browserDatabase.records.get("synthetic-interoperability-source"))?.data.value)
      .toBe("destination-must-survive-rejection");
    expect(await browserDatabase.table("backupCheckpoints").count()).toBe(0);

    const alteredPayload = {
      ...backup,
      payload: { ...backup.payload, ciphertext: "AA==" },
    };
    await expect(restoreBackupForCurrentRuntime({
      backup: alteredPayload, secret: { recoveryKey }, confirmed: true,
    })).rejects.toBeDefined();
    expect((await browserDatabase.records.get("synthetic-interoperability-source"))?.data.value)
      .toBe("destination-must-survive-rejection");
    expect(await browserDatabase.table("backupCheckpoints").count()).toBe(0);

    const alteredManifest = {
      ...backup,
      manifest: { ...backup.manifest, snapshotRevision: backup.manifest.snapshotRevision + 1 },
    };
    await expect(restoreBackupForCurrentRuntime({
      backup: alteredManifest, secret: { recoveryKey }, confirmed: true,
    })).rejects.toBeDefined();
    expect((await browserDatabase.records.get("destination-only-sentinel"))?.data.value)
      .toBe("unchanged-until-authenticated");
    expect(await browserDatabase.table("backupCheckpoints").count()).toBe(0);

    const restored = await restoreBackupForCurrentRuntime({
      backup, secret: { recoveryKey }, confirmed: true,
    });
    expect(restored.restoredCount).toBeGreaterThan(0);
    expect((await browserDatabase.records.get("synthetic-interoperability-source"))?.data.value)
      .toBe("source-snapshot");
    expect(await browserDatabase.records.get("destination-only-sentinel")).toBeUndefined();
    expect(await browserDatabase.table("backupCheckpoints").get(restored.checkpointId))
      .toMatchObject({ status: "restored_unverified" });
  });
});
