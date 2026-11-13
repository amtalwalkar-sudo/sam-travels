import type { FeatureDefinition } from "../../core/src/features";
import type { FeatureExtensionDefinition } from "../../core/src/feature-extension";

/** Maintenance owns actual expenses, effective-dated rates and immutable daily business-kilometre accrual snapshots. */
export const MAINTENANCE_FEATURE = Object.freeze({
  id: "maintenance",
  label: "Maintenance",
  dataPolicy: "persistent",
  contractVersion: 1,
  dependencies: [
    { id: "vehicle", contractVersion: 1 },
    { id: "logbook", contractVersion: 1 },
  ],
  persistence: {
    schemaVersion: 1,
    migrations: [],
    backup: { participantId: "maintenance-records", snapshotVersion: 1, required: true },
    restore: { validatorId: "maintenance-records-v1", required: true },
    lifecycle: { disableRetainsData: true, removalRequiresMigration: true },
  },
} as const satisfies FeatureDefinition);

export const MAINTENANCE_FEATURE_EXTENSION: FeatureExtensionDefinition = Object.freeze({
  id: "maintenance.persistence.v1",
  version: 1,
  featureId: "maintenance",
  publicEntryPoint: "packages/features/maintenance/index.ts",
  feature: MAINTENANCE_FEATURE,
});
