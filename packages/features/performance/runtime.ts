import { createElement } from "react";
import type { FeatureExtensionDefinition } from "../../core/src/feature-extension";
import type { FeaturePresentationContext, FeaturePresentationScreen } from "../../core/src/feature-presentation";
import type { FeatureDefinition } from "../../core/src/features";
import { PerformanceScreen } from "./presentation/PerformanceScreen";
import type { PerformanceScreenContextV1 as PerformanceScreenContext } from "./presentation/performance-screen-model";

export type PerformanceScreenContextV1 = PerformanceScreenContext;
export type PerformancePresentationContextV1 =
  FeaturePresentationContext<"performance.host", 1, PerformanceScreenContextV1>;

export const PERFORMANCE_PRESENTATION_SCREEN_V1: FeaturePresentationScreen<PerformancePresentationContextV1> = Object.freeze({
  id: "performance.dashboard.v1",
  ownerFeatureId: "performance",
  version: 1,
  mountPoint: "Performance",
  label: "Performance overview",
  context: Object.freeze({ id: "performance.host", version: 1 }),
  render(context) {
    return createElement(PerformanceScreen, { context: context.value });
  },
});

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
  presentationScreens: [PERFORMANCE_PRESENTATION_SCREEN_V1],
});
