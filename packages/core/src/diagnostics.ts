import type { RuntimeRegistry } from "./runtime-registry";
import type { FeatureDefinition, FeatureDependency, FeatureId } from "./features";

/** Versioned, platform-neutral diagnostic vocabulary. Values are safe to persist. */
export const DIAGNOSTIC_SCHEMA_VERSION = 1 as const;
export type DiagnosticStage =
  | "discovery" | "activation" | "dependency" | "contribution"
  | "source_query" | "data_validation" | "calculation"
  | "presentation" | "upgrade_preflight";
export type DiagnosticCode =
  | "feature_discovered" | "feature_active" | "feature_blocked" | "feature_rejected"
  | "dependency_unavailable" | "contribution_invalid" | "source_query_failed"
  | "source_validation_failed" | "calculation_failed" | "presentation_unavailable"
  | "upgrade_compatible" | "upgrade_incompatible" | "unknown";
export type DiagnosticOutcome = "success" | "blocked" | "failure" | "invalid";

export type SafeDiagnosticEvent = Readonly<{
  schemaVersion: typeof DIAGNOSTIC_SCHEMA_VERSION;
  traceId?: string;
  stage: DiagnosticStage;
  code: DiagnosticCode;
  outcome: DiagnosticOutcome;
  ownerFeatureId?: string;
  contributionId?: string;
  contractVersion?: number;
  occurredAt: string;
  durationMs?: number;
}>;

/** Only allowlisted identifiers and bounded metadata may cross into local diagnostics. */
export function createSafeDiagnosticEvent(input: Omit<SafeDiagnosticEvent, "schemaVersion">): SafeDiagnosticEvent {
  const safeId = (value: string | undefined) =>
    value && /^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(value) ? value : undefined;
  const timestamp = Number.isFinite(Date.parse(input.occurredAt))
    ? new Date(input.occurredAt).toISOString()
    : new Date(0).toISOString();
  const durationMs = input.durationMs !== undefined && Number.isFinite(input.durationMs)
    ? Math.max(0, Math.min(86_400_000, Math.floor(input.durationMs)))
    : undefined;
  return Object.freeze({
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    ...(safeId(input.traceId) ? { traceId: safeId(input.traceId) } : {}),
    stage: input.stage,
    code: input.code,
    outcome: input.outcome,
    ...(safeId(input.ownerFeatureId) ? { ownerFeatureId: safeId(input.ownerFeatureId) } : {}),
    ...(safeId(input.contributionId) ? { contributionId: safeId(input.contributionId) } : {}),
    ...(Number.isSafeInteger(input.contractVersion) && (input.contractVersion ?? 0) > 0
      ? { contractVersion: input.contractVersion } : {}),
    occurredAt: timestamp,
    ...(durationMs !== undefined ? { durationMs } : {}),
  });
}

function dependencyId(dependency: FeatureDependency): string {
  return typeof dependency === "string" ? dependency : dependency.id;
}

/**
 * Safe, deterministic projection of the existing runtime. Executable handlers,
 * labels, arbitrary messages, data records, values and tokens are deliberately omitted.
 */
export function createRuntimeDiagnosticSnapshot(runtime: RuntimeRegistry) {
  const features = [...runtime.features.values()].map(feature => {
    const activation = runtime.activation.results.get(feature.id);
    return Object.freeze({
      id: feature.id,
      contractVersion: feature.contractVersion,
      dataPolicy: feature.dataPolicy,
      state: activation?.state ?? (runtime.activeFeatures.has(feature.id) ? "active" : "rejected"),
      dependencies: Object.freeze(feature.dependencies.map(dependencyId).sort()),
      unavailableOptionalDependencies: Object.freeze([...(activation?.unavailableOptionalDependencies ?? [])].sort()),
      ...(feature.persistence ? {
        schemaVersion: feature.persistence.schemaVersion,
        backupSnapshotVersion: feature.persistence.backup.snapshotVersion,
      } : {}),
    });
  }).sort((a, b) => a.id.localeCompare(b.id));

  const capabilities = [
    ...[...runtime.extensions.values()].map(item => ({ kind: "extension", id: item.id, ownerFeatureId: item.featureId, version: item.version })),
    ...[...runtime.integrations.values()].map(item => ({ kind: "integration", id: item.id, ownerFeatureId: item.consumerFeatureId, version: item.version })),
    ...[...runtime.calculations.values()].map(item => ({ kind: "calculation", id: item.id, ownerFeatureId: item.ownerFeatureId, version: item.version, inputSchemaVersion: item.inputSchemaVersion, outputSchemaVersion: item.outputSchemaVersion })),
    ...[...runtime.dataQueries.values()].map(item => ({ kind: "data_query", id: item.id, ownerFeatureId: item.ownerFeatureId, version: item.version, outputSchemaVersion: item.outputSchemaVersion })),
    ...[...runtime.presentationScreens.values()].map(item => ({ kind: "presentation", id: item.id, ownerFeatureId: item.ownerFeatureId, version: item.version })),
    ...[...runtime.backupParticipants.values()].map(item => ({ kind: "backup", id: item.id, ownerFeatureId: item.featureId, version: item.snapshotVersion })),
  ].sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));

  const failures = runtime.contributionFailures.map(item => Object.freeze({
    ownerFeatureId: item.featureId,
    code: item.code,
  })).sort((a, b) => a.ownerFeatureId.localeCompare(b.ownerFeatureId) || a.code.localeCompare(b.code));

  const activationDiagnostics = runtime.activation.diagnostics.map(item => Object.freeze({
    ownerFeatureId: item.featureId,
    ...(item.dependencyId ? { dependencyId: item.dependencyId } : {}),
    code: item.code,
  })).sort((a, b) => a.ownerFeatureId.localeCompare(b.ownerFeatureId) || a.code.localeCompare(b.code));

  return Object.freeze({
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    features: Object.freeze(features),
    capabilities: Object.freeze(capabilities.map(item => Object.freeze(item))),
    contributionFailures: Object.freeze(failures),
    activationDiagnostics: Object.freeze(activationDiagnostics),
  });
}

