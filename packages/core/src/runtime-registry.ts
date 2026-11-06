import { createReadonlyRegistry } from "./readonly-registry";
import {
  registerBackupParticipants,
  type BackupParticipantDefinition,
  type FeatureDefinition,
  type FeatureId,
} from "./features";
import {
  registerCalculations,
  registerFeatureIntegrations,
  type CalculationContract,
  type FeatureIntegrationContract,
} from "./feature-contracts";
import {
  registerFeatureExtensions,
  type FeatureExtensionDefinition,
  type RegisteredFeatureExtension,
} from "./feature-extension";
import {
  planFeatureActivation,
  type FeatureActivationDiagnostic,
  type FeatureActivationPlan,
} from "./feature-activation";

export type RuntimeContractDefinitions = {
  /** Add-on declarations are validated independently against the stable built-in catalogue. */
  features?: FeatureDefinition[];
  /** Cohesive, statically linked feature packages; contributions are owned by featureId. */
  extensions?: FeatureExtensionDefinition[];
  integrations?: FeatureIntegrationContract[];
  calculations?: CalculationContract<any, any>[];
};

export type RuntimeContributionFailure = Readonly<{
  featureId: FeatureId;
  code: "invalid_extension" | "invalid_integration" | "invalid_calculation" | "duplicate_contribution";
  message: string;
}>;

export type RuntimeRegistry = {
  /** Full valid declaration inventory, including blocked/disabled persistent owners. */
  features: ReadonlyMap<FeatureId, FeatureDefinition>;
  /** Activation-eligible feature declarations only. */
  activeFeatures: ReadonlyMap<FeatureId, FeatureDefinition>;
  activation: FeatureActivationPlan;
  extensions: ReadonlyMap<string, RegisteredFeatureExtension>;
  startupOrder: readonly FeatureDefinition[];
  integrations: ReadonlyMap<string, FeatureIntegrationContract>;
  /** Includes every valid persistent owner, whether active, blocked, or disabled. */
  backupParticipants: ReadonlyMap<string, BackupParticipantDefinition>;
  calculations: ReadonlyMap<string, CalculationContract<any, any>>;
  contributionFailures: readonly RuntimeContributionFailure[];
};

/**
 * Build the single runtime catalogue. Feature declarations and persistent data
 * ownership are retained independently from operational activation. Each
 * feature's extension, integration and calculation contributions are staged
 * together and published only when the complete feature-owned group validates.
 */
