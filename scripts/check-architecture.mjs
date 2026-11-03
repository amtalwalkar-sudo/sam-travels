import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".kt", ".java"]);
const ignoredDirectories = new Set(["node_modules", ".git", "dist", "build", ".gradle"]);
const maxLines = 400;
const maxBytes = 24 * 1024;
const failures = [];
const sourceFiles = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(absolute);
    else if (sourceExtensions.has(path.extname(entry.name))) sourceFiles.push(absolute);
  }
}

function layer(file) {
  const p = file.split(path.sep).join("/");
  if (p.includes("/packages/core/src/")) return "core";
  if (p.includes("/packages/domain/src/")) return "domain";
  if (p.includes("/packages/application/src/")) return "application";
  if (p.includes("/packages/storage-browser/src/")) return "storage";
  if (p.includes("/apps/web/src/ui/")) return "ui";
  return "outer";
}

function targetLayer(specifier, fromFile) {
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
  if (resolved.includes("/packages/core/src/")) return "core";
  if (resolved.includes("/packages/domain/src/")) return "domain";
  if (resolved.includes("/packages/application/src/")) return "application";
  if (resolved.includes("/packages/storage-browser/src/")) return "storage";
  if (resolved.includes("/apps/web/src/")) return "ui";
  return null;
}

await walk(root);
for (const absolute of sourceFiles) {
  const relative = path.relative(root, absolute).split(path.sep).join("/");
  const content = await readFile(absolute, "utf8");
  const bytes = (await stat(absolute)).size;
  const lines = content.split(/\r?\n/).length;
  if (lines > maxLines || bytes > maxBytes) {
    failures.push(`${relative}: ${lines} lines / ${bytes} bytes (limit ${maxLines} lines / ${maxBytes} bytes)`);
  }
  if (!/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(relative)) continue;
  const from = layer(absolute);
  const importPattern = /\\b(?:import|export)\\s*(?:type\\s+)?(?:[^"'\\n]*?\\bfrom\\s*)?["']([^"']+)["']/g;
  for (const match of content.matchAll(importPattern)) {
    const specifier = match[1];
    const target = targetLayer(specifier, relative);
    const forbidden =
      (from === "core" && ["domain", "application", "storage", "ui"].includes(target)) ||
      (from === "domain" && ["application", "storage", "ui"].includes(target)) ||
      (from === "application" && ["storage", "ui"].includes(target)) ||
      (from === "storage" && target === "ui") ||
      (from === "ui" && target === "storage") ||
      (from === "ui" && /(?:^|\/)node_modules\/(?:dexie|@capacitor\/)/.test(specifier)) ||
      (from === "ui" && /^(?:dexie|@capacitor\/)/.test(specifier));
    if (forbidden) failures.push(`${relative}: ${from} layer must not import ${target ?? "platform dependency"} via "${specifier}"`);
  }
}

if (failures.length) {
  console.error("Architecture gate failed:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Architecture gate passed: ${sourceFiles.length} source files checked; file-size and dependency boundaries are within policy.`);
}
