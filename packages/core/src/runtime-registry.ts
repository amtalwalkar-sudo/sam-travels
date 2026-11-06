import {
  registerFeatures,
  registerBackupParticipants,
  resolveFeatureStartupOrder,
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

export type RuntimeContractDefinitions = {
  /** Add-on definitions are validated together with the stable built-in catalogue. */
  features?: FeatureDefinition[];
  /** Cohesive, versioned feature packages; contributions are owned by featureId. */
  extensions?: FeatureExtensionDefinition[];
  integrations?: FeatureIntegrationContract[];
  calculations?: CalculationContract<any, any>[];
};

export type RuntimeRegistry = {
  features: ReadonlyMap<FeatureId, FeatureDefinition>;
  extensions: ReadonlyMap<string, RegisteredFeatureExtension>;
  startupOrder: readonly FeatureDefinition[];
  integrations: ReadonlyMap<string, FeatureIntegrationContract>;
  backupParticipants: ReadonlyMap<string, BackupParticipantDefinition>;
  calculations: ReadonlyMap<string, CalculationContract<any, any>>;
};

/**
 * Single fail-closed bootstrap for feature packages and cross-feature contracts.
 * All feature definitions and contributions are validated before a registry is
 * returned; callers never receive a partially initialized runtime catalogue.
 */
export function initializeRuntimeRegistry(
  definitions: RuntimeContractDefinitions = {},
): RuntimeRegistry {
  const extensionDefinitions = definitions.extensions ?? [];
  const features = registerFeatures([
    ...(definitions.features ?? []),
    ...extensionDefinitions.flatMap(extension => extension.feature ? [extension.feature] : []),
  ]);
  const extensions = registerFeatureExtensions(features, extensionDefinitions);
  const integrations = registerFeatureIntegrations(features, [
    ...(definitions.integrations ?? []),
    ...extensionDefinitions.flatMap(extension => [...(extension.integrations ?? [])]),
  ]);
  const calculations = registerCalculations(features, [
    ...(definitions.calculations ?? []),
    ...extensionDefinitions.flatMap(extension => [...(extension.calculations ?? [])]),
  ]);
  const startupOrder = resolveFeatureStartupOrder(features);
  const backupParticipants = registerBackupParticipants(features);

  return Object.freeze({
    features,
    extensions,
    startupOrder: Object.freeze(startupOrder),
    integrations,
    backupParticipants,
    calculations,
  });
}
