import { createReadonlyRegistry } from "./readonly-registry";
import type { CalculationContract, FeatureIntegrationContract } from "./feature-contracts";
import type { FeatureDataQueryContract } from "./feature-data";
import type { FeatureDefinition, FeatureId } from "./features";

/**
 * One cohesive, statically linked capability contribution.
 *
 * New capabilities provide their feature definition. Existing capabilities may
 * publish additive extensions without replacing their stable feature identity.
 * The public entry point is the only supported cross-feature import surface.
 */
export type FeatureExtensionDefinition = Readonly<{
  id: string;
  version: number;
  featureId: FeatureId;
  publicEntryPoint: string;
  feature?: FeatureDefinition;
  integrations?: readonly FeatureIntegrationContract[];
  calculations?: readonly CalculationContract<any, any>[];
  dataQueries?: readonly FeatureDataQueryContract<any>[];
}>;

/** Safe, immutable extension metadata; executable contributions live in their own registries. */
export type RegisteredFeatureExtension = Readonly<{
  id: string;
  version: number;
  featureId: FeatureId;
  publicEntryPoint: string;
  integrationIds: readonly string[];
  calculationIds: readonly string[];
  dataQueryIds: readonly string[];
}>;

/** Validate extension contributions and expose metadata only after all ownership checks pass. */
export function registerFeatureExtensions(
  features: ReadonlyMap<FeatureId, FeatureDefinition>,
  definitions: readonly FeatureExtensionDefinition[],
): ReadonlyMap<string, RegisteredFeatureExtension> {
  const registry = new Map<string, RegisteredFeatureExtension>();

  for (const source of definitions) {
    if (!source.id?.trim() || registry.has(source.id)) {
      throw new Error("Missing or duplicate feature extension id: " + source.id);
    }
    if (!Number.isSafeInteger(source.version) || source.version < 1) {
      throw new Error("Invalid feature extension version: " + source.id);
    }
    if (!source.featureId?.trim()) {
      throw new Error("Feature extension references an unregistered feature: " + source.id);
    }
    if (source.feature && source.feature.id !== source.featureId) {
      throw new Error("Feature extension definition does not match its owner: " + source.id);
    }
    if (!features.has(source.featureId)) {
      throw new Error("Feature extension references an unregistered feature: " + source.id);
    }
    const expectedEntryPoint = `packages/features/${source.featureId}/index.ts`;
    if (source.publicEntryPoint !== expectedEntryPoint) {
      throw new Error("Invalid feature public entry point: " + source.id);
    }

    const integrations = [...(source.integrations ?? [])];
    for (const integration of integrations) {
      if (integration.producerFeatureId !== source.featureId &&
          integration.consumerFeatureId !== source.featureId) {
        throw new Error("Feature extension integration is outside its owner boundary: " + source.id);
      }
    }

    const calculations = [...(source.calculations ?? [])];
    const dataQueries = [...(source.dataQueries ?? [])];
    for (const query of dataQueries) {
      if (query.ownerFeatureId !== source.featureId) {
        throw new Error("Feature extension data query is outside its owner boundary: " + source.id);
      }
    }
    for (const calculation of calculations) {
      if (calculation.ownerFeatureId !== source.featureId) {
        throw new Error("Feature extension calculation is outside its owner boundary: " + source.id);
      }
    }

    registry.set(source.id, Object.freeze({
      id: source.id,
      version: source.version,
      featureId: source.featureId,
      publicEntryPoint: source.publicEntryPoint,
      integrationIds: Object.freeze(integrations.map(integration => integration.id)),
      calculationIds: Object.freeze(calculations.map(calculation => calculation.id)),
      dataQueryIds: Object.freeze(dataQueries.map(query => query.id)),
    }));
  }

  return createReadonlyRegistry(registry);
}
