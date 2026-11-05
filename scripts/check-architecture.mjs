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
  if (p.startsWith("packages/presentation/src/")) return "presentation";
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
  const value = normalize(resolved);
  const extension = path.posix.extname(value);
  const withoutExtension = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(extension)
    ? value.slice(0, -extension.length)
    : value;
  const normalized = withoutExtension.endsWith("/") ? withoutExtension.slice(0, -1) : withoutExtension;
  const parts = normalized.split("/");
  return parts[0] === "packages" && parts[1] === "features" &&
    (parts.length === 3 || (parts.length === 4 && parts[3] === "index"));
}

function targetLayer(resolved) {
  const p = "/" + normalize(resolved);
  if (p.includes("/packages/core/src/")) return "core";
  if (p.includes("/packages/domain/src/")) return "domain";
  if (p.includes("/packages/application/src/")) return "application";
  if (p.includes("/packages/presentation/src/")) return "presentation";
  if (p.includes("/packages/storage-browser/src/") || p.includes("/packages/storage-android/src/")) return "storage";
  if (p.includes("/packages/features/")) return "feature";
  if (p.includes("/apps/web/src/")) return "ui";
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

    if (["core", "domain", "application", "presentation"].includes(from) && platformOrUiImport) {
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
      (from === "core" && ["domain", "application", "storage", "ui", "feature", "presentation"].includes(target)) ||
      (from === "domain" && ["application", "storage", "ui", "presentation"].includes(target)) ||
      (from === "application" && ["storage", "ui", "presentation"].includes(target)) ||
      (from === "presentation" && ["core", "domain", "application", "storage", "feature", "ui", "web-app"].includes(target)) ||
      (from === "storage" && ["ui", "presentation"].includes(target)) ||
      (["core", "domain", "application", "storage"].includes(from) && target === "feature") ||
      (from === "feature" && ["storage", "ui", "presentation"].includes(target)) ||
      (from === "ui" && target === "storage");
    if (forbidden) {
      failures.push(`${relative}: ${from} layer must not import ${target ?? "a forbidden adapter"} via "${specifier}"`);
    }

    if (from === "ui" && (
      specifier === "dexie" || specifier.startsWith("dexie/") ||
      specifier.startsWith("@capacitor/")
    )) {
      failures.push(`${relative}: presentation must use application/platform contracts, not direct storage or Capacitor APIs "${specifier}"`);
    }
  }
}


/**
 * Persistent data access is confined to the platform adapter/gateway layer.
 * Business/domain/features and bridge presentation code must use public
 * repository/application contracts rather than reaching into Room or Dexie.
 */
const androidPersistenceGateways = new Set([
  "android/app/src/main/java/in/samtravels/app/LocalDatabase.kt",
  "android/app/src/main/java/in/samtravels/app/DriverWorkflowStore.kt",
  "android/app/src/main/java/in/samtravels/app/RoomStorePlugin.kt",
  "android/app/src/main/java/in/samtravels/app/BackupPlugin.kt",
  "android/app/src/main/java/in/samtravels/app/DailyDropboxBackupWorker.kt",
  "android/app/src/main/java/in/samtravels/app/NativeBackupCoverage.kt",
]);

for (const absolute of sourceFiles) {
  const relative = normalize(path.relative(root, absolute));
  const content = await readFile(absolute, "utf8");
  const productionTypeScript = /^(?:packages|apps\/web\/src)\//.test(relative) &&
    !relative.startsWith("packages/storage-browser/src/");
  if (productionTypeScript && /(?:from|import\s*\()\s*["']dexie(?:\/[^"']*)?["']/.test(content)) {
    failures.push(relative + ": Dexie is a storage adapter dependency and may only be imported by packages/storage-browser");
  }
  const browserPersistenceGateways = new Set(["apps/web/src/browser-secure-vault.ts"]);
  if (productionTypeScript && /\bbrowserDatabase\b/.test(content) &&
      !browserPersistenceGateways.has(relative)) {
    failures.push(relative + ": browserDatabase is private to the browser persistence adapter");
  }
  if (relative.startsWith("android/app/src/main/") &&
      /\b[A-Za-z_]\w*\.(?:records|logBookEvents)\(\)/.test(content) &&
      !androidPersistenceGateways.has(relative)) {
    failures.push(relative + ": Room DAO access must remain inside an approved persistence/backup gateway");
  }
}

// Android/Kotlin rules supplement TypeScript dependency direction checks.
const kotlinSources = sourceFiles.filter(file => file.endsWith(".kt") || file.endsWith(".java"));
for (const absolute of kotlinSources) {
  const relative = normalize(path.relative(root, absolute));
  const content = await readFile(absolute, "utf8");
  if (relative.startsWith("android/app/src/main/")) {
    if (/^\s*@(Entity|Dao|Database)\b/m.test(content) && !relative.endsWith("/LocalDatabase.kt")) {
      failures.push(relative + ": Room declarations must be centralized in LocalDatabase.kt");
    }
    if (/^\s*@PluginMethod\b/m.test(content) && !relative.endsWith("Plugin.kt")) {
      failures.push(relative + ": Capacitor bridge methods must be isolated in *Plugin.kt adapters");
    }
    if (/Class\.forName\s*\(|java\.lang\.reflect|DexClassLoader/.test(content)) {
      failures.push(relative + ": reflection/dynamic loading bypasses static architecture enforcement");
    }
  }
  if (/^packages\/(core|domain|application|presentation)\/src\//.test(relative) &&
      (/^\s*import\s+(?:android\.|androidx\.|com\.getcapacitor\.|java\.io\.)/m.test(content) ||
       /\b(?:androidx\.room|android\.content\.|android\.location\.|com\.getcapacitor\.|java\.io\.)/.test(content))) {
    failures.push(relative + ": platform-neutral Kotlin may not reference Android, Room, Capacitor, or Java I/O");
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

// The application must validate one shared runtime registry before mounting UI.
const applicationEntry = await readFile(path.join(root, "apps/web/src/main.tsx"), "utf8");
const workspaceConsumer = await readFile(path.join(root, "apps/web/src/ui/use-driver-workspace.ts"), "utf8");
const registryCall = applicationEntry.indexOf("getApplicationRuntimeRegistry();");
const uiMount = applicationEntry.indexOf("createRoot(");
if (registryCall < 0 || uiMount < 0 || registryCall > uiMount) {
  failures.push("apps/web/src/main.tsx: the validated application runtime registry must be initialized before UI mounting");
}
if (!workspaceConsumer.includes("getApplicationRuntimeRegistry()")) {
  failures.push("apps/web/src/ui/use-driver-workspace.ts: runtime consumers must reuse the application registry singleton");
}
for (const absolute of sourceFiles) {
  const relative = normalize(path.relative(root, absolute));
  if (!relative.startsWith("apps/web/src/")) continue;
  const content = await readFile(absolute, "utf8");
  if (content.includes("initializeApplicationRuntimeRegistry(")) {
    failures.push(relative + ": application consumers must use the shared runtime registry, not create independent registries");
  }
}

if (failures.length) {
  console.error("Architecture gate failed:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exitCode = 1;
} else {
  const dependencyCount = [...featureGraph.values()].reduce((sum, edges) => sum + edges.size, 0);
  console.log(`Architecture gate passed: ${sourceFiles.length} source files checked; dependency direction, public feature boundaries (${featureGraph.size} feature packages / ${dependencyCount} declared edges), Android/Kotlin adapter boundaries, cycle checks, and source-size limits are within policy.`);
}
