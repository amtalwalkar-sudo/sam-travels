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

  const oldQueries = indexById(before.dataQueries ?? [], "data query");
  const newQueries = indexById(after.dataQueries ?? [], "data query");
  for (const [id, oldContract] of oldQueries) {
    const nextContract = newQueries.get(id);
    if (!nextContract) throw new Error("Upgrade cannot silently remove data query contract: " + id);
    assertMonotonicContract("Data query " + id, oldContract.version, nextContract.version);
    assertMonotonicContract("Data query output schema " + id, oldContract.outputSchemaVersion, nextContract.outputSchemaVersion);
    if (oldContract.ownerFeatureId !== nextContract.ownerFeatureId) {
      throw new Error("Data query owner cannot change during upgrade: " + id);
    }
    if (oldContract.outputSchemaVersion !== nextContract.outputSchemaVersion && oldContract.version === nextContract.version) {
      throw new Error("Data query schema change requires a query version increase: " + id);
    }
  }

  const oldScreens = indexById(before.presentationScreens ?? [], "presentation screen");
  const newScreens = indexById(after.presentationScreens ?? [], "presentation screen");
  for (const [id, oldContract] of oldScreens) {
    const nextContract = newScreens.get(id);
    if (!nextContract) throw new Error("Upgrade cannot silently remove presentation screen contract: " + id);
    assertMonotonicContract("Presentation screen " + id, oldContract.version, nextContract.version);
    if (oldContract.ownerFeatureId !== nextContract.ownerFeatureId) {
      throw new Error("Presentation screen owner cannot change during upgrade: " + id);
    }
    if (oldContract.mountPoint !== nextContract.mountPoint && oldContract.version === nextContract.version) {
      throw new Error("Presentation mount-point change requires a screen version increase: " + id);
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


export type FeatureUpgradeImpactFinding = Readonly<{
  surface: "extension" | "feature" | "persistence" | "integration" | "calculation" | "data_query" | "presentation";
  contractId: string;
  change: string;
  breaking: boolean;
}>;
export type FeatureUpgradeImpactReport = Readonly<{
  compatible: boolean;
  findings: readonly FeatureUpgradeImpactFinding[];
  breakingChanges: readonly string[];
}>;

/** Complete metadata-only diff across every declared extension-owned contract surface. */
export function analyzeFeatureExtensionUpgradeImpact(
  previous: FeatureExtensionCompatibilitySnapshot,
  next: FeatureExtensionCompatibilitySnapshot,
): FeatureUpgradeImpactReport {
  const findings: FeatureUpgradeImpactFinding[] = [];
  const add = (surface: FeatureUpgradeImpactFinding["surface"], contractId: string, change: string, breaking = false) =>
    findings.push(Object.freeze({ surface, contractId, change, breaking }));
  const before = previous.extension;
  const after = next.extension;
  if (before.id !== after.id) add("extension", before.id, "identity_changed", true);
  if (before.featureId !== after.featureId) add("extension", before.id, "owner_changed", true);
  if (before.publicEntryPoint !== after.publicEntryPoint) add("extension", before.id, "public_entry_point_changed", true);
  if (after.version <= before.version) add("extension", before.id, "version_not_increased", true);

  const oldFeature = previous.feature;
  const newFeature = next.feature;
  if (oldFeature.contractVersion !== newFeature.contractVersion) add("feature", oldFeature.id, "contract_version_changed");
  if (JSON.stringify(oldFeature.dependencies) !== JSON.stringify(newFeature.dependencies)) add("feature", oldFeature.id, "dependencies_changed");
  if (oldFeature.dataPolicy !== newFeature.dataPolicy) add("feature", oldFeature.id, "data_policy_changed", oldFeature.dataPolicy === "persistent");
  const oldPersistence = oldFeature.persistence;
  const newPersistence = newFeature.persistence;
  if (!!oldPersistence !== !!newPersistence) add("persistence", oldFeature.id, "persistence_ownership_changed", !!oldPersistence);
  if (oldPersistence && newPersistence) {
    if (oldPersistence.schemaVersion !== newPersistence.schemaVersion) add("persistence", oldFeature.id, "schema_version_changed");
    if (oldPersistence.backup.participantId !== newPersistence.backup.participantId) add("persistence", oldFeature.id, "backup_participant_changed", true);
    if (oldPersistence.backup.snapshotVersion !== newPersistence.backup.snapshotVersion) add("persistence", oldFeature.id, "backup_snapshot_version_changed");
    if (oldPersistence.restore.validatorId !== newPersistence.restore.validatorId) add("persistence", oldFeature.id, "restore_validator_changed");
    if (oldPersistence.lifecycle.disableRetainsData !== newPersistence.lifecycle.disableRetainsData ||
        oldPersistence.lifecycle.removalRequiresMigration !== newPersistence.lifecycle.removalRequiresMigration) {
      add("persistence", oldFeature.id, "retention_lifecycle_changed", true);
    }
  }

  const compare = <T extends { id: string }>(
    surface: "integration" | "calculation" | "data_query" | "presentation",
    oldItems: readonly T[],
    newItems: readonly T[],
    fingerprint: (item: T) => string,
  ) => {
    const oldMap = indexById(oldItems, surface);
    const newMap = indexById(newItems, surface);
    for (const [id, oldItem] of oldMap) {
      const newItem = newMap.get(id);
      if (!newItem) { add(surface, id, "removed", true); continue; }
      if (fingerprint(oldItem) !== fingerprint(newItem)) add(surface, id, "contract_metadata_changed");
    }
    for (const id of newMap.keys()) if (!oldMap.has(id)) add(surface, id, "added");
  };
  compare("integration", before.integrations ?? [], after.integrations ?? [], item =>
    JSON.stringify([item.version, item.producerFeatureId, item.consumerFeatureId, item.eventName, item.payloadVersion]));
  compare("calculation", before.calculations ?? [], after.calculations ?? [], item =>
    JSON.stringify([item.ownerFeatureId, item.version, item.inputSchemaVersion, item.outputSchemaVersion, item.unit, item.effectiveDateField, item.rounding]));
  compare("data_query", before.dataQueries ?? [], after.dataQueries ?? [], item =>
    JSON.stringify([item.ownerFeatureId, item.version, item.outputSchemaVersion]));
  compare("presentation", before.presentationScreens ?? [], after.presentationScreens ?? [], item =>
    JSON.stringify([item.ownerFeatureId, item.version, item.mountPoint, item.label]));

  findings.sort((a, b) => a.surface.localeCompare(b.surface) || a.contractId.localeCompare(b.contractId) || a.change.localeCompare(b.change));
  const breakingChanges = findings.filter(item => item.breaking).map(item => item.surface + ":" + item.contractId + ":" + item.change);
  return Object.freeze({
    compatible: breakingChanges.length === 0,
    findings: Object.freeze(findings),
    breakingChanges: Object.freeze(breakingChanges),
  });
}
