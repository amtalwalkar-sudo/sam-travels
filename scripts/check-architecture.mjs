import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { analyzeBrowserPersistenceReferences, analyzeModuleReferences } from "./architecture-import-parser.mjs";
import { createAliasResolver, isBrowserPersistenceModule, isForbiddenLayerDependency, isPublicFeatureEntry, resolveImport, targetLayer } from "./architecture-import-policy.mjs";

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
  resolveAlias = createAliasResolver(tsconfig);
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

  const isTypeScriptSource = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(relative);
  const parsed = isTypeScriptSource
    ? analyzeModuleReferences(content, relative)
    : { references: [], diagnostics: [] };
  for (const diagnostic of parsed.diagnostics) {
    failures.push(`${relative}${diagnostic.line ? `:${diagnostic.line}` : ""} TypeScript parser error ${diagnostic.code}: ${diagnostic.message}`);
  }

  for (const reference of parsed.references) {
    const specifier = reference.specifier;
    const productionTypeScript = /^(?:packages|apps\/web\/src)\//.test(relative) &&
      !relative.startsWith("packages/storage-browser/src/");
    if (productionTypeScript && isBrowserPersistenceModule(specifier)) {
      failures.push(`${relative}:${reference.line}: browser persistence library "${specifier}" is private to the browser persistence adapter`);
    }
    const resolved = resolveImport(specifier, relative, resolveAlias);
    const target = resolved ? targetLayer(resolved) : null;
    const toFeature = resolved ? featureTarget(resolved) : null;

    // Every consumer outside a feature must use that feature's public entry point.
    // This includes the application composition root and UI, not only feature-to-feature imports.
    if (toFeature && fromFeature !== toFeature) {
      if (!isPublicFeatureEntry(resolved)) {
        failures.push(`${relative}:${reference.line}: imports of feature "${toFeature}" must use its public index.ts entry point, not "${specifier}"`);
      } else if (fromFeature) {
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

    if (isForbiddenLayerDependency(from, target)) {
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
  "android/app/src/main/java/in/samtravels/app/DriverWorkflowOutbox.kt",
  "android/app/src/main/java/in/samtravels/app/DriverCancellationFeeStore.kt",
  "android/app/src/main/java/in/samtravels/app/WorkDriverContextResolver.kt",
  "android/app/src/main/java/in/samtravels/app/RoomStorePlugin.kt",
  "android/app/src/main/java/in/samtravels/app/BackupPlugin.kt",
  "android/app/src/main/java/in/samtravels/app/DailyDropboxBackupWorker.kt",
  "android/app/src/main/java/in/samtravels/app/TimelineEnrichmentStore.kt",
  "android/app/src/main/java/in/samtravels/app/NativeBackupCoverage.kt",
  "android/app/src/main/java/in/samtravels/app/NativeFeatureBackupParticipants.kt",
]);

for (const absolute of sourceFiles) {
  const relative = normalize(path.relative(root, absolute));
  const content = await readFile(absolute, "utf8");
  const productionTypeScript = /^(?:packages|apps\/web\/src)\//.test(relative) &&
    !relative.startsWith("packages/storage-browser/src/");
  const browserPersistenceGateways = new Set([
    "apps/web/src/browser-secure-vault.ts",
    "apps/web/src/backup-config-storage.ts",
  ]);
  if (productionTypeScript && !browserPersistenceGateways.has(relative)) {
    for (const reference of analyzeBrowserPersistenceReferences(content, relative)) {
      failures.push(`${relative}:${reference.line}: direct browser persistence access "${reference.symbol}" is private to the browser persistence adapter`);
    }
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

/** Every declared extension entry point must resolve to a checked-in public file. */
const checkedInSourcePaths = new Set(sourceFiles.map(file => normalize(path.relative(root, file))));
for (const featureId of featureGraph.keys()) {
  const publicEntry = `packages/features/${featureId}/index.ts`;
  if (!checkedInSourcePaths.has(publicEntry)) {
    failures.push(`packages/features/${featureId}: missing public entry point ${publicEntry}`);
  }
}
for (const absolute of sourceFiles) {
  const relative = normalize(path.relative(root, absolute));
  if (!relative.startsWith("packages/features/")) continue;
  const content = await readFile(absolute, "utf8");
  for (const match of content.matchAll(/publicEntryPoint\s*:\s*["']([^"']+)["']/g)) {
    const entryPoint = normalize(match[1]);
    if (!checkedInSourcePaths.has(entryPoint)) {
      failures.push(`${relative}: feature public entry point "${entryPoint}" does not resolve to a checked-in source file`);
    }
  }
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

// Application package owns the shared registry; the outer entry point supplies extensions.
const applicationEntry = await readFile(path.join(root, "apps/web/src/main.tsx"), "utf8");
const applicationRegistry = await readFile(path.join(root, "packages/application/src/runtime-registry.ts"), "utf8");
const workspaceConsumer = await readFile(path.join(root, "apps/web/src/ui/use-driver-workspace.ts"), "utf8");
const registryCall = applicationEntry.indexOf("initializeApplicationRuntimeRegistry(");
const uiMount = applicationEntry.indexOf("createRoot(");
if (registryCall < 0 || uiMount < 0 || registryCall > uiMount) failures.push("apps/web/src/main.tsx: application runtime must initialize before UI mounting");
if ((applicationEntry.match(/initializeApplicationRuntimeRegistry\s*\(/g) ?? []).length !== 1) {
  failures.push("apps/web/src/main.tsx: exactly one application runtime registry initialization is permitted");
}
if ((applicationEntry.match(/createPlatformRepository\s*\(/g) ?? []).length !== 1) {
  failures.push("apps/web/src/main.tsx: exactly one authoritative platform repository construction is permitted");
}

if (!applicationRegistry.includes("initializeRuntimeRegistry(definitions)") || !applicationRegistry.includes("let applicationRuntimeRegistry") || !applicationRegistry.includes("Application runtime registry has not been initialized")) failures.push("packages/application/src/runtime-registry.ts: application layer must own validated registry construction and singleton lifecycle");
if (!workspaceConsumer.includes('from "../../../../packages/application/src"') || !workspaceConsumer.includes("useDriverWorkspace(runtime: RuntimeRegistry")) failures.push("apps/web/src/ui/use-driver-workspace.ts: runtime consumers must receive the application-layer registry singleton");
const appPresentation = await readFile(path.join(root, "apps/web/src/ui/App.tsx"), "utf8");
const shellPresentation = await readFile(path.join(root, "apps/web/src/ui/ApplicationShell.tsx"), "utf8");
const featureCatalogue = await readFile(path.join(root, "apps/web/src/generated-feature-catalog.ts"), "utf8");
if (!appPresentation.includes("ShellRenderer?: ComponentType<ApplicationShellProps>") ||
    !appPresentation.includes("<ShellRenderer shellDefinition={shellDefinition}")) {
  failures.push("apps/web/src/ui/App.tsx: application shell must be replaceable through the injected shell renderer contract");
}
if (!shellPresentation.includes("shellDefinition: typeof primaryShellDefinition") ||
    !shellPresentation.includes("shellDefinition.navigation.map")) {
  failures.push("apps/web/src/ui/ApplicationShell.tsx: shell renderer must consume the application-supplied navigation definition");
}
if (!featureCatalogue.includes("ADMIN_FEATURE_EXTENSION") ||
    !appPresentation.includes('FeatureScreenHost registry={runtimeRegistry} mountPoint="Admin" context={<AdminWorkspace />}')) {
  failures.push("Admin workspace must be registered in the generated feature catalogue and mounted through FeatureScreenHost");
}

const featureScreenHost = await readFile(path.join(root, "apps/web/src/ui/FeatureScreenHost.tsx"), "utf8");
const workspaceHook = await readFile(path.join(root, "apps/web/src/ui/use-driver-workspace.ts"), "utf8");
const adminServicesContext = await readFile(path.join(root, "apps/web/src/ui/admin-services-context.tsx"), "utf8");
if (!featureScreenHost.includes("registry: RuntimeRegistry") || featureScreenHost.includes("getApplicationRuntimeRegistry")) {
  failures.push("apps/web/src/ui/FeatureScreenHost.tsx: feature presentation hosts must consume the single registry supplied by composition");
}
if (!workspaceHook.includes("useDriverWorkspace(runtime: RuntimeRegistry, platformRepository: RecordRepository & PolicyRepository & AtomicRecordRepository)") ||
    workspaceHook.includes("createPlatformRepository") || workspaceHook.includes("getApplicationRuntimeRegistry")) {
  failures.push("apps/web/src/ui/use-driver-workspace.ts: workspace must reuse injected runtime and platform repository; no second global lookup or repository construction");
}
if (!adminServicesContext.includes("AdminPresentationServices") || !adminServicesContext.includes("AdminServicesContext.Provider")) {
  failures.push("apps/web/src/ui/admin-services-context.tsx: Admin must consume the explicit typed service boundary");
}
for (const absolute of sourceFiles) {
  const relative = normalize(path.relative(root, absolute));
  if (!relative.startsWith("apps/web/src/ui/")) continue;
  const content = await readFile(absolute, "utf8");
  if (/\bgetApplication[A-Z][A-Za-z0-9_]*\s*\(/.test(content)) {
    failures.push(relative + ": UI components must receive application services; global application-service getters are composition-root-only");
  }
  if (/\bcreatePlatformRepository\s*\(/.test(content)) {
    failures.push(relative + ": UI components must reuse the composition-root platform repository, not construct another repository");
  }
}
for (const absolute of sourceFiles) {
  const relative = normalize(path.relative(root, absolute));
  if (!relative.startsWith("apps/web/src/ui/")) continue;
  if (relative === "apps/web/src/ui/FeatureScreenHost.tsx" || relative === "apps/web/src/ui/use-driver-workspace.ts") continue;
  const content = await readFile(absolute, "utf8");
  if (/\bgetApplication(?!RuntimeRegistry)[A-Za-z0-9_]*/.test(content)) {
    failures.push(relative + ": UI components must receive application services through explicit presentation dependencies, not global service getters");
  }
}

for (const absolute of sourceFiles) {
  const relative = normalize(path.relative(root, absolute));
  if (!relative.startsWith("packages/features/")) continue;
  const content = await readFile(absolute, "utf8");
  if (/initializeApplicationRuntimeRegistry|\bgetApplicationRuntimeRegistry\b|let applicationRuntimeRegistry/.test(content)) failures.push(relative + ": feature modules may publish descriptors but must not own application registry lifecycle");
}
for (const absolute of sourceFiles) {
  const relative = normalize(path.relative(root, absolute));
  if (!relative.startsWith("apps/web/src/")) continue;
  const content = await readFile(absolute, "utf8");
  if (content.includes("initializeApplicationRuntimeRegistry(") && relative !== "apps/web/src/main.tsx") failures.push(relative + ": only the application composition root may initialize the shared registry");
  if (/initializeApplication[A-Z][A-Za-z0-9_]*\s*\(/.test(content) && relative !== "apps/web/src/main.tsx") failures.push(relative + ": only the application composition root may initialize application services or lifecycle");
}

if (failures.length) {
  console.error("Architecture gate failed:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exitCode = 1;
} else {
  const dependencyCount = [...featureGraph.values()].reduce((sum, edges) => sum + edges.size, 0);
  console.log(`Architecture gate passed: ${sourceFiles.length} source files checked; dependency direction, public feature boundaries (${featureGraph.size} feature packages / ${dependencyCount} declared edges), Android/Kotlin adapter boundaries, cycle checks, and source-size limits are within policy.`);
}
