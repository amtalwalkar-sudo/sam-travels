import {
  validateFeatureExtensionUpgrade,
  initializeRuntimeRegistry,
  runFeatureMigrationsAtomically,
  type FeatureMigrationHandler,
  type FeatureMigrationTransaction,
  type FeatureExtensionCompatibilitySnapshot,
  type RuntimeContractDefinitions,
} from "../../core/src/index";

export type FeatureExtensionUpgradeTransaction<Context> = FeatureMigrationTransaction<{
  migrationContext: Context;
  /** Persist the installed extension snapshot/version in the same store transaction. */
  persistInstalledExtension(snapshot: FeatureExtensionCompatibilitySnapshot): Promise<void>;
}>;

/**
 * Application upgrade boundary: validates the old/new public contracts and the
 * complete next runtime registry before opening the authoritative transaction.
 * Schema migrations and installed-version publication then commit or roll back
 * together through the supplied store transaction adapter.
 */
export class FeatureExtensionUpgradeCoordinator {
  async apply<Context>(input: {
    previous: FeatureExtensionCompatibilitySnapshot;
    next: FeatureExtensionCompatibilitySnapshot;
    nextRuntimeDefinitions: RuntimeContractDefinitions;
    currentSchemaVersion: number;
    handlers: Readonly<Record<string, FeatureMigrationHandler<Context>>>;
    transaction: FeatureExtensionUpgradeTransaction<Context>;
  }): Promise<number> {
    validateFeatureExtensionUpgrade(input.previous, input.next);
    const nextRegistry = initializeRuntimeRegistry(input.nextRuntimeDefinitions);
    const registered = nextRegistry.extensions.get(input.next.extension.id);
    if (!registered || registered.version !== input.next.extension.version ||
        registered.featureId !== input.next.extension.featureId) {
      throw new Error("feature_extension_upgrade_registry_mismatch");
    }
    const feature = nextRegistry.features.get(input.next.feature.id);
    if (!feature || feature.contractVersion !== input.next.feature.contractVersion) {
      throw new Error("feature_extension_upgrade_feature_mismatch");
    }

    const transaction: FeatureMigrationTransaction<Context> = {
      run: operation => input.transaction.run(async context => {
        const version = await operation(context.migrationContext);
        await context.persistInstalledExtension(input.next);
        return version;
      }),
    };
    return runFeatureMigrationsAtomically(
      feature,
      input.currentSchemaVersion,
      input.handlers,
      transaction,
    );
  }
}
