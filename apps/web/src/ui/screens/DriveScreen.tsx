import type { RuntimeRegistry } from "../../../../../packages/core/src";
import "../work/work-screen.css";
import { FeatureScreenHost } from "../FeatureScreenHost";
import { WorkScreenShell } from "../WorkScreenShell";
import { DriverWorkflowPanel } from "../work/DriverWorkflowPanel";
import { WorkScreenHeading } from "../work/WorkScreenHeading";
import { WorkScreenStatus } from "../work/WorkScreenStatus";
import type { useDriverWorkspace } from "../use-driver-workspace";

export type DriveScreenProps = Readonly<{
  workspace: ReturnType<typeof useDriverWorkspace>;
  runtimeRegistry: RuntimeRegistry;
}>;

/**
 * Composition adapter only: explicitly projects the workflow fields/actions
 * consumed by the replaceable driver presentation. The panel never receives
 * the repository, runtime registry, timeline services, or unrelated actions.
 */
export function DriveScreen({ workspace, runtimeRegistry }: DriveScreenProps) {
  const workflowWorkspace = {
    driver: workspace.driver,
    pending: workspace.pending,
    pendingBlocksWorkflow: workspace.pendingBlocksWorkflow,
    pendingBoundary: workspace.pendingBoundary,
    boundaryAt: workspace.boundaryAt,
    driverBusy: workspace.driverBusy,
    driverMessage: workspace.driverMessage,
    shiftOn: workspace.shiftOn,
    driverChoices: workspace.driverChoices,
    selectedDriverId: workspace.selectedDriverId,
    pendingCancellationFees: workspace.pendingCancellationFees,
    cancellationFeeDrafts: workspace.cancellationFeeDrafts,
    cancellationFeeBusy: workspace.cancellationFeeBusy,
    pendingCompletedTripFinancials: workspace.pendingCompletedTripFinancials,
    completedTripFinancialDrafts: workspace.completedTripFinancialDrafts,
    completedTripFinancialBusy: workspace.completedTripFinancialBusy,
    completedTripFinancialSummaries: workspace.completedTripFinancialSummaries,
    actions: {
      retry: workspace.actions.retry,
      dispatch: workspace.actions.dispatch,
      selectDriver: workspace.actions.selectDriver,
      updateCancellationFeeDraft: workspace.actions.updateCancellationFeeDraft,
      submitCancellationFee: workspace.actions.submitCancellationFee,
      updateCompletedTripFinancialDraft: workspace.actions.updateCompletedTripFinancialDraft,
      submitCompletedTripFinancials: workspace.actions.submitCompletedTripFinancials,
    },
  };

  return (
    <WorkScreenShell
      heading={<WorkScreenHeading />}
      status={<WorkScreenStatus ready={workspace.ready} error={workspace.error} />}
      workflow={<DriverWorkflowPanel workspace={workflowWorkspace} />}
      extensions={
        <FeatureScreenHost registry={runtimeRegistry} mountPoint="Drive" contextContract={{ id: "drive.host", version: 1 }} context={{ activeScreen: "Drive" }} />
      }
    />
  );
}
