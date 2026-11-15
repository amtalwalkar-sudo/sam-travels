import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminWorkspaceShell } from "../apps/web/src/ui/AdminWorkspaceShell";

const sections = [
  { id: "business-setup", label: "Business setup", content: createElement("p", null, "Business settings") },
  { id: "vehicle", label: "Vehicle", content: createElement("p", null, "Vehicle records") },
  { id: "driver", label: "Driver", content: createElement("p", null, "Driver records") },
  { id: "compliance", label: "Compliance", content: createElement("p", null, "Compliance records") },
  { id: "finance", label: "Finance", content: createElement("p", null, "Finance records") },
  { id: "maintenance", label: "Maintenance", content: createElement("p", null, "Maintenance records") },
];

describe("replaceable Admin workspace shell", () => {
  it("renders the six section contributions without depending on their implementation", () => {
    const markup = renderToStaticMarkup(createElement(AdminWorkspaceShell, { sections }));
    for (const section of sections) expect(markup).toContain(`>${section.label}</span>`);
    expect(markup).toContain('aria-label="Admin sections"');
    expect(markup).toContain("Manage business records and operations in one place.");
  });

  it("preserves the single-expanded-section interaction contract", () => {
    const markup = renderToStaticMarkup(createElement(AdminWorkspaceShell, {
      sections, initialExpandedSection: "finance",
    }));
    expect((markup.match(/aria-expanded="true"/g) ?? [])).toHaveLength(1);
    expect(markup).toContain('aria-controls="admin-section-panel-finance"');
    expect(markup).toContain('role="region" aria-labelledby="admin-section-trigger-finance"');
    expect(markup).toContain("Finance records");
    expect(markup).not.toContain("Business settings");
  });

  it("supports a fully collapsed initial presentation", () => {
    const markup = renderToStaticMarkup(createElement(AdminWorkspaceShell, {
      sections, initialExpandedSection: null,
    }));
    expect((markup.match(/aria-expanded="true"/g) ?? [])).toHaveLength(0);
    expect(markup).not.toContain("Finance records");
  });

  it("keeps cross-cutting identity presentation outside business section contributions", () => {
    const markup = renderToStaticMarkup(createElement(AdminWorkspaceShell, {
      sections, identityPanel: createElement("aside", { "data-identity-panel": "true" }, "Identity"),
    }));
    expect(markup).toContain('data-identity-panel="true"');
    expect(markup.indexOf("data-identity-panel")).toBeLessThan(markup.indexOf('aria-label="Admin sections"'));
  });
});
