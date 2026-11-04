export type FeatureId = string;

export type FeatureDependency = FeatureId | {
  id: FeatureId;
  contractVersion: number;
};

export type FeatureMigration = {
  fromVersion: number;
  toVersion: number;
  id: string;
};

export type PersistentFeatureContract = {
  schemaVersion: number;
  migrations: FeatureMigration[];
  backup: {
    participantId: string;
    snapshotVersion: number;
    required: true;
  };
  restore: {
    validatorId: string;
    required: true;
  };
  lifecycle: {
    disableRetainsData: true;
    removalRequiresMigration: true;
  };
};

export type FeatureDefinition = {
  id: FeatureId;
  label: string;
  contractVersion: number;
  dependencies: FeatureDependency[];
  persistence?: PersistentFeatureContract;
};

const initial: FeatureDefinition[] = [
  {
    id: "work",
    label: "Work",
    contractVersion: 1,
    dependencies: [],
    persistence: {
      schemaVersion: 1,
      migrations: [],
      backup: { participantId: "work-driver-state", snapshotVersion: 1, required: true },
      restore: { validatorId: "work-driver-state-v1", required: true },
      lifecycle: { disableRetainsData: true, removalRequiresMigration: true },
    },
  },
  { id: "logbook", label: "Log Book", contractVersion: 1, dependencies: [{ id: "work", contractVersion: 1 }] },
  { id: "finance", label: "Finance", contractVersion: 1, dependencies: [] },
  { id: "vehicle", label: "Vehicle", contractVersion: 1, dependencies: [] },
  { id: "performance", label: "Performance", contractVersion: 1, dependencies: [\n    { id: "work", contractVersion: 1 },\n    { id: "logbook", contractVersion: 1 },\n    { id: "finance", contractVersion: 1 },\n  ] },
  { id: "admin", label: "Admin", contractVersion: 1, dependencies: [] },
  { id: "backup", label: "Backup & Recovery", contractVersion: 1, dependencies: [] },
];

function dependencyId(dependency: FeatureDependency): FeatureId {
  return typeof dependency === "string" ? dependency : dependency.id;
}

function validatePersistentContract(feature: FeatureDefinition): void {
  const contract = feature.persistence;
  if (!contract) return;
  if (!Number.isSafeInteger(contract.schemaVersion) || contract.schemaVersion < 1) {
    throw new Error("Invalid schema version for feature: " + feature.id);
  }
  if (!Array.isArray(contract.migrations)) {\n    throw new Error("Invalid migration list for feature: " + feature.id);\n  }\n  if (!contract.backup?.required || !contract.backup.participantId || !Number.isSafeInteger(contract.backup.snapshotVersion) || contract.backup.snapshotVersion < 1) {
    throw new Error("Missing required backup participant for feature: " + feature.id);
  }
  if (!contract.restore?.required || !contract.restore.validatorId) {
    throw new Error("Missing required restore validator for feature: " + feature.id);
  }
  if (contract.lifecycle?.disableRetainsData !== true || contract.lifecycle?.removalRequiresMigration !== true) {
    throw new Error("Unsafe lifecycle contract for feature: " + feature.id);
  }

  const migrations = [...contract.migrations].sort((a, b) => a.fromVersion - b.fromVersion);
  let expectedVersion = 1;
  for (const migration of migrations) {
    if (
      !migration.id ||
      migration.fromVersion !== expectedVersion ||
      migration.toVersion !== migration.fromVersion + 1 ||
      migration.toVersion > contract.schemaVersion
    ) {
      throw new Error("Invalid migration chain for feature: " + feature.id);
    }
    expectedVersion = migration.toVersion;
  }
  if (expectedVersion !== contract.schemaVersion) {
    throw new Error("Incomplete migration chain for feature: " + feature.id);
  }
}

function assertAcyclic(registry: Map<FeatureId, FeatureDefinition>): void {
  const visiting = new Set<FeatureId>();
  const visited = new Set<FeatureId>();
  const visit = (id: FeatureId): void => {
    if (visiting.has(id)) throw new Error("Feature dependency cycle: " + id);
    if (visited.has(id)) return;
    visiting.add(id);
    const feature = registry.get(id)!;
    for (const dependency of feature.dependencies) visit(dependencyId(dependency));
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of registry.keys()) visit(id);
}

/**
 * Build and validate the runtime feature catalogue before feature writes are enabled.
 * Persistent features fail closed unless backup, restore, lifecycle, and migration
 * metadata form a complete contract.
 */
