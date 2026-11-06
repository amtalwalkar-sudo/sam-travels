import {
  FeatureExtensionUpgradeCoordinator,
  type FeatureMigrationHandler,
} from "../../../packages/application/src";
import type {
  FeatureExtensionCompatibilitySnapshot,
} from "../../../packages/core/src/feature-compatibility";
import type { RuntimeContractDefinitions } from "../../../packages/core/src/runtime-registry";
import {
  DexieFeatureExtensionUpgradeTransaction,
  type BrowserFeatureMigrationContext,
} from "../../../packages/storage-browser/src";

/**
 * Installed-extension update entry point for the browser application.
 * Call this from the extension installer/update flow; compatibility preflight,
 * feature migrations and installed-version publication execute atomically in
 * the authoritative IndexedDB records transaction.
 */
export async function upgradeInstalledBrowserFeatureExtension(input: {
  previous: FeatureExtensionCompatibilitySnapshot;
  next: FeatureExtensionCompatibilitySnapshot;
  nextRuntimeDefinitions: RuntimeContractDefinitions;
  currentSchemaVersion: number;
  handlers: Readonly<Record<string, FeatureMigrationHandler<BrowserFeatureMigrationContext>>>;
}): Promise<number> {
  return new FeatureExtensionUpgradeCoordinator().apply({
    ...input,
    transaction: new DexieFeatureExtensionUpgradeTransaction(),
  });
}
