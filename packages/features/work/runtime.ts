import { createElement } from "react";
import type { FeatureExtensionDefinition } from "../../core/src/feature-extension";
import type { FeaturePresentationContext } from "../../core/src/feature-presentation";
import { DriveScreen } from "./presentation/DriveScreen";
import type { DriveScreenContextV1 } from "./presentation/drive-screen-model";

/** Work owns its primary screen contribution; Drive remains a separate extension mount point. */
export const WORK_FEATURE_EXTENSION: FeatureExtensionDefinition = Object.freeze({
  id: "work.presentation.v1",
  version: 1,
  featureId: "work",
  publicEntryPoint: "packages/features/work/index.ts",
  presentationScreens: Object.freeze([{
    id: "work.drive-screen.v1",
    ownerFeatureId: "work",
    version: 1,
    mountPoint: "WorkScreen",
    label: "Work",
    context: Object.freeze({ id: "work.drive-screen", version: 1 }),
    render: (context: FeaturePresentationContext<"work.drive-screen", 1, DriveScreenContextV1>) =>
      createElement(DriveScreen, { context: context.value }),
  }]),
});
