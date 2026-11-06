import { describe, expect, it } from "vitest";
import { isPublicFeatureEntry, resolveImport } from "../scripts/architecture-import-policy.mjs";

describe("public feature import boundary", () => {
  it("allows a feature package directory and its explicit index.ts", () => {
    expect(isPublicFeatureEntry("packages/features/logbook")).toBe(true);
    expect(isPublicFeatureEntry("packages/features/logbook/index.ts")).toBe(true);
  });

  it("rejects private implementation files even when imported by the application", () => {
    expect(isPublicFeatureEntry("packages/features/logbook/runtime.ts")).toBe(false);
    expect(isPublicFeatureEntry("packages/features/logbook/projection.ts")).toBe(false);
    expect(isPublicFeatureEntry("packages/features/logbook/private/index.ts")).toBe(false);
  });

  it("resolves relative feature imports before applying the public boundary", () => {
    const resolved = resolveImport("../../../packages/features/logbook/runtime", "apps/web/src/main.tsx", () => null);
    expect(resolved).toBe("packages/features/logbook/runtime");
    expect(isPublicFeatureEntry(resolved ?? "")).toBe(false);
  });
});
