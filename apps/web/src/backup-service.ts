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

/** Create Dropbox integration with Android Keystore or an unlocked passphrase-encrypted browser vault. */
export async function createDropboxBackupSession(configuration: {
  clientId: string;
  redirectUri: string;
  browserVaultPassphrase?: string;
}): Promise<DropboxBackupSession> {
  const repository = await createPlatformRepository();
  const vault = createCredentialVault();
  if (vault instanceof BrowserCredentialVault) {
    if (!configuration.browserVaultPassphrase) throw new Error("browser_credential_vault_unlock_required");
    await vault.unlock(configuration.browserVaultPassphrase);
  }
  return {
    client: new DropboxBackupClient(repository, vault, configuration.clientId, configuration.redirectUri),
    native: Capacitor.isNativePlatform(),
    lock: () => {
      if (vault instanceof BrowserCredentialVault) vault.lock();
    },
  };
}
