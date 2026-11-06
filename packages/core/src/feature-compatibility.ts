import type { CalculationContract, FeatureIntegrationContract } from "./feature-contracts";
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
  if (before.featureId !== after.featureId || previous.feature.id !== next.feature.id) {
    throw new Error("Extension owner identity cannot change during upgrade");
  }
  if (before.publicEntryPoint !== after.publicEntryPoint) {
    throw new Error("Extension public entry point cannot change during upgrade");
  }
  if (!Number.isSafeInteger(after.version) || after.version <= before.version) {
    throw new Error("Extension upgrade must increase its version");
  }

  assertMonotonicContract("Feature contract", previous.feature.contractVersion, next.feature.contractVersion);
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
    if (nextPersistence.backup.participantId !== previousPersistence.backup.participantId) {
      throw new Error("Persistent backup participant identity cannot change during upgrade");
    }
    if (nextPersistence.restore.validatorId !== previousPersistence.restore.validatorId &&
        nextPersistence.schemaVersion === previousPersistence.schemaVersion) {
      throw new Error("Restore validator change requires a persistent schema version increase");
    }
  }

  const oldIntegrations = indexById(before.integrations ?? [], "integration");
  const newIntegrations = indexById(after.integrations ?? [], "integration");
  for (const [id, oldContract] of oldIntegrations) {
    const nextContract = newIntegrations.get(id);
    if (!nextContract) throw new Error("Upgrade cannot silently remove integration contract: " + id);
    assertMonotonicContract("Integration " + id, oldContract.version, nextContract.version);
    assertMonotonicContract("Integration payload " + id, oldContract.payloadVersion, nextContract.payloadVersion);
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
    if ((nextContract.inputSchemaVersion !== oldContract.inputSchemaVersion ||
         nextContract.outputSchemaVersion !== oldContract.outputSchemaVersion) &&
        nextContract.version === oldContract.version) {
      throw new Error("Calculation schema change requires a calculation version increase: " + id);
    }
  }

  // The concrete registry builders remain the authority for validating the
  // full dependency graph, migration chain, calculation fixtures and handlers.
  void (next.extension.integrations as readonly FeatureIntegrationContract[] | undefined);
  void (next.extension.calculations as readonly CalculationContract<any, any>[] | undefined);
}
