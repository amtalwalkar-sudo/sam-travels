import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FeatureScreenHost } from "../apps/web/src/ui/FeatureScreenHost";
import { DISCOVERED_FEATURE_EXTENSIONS } from "../apps/web/src/generated-feature-catalog";
import { initializeRuntimeRegistry, registerFeatures, type RuntimeRegistry } from "../packages/core/src";

const extensionFeatureIds = new Set(DISCOVERED_FEATURE_EXTENSIONS.flatMap(extension =>
  extension.feature ? [extension.feature.id] : [],
));
const production = initializeRuntimeRegistry({
  features: [...registerFeatures().values()].filter(feature => !extensionFeatureIds.has(feature.id)),
  extensions: [...DISCOVERED_FEATURE_EXTENSIONS],
});

function ReplacementShell({ children }: { children: ReactNode }) {
  return createElement("main", { "data-shell": "independent" }, children);
}

describe("production screen replacement boundary", () => {
  it("registers each primary production screen behind a replaceable renderer contract", () => {
    const owners = new Set([...production.presentationScreens.values()].map(screen => screen.ownerFeatureId));
    for (const owner of ["work", "timeline", "performance", "admin"]) expect(owners.has(owner)).toBe(true);
  });

  it("replaces every registered production screen without replacing or coupling the shell", () => {
    const screens = [...production.presentationScreens.values()].filter(screen =>
      ["work", "timeline", "performance", "admin"].includes(screen.ownerFeatureId),
    );
    expect([...new Set(screens.map(screen => screen.ownerFeatureId))].sort()).toEqual(["admin", "performance", "timeline", "work"]);

    const replacements = new Map(production.presentationScreens);
    for (const [id, screen] of replacements) {
      replacements.set(id, Object.freeze({
        ...screen,
        render: () => createElement("article", { "data-replacement-screen": id }, "replacement renderer"),
      }));
    }
    const runtime = { ...production, presentationScreens: replacements } as RuntimeRegistry;

    for (const screen of screens) {
      const markup = renderToStaticMarkup(createElement(ReplacementShell, null,
        createElement(FeatureScreenHost, {
          registry: runtime,
          mountPoint: screen.mountPoint,
          contextContract: screen.context,
          context: Object.freeze({ productionContextContract: screen.context.id }),
        }),
      ));
      expect(markup).toContain('data-shell="independent"');
      expect(markup).toContain('data-replacement-screen="' + screen.id + '"');
      expect(markup).not.toContain("production screen implementation");
    }
  });
});
