import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".kt", ".java"]);
const ignoredDirectories = new Set(["node_modules", ".git", "dist", "build", ".gradle", "coverage"]);
const maxLines = 400;
const maxBytes = 24 * 1024;
const failures = [];
const sourceFiles = [];
const importsByFeature = new Map();

const normalize = (value) => value.split(path.sep).join("/");

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(absolute);
    else if (sourceExtensions.has(path.extname(entry.name))) sourceFiles.push(absolute);
  }
}

function layer(file) {
  const p = normalize(file);
  if (p.startsWith("packages/core/src/")) return "core";
  if (p.startsWith("packages/domain/src/")) return "domain";
  if (p.startsWith("packages/application/src/")) return "application";
  if (p.startsWith("packages/storage-browser/src/") || p.startsWith("packages/storage-android/src/")) return "storage";
  if (p.startsWith("packages/features/")) return "feature";
  if (p.startsWith("apps/web/src/ui/") || p.startsWith("apps/web/src/components/")) return "ui";
  if (p.startsWith("apps/web/src/")) return "web-app";
  return "outer";
}

function featureName(file) {
  const match = normalize(file).match(/^packages\/features\/([^/]+)\//);
  return match?.[1] ?? null;
}

function featureTarget(file) {
  const match = normalize(file).match(/(?:^|\/)packages\/features\/([^/]+)(?:\/|$)/);
  return match?.[1] ?? null;
}

function isPublicFeatureEntry(resolved) {
  const normalized = normalize(resolved).replace(/\.(?:ts|tsx|js|jsx|mjs|cjs)$/, "").replace(/\/$/, "");
  return /\/packages\/features\/[^/]+(?:\/index)?$/.test(normalized);
}

function targetLayer(resolved) {
  if (resolved.includes("/packages/core/src/")) return "core";
  if (resolved.includes("/packages/domain/src/")) return "domain";
  if (resolved.includes("/packages/application/src/")) return "application";
  if (resolved.includes("/packages/storage-browser/src/") || resolved.includes("/packages/storage-android/src/")) return "storage";
  if (resolved.includes("/packages/features/")) return "feature";
  if (resolved.includes("/apps/web/src/")) return "ui";
  return null;
}

function readImportSpecifiers(content) {
  const pattern = /\b(?:import|export)\s*(?:type\s+)?(?:[^"'()]*?\bfrom\s*)?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;
  return [...content.matchAll(pattern)].map((match) => match[1] ?? match[2] ?? match[3]);
}

function aliasResolver(tsconfig) {
  const compiler = tsconfig.compilerOptions ?? {};
  const baseUrl = compiler.baseUrl ?? ".";
  const paths = compiler.paths ?? {};
  return (specifier) => {
    for (const [pattern, destinations] of Object.entries(paths)) {
      const star = pattern.indexOf("*");
      const prefix = star < 0 ? pattern : pattern.slice(0, star);
      const suffix = star < 0 ? "" : pattern.slice(star + 1);
      if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;
      const capture = specifier.slice(prefix.length, specifier.length - suffix.length || undefined);
      const destination = destinations[0];
      if (typeof destination !== "string") continue;
      const replaced = destination.replace("*", capture);
      return normalize(path.posix.join(baseUrl, replaced));
    }
    return null;
  };
}

function resolveImport(specifier, fromFile, resolveAlias) {
  if (specifier.startsWith(".")) {
    return normalize(path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier)));
  }
  return resolveAlias(specifier);
}

function detectCycles(graph) {
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const cycles = [];
  function visit(node) {
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      cycles.push([...stack.slice(start), node].join(" -> "));
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    stack.push(node);
    for (const next of graph.get(node) ?? []) visit(next);
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  }
  for (const node of graph.keys()) visit(node);
  return [...new Set(cycles)];
}

await walk(root);
let resolveAlias = () => null;
try {
  const tsconfig = JSON.parse(await readFile(path.join(root, "tsconfig.json"), "utf8"));
  resolveAlias = aliasResolver(tsconfig);
} catch {
  failures.push("tsconfig.json: architecture checker could not parse TypeScript path aliases");
}

const featureGraph = new Map();
for (const absolute of sourceFiles) {
  const relative = normalize(path.relative(root, absolute));
  const content = await readFile(absolute, "utf8");
  const bytes = (await stat(absolute)).size;
  const lines = content.split(/\r?\n/).length;
  if (lines > maxLines || bytes > maxBytes) {
    failures.push(`${relative}: ${lines} lines / ${bytes} bytes (limit ${maxLines} lines / ${maxBytes} bytes)`);
  }

  const from = layer(relative);
  const fromFeature = featureName(relative);
  if (fromFeature) featureGraph.set(fromFeature, featureGraph.get(fromFeature) ?? new Set());

  for (const specifier of readImportSpecifiers(content)) {
    const resolved = resolveImport(specifier, relative, resolveAlias);
    const target = resolved ? targetLayer(resolved) : null;
    const toFeature = resolved ? featureTarget(resolved) : null;

    if (fromFeature && toFeature && fromFeature !== toFeature) {
      if (!isPublicFeatureEntry(resolved)) {
        failures.push(`${relative}: cross-feature import must use the public entry point for "${toFeature}", not "${specifier}"`);
      } else {
        featureGraph.get(fromFeature).add(toFeature);
      }
    }

    const platformOrUiImport =
      specifier === "react" || specifier.startsWith("react/") ||
      specifier === "react-dom" || specifier.startsWith("react-dom/") ||
      specifier === "dexie" || specifier.startsWith("dexie/") ||
      specifier.startsWith("@capacitor/") ||
      /^(?:androidx\.|android\.|java\.|javax\.|org\.json|com\.dropbox\.)/.test(specifier);

    if (["core", "domain", "application"].includes(from) && platformOrUiImport) {
      failures.push(`${relative}: ${from} layer must not depend on UI, persistence, or platform SDK "${specifier}"`);
    }
    if (from === "storage" && (
      specifier === "react" || specifier.startsWith("react/") ||
      specifier === "react-dom" || specifier.startsWith("react-dom/") ||
      specifier.startsWith("@capacitor/")
    )) {
      failures.push(`${relative}: persistence adapters must not depend on UI or Capacitor "${specifier}"`);
    }

    const forbidden =
      (from === "core" && ["domain", "application", "storage", "ui", "feature"].includes(target)) ||
      (from === "domain" && ["application", "storage", "ui"].includes(target)) ||
      (from === "application" && ["storage", "ui"].includes(target)) ||
      (from === "storage" && target === "ui") ||
      (["core", "domain", "application", "storage"].includes(from) && target === "feature") ||
      (from === "feature" && ["storage", "ui"].includes(target)) ||
      (from === "ui" && target === "storage") ||
      (from === "web-app" && target === "storage");
    if (forbidden) {
      failures.push(`${relative}: ${from} layer must not import ${target ?? "a forbidden adapter"} via "${specifier}"`);
    }

    if ((from === "ui" || from === "web-app") && (
      specifier === "dexie" || specifier.startsWith("dexie/") ||
      specifier.startsWith("@capacitor/")
    )) {
      failures.push(`${relative}: presentation must use application/platform contracts, not direct storage or Capacitor APIs "${specifier}"`);
    }
  }
}

for (const cycle of detectCycles(featureGraph)) {
  failures.push(`feature dependency cycle detected: ${cycle}`);
}

const foundationContract = await readFile(path.join(root, "docs/ARCHITECTURE_FOUNDATION_CONTRACT.md"), "utf8");
const featureContract = await readFile(path.join(root, "docs/FEATURE_MODULE_CONTRACT.md"), "utf8");
const requiredFoundationSections = [
  "## 7. Feature registration, lifecycle, and dependency contracts",
  "## 8. Complete business backup and restore participation",
  "## 9. Calculation ownership and feature integration contracts",
];
for (const section of requiredFoundationSections) {
  if (!foundationContract.includes(section)) failures.push(`docs/ARCHITECTURE_FOUNDATION_CONTRACT.md: missing required section "${section}"`);
}
const requiredFeatureContractSections = [
  "## Mandatory persistent-feature registry",
  "## Feature lifecycle and data retention",
  "## Complete backup and restore participation",
  "## Calculation ownership and integrations",
];
for (const section of requiredFeatureContractSections) {
  if (!featureContract.includes(section)) failures.push(`docs/FEATURE_MODULE_CONTRACT.md: missing required section "${section}"`);
}

if (failures.length) {
  console.error("Architecture gate failed:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exitCode = 1;
} else {
  const dependencyCount = [...featureGraph.values()].reduce((sum, edges) => sum + edges.size, 0);
  console.log(`Architecture gate passed: ${sourceFiles.length} source files checked; dependency direction, public feature boundaries (${featureGraph.size} feature packages / ${dependencyCount} declared edges), cycle checks, and source-size limits are within policy.`);
}
