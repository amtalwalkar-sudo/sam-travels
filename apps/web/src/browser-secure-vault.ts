import type { CredentialVault } from "../../../packages/core/src/credentials";
import { ARGON2ID_PARAMETERS, HashWasmArgon2idProvider } from "../../../packages/features/backup";
import { browserDatabase } from "../../../packages/storage-browser/src/database";

type VaultRow = { name: string; nonce: string; ciphertext: string; updatedAt: string };
type LegacyVaultMeta = { id: "credential-vault"; salt: string; checkNonce: string; checkCiphertext: string };
type ManagedVaultMeta = { id: "credential-vault"; version: 2; key: CryptoKey };
type VaultMeta = LegacyVaultMeta | ManagedVaultMeta;
const META_ID = "credential-vault";
const CHECK_NAME = "sam-travels-browser-vault-check-v1";
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const toBytes = (value: Uint8Array) => value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
const encode = (value: Uint8Array) => {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
};
const decode = (value: string) => Uint8Array.from(atob(value), character => character.charCodeAt(0));
const random = (length: number) => {
  const value = new Uint8Array(length);
  crypto.getRandomValues(value);
  return value;
};
const table = () => browserDatabase.table("credentialVault");
const metaTable = () => browserDatabase.table("credentialVaultMeta");

/**
 * Browser credentials are encrypted with a non-extractable WebCrypto key
 * persisted by IndexedDB. This removes an extra setup password from the
 * Dropbox sign-in flow. It protects stored bytes at rest, but is not a
 * substitute for OS-backed storage: same-origin script executing in an
 * unlocked session can still request decryption.
 *
 * Legacy passphrase-encrypted vaults remain readable through unlock().
 */
export class BrowserCredentialVault implements CredentialVault {
  private key?: CryptoKey;
  private readonly kdf = new HashWasmArgon2idProvider();

  async unlockAutomatically(): Promise<void> {
    let meta = await metaTable().get(META_ID) as VaultMeta | undefined;
    if (meta) {
      if ("version" in meta && meta.version === 2 && meta.key) {
        this.key = meta.key;
        return;
      }
      throw new Error("browser_credential_vault_legacy_unlock_required");
    }

    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    const candidate: ManagedVaultMeta = { id: META_ID, version: 2, key };
    try {
      await metaTable().add(candidate);
      this.key = key;
    } catch {
      meta = await metaTable().get(META_ID) as VaultMeta | undefined;
      if (meta && "version" in meta && meta.version === 2 && meta.key) {
        this.key = meta.key;
        return;
      }
      throw new Error("browser_credential_vault_initialization_failed");
    }
  }

  /** Compatibility unlock for browser vaults created by earlier app versions. */
  async unlock(passphrase: string): Promise<void> {
    if (passphrase.length < 12) throw new Error("credential_vault_passphrase_too_short");
    let meta = await metaTable().get(META_ID) as VaultMeta | undefined;
    if (meta && "version" in meta && meta.version === 2) {
      this.key = meta.key;
      return;
    }
    if (!meta) {
      const salt = random(16);
      const key = await this.derive(passphrase, salt);
      const wrapped = await this.encrypt(key, encoder.encode(CHECK_NAME), encoder.encode(CHECK_NAME));
      const candidate: LegacyVaultMeta = {
        id: META_ID,
        salt: encode(salt),
        checkNonce: wrapped.nonce,
        checkCiphertext: wrapped.ciphertext,
      };
      try {
        await metaTable().add(candidate);
        this.key = key;
        return;
      } catch {
        meta = await metaTable().get(META_ID) as VaultMeta | undefined;
        if (!meta || "version" in meta) throw new Error("credential_vault_initialization_failed");
      }
    }
    if ("version" in meta) {
      this.key = meta.key;
      return;
    }
    const key = await this.derive(passphrase, decode(meta.salt));
    try {
      const check = await this.decrypt(key, meta.checkNonce, meta.checkCiphertext, encoder.encode(CHECK_NAME));
      if (decoder.decode(check) !== CHECK_NAME) throw new Error("credential_vault_unlock_failed");
      this.key = key;
    } catch {
      this.key = undefined;
      throw new Error("credential_vault_unlock_failed");
    }
  }

  lock(): void {
    this.key = undefined;
  }

  private async derive(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
    const raw = await this.kdf.deriveKey({ passphrase, salt, parameters: ARGON2ID_PARAMETERS });
    try {
      return await crypto.subtle.importKey("raw", toBytes(raw), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    } finally {
      raw.fill(0);
    }
  }

  private requireKey(): CryptoKey {
    if (!this.key) throw new Error("credential_vault_locked");
    return this.key;
  }

  private async encrypt(key: CryptoKey, plaintext: Uint8Array, aad: Uint8Array): Promise<{ nonce: string; ciphertext: string }> {
    const nonce = random(12);
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toBytes(nonce), additionalData: toBytes(aad), tagLength: 128 },
      key,
      toBytes(plaintext),
    ));
    return { nonce: encode(nonce), ciphertext: encode(ciphertext) };
  }

  private async decrypt(key: CryptoKey, nonce: string, ciphertext: string, aad: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toBytes(decode(nonce)), additionalData: toBytes(aad), tagLength: 128 },
      key,
      toBytes(decode(ciphertext)),
    ));
  }

  async get(name: string): Promise<string | undefined> {
    const row = await table().get(name) as VaultRow | undefined;
    if (!row) return undefined;
    const plaintext = await this.decrypt(this.requireKey(), row.nonce, row.ciphertext, encoder.encode(name));
    return decoder.decode(plaintext);
  }

  async set(name: string, value: string): Promise<void> {
    if (!name.trim()) throw new Error("credential_vault_name_required");
    const encrypted = await this.encrypt(this.requireKey(), encoder.encode(value), encoder.encode(name));
    await table().put({ name, ...encrypted, updatedAt: new Date().toISOString() } satisfies VaultRow);
  }

  async remove(name: string): Promise<void> {
    await table().delete(name);
  }
}