export type ContractImpactFinding = Readonly<{
  featureId: FeatureId;
  impact: "changed" | "direct_dependent" | "transitive_dependent";
  reasons: readonly string[];
}>;
export type ContractImpactReport = Readonly<{
  compatible: boolean;
  findings: readonly ContractImpactFinding[];
  breakingChanges: readonly string[];
}>;

/**
 * Pure deterministic impact preflight. It reports declared dependency closure;
 * it never mutates either declaration set or executes migrations/upgrades.
 */
export function analyzeFeatureContractImpact(
  previous: readonly FeatureDefinition[],
  proposed: readonly FeatureDefinition[],
): ContractImpactReport {
  const before = new Map(previous.map(feature => [feature.id, feature]));
  const after = new Map(proposed.map(feature => [feature.id, feature]));
  const findings = new Map<string, { impact: ContractImpactFinding["impact"]; reasons: Set<string> }>();
  const breaking = new Set<string>();
  const mark = (id: string, impact: ContractImpactFinding["impact"], reason: string) => {
    const current = findings.get(id);
    if (!current || (current.impact === "transitive_dependent" && impact !== "transitive_dependent")) {
      findings.set(id, { impact, reasons: new Set([reason]) });
    } else current.reasons.add(reason);
  };

  for (const [id, oldFeature] of before) {
    const next = after.get(id);
    if (!next) {
      mark(id, "changed", "feature_removed");
      if (oldFeature.dataPolicy === "persistent") breaking.add(id + ":persistent_feature_removed");
      continue;
    }
    if (oldFeature.contractVersion !== next.contractVersion) mark(id, "changed", "feature_contract_version_changed");
    if (oldFeature.dataPolicy !== next.dataPolicy) {
      mark(id, "changed", "data_policy_changed");
      if (oldFeature.dataPolicy === "persistent") breaking.add(id + ":persistent_data_policy_changed");
    }
    if (oldFeature.persistence?.schemaVersion !== next.persistence?.schemaVersion) mark(id, "changed", "persistence_schema_changed");
    if (oldFeature.dependencies.map(dependencyId).sort().join("|") !== next.dependencies.map(dependencyId).sort().join("|")) {
      mark(id, "changed", "dependencies_changed");
    }
  }
  for (const id of after.keys()) if (!before.has(id)) mark(id, "changed", "feature_added");

  const direct = new Set<string>();
  for (const feature of proposed) {
    if (feature.dependencies.some(dependency => {
      const id = dependencyId(dependency);
      return findings.has(id);
    })) {
      direct.add(feature.id);
      mark(feature.id, "direct_dependent", "depends_on_changed_feature");
    }
  }
  let frontier = new Set(direct);
  const visited = new Set([...findings.keys(), ...direct]);
  while (frontier.size) {
    const nextFrontier = new Set<string>();
    for (const feature of proposed) {
      if (visited.has(feature.id)) continue;
      if (feature.dependencies.some(dependency => frontier.has(dependencyId(dependency)))) {
        visited.add(feature.id);
        nextFrontier.add(feature.id);
        mark(feature.id, "transitive_dependent", "depends_on_affected_feature");
      }
    }
    frontier = nextFrontier;
  }

  const ordered = [...findings.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([featureId, value]) =>
    Object.freeze({ featureId, impact: value.impact, reasons: Object.freeze([...value.reasons].sort()) }),
  );
  return Object.freeze({
    compatible: breaking.size === 0,
    findings: Object.freeze(ordered),
    breakingChanges: Object.freeze([...breaking].sort()),
  });
}
