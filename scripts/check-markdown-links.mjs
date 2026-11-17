import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  "build",
  ".gradle",
  ".vite",
  ".cache",
]);

function collectMarkdown(directory, result = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        collectMarkdown(path.join(directory, entry.name), result);
      }
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      result.push(path.join(directory, entry.name));
    }
  }
  return result;
}

function stripFencedCode(markdown) {
  return markdown
    .replace(/^\s*`{3,}[^\n]*\n[\s\S]*?^\s*`{3,}\s*$/gm, "")
    .replace(/^\s*~{3,}[^\n]*\n[\s\S]*?^\s*~{3,}\s*$/gm, "");
}

function extractTargets(markdown) {
  const targets = [];
  const inlineLink = /!?\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+[^)]*)?\)/g;
  let match;
  while ((match = inlineLink.exec(markdown)) !== null) {
    const raw = match[1].startsWith("<") && match[1].endsWith(">")
      ? match[1].slice(1, -1)
      : match[1];
    targets.push(raw);
  }
  return targets;
}

function isExternal(target) {
  return /^(?:https?:|mailto:|tel:|data:|javascript:|#)/i.test(target);
}

const markdownFiles = collectMarkdown(root);
const knownBroken = [];
for (const file of markdownFiles) {
  const relativeFile = path.relative(root, file).split(path.sep).join("/");
  const markdown = stripFencedCode(fs.readFileSync(file, "utf8"));
  for (const originalTarget of extractTargets(markdown)) {
    if (!originalTarget || isExternal(originalTarget)) continue;
    const withoutQueryOrFragment = originalTarget.split(/[?#]/, 1)[0];
    if (!withoutQueryOrFragment) continue;

    let decodedTarget;
    try {
      decodedTarget = decodeURIComponent(withoutQueryOrFragment);
    } catch {
      knownBroken.push({ file: relativeFile, target: originalTarget, reason: "invalid URL encoding" });
      continue;
    }

    const resolved = decodedTarget.startsWith("/")
      ? path.resolve(root, decodedTarget.slice(1))
      : path.resolve(path.dirname(file), decodedTarget);
    const relativeTarget = path.relative(root, resolved);
    if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) {
      knownBroken.push({ file: relativeFile, target: originalTarget, reason: "target escapes repository" });
      continue;
    }
    if (!fs.existsSync(resolved)) {
      knownBroken.push({ file: relativeFile, target: originalTarget, reason: "target does not exist" });
    }
  }
}

if (knownBroken.length > 0) {
  console.error(`Found ${knownBroken.length} broken local Markdown link(s):`);
  for (const item of knownBroken) {
    console.error(`- ${item.file}: ${item.target} (${item.reason})`);
  }
  process.exit(1);
}

console.log(`Validated local Markdown links in ${markdownFiles.length} Markdown files.`);
