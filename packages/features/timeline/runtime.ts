import { createElement } from "react";
import type { FeatureExtensionDefinition, FeaturePresentationScreen } from "../../core/src/index";
import type { TimelineReadModel } from "../../application/src/timeline-projection-service";
import { TimelineScreen } from "./presentation/TimelineScreen";

export type TimelineScreenContext = Readonly<{
  loadTimeline: () => Promise<TimelineReadModel>;
}>;

export const TIMELINE_PRESENTATION_SCREEN: FeaturePresentationScreen = Object.freeze({
  id: "timeline.main.v1",
  ownerFeatureId: "timeline",
  version: 1,
  mountPoint: "Timeline",
  label: "Timeline",
  render(context: unknown) {
    return createElement(TimelineScreen, { context: context as TimelineScreenContext });
  },
});

export const TIMELINE_FEATURE_EXTENSION: FeatureExtensionDefinition = Object.freeze({
  id: "timeline.core.v1",
  version: 1,
  featureId: "timeline",
  publicEntryPoint: "packages/features/timeline/index.ts",
  presentationScreens: [TIMELINE_PRESENTATION_SCREEN],
});
