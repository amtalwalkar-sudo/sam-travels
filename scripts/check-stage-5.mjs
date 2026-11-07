import { readFile } from "node:fs/promises";

const failures = [];
async function source(path) {
  try { return await readFile(path, "utf8"); }
  catch { failures.push(path + ": required Stage 5 source is missing"); return ""; }
}
function requireText(path, text, label) {
  if (!text.includes(label)) failures.push(path + ": missing " + label);
}
function forbidText(path, text, pattern, label) {
  if (pattern.test(text)) failures.push(path + ": forbidden " + label);
}

const core = await source("packages/core/src/diagnostics.ts");
const coordinator = await source("packages/application/src/cross-feature-data-coordinator.ts");
const compatibility = await source("packages/core/src/feature-compatibility.ts");
const browser = await source("packages/storage-browser/src/local-diagnostics.ts");
const database = await source("packages/storage-browser/src/database.ts");
const android = await source("android/app/src/main/java/in/samtravels/app/LocalDiagnostics.kt");
const plugin = await source("android/app/src/main/java/in/samtravels/app/DiagnosticsPlugin.kt");
const guide = await source("docs/STAGE_5_DIAGNOSTICS_AND_CHANGE_IMPACT.md");

requireText("packages/core/src/diagnostics.ts", core, "DIAGNOSTIC_SCHEMA_VERSION = 1");
requireText("packages/core/src/diagnostics.ts", core, "createRuntimeDiagnosticSnapshot");
requireText("packages/core/src/diagnostics.ts", core, "analyzeFeatureContractImpact");
forbidText("packages/core/src/diagnostics.ts", core, /snapshotToken|credentials|password|\.records\b|\.calculate\s*\(|\.render\s*\(/, "private data or executable runtime projection");
requireText("packages/application/src/cross-feature-data-coordinator.ts", coordinator, "CalculationTrace");
requireText("packages/application/src/cross-feature-data-coordinator.ts", coordinator, "recordFailure");
forbidText("packages/application/src/cross-feature-data-coordinator.ts", coordinator.slice(coordinator.indexOf("export type CalculationTrace"), coordinator.indexOf("export type OrchestratedCalculationResult")), /snapshotToken|records\s*:|\bvalue\s*:/, "payload or snapshot token in trace contract");
requireText("packages/core/src/feature-compatibility.ts", compatibility, 'compare("integration"');
requireText("packages/core/src/feature-compatibility.ts", compatibility, 'compare("calculation"');
requireText("packages/core/src/feature-compatibility.ts", compatibility, 'compare("data_query"');
requireText("packages/core/src/feature-compatibility.ts", compatibility, 'compare("presentation"');
requireText("packages/storage-browser/src/local-diagnostics.ts", browser, "recordBrowserDiagnosticEvent");
requireText("packages/storage-browser/src/local-diagnostics.ts", browser, "catch {");
requireText("packages/storage-browser/src/database.ts", database, "BROWSER_DATABASE_SCHEMA_VERSION = 6");
requireText("android/app/src/main/java/in/samtravels/app/LocalDiagnostics.kt", android, "MAX_ENTRIES = 200");
requireText("android/app/src/main/java/in/samtravels/app/LocalDiagnostics.kt", android, "recordEvent");
requireText("android/app/src/main/java/in/samtravels/app/DiagnosticsPlugin.kt", plugin, "recordDiagnosticEvent");
requireText("docs/STAGE_5_DIAGNOSTICS_AND_CHANGE_IMPACT.md", guide, "Never upload them automatically.");
requireText("docs/STAGE_5_DIAGNOSTICS_AND_CHANGE_IMPACT.md", guide, "Change-impact preflight");

if (failures.length) {
  for (const failure of failures) console.error("Stage 5 gate: " + failure);
  process.exitCode = 1;
} else {
  console.log("Stage 5 privacy, trace, platform storage, compatibility and documentation gates passed.");
}
