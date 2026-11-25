import type { ReactNode } from "react";
import type { DriverWorkflowWorkspace } from "./DriverWorkflowPanel";

export type DriveScreenWorkspaceV1 = Readonly<DriverWorkflowWorkspace & {
  ready: boolean;
  error: string;
}>;

export type DriveScreenContextV1 = Readonly<{
  workspace: DriveScreenWorkspaceV1;
  extensions?: ReactNode;
}>;
