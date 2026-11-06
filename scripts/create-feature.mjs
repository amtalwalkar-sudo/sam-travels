import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateFeatureCatalog } from "./discover-features.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const templateDirectory = path.resolve(scriptDirectory, "../templates/feature");

function assertFeatureInput(featureId, label) {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(featureId)) {
    throw new Error("Feature ID must be lowercase kebab-case (for example, finance-insights)");
  }
  if (!label.trim() || /["\r\n]/.test(label)) {
    throw new Error("Feature label must be non-empty and cannot contain quotes or newlines");
  }
}

async function ensureAbsent(filePath) {
  try {
    await access(filePath);
    throw new Error("Refusing to overwrite existing path: " + filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

/** Create a safe, non-persistent feature package and its first registry contract test. */
export async function createFeatureScaffold({ root = process.cwd(), featureId, label }) {
  assertFeatureInput(featureId, label);
  const featureDirectory = path.join(root, "packages", "features", featureId);
  const testDirectory = path.join(root, "tests", "features");
  const testPath = path.join(testDirectory, featureId + ".extension.test.ts");
  await ensureAbsent(featureDirectory);
  await ensureAbsent(testPath);

  const featureConstant = featureId.toUpperCase().replace(/-/g, "_");
  const replacements = {
    "__FEATURE_ID__": featureId,
    "__FEATURE_LABEL__": label,
    "__FEATURE_CONST__": featureConstant,
  };
  const outputs = [
    ["feature.manifest.json.tpl", path.join(featureDirectory, "feature.manifest.json")],
    ["index.ts.tpl", path.join(featureDirectory, "index.ts")],
    ["runtime.ts.tpl", path.join(featureDirectory, "runtime.ts")],
    ["README.md.tpl", path.join(featureDirectory, "README.md")],
    ["extension.test.ts.tpl", testPath],
  ];

  const rendered = [];
  for (const [templateName, outputPath] of outputs) {
    let content = await readFile(path.join(templateDirectory, templateName), "utf8");
    for (const [token, value] of Object.entries(replacements)) {
      content = content.replaceAll(token, value);
    }
    if (/__FEATURE_[A-Z_]+__/.test(content)) {
      throw new Error("Unresolved scaffold token in " + templateName);
    }
    rendered.push([outputPath, content]);
  }

  await mkdir(featureDirectory, { recursive: true });
  await mkdir(testDirectory, { recursive: true });
  for (const [outputPath, content] of rendered) {
    await writeFile(outputPath, content, { flag: "wx" });
  }
  await generateFeatureCatalog({ root });
  return [
    ...rendered.map(([outputPath]) => path.relative(root, outputPath).split(path.sep).join("/")),
    "apps/web/src/generated-feature-catalog.ts",
  ];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [featureId, ...labelParts] = process.argv.slice(2);
  const label = labelParts.join(" ").trim();
  if (!featureId || !label) {
    console.error('Usage: npm run feature:create -- <feature-id> "<Feature Label>"');
    process.exitCode = 1;
  } else {
    try {
      const created = await createFeatureScaffold({ featureId, label });
      console.log("Created feature scaffold:");
      for (const file of created) console.log(" - " + file);
      console.log("Next: implement the feature contract. Its manifest is included in the generated static catalogue; no main.tsx registration edit is needed.");
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
