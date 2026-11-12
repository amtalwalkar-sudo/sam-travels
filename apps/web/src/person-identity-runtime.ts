import type { RecordEnvelope } from "../../../packages/core/src/types";
import type { AtomicRecordRepository } from "../../../packages/core/src/repositories";
import { PersonIdentityService } from "../../../packages/application/src/person-identity-service";
import { PersistentBusinessPersonRepository, SecureAdminPinVerifier } from "./person-identity-adapters";
import { createCredentialVault } from "./secure-vault";

let identityService: PersonIdentityService | undefined;

/** Bind durable identity and the platform secure credential vault at app bootstrap. */
export async function initializePersonIdentityRuntime(
  records: AtomicRecordRepository,
  source: RecordEnvelope<unknown>["source"],
): Promise<PersonIdentityService> {
  if (identityService) throw new Error("person_identity_runtime_already_initialized");
  const vault = createCredentialVault();
  // Browser vault uses a non-extractable WebCrypto key in IndexedDB; Android
  // delegates to the existing Android Keystore-backed SecureVault plugin.
  const unlockable = vault as typeof vault & { unlockAutomatically?: () => Promise<void> };
  await unlockable.unlockAutomatically?.();
  identityService = new PersonIdentityService(
    new PersistentBusinessPersonRepository(records, source),
    new SecureAdminPinVerifier(vault),
  );
  return identityService;
}

export function getPersonIdentityService(): PersonIdentityService {
  if (!identityService) throw new Error("person_identity_runtime_not_initialized");
  return identityService;
}
