import { describe, expect, it } from "vitest";
import { analyzeBrowserPersistenceReferences, analyzeModuleReferences } from "../scripts/architecture-import-parser.mjs";

describe("compiler-backed architecture import parser", () => {
  it("collects static, re-export, dynamic, and CommonJS module references", () => {
    const source = [
      'import type { Port } from "../application/port";',
      'export { run } from "@features/work";',
      'const load = import("../storage/index");',
      'const legacy = require("dexie");',
    ].join("\n");

    const result = analyzeModuleReferences(source, "fixture.ts");
    expect(result.diagnostics).toEqual([]);
    expect(result.references.map(({ specifier, kind }) => [specifier, kind])).toEqual([
      ["../application/port", "import"],
      ["@features/work", "export"],
      ["../storage/index", "dynamic-import"],
      ["dexie", "require"],
    ]);
  });

  it("ignores import-like text in comments and string literals", () => {
    const source = [
      '// import "dexie";',
      'const example = "require(\\\"dexie\\\")";',
      '/* export * from "../private"; */',
      'const value = 1;',
    ].join("\n");

    const result = analyzeModuleReferences(source, "fixture.ts");
    expect(result.diagnostics).toEqual([]);
    expect(result.references).toEqual([]);
  });

  it("fails closed on malformed TypeScript instead of silently skipping imports", () => {
    const result = analyzeModuleReferences('import { value } from "./broken";\nconst = ;', "broken.ts");
    expect(result.references).toHaveLength(1);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("parses JSX/TSX module declarations", () => {
    const result = analyzeModuleReferences(
      'import React from "react"; export const View = () => <main />;',
      "component.tsx",
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.references.map((item) => item.specifier)).toEqual(["react"]);
  });
});
