import { describe, expect, it } from "vitest";
import { registerFeatures } from "../packages/core/src/features";
import {
  createInitialFeatureLifecycleStates,
  transitionFeatureLifecycle,
  type FeatureLifecycleContext,
} from "../packages/core/src/feature-lifecycle";

function contextWith(overrides: Record<string, "enabled" | "disabled" | "retired"> = {}): FeatureLifecycleContext {
  const features = registerFeatures();
  const states = new Map(createInitialFeatureLifecycleStates(features));
  for (const [featureId, state] of Object.entries(overrides)) {
    const feature = features.get(featureId);
    if (!feature) throw new Error("Unknown test feature: " + featureId);
    states.set(featureId, Object.freeze({
      featureId,
      contractVersion: feature.contractVersion,
      state,
    }));
  }
  return { features, states };
}

describe("feature lifecycle policy", () => {
  it("starts every registered feature enabled without mutating feature definitions", () => {
    const context = contextWith();
    expect(context.states.get("logbook")?.state).toBe("enabled");
    expect(context.features.get("logbook")?.dataPolicy).toBe("persistent");
  });

  it("disables an enabled feature without changing its persistence contract", () => {
    const context = contextWith();
    const before = context.features.get("logbook")?.persistence;
    const result = transitionFeatureLifecycle("logbook", "disable", context);
    expect(result.state).toBe("disabled");
    expect(context.features.get("logbook")?.persistence).toBe(before);
  });

  it("prevents disabling a feature while an active dependent relies on it", () => {
    const context = contextWith();
    expect(() => transitionFeatureLifecycle("work", "disable", context))
      .toThrow(/active dependents:.*logbook/);
  });

  it("requires dependencies to be enabled before enabling a feature", () => {
    const context = contextWith({ performance: "disabled", logbook: "disabled" });
    expect(() => transitionFeatureLifecycle("performance", "enable", context))
      .toThrow("dependencies are unavailable: logbook");
  });

  it("rejects stale lifecycle state after a feature contract version changes", () => {
    const features = registerFeatures();
    const states = new Map(createInitialFeatureLifecycleStates(features));
    const old = states.get("logbook")!;
    states.set("logbook", Object.freeze({ ...old, contractVersion: old.contractVersion - 1 }));
    expect(() => transitionFeatureLifecycle("logbook", "disable", { features, states }))
      .toThrow("Stale feature lifecycle contract");
  });

  it("requires disablement before retirement and never treats retirement as data deletion", () => {
    const context = contextWith({ logbook: "disabled", performance: "retired" });
    const result = transitionFeatureLifecycle("logbook", "retire", context);
    expect(result.state).toBe("retired");
    expect(context.features.get("logbook")?.persistence?.backup.required).toBe(true);
  });

  it("rejects retirement while registered dependents remain", () => {
    const context = contextWith({ work: "disabled" });
    expect(() => transitionFeatureLifecycle("work", "retire", context))
      .toThrow("registered dependents: logbook");
  });

  it("does not permit a retired feature to be reactivated", () => {
    const context = contextWith({ admin: "retired" });
    expect(() => transitionFeatureLifecycle("admin", "enable", context))
      .toThrow("cannot be reactivated");
  });
});
