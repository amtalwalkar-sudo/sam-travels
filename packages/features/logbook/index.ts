/** Public Log Book capability contract. */
export {
  calculateTripDurationMinutes,
  dispatchCommittedWorkEvent,
  initializeApplicationRuntimeRegistry,
  LOGBOOK_WORK_EVENT_INTEGRATION,
  TRIP_DURATION_CALCULATION,
} from "./runtime";
export type { TripDurationInput } from "./runtime";
export {
  buildTripHistory,
} from "../../domain/src/trip-history";
export type {
  TripHistoryRecord,
  TripHistoryStatus,
} from "../../domain/src/trip-history";
