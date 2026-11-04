import { describe, expect, it } from "vitest";
import {
  ARGON2ID_PARAMETERS,
  createEncryptedBackup,
  generateBackupRecoveryKey,
  decryptBackupWithPassphrase,
  decryptBackupWithRecoveryKey,
  parseBackupPackage,
  serializeBackupPackage,
  type Argon2idProvider,
  HashWasmArgon2idProvider,
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
  it("derives a 256-bit key with the production Argon2id provider", async () => {
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    const derived = await new HashWasmArgon2idProvider().deriveKey({ passphrase: "production KDF test", salt, parameters: ARGON2ID_PARAMETERS });
    expect(derived).toBeInstanceOf(Uint8Array);
    expect(derived.byteLength).toBe(32);
  });

  it("reuses one user recovery key across backup generations", async () => {
    const recoveryKey = generateBackupRecoveryKey();
    const first = await createEncryptedBackup({ plaintext: new TextEncoder().encode("first"), manifest, passphrase: "correct horse battery", recoveryKey, argon2id: testKdf });
    const second = await createEncryptedBackup({ plaintext: new TextEncoder().encode("second"), manifest, passphrase: "correct horse battery", recoveryKey, argon2id: testKdf });
    expect(first.recoveryKey).toBe(recoveryKey);
    expect(second.recoveryKey).toBe(recoveryKey);
    expect(new TextDecoder().decode(await decryptBackupWithRecoveryKey(second.backup, recoveryKey))).toBe("second");
  });

  it("round-trips with either independent recovery method", async () => {
    const plaintext = new TextEncoder().encode('{"records":[1,2,3]}');
    const { backup, recoveryKey } = await createEncryptedBackup({ plaintext, manifest, passphrase: "correct horse battery", argon2id: testKdf });
    const serialized = serializeBackupPackage(backup);
    const parsed = parseBackupPackage(serialized);
    expect(new TextDecoder().decode(await decryptBackupWithPassphrase(parsed, "correct horse battery", testKdf))).toBe(new TextDecoder().decode(plaintext));
    expect(new TextDecoder().decode(await decryptBackupWithRecoveryKey(parsed, recoveryKey))).toBe(new TextDecoder().decode(plaintext));
    expect(ARGON2ID_PARAMETERS.memoryKiB).toBe(65536);
  });


  it("creates a versioned recovery-key-only package without weakening legacy v1", async () => {
    const recoveryKey = generateBackupRecoveryKey();
    const plaintext = new TextEncoder().encode('{"background":"safe"}');
    const { backup } = await createEncryptedBackup({
      plaintext, manifest, mode: "recovery-key-only", recoveryKey,
    });
    expect(backup.manifest.format).toBe("backup-encryption-v2");
    expect(backup.keyEnvelopes.passphrase).toBeUndefined();
    const parsed = parseBackupPackage(serializeBackupPackage(backup));
    expect(new TextDecoder().decode(await decryptBackupWithRecoveryKey(parsed, recoveryKey))).toBe(new TextDecoder().decode(plaintext));
    await expect(decryptBackupWithRecoveryKey(parsed, generateBackupRecoveryKey())).rejects.toBeTruthy();
    await expect(decryptBackupWithPassphrase(parsed, "any passphrase", testKdf)).rejects.toThrow("backup_passphrase_not_available");
  });

  it("requires an explicitly supplied recovery key for unattended packages", async () => {
    await expect(createEncryptedBackup({
      plaintext: new TextEncoder().encode("no implicit key"), manifest, mode: "recovery-key-only",
    })).rejects.toThrow("backup_recovery_key_required");
  });

  it("rejects wrong passphrases and tampered authenticated payloads", async () => {
    const { backup } = await createEncryptedBackup({ plaintext: new TextEncoder().encode("sensitive"), manifest, passphrase: "correct horse battery", argon2id: testKdf });
    await expect(decryptBackupWithPassphrase(backup, "incorrect passphrase", testKdf)).rejects.toBeTruthy();
    const tampered = structuredClone(backup);
    tampered.manifest.snapshotRevision += 1;
    await expect(decryptBackupWithPassphrase(tampered, "correct horse battery", testKdf)).rejects.toBeTruthy();
  });
});
