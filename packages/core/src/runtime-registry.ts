import {
  registerFeatures,
  registerBackupParticipants,
  type BackupParticipantDefinition,
  resolveFeatureStartupOrder,
  type FeatureDefinition,
  type FeatureId,
} from "./features";
import {
  registerCalculations,
  registerFeatureIntegrations,
  type CalculationContract,
  type FeatureIntegrationContract,
} from "./feature-contracts";

export type RuntimeContractDefinitions = {
  /** Add-on definitions are validated together with the stable built-in catalogue. */
  features?: FeatureDefinition[];
  integrations: FeatureIntegrationContract[];
  calculations: CalculationContract<any, any>[];
};

export type RuntimeRegistry = {
  features: ReadonlyMap<FeatureId, FeatureDefinition>;
  startupOrder: FeatureDefinition[];
  integrations: ReadonlyMap<string, FeatureIntegrationContract>;
  backupParticipants: ReadonlyMap<string, BackupParticipantDefinition>;
  calculations: ReadonlyMap<string, CalculationContract<any, any>>;
};

/** Single fail-closed bootstrap for feature and cross-feature runtime contracts. */
export function initializeRuntimeRegistry(
  definitions: RuntimeContractDefinitions = { integrations: [], calculations: [] },
): RuntimeRegistry {
  // Build every registry locally. A failure in any contract prevents a partial
  // runtime catalogue from being returned to the application bootstrap.
  const features = registerFeatures(definitions.features ?? []);
  const startupOrder = resolveFeatureStartupOrder(features);
  const backupParticipants = registerBackupParticipants(features);
  const integrations = registerFeatureIntegrations(features, definitions.integrations);
  const calculations = registerCalculations(features, definitions.calculations);
  return Object.freeze({ features, startupOrder, backupParticipants, integrations, calculations });
}
