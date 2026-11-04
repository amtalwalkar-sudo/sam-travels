import {
  dispatchFeatureIntegration,
  initializeRuntimeRegistry,
  type CalculationContract,
  type FeatureIntegrationHandler,
  type RuntimeRegistry,
} from "../../core/src/index";
import type { DriverEvent } from "../../domain/src/driver-workflow";

export type TripDurationInput = {
  businessDate: string;
  startedAt: string;
  endedAt: string;
};

/** Elapsed wall-clock duration for a completed trip, expressed in minutes. */
export function calculateTripDurationMinutes(input: TripDurationInput): number {
  const start = Date.parse(input.startedAt);
  const end = Date.parse(input.endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new Error("Invalid trip duration interval");
  }
  return (end - start) / 60_000;
}

export const LOGBOOK_WORK_EVENT_INTEGRATION = Object.freeze({
  id: "logbook.work-driver-events.v1",
  version: 1,
  producerFeatureId: "work",
  consumerFeatureId: "logbook",
  eventName: "work.driver-event-committed",
  payloadVersion: 1,
});

export const TRIP_DURATION_CALCULATION: CalculationContract<TripDurationInput, number> = {
  id: "logbook.trip-duration-minutes.v1",
  ownerFeatureId: "logbook",
  version: 1,
  inputSchemaVersion: 1,
  outputSchemaVersion: 1,
  unit: "minutes",
  effectiveDateField: "businessDate",
  rounding: { mode: "half-up", decimalPlaces: 2 },
  calculate: calculateTripDurationMinutes,
  regressionCases: [
    {
      name: "one-hour-trip",
      input: {
        businessDate: "2026-11-04",
        startedAt: "2026-11-04T08:00:00.000Z",
        endedAt: "2026-11-04T09:00:00.000Z",
      },
      expected: 60,
    },
    {
      name: "trip-crossing-midnight",
      input: {
        businessDate: "2026-11-04",
        startedAt: "2026-11-04T23:30:00.000Z",
        endedAt: "2026-11-05T00:15:30.000Z",
      },
      expected: 45.5,
    },
    {
      name: "fractional-minute",
      input: {
        businessDate: "2026-11-04",
        startedAt: "2026-11-04T10:00:00.000Z",
        endedAt: "2026-11-04T10:01:12.600Z",
      },
      expected: 1.21,
    },
  ],
};

export function initializeApplicationRuntimeRegistry(): RuntimeRegistry {
  return initializeRuntimeRegistry({
    integrations: [LOGBOOK_WORK_EVENT_INTEGRATION],
    calculations: [TRIP_DURATION_CALCULATION],
  });
}

/**
 * Dispatch a committed Work event through the registered Log Book contract.
 * The caller supplies the consumer port; the durable Work event log remains
 * the source of truth and can be replayed if a consumer is temporarily absent.
 */
export async function dispatchCommittedWorkEvent(
  registry: RuntimeRegistry,
  event: DriverEvent,
  consumer: FeatureIntegrationHandler<DriverEvent>,
): Promise<void> {
  await dispatchFeatureIntegration(
    registry.integrations,
    {
      integrationId: LOGBOOK_WORK_EVENT_INTEGRATION.id,
      contractVersion: LOGBOOK_WORK_EVENT_INTEGRATION.version,
      eventName: LOGBOOK_WORK_EVENT_INTEGRATION.eventName,
      payloadVersion: LOGBOOK_WORK_EVENT_INTEGRATION.payloadVersion,
      eventId: event.eventId,
      occurredAt: event.committedAt,
      payload: event,
    },
    { [LOGBOOK_WORK_EVENT_INTEGRATION.id]: consumer },
  );
}
