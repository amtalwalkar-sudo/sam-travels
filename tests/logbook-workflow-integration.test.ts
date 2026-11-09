import { describe, expect, it } from "vitest";
import { LOGBOOK_WORK_EVENT_INTEGRATION } from "../packages/features/logbook";

const gps = { latitude: 19.076, longitude: 72.8777, horizontalAccuracyM: 8, fixAt: "2026-11-10T04:00:00.000Z", provider: "test" };
function event(eventType: string, expectedPriorState: string, workflowVersion?: number) {
  const id = "event-" + eventType;
  return {
    eventId: id,
    command: {
      schemaVersion: 1, commandId: id, eventId: id, eventType,
      originSurface: "native_overlay", transitionAt: "2026-11-10T04:00:00.000Z",
      expectedPriorState, expectedRevision: 2, idempotencyKey: id,
      ...(workflowVersion === undefined ? {} : { workflowVersion }),
      ...(eventType === "trip_create" && workflowVersion === 2 ? {
        tripContext: { schemaVersion: 1, shiftId: "shift-1", driverId: "driver-1", assignmentId: "assignment-1",
          vehicleId: "feature:vehicle:MH01AB1234", operationalDate: "2026-11-10" },
      } : {}),
      ...(eventType === "shift_start" && workflowVersion === 2 ? {
        driverContext: { schemaVersion: 1, driverId: "driver-1", assignmentId: "assignment-1", vehicleId: "feature:vehicle:MH01AB1234" },
      } : {}),
    },
    gps, committedAt: "2026-11-10T04:00:01.000Z", revision: 3,
  };
}

describe("Work to Log Book event integration", () => {
  it.each([
    ["trip_create", "shift_active"],
    ["start_ride", "going_to_pickup"],
    ["end_ride", "trip_active"],
    ["cancel_ride", "going_to_pickup"],
  ])("accepts v2 %s from %s", (type, state) => {
    expect(LOGBOOK_WORK_EVENT_INTEGRATION.validatePayload(event(type, state, 2))).toBe(true);
  });

  it("continues accepting legacy v1 event meanings", () => {
    expect(LOGBOOK_WORK_EVENT_INTEGRATION.validatePayload(event("trip_start", "shift_active"))).toBe(true);
  });

  it("rejects a v2 trip creation that has lost its immutable trip snapshot", () => {
    const value = event("trip_create", "shift_active", 2);
    delete (value.command as { tripContext?: unknown }).tripContext;
    expect(LOGBOOK_WORK_EVENT_INTEGRATION.validatePayload(value)).toBe(false);
  });

  it("rejects a v2 event without the v2 workflow version", () => {
    expect(LOGBOOK_WORK_EVENT_INTEGRATION.validatePayload(event("start_ride", "going_to_pickup"))).toBe(false);
  });
});
