import type { FeatureDefinition } from "../../core/src/features";
import type { FeatureExtensionDefinition } from "../../core/src/feature-extension";

/**
 * Start non-persistent. Do not enable business writes until the complete
 * persistence, migration, backup, restore, and lifecycle contract is implemented.
 */
export const __FEATURE_CONST___FEATURE_DEFINITION: FeatureDefinition = Object.freeze({
  id: "__FEATURE_ID__",
  label: "__FEATURE_LABEL__",
  dataPolicy: "non-persistent",
  contractVersion: 1,
  dependencies: [],
});

/** Add calculations and integrations here only when their contracts and fixtures exist. */
export const __FEATURE_CONST___FEATURE_EXTENSION: FeatureExtensionDefinition = Object.freeze({
  id: "__FEATURE_ID__.core.v1",
  version: 1,
  featureId: "__FEATURE_ID__",
  publicEntryPoint: "packages/features/__FEATURE_ID__/index.ts",
  feature: __FEATURE_CONST___FEATURE_DEFINITION,
  integrations: [],
  calculations: [],
});
