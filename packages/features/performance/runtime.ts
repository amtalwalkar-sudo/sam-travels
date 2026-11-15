import type { FeatureExtensionDefinition } from "../../core/src/feature-extension";
import type { FeatureDefinition } from "../../core/src/features";

/** Performance calculation sources are persistent, portable business records. */
export const PERFORMANCE_FEATURE = Object.freeze({
  id: "performance",
  label: "Performance",
  dataPolicy: "persistent",
  contractVersion: 1,
  dependencies: [
    { id: "platform", contractVersion: 1 },
    { id: "business-settings", contractVersion: 1 },
    { id: "business-expenses", contractVersion: 1 },
    { id: "maintenance", contractVersion: 1 },
    { id: "finance", contractVersion: 2 },
    { id: "compliance", contractVersion: 1 },
  ],
  persistence: {
    schemaVersion: 1,
    migrations: [],
    backup: { participantId: "performance-records", snapshotVersion: 1, required: true },
    restore: { validatorId: "performance-records-v1", required: true },
    lifecycle: { disableRetainsData: true, removalRequiresMigration: true },
  },
} as const satisfies FeatureDefinition);

export const PERFORMANCE_FEATURE_EXTENSION: FeatureExtensionDefinition = Object.freeze({
  id: "performance.calculation.v1",
  version: 1,
  featureId: "performance",
  publicEntryPoint: "packages/features/performance/index.ts",
  feature: PERFORMANCE_FEATURE,
});
