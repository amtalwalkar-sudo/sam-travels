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

/** Composition adapter: maps the authoritative workspace into replaceable presentation regions. */
export function DriveScreen({ workspace, runtimeRegistry }: DriveScreenProps) {
  return (
    <WorkScreenShell
      heading={<WorkScreenHeading />}
      status={<WorkScreenStatus ready={workspace.ready} error={workspace.error} />}
      workflow={<DriverWorkflowPanel workspace={workspace} />}
      extensions={
        <FeatureScreenHost registry={runtimeRegistry} mountPoint="Drive" contextContract={{ id: "drive.host", version: 1 }} context={{ activeScreen: "Drive" }} />
      }
    />
  );
}
