import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { WorkScreenShell } from "../packages/features/work";

describe("replaceable Work screen shell", () => {
  it("composes independently supplied regions without interpreting their contents", () => {
    const markup = renderToStaticMarkup(createElement(WorkScreenShell, {
      heading: createElement("h1", null, "Work"),
      status: createElement("p", { "data-slot": "status" }, "Ready"),
      workflow: createElement("button", { type: "button" }, "Start shift"),
      extensions: createElement("aside", null, "Feature contribution"),
    }));
    expect(markup).toContain('data-presentation-contract="work-shell-v1"');
    expect(markup).toContain("<h1>Work</h1>");
    expect(markup).toContain('data-slot="status"');
    expect(markup).toContain("<button type=\"button\">Start shift</button>");
    expect(markup).toContain("<aside>Feature contribution</aside>");
    expect(markup).toContain('aria-label="Current work"');
  });

  it("allows optional regions to be independently omitted", () => {
    const markup = renderToStaticMarkup(createElement(WorkScreenShell, {
      heading: createElement("h1", null, "Work"),
      workflow: createElement("p", null, "Workflow"),
    }));
    expect(markup).not.toContain("work-screen-status");
    expect(markup).not.toContain("work-screen-extensions");
    expect(markup).toContain("Workflow");
  });

  it("keeps the shell free of feature and infrastructure dependencies", async () => {
    const source = await readFile("packages/features/work/presentation/WorkScreenShell.tsx", "utf8");
    expect(source).not.toMatch(/packages\/(domain|application|storage|features)/);
    expect(source).not.toMatch(/(IndexedDB|Room|repository|workflow service)/i);
    expect(source).toContain("./work-screen.css");
  });

  it("does not shadow feature-owned status announcements", async () => {
    const source = await readFile("packages/features/work/presentation/WorkScreenStatus.tsx", "utf8");
    expect(source).toContain('aria-live={error ? "assertive" : "polite"}');
    expect(source).not.toContain('role={error ? "alert" : "status"}');
  });

  it("keeps the Work composition adapter limited to independently replaceable regions", async () => {
    const source = await readFile("packages/features/work/presentation/DriveScreen.tsx", "utf8");
    expect(source).toContain("<WorkScreenHeading />");
    expect(source).toContain("<WorkScreenStatus");
    expect(source).toContain("DriverWorkflowPanel workspace={workspace}");
    expect(source).toContain("<DriverWorkflowPanel workspace={workflowWorkspace} />");
    expect(source).toContain("extensions={extensions}");
    expect(source).not.toContain("loadTimeline:");
    expect(source).toContain("<WorkScreenShell");
    expect(source).not.toContain("work-screen.css");
    expect(source).not.toContain("useState(");
    expect(source).not.toContain("dispatch(");
  });

  it("keeps the workflow panel separate from shell and persistence infrastructure", async () => {
    const source = await readFile("packages/features/work/presentation/DriverWorkflowPanel.tsx", "utf8");
    expect(source).toContain("export function DriverWorkflowPanel");
    expect(source).not.toMatch(/packages\/(domain|application|storage)/);
    expect(source).not.toMatch(/IndexedDB|Room|createPlatformRepository/);
    expect(source).not.toContain("from \"../use-driver-workspace\"");
    expect(source).not.toContain("RuntimeRegistry");
    expect(source).not.toContain("FeatureScreenHost");
  });

  it("scopes responsive and touch-friendly styling to the Work shell", async () => {
    const css = await readFile("apps/web/src/ui/work/work-screen.css", "utf8");
    expect(css).toContain(".work-screen-shell");
    expect(css).toContain(".work-driver-card .primary-action");
    expect(css).toContain("min-height:56px");
    expect(css).toMatch(/@media\(max-width:380px\).*work-screen-header/s);
  });
});
