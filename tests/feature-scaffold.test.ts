import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFeatureScaffold } from "../scripts/create-feature.mjs";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe("feature scaffolding", () => {
  it("creates the public entry point, safe runtime descriptor, guide, and registry test", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "sam-feature-scaffold-"));
    temporaryRoots.push(root);
    const created = await createFeatureScaffold({ root, featureId: "fleet-notes", label: "Fleet Notes" });

    expect(created).toHaveLength(4);
    const runtime = await readFile(path.join(root, "packages/features/fleet-notes/runtime.ts"), "utf8");
    const entry = await readFile(path.join(root, "packages/features/fleet-notes/index.ts"), "utf8");
    const test = await readFile(path.join(root, "tests/features/fleet-notes.extension.test.ts"), "utf8");
    expect(runtime).toContain('dataPolicy: "non-persistent"');
    expect(runtime).toContain('publicEntryPoint: "packages/features/fleet-notes/index.ts"');
    expect(runtime).toContain("FLEET_NOTES_FEATURE_EXTENSION");
    expect(entry).toContain("FLEET_NOTES_FEATURE_EXTENSION");
    expect(test).toContain("createApplicationRuntimeRegistry");
    expect(test).toContain('runtime.features.get("fleet-notes")');
  });

  it("rejects unsafe IDs and never overwrites an existing feature", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "sam-feature-scaffold-"));
    temporaryRoots.push(root);
    await expect(createFeatureScaffold({ root, featureId: "../unsafe", label: "Unsafe" }))
      .rejects.toThrow("lowercase kebab-case");
    await createFeatureScaffold({ root, featureId: "fleet-notes", label: "Fleet Notes" });
    await expect(createFeatureScaffold({ root, featureId: "fleet-notes", label: "Fleet Notes" }))
      .rejects.toThrow("Refusing to overwrite");
  });
});
