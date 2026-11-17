import { useMemo } from "react";
import type { FullCostBreakevenService, PerformanceCalculationServiceV1 } from "../../../../packages/application/src";
import type { FeaturePresentationContextContract, RuntimeRegistry } from "../../../../packages/core/src";
import type { DriveScreenContextV1, DriveScreenWorkspaceV1 } from "../../../../packages/features/work";
import type { TimelineScreenContext } from "../../../../packages/features/timeline";
import { PerformanceScreenControllerV1, PerformanceScreenServicesAdapterV1, type PerformanceScreenContextV1 } from "../../../../packages/features/performance";
import type { AdminPresentationContextV1 } from "../../../../packages/features/admin";
import { FeatureScreenHost } from "./FeatureScreenHost";
import { AdminWorkspace } from "./AdminWorkspace";
import type { PrimaryScreen } from "./ApplicationShell";

type ScreenContextEntry = Readonly<{
  mountPoint: string;
  contextContract: FeaturePresentationContextContract;
  context: unknown;
}>;

export type PrimaryScreenWorkspace = Readonly<DriveScreenWorkspaceV1 & {
  loadTimeline: TimelineScreenContext["loadTimeline"];
}>;

export type PrimaryScreenCompositionProps = Readonly<{
  activeScreen: PrimaryScreen;
  runtimeRegistry: RuntimeRegistry;
  workspace: PrimaryScreenWorkspace;
  performanceCalculation: Pick<PerformanceCalculationServiceV1, "calculate">;
  fullCostBreakeven: Pick<FullCostBreakevenService, "calculate">;
}>;

/** Generic primary-screen host. Feature renderers own their UI; this layer supplies typed contexts only. */
export function PrimaryScreenComposition({
  activeScreen, runtimeRegistry, workspace,
  performanceCalculation, fullCostBreakeven,
}: PrimaryScreenCompositionProps) {
  const performanceController = useMemo(
    () => new PerformanceScreenControllerV1(
      new PerformanceScreenServicesAdapterV1(performanceCalculation, fullCostBreakeven),
    ),
    [performanceCalculation, fullCostBreakeven],
  );

  const workContext: DriveScreenContextV1 = {
    workspace,
    extensions: (
      <FeatureScreenHost registry={runtimeRegistry} mountPoint="Drive"
        contextContract={{ id: "drive.host", version: 1 }} context={{ activeScreen: "Drive" }} />
    ),
  };
  const timelineContext: TimelineScreenContext = {
    loadTimeline: workspace.loadTimeline,
  };
  const performanceContext: PerformanceScreenContextV1 = {
    loadPeriod: (from, to) => performanceController.loadPeriod(from, to),
  };
  const adminContext: AdminPresentationContextV1 = <AdminWorkspace />;

  const screenContexts: Record<PrimaryScreen, ScreenContextEntry> = {
    Drive: {
      mountPoint: "WorkScreen",
      contextContract: { id: "work.drive-screen", version: 1 },
      context: workContext,
    },
    Timeline: {
      mountPoint: "Timeline",
      contextContract: { id: "timeline.main", version: 1 },
      context: timelineContext,
    },
    Performance: {
      mountPoint: "Performance",
      contextContract: { id: "performance.host", version: 1 },
      context: performanceContext,
    },
    Admin: {
      mountPoint: "Admin",
      contextContract: { id: "admin.workspace", version: 1 },
      context: adminContext,
    },
  };

  const selected = screenContexts[activeScreen];
  return (
    <FeatureScreenHost
      registry={runtimeRegistry}
      mountPoint={selected.mountPoint}
      contextContract={selected.contextContract}
      context={selected.context}
    />
  );
}
