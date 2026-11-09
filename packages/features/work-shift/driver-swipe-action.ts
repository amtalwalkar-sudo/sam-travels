import type { DriverEventType, DriverWorkflowState } from "../../core/src/commands";
import swipePresentation from "../../../contracts/driver-swipe-presentation-v1.json";

export type DriverSwipeAction = Readonly<{
  label: "Going to pickup" | "Start trip" | "End trip";
  eventType: Extract<DriverEventType, "trip_create" | "start_ride" | "end_ride">;
}>;

const actions = swipePresentation.actions as Record<string, DriverSwipeAction>;

/** The one trip action exposed by the current persisted workflow state. */
export function getDriverSwipeAction(state?: DriverWorkflowState): DriverSwipeAction | undefined {
  return state ? actions[state] : undefined;
}

export const driverSwipePresentationContract = swipePresentation;
