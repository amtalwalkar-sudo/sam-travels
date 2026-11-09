import type { DriverEventType, DriverWorkflowState } from "../../core/src/commands";

export type DriverSwipeAction = Readonly<{
  label: "Going to pickup" | "Start trip" | "End trip";
  eventType: Extract<DriverEventType, "trip_create" | "start_ride" | "end_ride">;
}>;

/** The one trip action exposed by the current persisted workflow state. */
export function getDriverSwipeAction(state?: DriverWorkflowState): DriverSwipeAction | undefined {
  switch (state) {
    case "shift_active":
      return { label: "Going to pickup", eventType: "trip_create" };
    case "going_to_pickup":
      return { label: "Start trip", eventType: "start_ride" };
    case "trip_active":
      return { label: "End trip", eventType: "end_ride" };
    default:
      return undefined;
  }
}
