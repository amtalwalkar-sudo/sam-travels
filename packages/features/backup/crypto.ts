import type { SnapshotManifest } from "../../core/src/backup";

/**
 * backup-encryption-v1 package cryptography.
 *
 * Argon2id is deliberately injected: the caller must provide a reviewed,
 * platform-compatible Argon2id implementation. There is no PBKDF2 or
 * device-keystore fallback. Dropbox must only ever receive BackupPackage.
 */
export const BACKUP_ENCRYPTION_VERSION = "backup-encryption-v1" as const;
export const ARGON2ID_PARAMETERS = {
  memoryKiB: 65_536,
  iterations: 3,
  parallelism: 1,
  hashLength: 32,
} as const;

export interface Argon2idProvider {
  deriveKey(input: {
    passphrase: string;
    salt: Uint8Array;
    parameters: typeof ARGON2ID_PARAMETERS;
  }): Promise<Uint8Array>;
}

export interface BackupManifest extends SnapshotManifest {
  format: typeof BACKUP_ENCRYPTION_VERSION;
  plaintextSha256: string;
}

export interface WrappedKey {
  algorithm: "AES-256-GCM";
  nonce: string;
  ciphertext: string;
}

export interface BackupPackage {
  manifest: BackupManifest;
  payload: {
    algorithm: "AES-256-GCM";
    nonce: string;
    ciphertext: string;
  };
  keyEnvelopes: {
    passphrase: {
      kdf: "Argon2id";
      salt: string;
      parameters: typeof ARGON2ID_PARAMETERS;
      wrappedDek: WrappedKey;
    };
    recovery: {
      algorithm: "AES-256-GCM";
      wrappedDek: WrappedKey;
    };
  };
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const bytes = (value: Uint8Array) => value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
const toBase64 = (value: Uint8Array) => {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
};
const fromBase64 = (value: string) => {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
};
const randomBytes = (length: number) => {
  const result = new Uint8Array(length);
  crypto.getRandomValues(result);
  return result;
};
export function generateBackupRecoveryKey(): string {
  return toBase64(randomBytes(32));
}
const digest = async (value: Uint8Array) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", bytes(value)));
const aadFor = (manifest: BackupManifest) => encoder.encode(JSON.stringify(manifest));
const importAesKey = (raw: Uint8Array) =>
  crypto.subtle.importKey("raw", bytes(raw), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
const encrypt = async (key: CryptoKey, plaintext: Uint8Array, aad: Uint8Array) => {
  const nonce = randomBytes(12);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: bytes(nonce), additionalData: bytes(aad), tagLength: 128 },
    key,
    bytes(plaintext),
  ));
  return { algorithm: "AES-256-GCM" as const, nonce: toBase64(nonce), ciphertext: toBase64(ciphertext) };
};
const decrypt = async (key: CryptoKey, wrapped: WrappedKey, aad: Uint8Array) =>
  new Uint8Array(await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes(fromBase64(wrapped.nonce)), additionalData: bytes(aad), tagLength: 128 },
    key,
    bytes(fromBase64(wrapped.ciphertext)),
  ));

function validateManifest(manifest: BackupManifest): void {
  if (manifest.format !== BACKUP_ENCRYPTION_VERSION) throw new Error("backup_unsupported_format");
  if (!Number.isSafeInteger(manifest.schemaVersion) || manifest.schemaVersion < 1) throw new Error("backup_invalid_schema");
  if (!Number.isSafeInteger(manifest.snapshotRevision) || manifest.snapshotRevision < 0) throw new Error("backup_invalid_revision");
  if (!Number.isFinite(Date.parse(manifest.createdAt)) || !manifest.applicationVersion || !manifest.businessTimezone) {
    throw new Error("backup_invalid_manifest");
  }
  for (const count of Object.values(manifest.recordCounts)) {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("backup_invalid_record_count");
  }
}

function validatePackageShape(pkg: BackupPackage): void {
  validateManifest(pkg.manifest);
  if (pkg.payload?.algorithm !== "AES-256-GCM" || pkg.keyEnvelopes?.passphrase?.kdf !== "Argon2id" ||
      pkg.keyEnvelopes?.recovery?.algorithm !== "AES-256-GCM") throw new Error("backup_invalid_envelope");
  if (pkg.keyEnvelopes.passphrase.parameters.memoryKiB !== ARGON2ID_PARAMETERS.memoryKiB ||
      pkg.keyEnvelopes.passphrase.parameters.iterations !== ARGON2ID_PARAMETERS.iterations ||
      pkg.keyEnvelopes.passphrase.parameters.parallelism !== ARGON2ID_PARAMETERS.parallelism ||
      pkg.keyEnvelopes.passphrase.parameters.hashLength !== ARGON2ID_PARAMETERS.hashLength) {
    throw new Error("backup_unsupported_kdf_parameters");
  }
}

