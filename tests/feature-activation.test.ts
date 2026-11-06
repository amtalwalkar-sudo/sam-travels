import { describe, expect, it } from "vitest";
import { planFeatureActivation } from "../packages/core/src/feature-activation";
import type { FeatureDefinition } from "../packages/core/src/features";

const feature = (
  id: string,
  dependencies: FeatureDefinition["dependencies"] = [],
  contractVersion = 1,
): FeatureDefinition => ({
  id,
  label: id,
  dataPolicy: "non-persistent",
  contractVersion,
  dependencies,
});

describe("deterministic feature activation planning", () => {
  it("keeps an unrelated feature active when a required dependency is missing", () => {
    const plan = planFeatureActivation([
      feature("needs-missing", ["not-installed"]),
      feature("independent"),
    ]);
    expect(plan.results.get("needs-missing")?.state).toBe("blocked");
    expect(plan.results.get("independent")?.state).toBe("active");
    expect(plan.activeFeatures.has("independent")).toBe(true);
    expect(plan.diagnostics).toContainEqual(expect.objectContaining({
      code: "missing_required_dependency",
      featureId: "needs-missing",
      dependencyId: "not-installed",
    }));
  });

  it("reports an absent optional dependency without blocking its owner", () => {
    const plan = planFeatureActivation([
      feature("optional-consumer", [{ id: "optional-provider", contractVersion: 1, optional: true }]),
    ]);
    expect(plan.results.get("optional-consumer")?.state).toBe("active");
    expect(plan.results.get("optional-consumer")?.unavailableOptionalDependencies).toEqual(["optional-provider"]);
    expect(plan.diagnostics).toContainEqual(expect.objectContaining({
      code: "optional_dependency_unavailable",
      featureId: "optional-consumer",
      dependencyId: "optional-provider",
    }));
  });

  it("blocks a required dependency chain when a contract version is incompatible", () => {
    const plan = planFeatureActivation([
      feature("provider", [], 2),
      feature("consumer", [{ id: "provider", contractVersion: 1 }]),
      feature("downstream", ["consumer"]),
      feature("independent"),
    ]);
    expect(plan.results.get("consumer")?.state).toBe("blocked");
    expect(plan.results.get("downstream")?.state).toBe("blocked");
    expect(plan.results.get("independent")?.state).toBe("active");
    expect(plan.diagnostics).toContainEqual(expect.objectContaining({
      code: "incompatible_required_dependency",
      featureId: "consumer",
      dependencyId: "provider",
    }));
  });

  it("rejects every member of a dependency cycle before activation", () => {
    const plan = planFeatureActivation([
      feature("cycle-a", ["cycle-b"]),
      feature("cycle-b", ["cycle-a"]),
      feature("independent"),
    ]);
    expect(plan.results.get("cycle-a")?.state).toBe("rejected");
    expect(plan.results.get("cycle-b")?.state).toBe("rejected");
    expect(plan.results.get("independent")?.state).toBe("active");
    expect(plan.diagnostics.filter(item => item.code === "dependency_cycle").map(item => item.featureId))
      .toEqual(["cycle-a", "cycle-b"]);
  });

  it("publishes a stable dependency-first order for active features", () => {
    const plan = planFeatureActivation([
      feature("z-consumer", ["a-provider"]),
      feature("a-provider"),
    ]);
    const order = plan.startupOrder.map(item => item.id);
    expect(order.indexOf("a-provider")).toBeLessThan(order.indexOf("z-consumer"));
    expect(plan.startupOrder).toEqual(planFeatureActivation([
      feature("z-consumer", ["a-provider"]),
      feature("a-provider"),
    ]).startupOrder);
  });

  it("rejects invalid declarations while preserving valid unrelated declarations", () => {
    const plan = planFeatureActivation([
      feature("invalid-persistent", []),
      feature("healthy"),
    ]);
    const invalid = {
      ...feature("invalid-persistent"),
      dataPolicy: "persistent" as const,
    };
    const result = planFeatureActivation([invalid, feature("healthy")]);
    expect(result.results.get("invalid-persistent")?.state).toBe("rejected");
    expect(result.results.get("healthy")?.state).toBe("active");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "invalid_feature_declaration",
      featureId: "invalid-persistent",
    }));
    expect(plan.results.get("healthy")?.state).toBe("active");
  });

  it("keeps persistent ownership declarations visible even when operational activation is blocked", () => {
    const persistent: FeatureDefinition = {
      id: "persistent-blocked",
      label: "Persistent Blocked",
      dataPolicy: "persistent",
      contractVersion: 1,
      dependencies: ["missing-owner-dependency"],
      persistence: {
        schemaVersion: 1,
        migrations: [],
        backup: { participantId: "persistent-blocked-backup", snapshotVersion: 1, required: true },
        restore: { validatorId: "persistent-blocked-restore-v1", required: true },
        lifecycle: { disableRetainsData: true, removalRequiresMigration: true },
      },
    };
    const plan = planFeatureActivation([persistent]);
    expect(plan.results.get("persistent-blocked")?.state).toBe("blocked");
    expect(plan.declarations.get("persistent-blocked")?.persistence?.backup.participantId)
      .toBe("persistent-blocked-backup");
  });
});
