import { describe, expect, it } from "vitest";
import { initializeRuntimeRegistry, type FeatureExtensionDefinition, type FeaturePresentationScreen } from "../packages/core/src/index";
import type { FeatureDefinition } from "../packages/core/src/features";

const owner: FeatureDefinition = {
  id: "presentation-fixture",
  label: "Presentation fixture",
  dataPolicy: "non-persistent",
  contractVersion: 1,
  dependencies: [{ id: "logbook", contractVersion: 1 }],
};

const denseScreen: FeaturePresentationScreen = {
  id: "presentation-fixture.dense.v1",
  ownerFeatureId: owner.id,
  version: 1,
  mountPoint: "fixture/dense",
  label: "Dense data screen",
  render: context => ({ kind: "dense-table", context }),
};

const composedScreen: FeaturePresentationScreen = {
  id: "presentation-fixture.composed.v1",
  ownerFeatureId: owner.id,
  version: 1,
  mountPoint: "fixture/composed",
  label: "Composed interactive screen",
  render: context => ["custom", context, { nested: true }],
};

const extension: FeatureExtensionDefinition = {
  id: "presentation-fixture.extension.v1",
  version: 1,
  featureId: owner.id,
  publicEntryPoint: "packages/features/presentation-fixture/index.ts",
  feature: owner,
  presentationScreens: [denseScreen, composedScreen],
};

describe("feature-owned custom presentation contributions", () => {
  it("registers structurally different custom renderers without imposing a screen template", () => {
    const runtime = initializeRuntimeRegistry({ extensions: [extension] });
    expect(runtime.presentationScreens.get(denseScreen.id)?.render({ rows: 4 })).toEqual({
      kind: "dense-table",
      context: { rows: 4 },
    });
    expect(runtime.presentationScreens.get(composedScreen.id)?.render("tap")).toEqual([
      "custom", "tap", { nested: true },
    ]);
    expect(runtime.extensions.get(extension.id)?.presentationScreenIds).toEqual([
      denseScreen.id, composedScreen.id,
    ]);
    expect(Object.isFrozen(runtime.presentationScreens.get(denseScreen.id))).toBe(true);
    expect((runtime.presentationScreens as unknown as { set?: unknown }).set).toBeUndefined();
  });

  it("withholds the complete owner contribution when presentation ownership is invalid", () => {
    const runtime = initializeRuntimeRegistry({
      extensions: [{
        ...extension,
        presentationScreens: [{ ...denseScreen, ownerFeatureId: "logbook" }],
      }],
    });
    expect(runtime.extensions.has(extension.id)).toBe(false);
    expect(runtime.presentationScreens.size).toBe(0);
    expect(runtime.contributionFailures).toContainEqual(expect.objectContaining({
      featureId: owner.id,
      code: "invalid_presentation",
    }));
  });

  it("rejects duplicate screen identities without publishing a partial screen set", () => {
    const runtime = initializeRuntimeRegistry({
      extensions: [{
        ...extension,
        presentationScreens: [denseScreen, { ...composedScreen, id: denseScreen.id }],
      }],
    });
    expect(runtime.extensions.has(extension.id)).toBe(false);
    expect(runtime.presentationScreens.size).toBe(0);
    expect(runtime.contributionFailures).toContainEqual(expect.objectContaining({
      featureId: owner.id,
    }));
  });
});
