import type { ReactNode } from "react";
import type { DriverWorkflowWorkspace } from "./DriverWorkflowPanel";
import type { TripHistoryRecord } from "../../../domain/src/trip-history";

export type DriveScreenWorkspaceV1 = Readonly<DriverWorkflowWorkspace & {
  ready: boolean;
  error: string;
  tripHistory: readonly TripHistoryRecord[];
}>;

export type DriveScreenContextV1 = Readonly<{
  workspace: DriveScreenWorkspaceV1;
  extensions?: ReactNode;
}>;
