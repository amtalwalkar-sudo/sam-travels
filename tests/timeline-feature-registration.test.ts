import { describe, expect, it } from "vitest";
import { initializeRuntimeRegistry } from "../packages/core/src/runtime-registry";

describe("Timeline feature registration", () => {
  it("registers a non-persistent read-only capability with declared owners", () => {
    const registry = initializeRuntimeRegistry();
    const timeline = registry.activeFeatures.get("timeline");
    expect(timeline).toMatchObject({
      id: "timeline",
      dataPolicy: "non-persistent",
      dependencies: [{ id: "work", contractVersion: 1 }],
    });
    expect(timeline?.persistence).toBeUndefined();
  });
});
