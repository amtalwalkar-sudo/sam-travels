import { describe, expect, it } from "vitest";
import { analyzeFeatureContractImpact, createRuntimeDiagnosticSnapshot, createSafeDiagnosticEvent } from "../packages/core/src/diagnostics";
import { initializeRuntimeRegistry } from "../packages/core/src/runtime-registry";
import type { FeatureDefinition } from "../packages/core/src/features";

const feature = (id: string, dependencies: FeatureDefinition["dependencies"] = [], contractVersion = 1): FeatureDefinition => ({
  id, label: id, dataPolicy: "non-persistent", contractVersion, dependencies,
});

describe("safe Stage 5 diagnostics", () => {
  it("projects runtime metadata without labels, handlers, or payload values", () => {
    const runtime = initializeRuntimeRegistry();
    const snapshot = createRuntimeDiagnosticSnapshot(runtime);
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.features.some(item => item.id === "work")).toBe(true);
    expect(snapshot.capabilities.every(item => !("calculate" in item) && !("render" in item))).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain("Platform Runtime");
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it("normalizes identifiers and bounds duration without retaining arbitrary text", () => {
    const event = createSafeDiagnosticEvent({
      stage: "calculation", code: "calculation_failed", outcome: "failure",
      traceId: "trace-1", ownerFeatureId: "finance", contributionId: "loan.emi",
      contractVersion: 2, occurredAt: "2026-11-07T00:00:00.000Z", durationMs: 999999999,
    });
    expect(event.durationMs).toBe(86_400_000);
    expect(event.traceId).toBe("trace-1");
    expect(JSON.stringify(event)).not.toContain("input");
  });
});

describe("feature contract impact preflight", () => {
  it("reports direct and transitive dependents deterministically", () => {
    const before = [feature("provider"), feature("consumer", ["provider"]), feature("downstream", ["consumer"])];
    const after = [feature("provider", [], 2), feature("consumer", ["provider"]), feature("downstream", ["consumer"])];
    const report = analyzeFeatureContractImpact(before, after);
    expect(report.compatible).toBe(true);
    expect(report.findings).toEqual([
      { featureId: "consumer", impact: "direct_dependent", reasons: ["depends_on_changed_feature"] },
      { featureId: "downstream", impact: "transitive_dependent", reasons: ["depends_on_affected_feature"] },
      { featureId: "provider", impact: "changed", reasons: ["feature_contract_version_changed"] },
    ]);
    expect(analyzeFeatureContractImpact(before, after)).toEqual(report);
  });

  it("flags removal of persistent feature ownership as breaking", () => {
    const persistent: FeatureDefinition = {
      id: "records", label: "Records", dataPolicy: "persistent", contractVersion: 1, dependencies: [],
      persistence: {
        schemaVersion: 1, migrations: [],
        backup: { participantId: "records-backup", snapshotVersion: 1, required: true },
        restore: { validatorId: "records-restore-v1", required: true },
        lifecycle: { disableRetainsData: true, removalRequiresMigration: true },
      },
    };
    const report = analyzeFeatureContractImpact([persistent], []);
    expect(report.compatible).toBe(false);
    expect(report.breakingChanges).toEqual(["records:persistent_feature_removed"]);
  });
});
