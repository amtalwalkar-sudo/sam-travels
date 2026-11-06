import { describe, expect, it } from "vitest";
import { createApplicationRuntimeRegistry } from "../../packages/application/src";
import { __FEATURE_CONST___FEATURE_EXTENSION } from "../../packages/features/__FEATURE_ID__";

describe("__FEATURE_LABEL__ feature scaffold", () => {
  it("publishes a valid non-persistent extension through the application registry", () => {
    const runtime = createApplicationRuntimeRegistry({
      extensions: [__FEATURE_CONST___FEATURE_EXTENSION],
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
