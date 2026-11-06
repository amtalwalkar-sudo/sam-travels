import { createReadonlyRegistry } from "./readonly-registry";
import type { FeatureDefinition, FeatureId } from "./features";

/**
 * Framework-neutral feature screen contribution. The renderer is opaque to the
 * runtime: the active presentation host owns how it is mounted and isolated.
 */
export type FeaturePresentationScreen = Readonly<{
  id: string;
  ownerFeatureId: FeatureId;
  version: number;
  mountPoint: string;
  label: string;
  render: (context: unknown) => unknown;
}>;

export type RegisteredFeaturePresentationScreen = FeaturePresentationScreen;

/** Validate screen ownership and identity without imposing a UI framework or template. */
export function registerFeaturePresentationScreens(
  features: ReadonlyMap<FeatureId, FeatureDefinition>,
  definitions: readonly FeaturePresentationScreen[],
): ReadonlyMap<string, RegisteredFeaturePresentationScreen> {
  const registry = new Map<string, RegisteredFeaturePresentationScreen>();
  for (const source of definitions) {
    if (!source.id?.trim() || registry.has(source.id)) {
      throw new Error("Missing or duplicate presentation screen id: " + source.id);
    }
    if (!source.ownerFeatureId?.trim() || !features.has(source.ownerFeatureId)) {
      throw new Error("Presentation screen references an unregistered owner: " + source.id);
    }
    if (!Number.isSafeInteger(source.version) || source.version < 1) {
      throw new Error("Invalid presentation screen version: " + source.id);
    }
    if (!source.mountPoint?.trim() || !source.label?.trim() || typeof source.render !== "function") {
      throw new Error("Invalid custom presentation screen contract: " + source.id);
    }
    registry.set(source.id, Object.freeze({ ...source }));
  }
  return createReadonlyRegistry(registry);
}
