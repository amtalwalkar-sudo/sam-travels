import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FeatureScreenHost, ScreenFailureBoundary } from "../apps/web/src/ui/FeatureScreenHost";
import { initializeRuntimeRegistry, type FeatureExtensionDefinition, type FeaturePresentationContext, type FeaturePresentationScreen } from "../packages/core/src";

type ScreenContext = FeaturePresentationContext<"fixture.render", 1, Readonly<{ message: string }>>;
const screen: FeaturePresentationScreen<ScreenContext> = {
  id: "fixture.render.v1",
  ownerFeatureId: "presentation-render-fixture",
  version: 1,
  mountPoint: "fixture/render",
  label: "Render fixture",
  context: { id: "fixture.render", version: 1 },
  render: context => createElement("article", { "data-screen-id": "fixture.render.v1" }, context.value.message),
};
const extension: FeatureExtensionDefinition = {
  id: "presentation-render-fixture.v1",
  version: 1,
  featureId: "presentation-render-fixture",
  publicEntryPoint: "packages/features/presentation-render-fixture/index.ts",
  feature: {
    id: "presentation-render-fixture",
    label: "Presentation render fixture",
    dataPolicy: "non-persistent",
    contractVersion: 1,
    dependencies: [{ id: "logbook", contractVersion: 1 }],
  },
  presentationScreens: [screen],
};
const runtime = initializeRuntimeRegistry({ extensions: [extension] });

function ReplacementShell({ children }: { children: ReactNode }) {
  return createElement("main", { "data-shell": "replacement" }, children);
}

describe("runtime feature screen mounting", () => {
  it("mounts the same registered custom screen inside a replacement shell", () => {
    const host = createElement(FeatureScreenHost, {
      registry: runtime,
      mountPoint: "fixture/render",
      contextContract: { id: "fixture.render", version: 1 },
      context: { message: "mounted through host" },
    });
    const markup = renderToStaticMarkup(createElement(ReplacementShell, null, host));
    expect(markup).toContain('data-shell="replacement"');
    expect(markup).toContain('data-screen-id="fixture.render.v1"');
    expect(markup).toContain("mounted through host");
  });

  it("does not render a screen registered at a different mount point", () => {
    const markup = renderToStaticMarkup(createElement(FeatureScreenHost, {
      registry: runtime,
      mountPoint: "fixture/other",
      contextContract: { id: "fixture.render", version: 1 },
      context: { message: "must not appear" },
    }));
    expect(markup).toBe("");
  });
});

describe("feature screen failure containment", () => {
  it("converts a renderer exception into a retryable, isolated fallback", () => {
    const failures: string[] = [];
    const boundary = new ScreenFailureBoundary({
      screenId: "fixture.broken.v1",
      children: null,
      onFailure: screenId => failures.push(screenId),
    });
    boundary.state = ScreenFailureBoundary.getDerivedStateFromError();
    const fallback = renderToStaticMarkup(boundary.render() as ReactElement);
    boundary.componentDidCatch();
    expect(fallback).toContain('role="alert"');
    expect(fallback).toContain("Retry section");
    expect(failures).toEqual(["fixture.broken.v1"]);
  });
});
