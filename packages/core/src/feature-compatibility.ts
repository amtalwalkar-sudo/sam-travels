import type { FeatureDefinition } from "./features";
import type { FeatureExtensionDefinition } from "./feature-extension";

export type FeatureExtensionCompatibilitySnapshot = Readonly<{
  extension: FeatureExtensionDefinition;
  feature: FeatureDefinition;
}>;

function assertMonotonicContract(
  label: string,
  previousVersion: number,
  nextVersion: number,
): void {
  if (!Number.isSafeInteger(nextVersion) || nextVersion < previousVersion) {
    throw new Error(label + " version cannot decrease");
  }
}

function indexById<T extends { id: string }>(items: readonly T[], label: string): Map<string, T> {
  const indexed = new Map<string, T>();
  for (const item of items) {
    if (indexed.has(item.id)) throw new Error("Duplicate " + label + " in compatibility snapshot: " + item.id);
    indexed.set(item.id, item);
  }
  return indexed;
}

/**
 * Validate an additive extension upgrade against the previously deployed
 * contract snapshot. This is a preflight: it has no side effects and does not
 * execute migrations or replace the running registry.
 */
export function validateFeatureExtensionUpgrade(
  previous: FeatureExtensionCompatibilitySnapshot,
  next: FeatureExtensionCompatibilitySnapshot,
): void {
  const before = previous.extension;
  const after = next.extension;

  if (before.id !== after.id) throw new Error("Extension identity cannot change during upgrade");
  if (before.featureId !== after.featureId || previous.feature.id !== next.feature.id ||
      before.featureId !== previous.feature.id || after.featureId !== next.feature.id) {
    throw new Error("Extension owner identity cannot change during upgrade");
  }
  if (before.publicEntryPoint !== after.publicEntryPoint) {
    throw new Error("Extension public entry point cannot change during upgrade");
  }
  if (!Number.isSafeInteger(after.version) || after.version <= before.version) {
    throw new Error("Extension upgrade must increase its version");
  }

  assertMonotonicContract("Feature contract", previous.feature.contractVersion, next.feature.contractVersion);
  const previousDependencies = JSON.stringify(previous.feature.dependencies);
  const nextDependencies = JSON.stringify(next.feature.dependencies);
  if (previousDependencies !== nextDependencies && next.feature.contractVersion === previous.feature.contractVersion) {
    throw new Error("Feature dependency changes require a feature contract version increase");
  }
  if (previous.feature.dataPolicy === "persistent" && next.feature.dataPolicy !== "persistent") {
    throw new Error("Persistent feature cannot become non-persistent during upgrade");
  }

  const previousPersistence = previous.feature.persistence;
  const nextPersistence = next.feature.persistence;
  if (previousPersistence && !nextPersistence) {
    throw new Error("Persistent feature cannot drop its persistence contract");
  }
  if (previousPersistence && nextPersistence) {
    assertMonotonicContract("Persistent schema", previousPersistence.schemaVersion, nextPersistence.schemaVersion);
    assertMonotonicContract("Backup snapshot", previousPersistence.backup.snapshotVersion, nextPersistence.backup.snapshotVersion);
    if (nextPersistence.backup.participantId !== previousPersistence.backup.participantId) {
      throw new Error("Persistent backup participant identity cannot change during upgrade");
    }
    if (nextPersistence.restore.validatorId !== previousPersistence.restore.validatorId &&
        nextPersistence.schemaVersion === previousPersistence.schemaVersion) {
      throw new Error("Restore validator change requires a persistent schema version increase");
    }
    let expectedSchema = previousPersistence.schemaVersion;
    const pendingMigrations = [...nextPersistence.migrations]
      .filter(migration => migration.fromVersion >= previousPersistence.schemaVersion)
      .sort((left, right) => left.fromVersion - right.fromVersion);
    for (const migration of pendingMigrations) {
      if (migration.fromVersion !== expectedSchema || migration.toVersion !== expectedSchema + 1 || !migration.id) {
        throw new Error("Persistent schema upgrade has an incomplete migration chain");
      }
      expectedSchema = migration.toVersion;
    }
    if (expectedSchema !== nextPersistence.schemaVersion) {
      throw new Error("Persistent schema upgrade has an incomplete migration chain");
    }
  }

  const oldIntegrations = indexById(before.integrations ?? [], "integration");
  const newIntegrations = indexById(after.integrations ?? [], "integration");
  for (const [id, oldContract] of oldIntegrations) {
    const nextContract = newIntegrations.get(id);
    if (!nextContract) throw new Error("Upgrade cannot silently remove integration contract: " + id);
    assertMonotonicContract("Integration " + id, oldContract.version, nextContract.version);
    assertMonotonicContract("Integration payload " + id, oldContract.payloadVersion, nextContract.payloadVersion);
    if (oldContract.producerFeatureId !== nextContract.producerFeatureId ||
        oldContract.consumerFeatureId !== nextContract.consumerFeatureId ||
        oldContract.eventName !== nextContract.eventName) {
      if (nextContract.version === oldContract.version) {
        throw new Error("Integration identity changes require an integration version increase: " + id);
      }
    }
    if (nextContract.payloadVersion !== oldContract.payloadVersion &&
        nextContract.version === oldContract.version) {
      throw new Error("Integration payload change requires an integration version increase: " + id);
    }
  }

  const oldCalculations = indexById(before.calculations ?? [], "calculation");
  const newCalculations = indexById(after.calculations ?? [], "calculation");
  for (const [id, oldContract] of oldCalculations) {
    const nextContract = newCalculations.get(id);
    if (!nextContract) throw new Error("Upgrade cannot silently remove calculation contract: " + id);
    assertMonotonicContract("Calculation " + id, oldContract.version, nextContract.version);
    assertMonotonicContract("Calculation input schema " + id, oldContract.inputSchemaVersion, nextContract.inputSchemaVersion);
    assertMonotonicContract("Calculation output schema " + id, oldContract.outputSchemaVersion, nextContract.outputSchemaVersion);
    const calculationRulesChanged = nextContract.unit !== oldContract.unit ||
      nextContract.effectiveDateField !== oldContract.effectiveDateField ||
      JSON.stringify(nextContract.rounding) !== JSON.stringify(oldContract.rounding);
    if ((nextContract.inputSchemaVersion !== oldContract.inputSchemaVersion ||
         nextContract.outputSchemaVersion !== oldContract.outputSchemaVersion || calculationRulesChanged) &&
        nextContract.version === oldContract.version) {
      throw new Error("Calculation schema change requires a calculation version increase: " + id);
    }
  }

}
