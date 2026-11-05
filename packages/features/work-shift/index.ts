/** Public Work/Shift capability contract. */
export {
  DriverWorkflowService,
  createDriverCommand,
} from "../../application/src/driver-workflow-service";
export type {
  DriverWorkflowRepository,
  EventLocationProvider,
  DriverEventPublisher,
} from "../../application/src/driver-workflow-service";

export {
  EMPTY_DRIVER_STATE,
  transitionTarget,
  validateDriverCommand,
  validateDriverCompletion,
  isWithinGpsRecoveryWindow,
} from "../../domain/src/driver-workflow";
export { buildTripHistory } from "../../domain/src/trip-history";
export type { TripHistoryRecord, TripHistoryStatus } from "../../domain/src/trip-history";
export type {
  DriverEvent,
  DriverIntent,
  DriverIntentStatus,
  DriverResult,
  DriverTransitionError,
} from "../../domain/src/driver-workflow";

export type {
  CommandSurface,
  DriverEventType,
  DriverStateProjection,
  DriverTransitionCommand,
  DriverWorkflowState,
} from "../../core/src/commands";
export type { GpsFix } from "../../core/src/types";
