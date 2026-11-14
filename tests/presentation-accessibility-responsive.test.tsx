import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { ApplicationShell, primaryShellDefinition } from "../apps/web/src/ui/ApplicationShell";

describe("application shell accessibility and responsive contract", () => {
  it("exposes named navigation, current destination, and an expandable settings control", () => {
    const markup = renderToStaticMarkup(createElement(ApplicationShell, {
      shellDefinition: primaryShellDefinition,
      activeScreen: "Drive",
      onNavigate: () => undefined,
      settingsContent: createElement("p", null, "Settings content"),
      children: createElement("section", null, "Drive content"),
    }));
    expect(markup).toContain('<nav class="bottom-navigation" aria-label="Primary navigation">');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('aria-label="Settings"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-controls="application-settings"');
    expect((markup.match(/class="bottom-navigation-item/g) ?? []).length).toBe(4);
  });

  it("retains narrow-viewport, safe-area, focus-visible and touch-target rules", async () => {
    const css = await readFile("apps/web/src/ui/styles.css", "utf8");
    expect(css).toMatch(/@media\s*\(max-width:\s*380px\)/);
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain(".bottom-navigation-item:focus-visible");
    expect(css).toMatch(/\.bottom-navigation-item\{[^}]*min-height:\s*(54|58)px/s);
    expect(css).toContain("100dvh");
  });
});
