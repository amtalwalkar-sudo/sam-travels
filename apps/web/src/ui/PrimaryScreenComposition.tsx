import { useMemo, type ReactNode } from "react";
import type { FullCostBreakevenService, PerformanceCalculationServiceV1 } from "../../../../packages/application/src";
import type { RuntimeRegistry } from "../../../../packages/core/src";
import { PerformanceScreenControllerV1 } from "../../../../packages/features/performance";
import { FeatureScreenHost } from "./FeatureScreenHost";
import { AdminWorkspace } from "./AdminWorkspace";
import type { useDriverWorkspace } from "./use-driver-workspace";

export type PrimaryScreenCompositionProps = Readonly<{
  activeScreen: "Drive" | "Timeline" | "Performance" | "Admin";
  runtimeRegistry: RuntimeRegistry;
  workspace: ReturnType<typeof useDriverWorkspace>;
  performanceCalculation: Pick<PerformanceCalculationServiceV1, "calculate">;
  fullCostBreakeven: Pick<FullCostBreakevenService, "calculate">;
  children: ReactNode;
}>;

/** Replaceable screen composition; feature renderers remain opaque behind their typed host contracts. */
export function PrimaryScreenComposition({
  activeScreen, runtimeRegistry, workspace,
  performanceCalculation, fullCostBreakeven, children,
}: PrimaryScreenCompositionProps) {
  const performanceController = useMemo(
    () => new PerformanceScreenControllerV1(performanceCalculation, fullCostBreakeven),
    [performanceCalculation, fullCostBreakeven],
  );

  return <>
    <div hidden={activeScreen !== "Drive"}>{children}</div>
    {activeScreen === "Timeline" && (
      <FeatureScreenHost registry={runtimeRegistry} mountPoint="Timeline"
        contextContract={{ id: "timeline.main", version: 1 }}
        context={{ loadTimeline: workspace.loadTimeline }} />
    )}
    {activeScreen === "Performance" && (
      <section className="screen-heading">
        <small>YOUR WORKSPACE</small><h1>Performance</h1>
        <FeatureScreenHost registry={runtimeRegistry} mountPoint="Performance"
          contextContract={{ id: "performance.host", version: 1 }} context={{ loadPeriod: (from, to) => performanceController.loadPeriod(from, to) }} />
      </section>
    )}
    {activeScreen === "Admin" && (
      <FeatureScreenHost registry={runtimeRegistry} mountPoint="Admin"
        contextContract={{ id: "admin.workspace", version: 1 }} context={<AdminWorkspace />} />
    )}
  </>;
}
