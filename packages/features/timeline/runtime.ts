import { createElement } from "react";
import type { FeatureExtensionDefinition, FeaturePresentationScreen } from "../../core/src/index";
import type { TimelineReadModel } from "../../application/src/timeline-projection-service";
import type { TimelineLocationMap } from "../../application/src/timeline-reverse-geocoding";
import { TimelineScreen } from "./presentation/TimelineScreen";

export type TimelineScreenContext = Readonly<{
  loadTimeline: (fromDate: string, toDate: string, allowLocationLookup: boolean, signal?: AbortSignal) => Promise<Readonly<{
    model: TimelineReadModel;
    locations: Promise<TimelineLocationMap>;
  }>>;
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
  feature: {
    id: "timeline",
    label: "Timeline",
    dataPolicy: "non-persistent" as const,
    contractVersion: 1,
    dependencies: [{ id: "work", contractVersion: 1 }],
  },
  presentationScreens: [TIMELINE_PRESENTATION_SCREEN],
});
