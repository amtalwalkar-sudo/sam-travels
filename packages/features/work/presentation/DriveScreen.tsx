import type { DriveScreenContextV1 } from "./drive-screen-model";
import { WorkScreenHeading } from "./WorkScreenHeading";
import { WorkScreenShell } from "./WorkScreenShell";
import { WorkScreenStatus } from "./WorkScreenStatus";
import { DriverWorkflowPanel } from "./DriverWorkflowPanel";

/** Feature-owned Work screen. It receives a versioned view/action model and an extension slot. */
export function DriveScreen({ context }: { context: DriveScreenContextV1 }) {
  const { workspace, extensions } = context;
  return (
    <WorkScreenShell
      heading={<WorkScreenHeading />}
      status={<WorkScreenStatus ready={workspace.ready} error={workspace.error} />}
      workflow={<DriverWorkflowPanel workspace={workspace} />}
      extensions={extensions}
    />
  );
}
