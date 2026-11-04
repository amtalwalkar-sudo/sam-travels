import { describe, expect, it } from "vitest";
import {
  registerFeatures,
  resolveFeatureStartupOrder,
  runFeatureMigrations,
  runFeatureMigrationsAtomically,
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
  dataPolicy: overrides.dataPolicy ?? "persistent",
});

describe("runtime feature registry", () => {
  it("registers the seven initial product modules in dependency-first order", () => {
    const registry = registerFeatures();
    expect([...registry.keys()]).toEqual(["platform", "work", "logbook", "finance", "vehicle", "performance", "admin", "backup"]);
    const order = resolveFeatureStartupOrder(registry).map(feature => feature.id);
    expect(order.indexOf("platform")).toBeLessThan(order.indexOf("work"));
    expect(order.indexOf("work")).toBeLessThan(order.indexOf("logbook"));
    expect(order.indexOf("logbook")).toBeLessThan(order.indexOf("performance"));
    expect(order.indexOf("finance")).toBeLessThan(order.indexOf("performance"));
  });

  it("rejects duplicate module identifiers", () => {
    expect(() => registerFeatures([{
      id: "admin", label: "Admin v2", dataPolicy: "non-persistent", contractVersion: 2, dependencies: [],
    }])).toThrow("Duplicate feature registration: admin");
  });

  it("rejects a persistent feature that omits its persistence contract", () => {
    expect(() => registerFeatures([{
      id: "unbacked-feature",
      label: "Unbacked",
      dataPolicy: "persistent",
      contractVersion: 1,
      dependencies: [],
    }])).toThrow("Persistent feature is missing its persistence contract");
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
      id: "custom-a", label: "A", dataPolicy: "non-persistent", contractVersion: 1, dependencies: ["missing-feature"],
    }])).toThrow("Missing dependency missing-feature");

    expect(() => registerFeatures([
      { id: "custom-a", label: "A", dataPolicy: "non-persistent", contractVersion: 1, dependencies: [] },
      { id: "custom-b", label: "B", dataPolicy: "non-persistent", contractVersion: 1, dependencies: [{ id: "custom-a", contractVersion: 2 }] },
    ])).toThrow("Incompatible dependency contract");
  });

  it("rejects cycles and duplicate backup participants", () => {
    expect(() => registerFeatures([
      { id: "custom-a", label: "A", dataPolicy: "non-persistent", contractVersion: 1, dependencies: ["custom-b"] },
      { id: "custom-b", label: "B", dataPolicy: "non-persistent", contractVersion: 1, dependencies: ["custom-a"] },
    ])).toThrow("Feature dependency cycle");

    const first = persistentFeature({ id: "custom-a" });
    const second = persistentFeature({ id: "custom-b" });
    expect(() => registerFeatures([first, second])).toThrow("Duplicate backup participant");
  });

  it("runs migrations in order and resolves every handler before executing", async () => {
    const feature = persistentFeature();
    const order: string[] = [];
    const result = await runFeatureMigrations(feature, 1, {
      "custom-ledger-1-2": () => { order.push("1-to-2"); },
    }, {});
    expect(result).toBe(2);
    expect(order).toEqual(["1-to-2"]);

    await expect(runFeatureMigrations(feature, 1, {}, {})).rejects.toThrow("Missing migration handler");
    expect(order).toEqual(["1-to-2"]);
  });

  it("rolls back partially applied migrations when a later step fails", async () => {
    const feature = persistentFeature();
    const state = { value: "before" };
    const transaction = {
      async run<T>(operation: (context: typeof state) => Promise<T>): Promise<T> {
        const checkpoint = { ...state };
        try {
          return await operation(state);
        } catch (error) {
          Object.assign(state, checkpoint);
          throw error;
        }
      },
    };
    await expect(runFeatureMigrationsAtomically(feature, 1, {
      "custom-ledger-1-2": context => {
        context.value = "partially-migrated";
        throw new Error("injected_migration_interruption");
      },
    }, transaction)).rejects.toThrow("injected_migration_interruption");
    expect(state.value).toBe("before");
  });

  it("preflights all migration handlers before opening the transaction", async () => {
    const feature = persistentFeature();
    let opened = false;
    const transaction = {
      async run<T>(operation: (context: {}) => Promise<T>): Promise<T> {
        opened = true;
        return operation({});
      },
    };
    await expect(runFeatureMigrationsAtomically(feature, 1, {}, transaction))
      .rejects.toThrow("Missing migration handler");
    expect(opened).toBe(false);
  });

  it("copies and freezes dependency descriptors supplied by add-ons", () => {
    const dependency = { id: "work", contractVersion: 1 };
    const registry = registerFeatures([{
      id: "dependency-check", label: "Dependency Check", dataPolicy: "non-persistent",
      contractVersion: 1, dependencies: [dependency],
    }]);
    dependency.id = "admin";
    expect(registry.get("dependency-check")?.dependencies).toEqual([{ id: "work", contractVersion: 1 }]);
    expect(Object.isFrozen(registry.get("dependency-check")?.dependencies[0])).toBe(true);
    expect(() => {
      (registry.get("dependency-check")!.dependencies[0] as { id: string }).id = "admin";
    }).toThrow();
  });

  it("exposes a runtime-immutable feature registry", () => {
    const registry = registerFeatures();
    expect(Object.isFrozen(registry)).toBe(true);
    expect((registry as unknown as { set?: unknown }).set).toBeUndefined();
    expect((registry as unknown as { delete?: unknown }).delete).toBeUndefined();
    expect(registry.has("work")).toBe(true);
  });

  it("returns immutable registration metadata", () => {
    const registry = registerFeatures();
    expect(() => (registry.get("work")!.dependencies as string[]).push("admin")).toThrow();
    expect(registry.get("work")!.dependencies).toEqual([]);
  });
});
