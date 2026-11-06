import {
  type CalculationContract,
  type FeatureExtensionDefinition,
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
  validatePayload(payload: unknown): payload is DriverEvent {
    if (!payload || typeof payload !== "object") return false;
    const event = payload as Partial<DriverEvent>;
    const command = event.command;
    const gps = event.gps;
    return typeof event.eventId === "string" && event.eventId.length > 0 &&
      Number.isSafeInteger(event.revision) && (event.revision ?? 0) > 0 &&
      typeof event.committedAt === "string" && Number.isFinite(Date.parse(event.committedAt)) &&
      !!command && command.schemaVersion === 1 &&
      typeof command.commandId === "string" && command.commandId.length > 0 &&
      command.eventId === event.eventId &&
      ["shift_start", "shift_end", "trip_start", "trip_end", "ride_cancel"].includes(command.eventType) &&
      ["pwa", "native_overlay"].includes(command.originSurface) &&
      typeof command.transitionAt === "string" && Number.isFinite(Date.parse(command.transitionAt)) &&
      Number.isSafeInteger(command.expectedRevision) &&
      ["idle", "shift_active", "trip_active", "approach_active", "needs_attention"].includes(command.expectedPriorState) &&
      typeof command.idempotencyKey === "string" && command.idempotencyKey.length > 0 &&
      !!gps && Number.isFinite(gps.latitude) && gps.latitude >= -90 && gps.latitude <= 90 &&
      Number.isFinite(gps.longitude) && gps.longitude >= -180 && gps.longitude <= 180 &&
      Number.isFinite(gps.horizontalAccuracyM) && gps.horizontalAccuracyM >= 0 &&
      typeof gps.fixAt === "string" && Number.isFinite(Date.parse(gps.fixAt)) &&
      typeof gps.provider === "string" && gps.provider.length > 0;
  },
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

/** Production Log Book is registered through the same extension path as future modules. */
export const LOGBOOK_FEATURE_EXTENSION: FeatureExtensionDefinition = Object.freeze({
  id: "logbook.core.v1",
  version: 1,
  featureId: "logbook",
  publicEntryPoint: "packages/features/logbook/index.ts",
  integrations: [LOGBOOK_WORK_EVENT_INTEGRATION],
  calculations: [TRIP_DURATION_CALCULATION],
});

