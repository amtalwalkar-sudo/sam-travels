import type { FeatureExtensionDefinition } from "../../core/src/feature-extension";

/** Vehicle persistence is declared in the stable built-in feature catalogue. */
export const VEHICLE_FEATURE_EXTENSION: FeatureExtensionDefinition = Object.freeze({
  id: "vehicle.persistence.v1",
  version: 1,
  featureId: "vehicle",
  publicEntryPoint: "packages/features/vehicle/index.ts",
});
