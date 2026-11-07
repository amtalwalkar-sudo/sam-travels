import type { FeatureDefinition } from "../../core/src/features";
import type { FeatureExtensionDefinition } from "../../core/src/feature-extension";

/** Driver profiles are persistent feature-owned records with required recovery coverage. */
export const DRIVER_RECORDS_FEATURE = Object.freeze({
  id: "driver-records",
  label: "Driver Records",
  dataPolicy: "persistent",
  contractVersion: 1,
  dependencies: [{ id: "platform", contractVersion: 1 }],
  persistence: {
    schemaVersion: 1,
    migrations: [],
    backup: { participantId: "driver-records", snapshotVersion: 1, required: true },
    restore: { validatorId: "driver-records-v1", required: true },
    lifecycle: { disableRetainsData: true, removalRequiresMigration: true },
  },
} as const satisfies FeatureDefinition);

export const DRIVER_RECORDS_FEATURE_EXTENSION: FeatureExtensionDefinition = Object.freeze({
  id: "driver-records.persistence.v1",
  version: 1,
  featureId: "driver-records",
  publicEntryPoint: "packages/features/driver-records/index.ts",
  feature: DRIVER_RECORDS_FEATURE,
});
