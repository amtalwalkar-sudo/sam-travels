import { describe, expect, it } from "vitest";
import { initializeRuntimeRegistry } from "../packages/core/src/runtime-registry";
import { DISCOVERED_FEATURE_EXTENSIONS } from "../apps/web/src/generated-feature-catalog";

describe("Performance presentation runtime registration", () => {
  it("activates the Performance owner and publishes its dashboard renderer", () => {
    const registry = initializeRuntimeRegistry({ extensions: [...DISCOVERED_FEATURE_EXTENSIONS] });

    expect(registry.activeFeatures.has("performance")).toBe(true);
    expect(registry.presentationScreens.has("performance.dashboard.v1")).toBe(true);
    expect(registry.contributionFailures.filter(failure => failure.featureId === "performance")).toEqual([]);
  });
});
