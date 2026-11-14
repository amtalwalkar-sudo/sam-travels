import { createReadonlyRegistry } from "./readonly-registry";
import type { FeatureDefinition, FeatureId } from "./features";

/** Stable identity/version for the value contract supplied to a screen renderer. */
export type FeaturePresentationContextContract<Id extends string = string, Version extends number = number> = Readonly<{
  id: Id;
  version: Version;
}>;

/**
 * Typed, immutable boundary between the application composition root and a
 * feature-owned renderer. The feature chooses its own state and action shape.
 */
export type FeaturePresentationContext<
  Id extends string = string,
  Version extends number = number,
  Value = unknown,
> = Readonly<{
  contractId: Id;
  contractVersion: Version;
  value: Value;
}>;

export type FeaturePresentationScreen<Context = any> = Readonly<{
  id: string;
  ownerFeatureId: FeatureId;
  version: number;
  mountPoint: string;
  label: string;
  context: FeaturePresentationContextContract;
  render: (context: Context) => unknown;
}>;

/** Runtime registry erases feature-specific context types only at the host boundary. */
export type RegisteredFeaturePresentationScreen = FeaturePresentationScreen<any>;

/** Construct a context whose identity is checked by the host before mounting. */
export function createFeaturePresentationContext<
  const Id extends string,
  const Version extends number,
  Value,
>(
  contract: FeaturePresentationContextContract<Id, Version>,
  value: Value,
): FeaturePresentationContext<Id, Version, Value> {
  if (!contract.id.trim() || !Number.isSafeInteger(contract.version) || contract.version < 1) {
    throw new Error("Invalid feature presentation context contract");
  }
  return Object.freeze({ contractId: contract.id, contractVersion: contract.version, value });
}

/** Validate a supplied context against the exact screen contract before render. */
export function assertFeaturePresentationContext(
  screen: Pick<RegisteredFeaturePresentationScreen, "id" | "context">,
  context: FeaturePresentationContext,
): void {
  if (context.contractId !== screen.context.id || context.contractVersion !== screen.context.version) {
    throw new Error("Incompatible presentation context for screen: " + screen.id);
  }
}

/** Validate screen ownership and identity without imposing a UI framework or template. */
export function registerFeaturePresentationScreens(
  features: ReadonlyMap<FeatureId, FeatureDefinition>,
  definitions: readonly FeaturePresentationScreen<any>[],
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
    if (!source.mountPoint?.trim() || !source.label?.trim() ||
        !source.context?.id?.trim() || !Number.isSafeInteger(source.context?.version) ||
        source.context.version < 1 || typeof source.render !== "function") {
      throw new Error("Invalid custom presentation screen contract: " + source.id);
    }
    registry.set(source.id, Object.freeze({
      ...source,
      context: Object.freeze({ ...source.context }),
    }));
  }
  return createReadonlyRegistry(registry);
}
