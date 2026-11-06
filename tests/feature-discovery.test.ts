import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateFeatureCatalog } from "../scripts/discover-features.mjs";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function addFeature(root: string, id: string): Promise<void> {
  const directory = path.join(root, "packages", "features", id);
  const constant = id.toUpperCase().replace(/-/g, "_") + "_FEATURE_EXTENSION";
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "feature.manifest.json"), JSON.stringify({
    manifestVersion: 1,
    id,
    entryPoint: "packages/features/" + id + "/index.ts",
    extensionExport: constant,
  }));
  await writeFile(path.join(directory, "index.ts"), `export { ${constant} } from "./runtime";\n`);
}

describe("deterministic feature discovery", () => {
  it("generates a sorted, statically linked catalogue from explicit manifests", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "sam-feature-discovery-"));
    roots.push(root);
    await addFeature(root, "zeta-notes");
    await addFeature(root, "alpha-notes");

    const generated = await generateFeatureCatalog({ root });

    expect(generated.indexOf("alpha-notes/index")).toBeLessThan(generated.indexOf("zeta-notes/index"));
    expect(generated).toContain("ALPHA_NOTES_FEATURE_EXTENSION");
    expect(generated).toContain("ZETA_NOTES_FEATURE_EXTENSION");
    expect(generated).toContain("Object.freeze([");
    expect(generated).not.toContain("import.meta.glob");
    expect(generated).not.toContain("dynamic import");
    expect(await readFile(path.join(root, "apps/web/src/generated-feature-catalog.ts"), "utf8")).toBe(generated);
    await expect(generateFeatureCatalog({ root, check: true })).resolves.toBe(generated);
  });

  it("rejects a manifest whose identity or public entry point is unsafe", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "sam-feature-discovery-invalid-"));
    roots.push(root);
    await addFeature(root, "finance-notes");
    const manifestPath = path.join(root, "packages/features/finance-notes/feature.manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.entryPoint = "../../private.ts";
    await writeFile(manifestPath, JSON.stringify(manifest));

    await expect(generateFeatureCatalog({ root })).rejects.toThrow("canonical public entry point");
  });

  it("rejects a manifest that names an export missing from the public entry point", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "sam-feature-discovery-export-"));
    roots.push(root);
    await addFeature(root, "fleet-notes");
    const indexPath = path.join(root, "packages/features/fleet-notes/index.ts");
    await writeFile(indexPath, "export {};\n");

    await expect(generateFeatureCatalog({ root })).rejects.toThrow("does not export FLEET_NOTES_FEATURE_EXTENSION");
  });

  it("detects stale generated output instead of silently rewriting it in check mode", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "sam-feature-discovery-stale-"));
    roots.push(root);
    await addFeature(root, "fleet-notes");
    await generateFeatureCatalog({ root });
    await writeFile(path.join(root, "apps/web/src/generated-feature-catalog.ts"), "// stale\n");

    await expect(generateFeatureCatalog({ root, check: true })).rejects.toThrow("catalogue is stale");
  });
});
