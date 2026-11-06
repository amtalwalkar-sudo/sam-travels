import { describe, expect, it } from "vitest";
import { createApplicationRuntimeRegistry } from "../../packages/application/src";
import { DISCOVERED_FEATURE_EXTENSIONS } from "../../apps/web/src/generated-feature-catalog";

describe("__FEATURE_LABEL__ feature scaffold", () => {
  it("is discovered and registered through the generated application catalogue", () => {
    const discovered = DISCOVERED_FEATURE_EXTENSIONS.find(extension => extension.featureId === "__FEATURE_ID__");
    expect(discovered).toBeDefined();

    const runtime = createApplicationRuntimeRegistry({
      extensions: [...DISCOVERED_FEATURE_EXTENSIONS],
    });

    expect(runtime.features.get("__FEATURE_ID__")).toMatchObject({
      id: "__FEATURE_ID__",
      dataPolicy: "non-persistent",
      contractVersion: 1,
    });
    expect(runtime.extensions.get("__FEATURE_ID__.core.v1")).toMatchObject({
      featureId: "__FEATURE_ID__",
      publicEntryPoint: "packages/features/__FEATURE_ID__/index.ts",
    });
  });
});
