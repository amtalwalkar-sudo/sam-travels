import {
  registerFeatures,
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
  integrations: FeatureIntegrationContract[];
  calculations: CalculationContract<any, any>[];
};

export type RuntimeRegistry = {
  features: ReadonlyMap<FeatureId, FeatureDefinition>;
  startupOrder: FeatureDefinition[];
  integrations: ReadonlyMap<string, FeatureIntegrationContract>;
  calculations: ReadonlyMap<string, CalculationContract<any, any>>;
};

/** Single fail-closed bootstrap for feature and cross-feature runtime contracts. */
export function initializeRuntimeRegistry(
  definitions: RuntimeContractDefinitions = { integrations: [], calculations: [] },
): RuntimeRegistry {
  const features = registerFeatures();
  const startupOrder = resolveFeatureStartupOrder(features);
  const integrations = registerFeatureIntegrations(features, definitions.integrations);
  const calculations = registerCalculations(features, definitions.calculations);
  return Object.freeze({ features, startupOrder, integrations, calculations });
}
