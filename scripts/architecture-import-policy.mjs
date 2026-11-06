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

const normalizePath = (value) => value.replaceAll("\\", "/").replace(/\/+/g, "/");
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

export function targetLayer(resolved) {
  const p = "/" + normalizePath(resolved);
  if (p.includes("/packages/core/src/")) return "core";
  if (p.includes("/packages/domain/src/")) return "domain";
  if (p.includes("/packages/application/src/")) return "application";
  if (p.includes("/packages/presentation/src/")) return "presentation";
  if (p.includes("/packages/storage-browser/src/") || p.includes("/packages/storage-android/src/")) return "storage";
  if (p.includes("/packages/features/")) return "feature";
  if (p.includes("/apps/web/src/")) return "ui";
  return null;
}

export function isForbiddenLayerDependency(from, target) {
  return (
    (from === "core" && ["domain", "application", "storage", "ui", "feature", "presentation"].includes(target)) ||
    (from === "domain" && ["application", "storage", "ui", "presentation"].includes(target)) ||
    (from === "application" && ["storage", "ui", "presentation"].includes(target)) ||
    (from === "presentation" && ["core", "domain", "application", "storage", "feature", "ui", "web-app"].includes(target)) ||
    (from === "storage" && ["ui", "presentation"].includes(target)) ||
    (["core", "domain", "application", "storage"].includes(from) && target === "feature") ||
    (from === "feature" && ["storage", "ui", "presentation"].includes(target)) ||
    (from === "ui" && target === "storage")
  );
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
