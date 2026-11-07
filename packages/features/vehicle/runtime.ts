import type { FeatureExtensionDefinition } from "../../core/src/feature-extension";
import type { FeatureDefinition } from "../../core/src/features";

/** Vehicle persistence contract, shared with the stable built-in feature declaration. */
export const VEHICLE_FEATURE = Object.freeze({
  id: "vehicle",
  label: "Vehicle",
  dataPolicy: "persistent",
  contractVersion: 1,
  dependencies: [{ id: "platform", contractVersion: 1 }],
  persistence: {
    schemaVersion: 1,
    migrations: [],
    backup: { participantId: "vehicle-records", snapshotVersion: 1, required: true },
    restore: { validatorId: "vehicle-records-v1", required: true },
    lifecycle: { disableRetainsData: true, removalRequiresMigration: true },
  },
} as const satisfies FeatureDefinition);

/** The extension is additive; the stable built-in feature identity is not redeclared. */
export const VEHICLE_FEATURE_EXTENSION: FeatureExtensionDefinition = Object.freeze({
  id: "vehicle.persistence.v1",
  version: 1,
  featureId: "vehicle",
  publicEntryPoint: "packages/features/vehicle/index.ts",
});
