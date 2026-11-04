import { describe, expect, it } from "vitest";
import {
  registerFeatures,
  resolveFeatureStartupOrder,
  type FeatureDefinition,
} from "../packages/core/src/features";

const persistentFeature = (overrides: Partial<FeatureDefinition> = {}): FeatureDefinition => ({
  id: "custom-ledger",
  label: "Custom Ledger",
  contractVersion: 1,
  dependencies: [],
  persistence: {
    schemaVersion: 2,
    migrations: [{ id: "custom-ledger-1-2", fromVersion: 1, toVersion: 2 }],
    backup: { participantId: "custom-ledger-snapshot", snapshotVersion: 1, required: true },
    restore: { validatorId: "custom-ledger-restore-v1", required: true },
    lifecycle: { disableRetainsData: true, removalRequiresMigration: true },
  },
  ...overrides,
});

describe("runtime feature registry", () => {
  it("registers the seven initial product modules in dependency-first order", () => {
    const registry = registerFeatures();
    expect([...registry.keys()]).toEqual(["work", "logbook", "finance", "vehicle", "performance", "admin", "backup"]);
    const order = resolveFeatureStartupOrder(registry).map(feature => feature.id);
    expect(order.indexOf("work")).toBeLessThan(order.indexOf("logbook"));
    expect(order.indexOf("logbook")).toBeLessThan(order.indexOf("performance"));
    expect(order.indexOf("finance")).toBeLessThan(order.indexOf("performance"));
  });

  it("rejects duplicate module identifiers", () => {
    expect(() => registerFeatures([{
      id: "admin", label: "Admin v2", contractVersion: 2, dependencies: [],
    }])).toThrow("Duplicate feature registration: admin");
  });

  it("supports a future add-on without changing the initial registry", () => {
    const registry = registerFeatures([persistentFeature()]);
    expect(registry.get("custom-ledger")?.persistence?.backup.participantId).toBe("custom-ledger-snapshot");
    expect(registerFeatures().has("custom-ledger")).toBe(false);
  });

  it("fails closed when a persistent feature omits backup or restore obligations", () => {
    const missingBackup = persistentFeature({
      persistence: {
        schemaVersion: 1,
        migrations: [],
        backup: { participantId: "", snapshotVersion: 1, required: true },
        restore: { validatorId: "restore-v1", required: true },
        lifecycle: { disableRetainsData: true, removalRequiresMigration: true },
      },
    });
    expect(() => registerFeatures([missingBackup])).toThrow("Missing required backup participant");
  });

  it("rejects incomplete migration chains", () => {
    const feature = persistentFeature({
      persistence: {
        ...persistentFeature().persistence!,
        migrations: [],
      },
    });
    expect(() => registerFeatures([feature])).toThrow("Incomplete migration chain");
  });

  it("rejects missing dependencies and incompatible dependency contracts", () => {
    expect(() => registerFeatures([{
      id: "custom-a", label: "A", contractVersion: 1, dependencies: ["missing-feature"],
    }])).toThrow("Missing dependency missing-feature");

    expect(() => registerFeatures([
      { id: "custom-a", label: "A", contractVersion: 1, dependencies: [] },
      { id: "custom-b", label: "B", contractVersion: 1, dependencies: [{ id: "custom-a", contractVersion: 2 }] },
    ])).toThrow("Incompatible dependency contract");
  });

  it("rejects cycles and duplicate backup participants", () => {
    expect(() => registerFeatures([
      { id: "custom-a", label: "A", contractVersion: 1, dependencies: ["custom-b"] },
      { id: "custom-b", label: "B", contractVersion: 1, dependencies: ["custom-a"] },
    ])).toThrow("Feature dependency cycle");

    const first = persistentFeature({ id: "custom-a" });
    const second = persistentFeature({ id: "custom-b" });
    expect(() => registerFeatures([first, second])).toThrow("Duplicate backup participant");
  });

  it("returns immutable registration metadata", () => {
    const registry = registerFeatures();
    expect(() => (registry.get("work")!.dependencies as string[]).push("admin")).toThrow();
    expect(registry.get("work")!.dependencies).toEqual([]);
  });
});
