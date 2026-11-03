import { describe, expect, it } from "vitest";
import fixture from "../fixtures/native-backup-v2.json";
import { decryptBackupWithRecoveryKey, parseBackupPackage } from "../packages/features/backup";

describe("native backup-encryption-v2 interoperability", () => {
  it("restores the shared Android-generated package through the TypeScript restore path", async () => {
    const serialized = new TextEncoder().encode(JSON.stringify(fixture.backup));
    const parsed = parseBackupPackage(serialized);
    const plaintext = await decryptBackupWithRecoveryKey(parsed, fixture.recoveryKey);

    expect(new TextDecoder().decode(plaintext)).toBe(
      """{"records":[{"id":"driver-state","json":"{}","schemaVersion":1,"updatedAt":"2026-11-04T00:00:00.000Z"}],"snapshotRevision":7,"schemaVersion":1}""",
    );
    expect(parsed.manifest.format).toBe("backup-encryption-v2");
    expect(parsed.keyEnvelopes.passphrase).toBeUndefined();
  });
});
