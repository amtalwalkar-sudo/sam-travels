import { describe, expect, it } from "vitest";
import { FeatureExtensionUpgradeCoordinator, type FeatureExtensionUpgradeTransaction } from "../packages/application/src/feature-extension-upgrade-coordinator";
import type { FeatureDefinition } from "../packages/core/src/features";
import type { FeatureExtensionDefinition } from "../packages/core/src/feature-extension";
import type { FeatureExtensionCompatibilitySnapshot } from "../packages/core/src/feature-compatibility";

const previousFeature: FeatureDefinition = {
  id: "persistent-addon",
  label: "Persistent Add-on",
  dataPolicy: "persistent",
  contractVersion: 1,
  dependencies: [{ id: "platform", contractVersion: 1 }],
  persistence: {
    schemaVersion: 1,
    migrations: [],
    backup: { participantId: "persistent-addon-records", snapshotVersion: 1, required: true },
    restore: { validatorId: "persistent-addon-records-v1", required: true },
    lifecycle: { disableRetainsData: true, removalRequiresMigration: true },
  },
};
const nextFeature: FeatureDefinition = {
  ...previousFeature,
  persistence: {
    ...previousFeature.persistence!,
    schemaVersion: 2,
    migrations: [{ fromVersion: 1, toVersion: 2, id: "persistent-addon-v1-v2" }],
  },
};
const previousExtension: FeatureExtensionDefinition = {
  id: "persistent-addon.core",
  version: 1,
  featureId: "persistent-addon",
  publicEntryPoint: "packages/features/persistent-addon/index.ts",
  feature: previousFeature,
};
const nextExtension: FeatureExtensionDefinition = {
  ...previousExtension,
  version: 2,
  feature: nextFeature,
};
const previous: FeatureExtensionCompatibilitySnapshot = { extension: previousExtension, feature: previousFeature };
const next: FeatureExtensionCompatibilitySnapshot = { extension: nextExtension, feature: nextFeature };
const runtimeDefinitions = { extensions: [nextExtension] };

class Transaction implements FeatureExtensionUpgradeTransaction<{ values: string[] }> {
  committed: { values: string[]; installedVersion: number } = { values: [], installedVersion: 1 };
  failPersist = false;
  calls = 0;

  async run<Result>(operation: (context: {
    migrationContext: { values: string[] };
    persistInstalledExtension(snapshot: FeatureExtensionCompatibilitySnapshot): Promise<void>;
  }) => Promise<Result>): Promise<Result> {
    this.calls += 1;
    const working = {
      values: [...this.committed.values],
      installedVersion: this.committed.installedVersion,
    };
    const result = await operation({
      migrationContext: working,
      persistInstalledExtension: async snapshot => {
        if (this.failPersist) throw new Error("injected_extension_publish_failure");
        working.installedVersion = snapshot.extension.version;
      },
    });
    this.committed = working;
    return result;
  }
}

describe("application feature extension upgrade coordinator", () => {
  it("runs migrations and publishes the installed extension in one transaction", async () => {
    const transaction = new Transaction();
    const version = await new FeatureExtensionUpgradeCoordinator().apply({
      previous, next, nextRuntimeDefinitions: runtimeDefinitions, currentSchemaVersion: 1,
      handlers: { "persistent-addon-v1-v2": context => { context.values.push("migrated"); } },
      transaction,
    });
    expect(version).toBe(2);
    expect(transaction.committed).toEqual({ values: ["migrated"], installedVersion: 2 });
    expect(transaction.calls).toBe(1);
  });

  it("rejects incompatible preflight before opening a transaction", async () => {
    const transaction = new Transaction();
    await expect(new FeatureExtensionUpgradeCoordinator().apply({
      previous,
      next: { ...next, extension: { ...nextExtension, version: 1 } },
      nextRuntimeDefinitions: runtimeDefinitions,
      currentSchemaVersion: 1,
      handlers: { "persistent-addon-v1-v2": () => undefined },
      transaction,
    })).rejects.toThrow("must increase its version");
    expect(transaction.calls).toBe(0);
  });

  it("rolls migration writes back when a migration fails", async () => {
    const transaction = new Transaction();
    await expect(new FeatureExtensionUpgradeCoordinator().apply({
      previous, next, nextRuntimeDefinitions: runtimeDefinitions, currentSchemaVersion: 1,
      handlers: { "persistent-addon-v1-v2": context => { context.values.push("partial"); throw new Error("injected_migration_failure"); } },
      transaction,
    })).rejects.toThrow("injected_migration_failure");
    expect(transaction.committed).toEqual({ values: [], installedVersion: 1 });
  });

  it("rolls migration writes back when installed-version publication fails", async () => {
    const transaction = new Transaction();
    transaction.failPersist = true;
    await expect(new FeatureExtensionUpgradeCoordinator().apply({
      previous, next, nextRuntimeDefinitions: runtimeDefinitions, currentSchemaVersion: 1,
      handlers: { "persistent-addon-v1-v2": context => { context.values.push("migrated"); } },
      transaction,
    })).rejects.toThrow("injected_extension_publish_failure");
    expect(transaction.committed).toEqual({ values: [], installedVersion: 1 });
  });
});
