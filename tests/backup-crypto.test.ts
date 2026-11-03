import { describe, expect, it } from "vitest";
import {
  ARGON2ID_PARAMETERS,
  createEncryptedBackup,
  decryptBackupWithPassphrase,
  decryptBackupWithRecoveryKey,
  parseBackupPackage,
  serializeBackupPackage,
  type Argon2idProvider,
} from "../packages/features/backup";

const testKdf: Argon2idProvider = {
  async deriveKey({ passphrase, salt, parameters }) {
    // Deterministic test double only. Production must inject a real Argon2id provider.
    const material = new TextEncoder().encode(passphrase + ":" + Array.from(salt).join(",") + ":" + parameters.memoryKiB);
    return new Uint8Array(await crypto.subtle.digest("SHA-256", material));
  },
};

const manifest = {
  applicationVersion: "0.1.0",
  schemaVersion: 2,
  createdAt: "2026-11-04T00:00:00.000Z",
  businessTimezone: "Asia/Kolkata",
  snapshotRevision: 7,
  recordCounts: { records: 3, driverEvents: 2 },
};

describe("backup-encryption-v1", () => {
  it("round-trips with either independent recovery method", async () => {
    const plaintext = new TextEncoder().encode('{"records":[1,2,3]}');
    const { backup, recoveryKey } = await createEncryptedBackup({ plaintext, manifest, passphrase: "correct horse battery", argon2id: testKdf });
    const serialized = serializeBackupPackage(backup);
    const parsed = parseBackupPackage(serialized);
    expect(new TextDecoder().decode(await decryptBackupWithPassphrase(parsed, "correct horse battery", testKdf))).toBe(new TextDecoder().decode(plaintext));
    expect(new TextDecoder().decode(await decryptBackupWithRecoveryKey(parsed, recoveryKey))).toBe(new TextDecoder().decode(plaintext));
    expect(ARGON2ID_PARAMETERS.memoryKiB).toBe(65536);
  });

  it("rejects wrong passphrases and tampered authenticated payloads", async () => {
    const { backup } = await createEncryptedBackup({ plaintext: new TextEncoder().encode("sensitive"), manifest, passphrase: "correct horse battery", argon2id: testKdf });
    await expect(decryptBackupWithPassphrase(backup, "incorrect passphrase", testKdf)).rejects.toBeTruthy();
    const tampered = structuredClone(backup);
    tampered.manifest.snapshotRevision += 1;
    await expect(decryptBackupWithPassphrase(tampered, "correct horse battery", testKdf)).rejects.toBeTruthy();
  });
});