export async function createEncryptedBackup(input: {
  plaintext: Uint8Array;
  manifest: SnapshotManifest;
  passphrase: string;
  recoveryKey?: string;
  argon2id: Argon2idProvider;
}): Promise<{ backup: BackupPackage; recoveryKey: string }> {
  if (input.passphrase.length < 12) throw new Error("backup_passphrase_too_short");
  const recoveryBytes = input.recoveryKey ? fromBase64(input.recoveryKey) : randomBytes(32);
  if (recoveryBytes.length !== 32) throw new Error("backup_invalid_recovery_key");
  const salt = randomBytes(16);
  const dekBytes = randomBytes(32);
  const manifest: BackupManifest = {
    ...input.manifest,
    format: BACKUP_ENCRYPTION_VERSION,
    plaintextSha256: toBase64(await digest(input.plaintext)),
  };
  validateManifest(manifest);
  const aad = aadFor(manifest);
  const [passphraseKeyBytes, recoveryKey] = await Promise.all([
    input.argon2id.deriveKey({ passphrase: input.passphrase, salt, parameters: ARGON2ID_PARAMETERS }),
    importAesKey(recoveryBytes),
  ]);
  if (passphraseKeyBytes.length !== 32) throw new Error("backup_argon2id_invalid_key_length");
  const passphraseKey = await importAesKey(passphraseKeyBytes);
  const dek = await importAesKey(dekBytes);
  const [payload, passphraseWrapped, recoveryWrapped] = await Promise.all([
    encrypt(dek, input.plaintext, aad),
    encrypt(passphraseKey, dekBytes, aad),
    encrypt(recoveryKey, dekBytes, aad),
  ]);
  passphraseKeyBytes.fill(0);
  dekBytes.fill(0);
  const exportedRecoveryKey = toBase64(recoveryBytes);
  recoveryBytes.fill(0);
  return {
    backup: {
      manifest,
      payload,
      keyEnvelopes: {
        passphrase: {
          kdf: "Argon2id",
          salt: toBase64(salt),
          parameters: ARGON2ID_PARAMETERS,
          wrappedDek: passphraseWrapped,
        },
        recovery: { algorithm: "AES-256-GCM", wrappedDek: recoveryWrapped },
      },
    },
    recoveryKey: exportedRecoveryKey,
  };
}

async function decryptWithKey(pkg: BackupPackage, key: CryptoKey): Promise<Uint8Array> {
  const aad = aadFor(pkg.manifest);
  const dekBytes = await decrypt(key, pkg.keyEnvelopes.passphrase.wrappedDek, aad);
  try {
    const dek = await importAesKey(dekBytes);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes(fromBase64(pkg.payload.nonce)), additionalData: bytes(aad), tagLength: 128 },
      dek,
      bytes(fromBase64(pkg.payload.ciphertext)),
    );
    const result = new Uint8Array(plaintext);
    const actualDigest = toBase64(await digest(result));
    if (actualDigest !== pkg.manifest.plaintextSha256) throw new Error("backup_integrity_mismatch");
    return result;
  } finally {
    dekBytes.fill(0);
  }
}

export async function decryptBackupWithPassphrase(
  pkg: BackupPackage,
  passphrase: string,
  argon2id: Argon2idProvider,
): Promise<Uint8Array> {
  validatePackageShape(pkg);
  const keyBytes = await argon2id.deriveKey({
    passphrase,
    salt: fromBase64(pkg.keyEnvelopes.passphrase.salt),
    parameters: ARGON2ID_PARAMETERS,
  });
  if (keyBytes.length !== 32) throw new Error("backup_argon2id_invalid_key_length");
  try {
    return await decryptWithKey(pkg, await importAesKey(keyBytes));
  } finally {
    keyBytes.fill(0);
  }
}

export async function decryptBackupWithRecoveryKey(
  pkg: BackupPackage,
  recoveryKey: string,
): Promise<Uint8Array> {
  validatePackageShape(pkg);
  const aad = aadFor(pkg.manifest);
  const recoveryBytes = fromBase64(recoveryKey);
  if (recoveryBytes.length !== 32) throw new Error("backup_invalid_recovery_key");
  const key = await importAesKey(recoveryBytes);
  recoveryBytes.fill(0);
  const dekBytes = await decrypt(key, pkg.keyEnvelopes.recovery.wrappedDek, aad);
  try {
    const dek = await importAesKey(dekBytes);
    const plaintext = new Uint8Array(await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes(fromBase64(pkg.payload.nonce)), additionalData: bytes(aad), tagLength: 128 },
      dek,
      bytes(fromBase64(pkg.payload.ciphertext)),
    ));
    if (toBase64(await digest(plaintext)) !== pkg.manifest.plaintextSha256) throw new Error("backup_integrity_mismatch");
    return plaintext;
  } finally {
    dekBytes.fill(0);
  }
}

export function serializeBackupPackage(pkg: BackupPackage): Uint8Array {
  validatePackageShape(pkg);
  return encoder.encode(JSON.stringify(pkg));
}

export function parseBackupPackage(serialized: Uint8Array): BackupPackage {
  if (serialized.byteLength > 512 * 1024 * 1024) throw new Error("backup_package_too_large");
  const parsed = JSON.parse(decoder.decode(serialized)) as BackupPackage;
  validatePackageShape(parsed);
  return parsed;
}
