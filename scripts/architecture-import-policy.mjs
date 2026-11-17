export function createAliasResolver(tsconfig) {
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
      return normalizePath(joinPath(baseUrl, destination.replace("*", capture)));
    }
    return null;
  };
}

const normalizePath = (value) => {
  const absolute = value.startsWith("/");
  const parts = [];
  for (const part of value.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return (absolute ? "/" : "") + parts.join("/");
};
const joinPath = (...parts) => normalizePath(parts.join("/"));

export function resolveImport(specifier, fromFile, resolveAlias) {
  if (specifier.startsWith(".")) {
    const parts = normalizePath(fromFile).split("/");
    parts.pop();
    for (const part of specifier.split("/")) {
      if (part === "." || part === "") continue;
      if (part === "..") parts.pop();
      else parts.push(part);
    }
    return parts.join("/");
  }
  return resolveAlias(specifier);
}

/**
 * Feature packages are capability modules, not a single architectural layer.
 * Their internal subdirectories have distinct dependency rules. Root files are
 * retained as a migration-compatible feature boundary until they are moved.
 */
export function targetLayer(resolved) {
  const normalized = normalizePath(resolved);
  const featureSubLayer = normalized.match(
    /^packages\/features\/[^/]+\/(domain|application|ports|adapters|presentation|tests)(?:\/|$)/,
  );
  if (featureSubLayer) return `feature-${featureSubLayer[1]}`;
  if (normalized.startsWith("packages/features/")) return "feature-root";
  if (normalized.startsWith("packages/core/src/")) return "core";
  if (normalized.startsWith("packages/domain/src/")) return "domain";
  if (normalized.startsWith("packages/application/src/")) return "application";
  if (normalized.startsWith("packages/presentation/src/")) return "presentation";
  if (normalized.startsWith("packages/storage-browser/src/") || normalized.startsWith("packages/storage-android/src/")) return "storage";
  if (normalized.startsWith("apps/web/src/ui/") || normalized.startsWith("apps/web/src/components/")) return "ui";
  if (normalized.startsWith("apps/web/src/")) return "web-app";
  return null;
}

const forbiddenByLayer = {
  core: new Set(["domain", "application", "storage", "ui", "web-app", "presentation", "feature-root", "feature-domain", "feature-application", "feature-ports", "feature-adapters", "feature-presentation", "feature-tests"]),
  domain: new Set(["application", "storage", "ui", "web-app", "presentation", "feature-root", "feature-domain", "feature-application", "feature-ports", "feature-adapters", "feature-presentation", "feature-tests"]),
  application: new Set(["storage", "ui", "web-app", "presentation", "feature-root", "feature-domain", "feature-application", "feature-ports", "feature-adapters", "feature-presentation", "feature-tests"]),
  presentation: new Set(["core", "domain", "application", "storage", "ui", "web-app", "feature-root", "feature-domain", "feature-application", "feature-ports", "feature-adapters", "feature-presentation", "feature-tests"]),
  storage: new Set(["ui", "web-app", "presentation", "feature-root", "feature-domain", "feature-application", "feature-ports", "feature-adapters", "feature-presentation", "feature-tests"]),
  "feature-domain": new Set(["application", "storage", "ui", "web-app", "presentation", "feature-root", "feature-application", "feature-ports", "feature-adapters", "feature-presentation", "feature-tests"]),
  "feature-ports": new Set(["application", "storage", "ui", "web-app", "presentation", "feature-root", "feature-domain", "feature-application", "feature-adapters", "feature-presentation", "feature-tests"]),
  "feature-application": new Set(["storage", "ui", "web-app", "presentation", "feature-adapters", "feature-presentation", "feature-tests"]),
  "feature-adapters": new Set(["ui", "web-app", "presentation", "feature-presentation", "feature-tests"]),
  "feature-presentation": new Set(["application", "domain", "storage", "web-app", "feature-root", "feature-domain", "feature-ports", "feature-adapters", "feature-tests"]),
  "feature-root": new Set(["storage", "ui", "web-app", "feature-adapters", "feature-tests"]),
  "feature-tests": new Set(),
  ui: new Set(["storage"]),
  "web-app": new Set(),
};

export function isForbiddenLayerDependency(from, target) {
  return forbiddenByLayer[from]?.has(target) ?? false;
}

export function isPublicFeatureEntry(resolved) {
  const value = normalizePath(resolved);
  const extension = value.match(/\.(?:ts|tsx|js|jsx|mjs|cjs)$/)?.[0] ?? "";
  const withoutExtension = extension ? value.slice(0, -extension.length) : value;
  const normalized = withoutExtension.endsWith("/") ? withoutExtension.slice(0, -1) : withoutExtension;
  const parts = normalized.split("/");
  return parts[0] === "packages" && parts[1] === "features" &&
    (parts.length === 3 || (parts.length === 4 && parts[3] === "index"));
}

const browserPersistenceModules = new Set(["dexie", "idb", "idb-keyval", "localforage"]);

export function isBrowserPersistenceModule(specifier) {
  return browserPersistenceModules.has(specifier.split("/")[0]);
}
