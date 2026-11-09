import { Capacitor } from "@capacitor/core";
import { DropboxBackupClient } from "../../../packages/features/backup";
import { createPlatformRepository } from "./native-store";
import { BrowserCredentialVault } from "./browser-secure-vault";
import { createCredentialVault } from "./secure-vault";

export interface DropboxBackupSession {
  client: DropboxBackupClient;
  native: boolean;
  lock(): void;
}

/** Public Dropbox OAuth client configuration; never a Dropbox password or secret. */
export const DROPBOX_CLIENT_ID = import.meta.env.VITE_DROPBOX_CLIENT_ID || "562zfpfzsqx60x";

/** Create Dropbox integration with Android Keystore or a managed encrypted browser vault. */
export async function createDropboxBackupSession(configuration: {
  clientId?: string;
  redirectUri?: string;
} = {}): Promise<DropboxBackupSession> {
  const clientId = configuration.clientId?.trim() || DROPBOX_CLIENT_ID;
  const redirectUri = configuration.redirectUri?.trim() || defaultDropboxRedirectUri();
  if (!clientId || !redirectUri) throw new Error("dropbox_oauth_configuration_required");

  const repository = await createPlatformRepository();
  const vault = createCredentialVault();
  if (vault instanceof BrowserCredentialVault) {
    await vault.unlockAutomatically();
  }
  return {
    client: new DropboxBackupClient(repository, vault, clientId, redirectUri),
    native: Capacitor.isNativePlatform(),
    lock: () => {
      if (vault instanceof BrowserCredentialVault) vault.lock();
    },
  };
}

/** Use the registered custom-scheme callback in Android and current PWA origin/path in browsers. */
export function defaultDropboxRedirectUri(): string {
  if (Capacitor.isNativePlatform()) return "samtravels://oauth";
  return typeof window === "undefined" ? "" : window.location.origin + window.location.pathname;
}
