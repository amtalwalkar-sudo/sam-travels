import { Capacitor } from "@capacitor/core";
import { CredentialVaultUnavailableError } from "../../../packages/core/src/credentials";
import { DropboxBackupClient } from "../../../packages/features/backup";
import { createPlatformRepository } from "./native-store";
import { createCredentialVault } from "./secure-vault";

/** Build Dropbox integration only when native secure credential storage is available. */
export async function createDropboxBackupClient(configuration: {
  clientId: string;
  redirectUri: string;
}): Promise<DropboxBackupClient> {
  if (!Capacitor.isNativePlatform()) throw new CredentialVaultUnavailableError();
  const repository = await createPlatformRepository();
  return new DropboxBackupClient(repository, createCredentialVault(), configuration.clientId, configuration.redirectUri);
}
