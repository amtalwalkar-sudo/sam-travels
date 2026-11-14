import { describe, expect, it } from "vitest";
import {
  createFeaturePresentationContext,
  initializeRuntimeRegistry,
  type FeatureExtensionDefinition,
  type FeaturePresentationContext,
  type FeaturePresentationScreen,
} from "../packages/core/src/index";
import type { FeatureDefinition } from "../packages/core/src/features";
import { ADMIN_FEATURE_EXTENSION } from "../packages/features/admin";

const owner: FeatureDefinition = {
  id: "presentation-fixture",
  label: "Presentation fixture",
  dataPolicy: "non-persistent",
  contractVersion: 1,
  dependencies: [{ id: "logbook", contractVersion: 1 }],
};

type DenseContext = FeaturePresentationContext<"fixture.dense", 1, Readonly<{ rows: number }>>;
type ComposedContext = FeaturePresentationContext<"fixture.composed", 2, string>;

const denseScreen: FeaturePresentationScreen<DenseContext> = {
  id: "presentation-fixture.dense.v1",
  ownerFeatureId: owner.id,
  version: 1,
  mountPoint: "fixture/dense",
  label: "Dense data screen",
  context: { id: "fixture.dense", version: 1 },
  render: context => ({ kind: "dense-table", rows: context.value.rows }),
};

const composedScreen: FeaturePresentationScreen<ComposedContext> = {
  id: "presentation-fixture.composed.v1",
  ownerFeatureId: owner.id,
  version: 1,
  mountPoint: "fixture/composed",
  label: "Composed interactive screen",
  context: { id: "fixture.composed", version: 2 },
  render: context => ["custom", context.value, { nested: true }],
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
  it("registers differently typed renderers without imposing a screen template", () => {
    const runtime = initializeRuntimeRegistry({ extensions: [extension] });
    const dense = runtime.presentationScreens.get(denseScreen.id)!;
    const composed = runtime.presentationScreens.get(composedScreen.id)!;
    expect(dense.render(createFeaturePresentationContext(denseScreen.context, { rows: 4 }))).toEqual({
      kind: "dense-table", rows: 4,
    });
    expect(composed.render(createFeaturePresentationContext(composedScreen.context, "tap"))).toEqual([
      "custom", "tap", { nested: true },
    ]);
    expect(runtime.extensions.get(extension.id)?.presentationScreenIds).toEqual([
      denseScreen.id, composedScreen.id,
    ]);
    expect(Object.isFrozen(dense)).toBe(true);
    expect(Object.isFrozen(dense.context)).toBe(true);
    expect((runtime.presentationScreens as unknown as { set?: unknown }).set).toBeUndefined();
  });

  it("rejects a context version mismatch before feature rendering", () => {
    const runtime = initializeRuntimeRegistry({ extensions: [extension] });
    const screen = runtime.presentationScreens.get(denseScreen.id)!;
    expect(() => screen.render(createFeaturePresentationContext(
      { id: "fixture.dense", version: 2 }, { rows: 4 },
    ))).not.toThrow();
    expect(screen.context.version).toBe(1);
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

describe("Admin presentation contribution", () => {
  it("registers Admin through the same feature registry without giving it data ownership", () => {
    const runtime = initializeRuntimeRegistry({ extensions: [ADMIN_FEATURE_EXTENSION] });
    const admin = runtime.features.get("admin");
    const screen = runtime.presentationScreens.get("admin.workspace.v1")!;
    const suppliedScreen = { kind: "admin-workspace" };

    expect(admin?.dataPolicy).toBe("non-persistent");
    expect(screen.ownerFeatureId).toBe("admin");
    expect(screen.render(createFeaturePresentationContext(
      { id: "admin.workspace", version: 1 }, suppliedScreen,
    ))).toBe(suppliedScreen);
    expect(runtime.extensions.has("admin.presentation.v1")).toBe(true);
  });
});
