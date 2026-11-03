import { DropboxBackupClient } from "../../../packages/features/backup";
import { createPlatformRepository } from "./native-store";
import { BrowserCredentialVault } from "./browser-secure-vault";
import { createCredentialVault } from "./secure-vault";

/** Create Dropbox integration with Android Keystore or an unlocked passphrase-encrypted browser vault. */
export async function createDropboxBackupClient(configuration: {
  clientId: string;
  redirectUri: string;
  browserVaultPassphrase?: string;
}): Promise<DropboxBackupClient> {
  const repository = await createPlatformRepository();
  const vault = createCredentialVault();
  if (vault instanceof BrowserCredentialVault) {
    if (!configuration.browserVaultPassphrase) throw new Error("browser_credential_vault_unlock_required");
    await vault.unlock(configuration.browserVaultPassphrase);
  }
  return new DropboxBackupClient(repository, vault, configuration.clientId, configuration.redirectUri);
}
