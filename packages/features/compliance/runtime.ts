import type { FeatureDefinition } from "../../core/src/features";
import type { FeatureExtensionDefinition } from "../../core/src/feature-extension";

/** Compliance owns durable vehicle legal-coverage records and required recovery participation. */
export const COMPLIANCE_FEATURE = Object.freeze({
  id: "compliance",
  label: "Compliance",
  dataPolicy: "persistent",
  contractVersion: 1,
  dependencies: [{ id: "vehicle", contractVersion: 1 }],
  persistence: {
    schemaVersion: 1,
    migrations: [],
    backup: { participantId: "compliance-records", snapshotVersion: 1, required: true },
    restore: { validatorId: "compliance-records-v1", required: true },
    lifecycle: { disableRetainsData: true, removalRequiresMigration: true },
  },
} as const satisfies FeatureDefinition);

export const COMPLIANCE_FEATURE_EXTENSION: FeatureExtensionDefinition = Object.freeze({
  id: "compliance.persistence.v1",
  version: 1,
  featureId: "compliance",
  publicEntryPoint: "packages/features/compliance/index.ts",
  feature: COMPLIANCE_FEATURE,
});
