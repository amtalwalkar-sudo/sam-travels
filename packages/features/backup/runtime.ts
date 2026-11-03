import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  createEncryptedBackup,
  decryptBackupWithPassphrase,
  parseBackupPackage,
  decryptBackupWithRecoveryKey,
  HashWasmArgon2idProvider,
  type BackupManifest,
  type BackupPackage,
} from "./crypto";
import {
  exportBrowserSnapshot,
  restoreBrowserSnapshot,
  listBrowserRecoveryCheckpoints,
  markBrowserRestoreVerified,
  discardVerifiedBrowserCheckpoint,
  type BrowserSnapshotData,
} from "./browser-snapshot";

type RoomSnapshot = { records: unknown[]; snapshotRevision: number; schemaVersion: number };
type RoomBackupApi = {
  exportSnapshot(): Promise<{ snapshot: RoomSnapshot; manifest: Omit<BackupManifest, "format" | "plaintextSha256"> }>;
  restoreSnapshot(input: { snapshot: RoomSnapshot; manifest: BackupManifest; confirmed: boolean }): Promise<{ checkpointId: string; restoredCount: number }>;
  listCheckpoints(): Promise<{ checkpoints: Array<{ id: string; createdAt: string; status: string }> }>;
  markRestoreVerified(input: { checkpointId: string }): Promise<void>;
  discardVerifiedCheckpoint(input: { checkpointId: string }): Promise<void>;
};
const NativeBackup = registerPlugin<RoomBackupApi>("Backup");

type RecoverySecret = { passphrase: string } | { recoveryKey: string };

function snapshotBytes(snapshot: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(snapshot));
}

/** Runtime adapter selects exactly one authoritative store: Room or IndexedDB. */
export async function createBackupForCurrentRuntime(input: {
  applicationVersion: string;
  passphrase: string;
}): Promise<{ backup: BackupPackage; recoveryKey: string }> {
  if (Capacitor.isNativePlatform()) {
    const { snapshot, manifest } = await NativeBackup.exportSnapshot();
    return createEncryptedBackup({
      plaintext: snapshotBytes(snapshot),
      manifest,
      passphrase: input.passphrase,
      argon2id: new HashWasmArgon2idProvider(),
    });
  }
  const { manifest, plaintext } = await exportBrowserSnapshot(input.applicationVersion);
  return createEncryptedBackup({
    plaintext,
    manifest,
    passphrase: input.passphrase,
    argon2id: new HashWasmArgon2idProvider(),
  });
}

/** Decrypt and validate before asking the authoritative store to checkpoint or replace data. */
export async function restoreBackupForCurrentRuntime(input: {
  backup: BackupPackage;
  secret: RecoverySecret;
  confirmed: boolean;
}): Promise<{ checkpointId: string; restoredCount: number }> {
  if (!input.confirmed) throw new Error("backup_restore_confirmation_required");
  const argon2id = new HashWasmArgon2idProvider();
  const plaintext = "passphrase" in input.secret
    ? await decryptBackupWithPassphrase(input.backup, input.secret.passphrase, argon2id)
    : await decryptBackupWithRecoveryKey(input.backup, input.secret.recoveryKey);
  const snapshot = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext)) as unknown;

  if (Capacitor.isNativePlatform()) {
    const result = await NativeBackup.restoreSnapshot({
      snapshot: snapshot as RoomSnapshot,
      manifest: input.backup.manifest,
      confirmed: true,
    });
    return { checkpointId: result.checkpointId, restoredCount: result.restoredCount };
  }

  const result = await restoreBrowserSnapshot({
    data: snapshot as BrowserSnapshotData,
    manifest: input.backup.manifest,
    confirmed: true,
  });
  return {
    checkpointId: result.checkpointId,
    restoredCount: Object.values(result.restoredCounts).reduce((total, count) => total + count, 0),
  };
}

export async function listRecoveryCheckpoints(): Promise<Array<{ id: string; createdAt: string; status: string }>> {
  if (Capacitor.isNativePlatform()) return (await NativeBackup.listCheckpoints()).checkpoints;
  return listBrowserRecoveryCheckpoints();
}

export async function markRestoreVerified(checkpointId: string): Promise<void> {
  if (Capacitor.isNativePlatform()) return NativeBackup.markRestoreVerified({ checkpointId });
  return markBrowserRestoreVerified(checkpointId);
}

export async function discardVerifiedRecoveryCheckpoint(checkpointId: string): Promise<void> {
  if (Capacitor.isNativePlatform()) return NativeBackup.discardVerifiedCheckpoint({ checkpointId });
  return discardVerifiedBrowserCheckpoint(checkpointId);
}

/** User-initiated encrypted upload. The passphrase is never persisted by this operation. */
export async function createAndUploadBackup(input: {
  applicationVersion: string;
  passphrase: string;
  dropbox: DropboxBackupClient;
}): Promise<{ filename: string; recoveryKey: string }> {
  const { backup, recoveryKey } = await createBackupForCurrentRuntime(input);
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const filename = "sam-travels-" + timestamp + "-" + crypto.randomUUID() + ".stbackup";
  await input.dropbox.uploadEncryptedBackup(backup, filename);
  return { filename, recoveryKey };
}

/** Restore always requires a user-supplied recovery secret and explicit confirmation. */
export async function restoreDropboxBackup(input: {
  path: string;
  secret: RecoverySecret;
  confirmed: boolean;
  dropbox: DropboxBackupClient;
}): Promise<{ checkpointId: string; restoredCount: number }> {
  if (!input.confirmed) throw new Error("backup_restore_confirmation_required");
  const bytes = await input.dropbox.downloadBackup(input.path);
  const backup = parseBackupPackage(bytes);
  return restoreBackupForCurrentRuntime({ backup, secret: input.secret, confirmed: true });
}