export function registerFeatures(additional: FeatureDefinition[] = []): ReadonlyMap<FeatureId, FeatureDefinition> {
  const registry = new Map<FeatureId, FeatureDefinition>();
  for (const source of [...initial, ...additional]) {
    if (registry.has(source.id)) throw new Error("Duplicate feature registration: " + source.id);
    if (!source.label.trim() || !Number.isSafeInteger(source.contractVersion) || source.contractVersion < 1) {
      throw new Error("Invalid feature contract: " + source.id);
    }
    validatePersistentContract(source);
    const feature: FeatureDefinition = Object.freeze({
      ...source,
      dependencies: Object.freeze([...source.dependencies]) as FeatureDependency[],
      persistence: source.persistence ? Object.freeze({
        ...source.persistence,
        migrations: Object.freeze(source.persistence.migrations.map(migration => Object.freeze({ ...migration }))) as FeatureMigration[],
        backup: Object.freeze({ ...source.persistence.backup }),
        restore: Object.freeze({ ...source.persistence.restore }),
        lifecycle: Object.freeze({ ...source.persistence.lifecycle }),
      }) : undefined,
    });
    registry.set(feature.id, feature);
  }

  for (const feature of registry.values()) {
    for (const dependency of feature.dependencies) {
      const id = dependencyId(dependency);
      const target = registry.get(id);
      if (!target) throw new Error("Missing dependency " + id + " for " + feature.id);
      if (typeof dependency !== "string" && target.contractVersion !== dependency.contractVersion) {
        throw new Error("Incompatible dependency contract " + id + " for " + feature.id);
      }
      if (id === feature.id) throw new Error("Feature cannot depend on itself: " + id);
    }
  }
  assertAcyclic(registry);

  const participants = new Set<string>();
  for (const feature of registry.values()) {
    const id = feature.persistence?.backup.participantId;
    if (id && participants.has(id)) throw new Error("Duplicate backup participant: " + id);
    if (id) participants.add(id);
  }
  return registry;
}

/** Stable dependency-first order for startup and migration coordination. */
export function resolveFeatureStartupOrder(
  registry: ReadonlyMap<FeatureId, FeatureDefinition> = registerFeatures(),
): FeatureDefinition[] {
  const ordered: FeatureDefinition[] = [];
  const visited = new Set<FeatureId>();
  const visit = (id: FeatureId) => {
    if (visited.has(id)) return;
    const feature = registry.get(id);
    if (!feature) throw new Error("Unknown feature: " + id);
    for (const dependency of feature.dependencies) visit(dependencyId(dependency));
    visited.add(id);
    ordered.push(feature);
  };
  for (const id of registry.keys()) visit(id);
  return ordered;
}

export type FeatureMigrationHandler<Context> = (context: Context) => void | Promise<void>;

/** Run a complete, ordered feature migration chain; resolve all handlers before writes begin. */
export async function runFeatureMigrations<Context>(
  feature: FeatureDefinition,
  currentVersion: number,
  handlers: Readonly<Record<string, FeatureMigrationHandler<Context>>>,
  context: Context,
): Promise<number> {
  const contract = feature.persistence;
  if (!contract) {
    if (currentVersion !== 0) throw new Error("Non-persistent feature has a schema version: " + feature.id);
    return 0;
  }
  if (!Number.isSafeInteger(currentVersion) || currentVersion < 1 || currentVersion > contract.schemaVersion) {
    throw new Error("Unsupported current schema version for feature: " + feature.id);
  }
  const pending = contract.migrations
    .filter(migration => migration.fromVersion >= currentVersion)
    .sort((left, right) => left.fromVersion - right.fromVersion);
  let expectedVersion = currentVersion;
  const steps = pending.map(migration => {
    if (migration.fromVersion !== expectedVersion || migration.toVersion !== expectedVersion + 1) {
      throw new Error("Incomplete migration chain for feature: " + feature.id);
    }
    const handler = handlers[migration.id];
    if (!handler) throw new Error("Missing migration handler " + migration.id + " for feature: " + feature.id);
    expectedVersion = migration.toVersion;
    return handler;
  });
  if (expectedVersion !== contract.schemaVersion) {
    throw new Error("Incomplete migration chain for feature: " + feature.id);
  }
  for (const step of steps) await step(context);
  return contract.schemaVersion;
}
