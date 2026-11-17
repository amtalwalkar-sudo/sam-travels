import type { ReactNode } from "react";
import type { FeatureExtensionDefinition, FeaturePresentationContext, FeaturePresentationScreen } from "../../core/src/index";

export type AdminPresentationContextV1 = ReactNode;
export type AdminPresentationContext = FeaturePresentationContext<"admin.workspace", 1, AdminPresentationContextV1>;

/** Admin is a presentation/access surface; its business data remains owned by capabilities. */
export const ADMIN_PRESENTATION_SCREEN: FeaturePresentationScreen<AdminPresentationContext> = Object.freeze({
  id: "admin.workspace.v1",
  ownerFeatureId: "admin",
  version: 1,
  mountPoint: "Admin",
  label: "Admin workspace",
  context: Object.freeze({ id: "admin.workspace", version: 1 }),
  render(context) {
    return context.value;
  },
});

export const ADMIN_FEATURE_EXTENSION: FeatureExtensionDefinition = Object.freeze({
  id: "admin.presentation.v1",
  version: 1,
  featureId: "admin",
  publicEntryPoint: "packages/features/admin/index.ts",
  presentationScreens: [ADMIN_PRESENTATION_SCREEN],
});
