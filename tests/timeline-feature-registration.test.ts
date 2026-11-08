import { describe, expect, it } from "vitest";
import { initializeRuntimeRegistry } from "../packages/core/src/runtime-registry";
import { TIMELINE_FEATURE_EXTENSION } from "../packages/features/timeline";

describe("Timeline feature registration", () => {
  it("registers a non-persistent read-only capability through the existing feature extension architecture", () => {
    const registry = initializeRuntimeRegistry({ extensions: [TIMELINE_FEATURE_EXTENSION] });
    const timeline = registry.activeFeatures.get("timeline");
    expect(timeline).toMatchObject({
      id: "timeline",
      dataPolicy: "non-persistent",
      dependencies: [{ id: "work", contractVersion: 1 }],
    });
    expect(timeline?.persistence).toBeUndefined();
    expect(registry.extensions.get("timeline.core.v1")?.featureId).toBe("timeline");
    expect(registry.presentationScreens.has("timeline.main.v1")).toBe(true);
  });
});
