import { describe, expect, it } from "vitest";
import { initializeRuntimeRegistry } from "../packages/core/src/runtime-registry";

describe("Timeline feature registration", () => {
  it("registers a non-persistent read-only capability with declared owners", () => {
    const registry = initializeRuntimeRegistry();
    const timeline = registry.activeFeatures.get("timeline");
    expect(timeline).toMatchObject({
      id: "timeline",
      dataPolicy: "non-persistent",
      dependencies: [
        { id: "work", contractVersion: 1 },
        { id: "logbook", contractVersion: 1 },
        { id: "finance", contractVersion: 2, optional: true },
        { id: "vehicle", contractVersion: 1, optional: true },
      ],
    });
    expect(timeline?.persistence).toBeUndefined();
  });
});
