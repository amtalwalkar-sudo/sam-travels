import { describe, expect, it } from "vitest";
import tsFixture from "../fixtures/typescript-backup-v2.json";
import fixture from "../fixtures/native-backup-v2.json";
import { decryptBackupWithRecoveryKey, parseBackupPackage } from "../packages/features/backup";

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


describe("TypeScript backup-encryption-v2 package fixture", () => {
  it("decrypts the recovery-only package shared with Android", async () => {
    const parsed = parseBackupPackage(new TextEncoder().encode(JSON.stringify(tsFixture.backup)));
    const plaintext = await decryptBackupWithRecoveryKey(parsed, tsFixture.recoveryKey);
    expect(new TextDecoder().decode(plaintext)).toBe(tsFixture.expectedPlaintext);
  });
});
