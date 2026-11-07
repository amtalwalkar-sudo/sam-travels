import type { FeatureExtensionDefinition } from "../../core/src/feature-extension";
import type { FeatureDefinition } from "../../core/src/features";

/** Persistent Business Settings capability; only the approved business start date is owned here. */
export const BUSINESS_SETTINGS_FEATURE: FeatureDefinition = Object.freeze({
  id: "business-settings",
  label: "Business Settings",
  dataPolicy: "persistent",
  contractVersion: 1,
  dependencies: [{ id: "platform", contractVersion: 1 }],
  persistence: {
    schemaVersion: 1,
    migrations: [],
    backup: {
      participantId: "business-settings-records",
      snapshotVersion: 1,
      required: true,
    },
    restore: {
      validatorId: "business-settings-records-v1",
      required: true,
    },
    lifecycle: {
      disableRetainsData: true,
      removalRequiresMigration: true,
    },
  },
});

export const BUSINESS_SETTINGS_FEATURE_EXTENSION: FeatureExtensionDefinition = Object.freeze({
  id: "business-settings.persistence.v1",
  version: 1,
  featureId: "business-settings",
  publicEntryPoint: "packages/features/business-settings/index.ts",
  feature: BUSINESS_SETTINGS_FEATURE,
});
