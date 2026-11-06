import type { FeatureDefinition, FeatureId } from "./features";

export type FeatureLifecycleState = "enabled" | "disabled" | "retired";
export type FeatureLifecycleAction = "enable" | "disable" | "retire";

export type FeatureLifecycleRecord = Readonly<{
  featureId: FeatureId;
  contractVersion: number;
  state: FeatureLifecycleState;
}>;

export type FeatureLifecycleContext = Readonly<{
  features: ReadonlyMap<FeatureId, FeatureDefinition>;
  states: ReadonlyMap<FeatureId, FeatureLifecycleRecord>;
}>;

function dependencyId(dependency: FeatureDefinition["dependencies"][number]): FeatureId {
  return typeof dependency === "string" ? dependency : dependency.id;
}

function activeDependents(
  featureId: FeatureId,
  context: FeatureLifecycleContext,
): FeatureId[] {
  return [...context.features.values()]
    .filter(candidate => candidate.id !== featureId)
    .filter(candidate => candidate.dependencies.some(dependency => dependencyId(dependency) === featureId))
    .filter(candidate => context.states.get(candidate.id)?.state !== "retired")
    .map(candidate => candidate.id);
}

function currentRecord(feature: FeatureDefinition, context: FeatureLifecycleContext): FeatureLifecycleRecord {
  const record = context.states.get(feature.id);
  if (!record) {
    return Object.freeze({
      featureId: feature.id,
      contractVersion: feature.contractVersion,
      state: "enabled",
    });
  }
  if (record.featureId !== feature.id || record.contractVersion !== feature.contractVersion) {
    throw new Error("Stale feature lifecycle contract: " + feature.id);
  }
  return record;
}

/**
 * Pure lifecycle transition policy. The caller must persist the returned record
 * through the authoritative application store before treating the transition
 * as committed. This function never changes feature data or backup membership.
 */
export function transitionFeatureLifecycle(
  featureId: FeatureId,
  action: FeatureLifecycleAction,
  context: FeatureLifecycleContext,
): FeatureLifecycleRecord {
  const feature = context.features.get(featureId);
  if (!feature) throw new Error("Unknown feature: " + featureId);

  const current = currentRecord(feature, context);
  if (current.state === "retired") {
    throw new Error("Retired feature cannot be reactivated or transitioned: " + featureId);
  }

  if (action === "disable") {
    if (current.state !== "enabled") {
      throw new Error("Only an enabled feature can be disabled: " + featureId);
    }
    const dependents = activeDependents(featureId, context);
    if (dependents.length) {
      throw new Error("Cannot disable feature with active dependents: " + dependents.join(", "));
    }
    return Object.freeze({ ...current, state: "disabled" });
  }

  if (action === "enable") {
    if (current.state !== "disabled") {
      throw new Error("Only a disabled feature can be enabled: " + featureId);
    }
    const unavailable = feature.dependencies
      .map(dependencyId)
      .filter(dependency => context.states.get(dependency)?.state === "disabled" ||
        context.states.get(dependency)?.state === "retired");
    if (unavailable.length) {
      throw new Error("Cannot enable feature while dependencies are unavailable: " + unavailable.join(", "));
    }
    return Object.freeze({ ...current, state: "enabled" });
  }

  if (current.state !== "disabled") {
    throw new Error("Feature must be disabled before retirement: " + featureId);
  }
  const dependents = activeDependents(featureId, context);
  if (dependents.length) {
    throw new Error("Cannot retire feature with registered dependents: " + dependents.join(", "));
  }
  if (feature.dataPolicy === "persistent" && !feature.persistence) {
    throw new Error("Cannot retire persistent feature without its retention contract: " + featureId);
  }
  // Retirement is a lifecycle state, never a data deletion instruction.
  return Object.freeze({ ...current, state: "retired" });
}

/** Create the initial enabled state for every feature in a validated registry. */
export function createInitialFeatureLifecycleStates(
  features: ReadonlyMap<FeatureId, FeatureDefinition>,
): ReadonlyMap<FeatureId, FeatureLifecycleRecord> {
  const states = new Map<FeatureId, FeatureLifecycleRecord>();
  for (const feature of features.values()) {
    states.set(feature.id, Object.freeze({
      featureId: feature.id,
      contractVersion: feature.contractVersion,
      state: "enabled",
    }));
  }
  return states;
}
