import { createReadonlyRegistry } from "./readonly-registry";
import type { CalculationContract, FeatureIntegrationContract } from "./feature-contracts";
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
}>;

/** Validate and freeze extension descriptors against the complete feature graph. */
export function registerFeatureExtensions(
  features: ReadonlyMap<FeatureId, FeatureDefinition>,
  definitions: readonly FeatureExtensionDefinition[],
): ReadonlyMap<string, FeatureExtensionDefinition> {
  const registry = new Map<string, FeatureExtensionDefinition>();

  for (const source of definitions) {
    if (!source.id?.trim() || registry.has(source.id)) {
      throw new Error("Missing or duplicate feature extension id: " + source.id);
    }
    if (!Number.isSafeInteger(source.version) || source.version < 1) {
      throw new Error("Invalid feature extension version: " + source.id);
    }
    if (!source.featureId?.trim() || !features.has(source.featureId)) {
      throw new Error("Feature extension references an unregistered feature: " + source.id);
    }
    if (source.feature && source.feature.id !== source.featureId) {
      throw new Error("Feature extension definition does not match its owner: " + source.id);
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
    for (const calculation of calculations) {
      if (calculation.ownerFeatureId !== source.featureId) {
        throw new Error("Feature extension calculation is outside its owner boundary: " + source.id);
      }
    }

    registry.set(source.id, Object.freeze({
      ...source,
      integrations: Object.freeze(integrations),
      calculations: Object.freeze(calculations),
    }));
  }

  return createReadonlyRegistry(registry);
}
