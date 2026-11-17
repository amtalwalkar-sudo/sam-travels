import { describe, expect, it } from "vitest";
import { analyzeBrowserPersistenceReferences, analyzeModuleReferences } from "../scripts/architecture-import-parser.mjs";
import { createAliasResolver, isBrowserPersistenceModule, isForbiddenLayerDependency, isPublicFeatureEntry, resolveImport, targetLayer } from "../scripts/architecture-import-policy.mjs";

describe("compiler-backed architecture import parser", () => {
  it("resolves configured aliases before enforcing forbidden storage-layer dependencies", () => {
    const resolveAlias = createAliasResolver({ compilerOptions: { baseUrl: ".", paths: { "@storage/*": ["packages/storage-browser/src/*"] } } });
    const resolved = resolveImport("@storage/index", "packages/application/src/feature.ts", resolveAlias);
    expect(resolved).toBe("packages/storage-browser/src/index");
    if (resolved) {
      expect(targetLayer(resolved)).toBe("storage");
      expect(isForbiddenLayerDependency("application", targetLayer(resolved))).toBe(true);
    }
  });

  it("rejects persistence-library imports outside the storage adapter", () => {
    expect(isBrowserPersistenceModule("idb")).toBe(true);
    expect(isBrowserPersistenceModule("idb-keyval")).toBe(true);
    expect(isBrowserPersistenceModule("localforage")).toBe(true);
    expect(isBrowserPersistenceModule("dexie")).toBe(true);
    expect(isBrowserPersistenceModule("@/application/port")).toBe(false);
  });

  it("allows only public feature entry points across feature packages", () => {
    expect(isPublicFeatureEntry("packages/features/work/index.ts")).toBe(true);
    expect(isPublicFeatureEntry("packages/features/work/internal/store.ts")).toBe(false);
  });

  it("recognizes capability-owned architectural sublayers", () => {
    expect(targetLayer("packages/features/work-shift/domain/driver-workflow.ts")).toBe("feature-domain");
    expect(targetLayer("packages/features/work-shift/application/workspace-coordinator.ts")).toBe("feature-application");
    expect(targetLayer("packages/features/work-shift/ports/driver-workflow.ts")).toBe("feature-ports");
    expect(targetLayer("packages/features/work-shift/adapters/dexie-driver-workflow.ts")).toBe("feature-adapters");
    expect(targetLayer("packages/features/work-shift/presentation/DriveScreen.tsx")).toBe("feature-presentation");
    expect(targetLayer("packages/features/work-shift/index.ts")).toBe("feature-root");
    expect(targetLayer("packages/features/work-shift/driver-swipe-action.ts")).toBe("feature-root");
  });

  it("enforces inward dependencies within a capability without blocking application coordination", () => {
    expect(isForbiddenLayerDependency("feature-domain", "feature-application")).toBe(true);
    expect(isForbiddenLayerDependency("feature-domain", "storage")).toBe(true);
    expect(isForbiddenLayerDependency("feature-application", "feature-domain")).toBe(false);
    expect(isForbiddenLayerDependency("feature-application", "feature-ports")).toBe(false);
    expect(isForbiddenLayerDependency("feature-application", "application")).toBe(false);
    expect(isForbiddenLayerDependency("feature-application", "feature-adapters")).toBe(true);
    expect(isForbiddenLayerDependency("feature-application", "storage")).toBe(true);
    expect(isForbiddenLayerDependency("feature-presentation", "feature-application")).toBe(false);
    expect(isForbiddenLayerDependency("feature-presentation", "feature-domain")).toBe(false);
    expect(isForbiddenLayerDependency("feature-presentation", "application")).toBe(true);
    expect(isForbiddenLayerDependency("application", "feature-root")).toBe(true);
  });

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
      'const example = "require(\\"dexie\\")";',
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

  it("detects browser persistence reads and writes across IndexedDB, Web Storage and Cache APIs", () => {
    const source = [
      'window.indexedDB.open("business");',
      'request.result.transaction("records", "readwrite").objectStore("records").put(value);',
      'window.localStorage.setItem("record", value);',
      'globalThis["indexedDB"].deleteDatabase("old");',
      'browserDatabase.records.put(record);',
      'sessionStorage.removeItem("record");',
      'caches.delete("business-cache");',
      'navigator.storage.persist();',
      'const factory: IDBFactory = indexedDB;',
      'const table = new Dexie("business");',
      'declare const store: IDBObjectStore;',
    ].join("\n");
    expect(analyzeBrowserPersistenceReferences(source, "unsafe.ts").map((item) => item.symbol)).toEqual([
      "indexedDB", "localStorage", "indexedDB", "browserDatabase",
      "sessionStorage", "caches", "navigator.storage", "IDBFactory",
      "indexedDB", "new Dexie", "IDBObjectStore",
    ]);
  });

  it("ignores persistence-like words in comments and strings", () => {
    const source = [
      '// localStorage.clear(); indexedDB.deleteDatabase("x")',
      'const note = "new Dexie(); IDBObjectStore localStorage";',
    ].join("\n");
    expect(analyzeBrowserPersistenceReferences(source, "safe.ts")).toEqual([]);
  });
});