export function initializeRuntimeRegistry(
  definitions: RuntimeContractDefinitions = {},
): RuntimeRegistry {
  const extensionDefinitions = [...(definitions.extensions ?? [])];
  const featureDeclarations = [
    ...(definitions.features ?? []),
    ...extensionDefinitions.flatMap(extension => extension.feature && extension.feature.id === extension.featureId ? [extension.feature] : []),
  ];
  const activation = planFeatureActivation(featureDeclarations);
  const features = activation.declarations;
  const activeFeatures = activation.activeFeatures;

  // Group contributions by their owning feature. Extension-owned contracts
  // remain in that same atomic group; top-level contracts use their declared owner.
  const extensionsByOwner = new Map<FeatureId, FeatureExtensionDefinition[]>();
  const integrationsByOwner = new Map<FeatureId, FeatureIntegrationContract[]>();
  const calculationsByOwner = new Map<FeatureId, CalculationContract<any, any>[]>();
  const failures: RuntimeContributionFailure[] = [];
  const add = <T>(map: Map<FeatureId, T[]>, owner: FeatureId, value: T) => {
    const values = map.get(owner) ?? [];
    values.push(value);
    map.set(owner, values);
  };

  for (const extension of extensionDefinitions) {
    add(extensionsByOwner, extension.featureId, extension);
    for (const integration of extension.integrations ?? []) add(integrationsByOwner, extension.featureId, integration);
    for (const calculation of extension.calculations ?? []) add(calculationsByOwner, extension.featureId, calculation);
  }
  for (const integration of definitions.integrations ?? []) add(integrationsByOwner, integration.consumerFeatureId, integration);
  for (const calculation of definitions.calculations ?? []) add(calculationsByOwner, calculation.ownerFeatureId, calculation);

  // A duplicated contribution identity is ambiguous across owners. Reject all
  // owners of that identity rather than allowing declaration order to win.
  const identityOwners = new Map<string, Set<FeatureId>>();
  const countIdentity = (kind: string, id: string, owner: FeatureId) => {
    const key = kind + ":" + id;
    const owners = identityOwners.get(key) ?? new Set<FeatureId>();
    owners.add(owner);
    identityOwners.set(key, owners);
  };
  for (const [owner, values] of extensionsByOwner) for (const value of values) countIdentity("extension", value.id, owner);
  for (const [owner, values] of integrationsByOwner) for (const value of values) countIdentity("integration", value.id, owner);
  for (const [owner, values] of calculationsByOwner) for (const value of values) countIdentity("calculation", value.id, owner);
  const duplicateOwners = new Set<FeatureId>();
  for (const [key, owners] of identityOwners) {
    if (owners.size < 2) continue;
    for (const owner of owners) {
      duplicateOwners.add(owner);
      failures.push(Object.freeze({
        featureId: owner,
        code: "duplicate_contribution",
        message: "Contribution identity is declared by multiple feature owners: " + key,
      }));
    }
  }

  const extensions = new Map<string, RegisteredFeatureExtension>();
  const integrations = new Map<string, FeatureIntegrationContract>();
  const calculations = new Map<string, CalculationContract<any, any>>();

  const owners = new Set<FeatureId>([
    ...extensionsByOwner.keys(),
    ...integrationsByOwner.keys(),
    ...calculationsByOwner.keys(),
  ]);
  for (const owner of [...owners].sort()) {
    if (!features.has(owner)) {
      failures.push(Object.freeze({
        featureId: owner,
        code: "invalid_extension",
        message: "Feature contributions reference an unregistered or invalid owner.",
      }));
      continue;
    }
    if (!activeFeatures.has(owner) || duplicateOwners.has(owner)) continue;
    const ownerExtensions = extensionsByOwner.get(owner) ?? [];
    const ownerIntegrations = integrationsByOwner.get(owner) ?? [];
    const ownerCalculations = calculationsByOwner.get(owner) ?? [];
    try {
      // Stage every registry for this owner locally. Nothing is published until
      // all three validators succeed, preventing partial feature contribution.
      const stagedExtensions = registerFeatureExtensions(features, ownerExtensions);
      const stagedIntegrations = registerFeatureIntegrations(activeFeatures, ownerIntegrations);
      const stagedCalculations = registerCalculations(activeFeatures, ownerCalculations);
      for (const [id, value] of stagedExtensions) extensions.set(id, value);
      for (const [id, value] of stagedIntegrations) integrations.set(id, value);
      for (const [id, value] of stagedCalculations) calculations.set(id, value);
    } catch (error) {
      const hasExtensions = ownerExtensions.length > 0;
      const hasIntegrations = ownerIntegrations.length > 0;
      const code = hasExtensions ? "invalid_extension" : hasIntegrations ? "invalid_integration" : "invalid_calculation";
      failures.push(Object.freeze({
        featureId: owner,
        code,
        message: error instanceof Error ? error.message : "Feature contribution validation failed.",
      }));
    }
  }

  // Backup participation derives from the complete declaration inventory, not
  // the active subset, so blocked/disabled persistent data is never orphaned.
  const backupParticipants = registerBackupParticipants(features);

  return Object.freeze({
    features,
    activeFeatures,
    activation,
    extensions: createReadonlyRegistry(extensions),
    startupOrder: activation.startupOrder,
    integrations: createReadonlyRegistry(integrations),
    backupParticipants,
    calculations: createReadonlyRegistry(calculations),
    contributionFailures: Object.freeze(failures.sort((a, b) =>
      a.featureId < b.featureId ? -1 : a.featureId > b.featureId ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : 0,
    )),
  });
}
