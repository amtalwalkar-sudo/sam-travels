import { describe, expect, it } from "vitest";
import { buildTripHistory, type DriverEvent } from "../packages/features/work-shift";

const event = (id: string, revision: number, eventType: DriverEvent["command"]["eventType"], at: string, expectedPriorState: DriverEvent["command"]["expectedPriorState"] = "trip_active"): DriverEvent => ({
  eventId: id,
  command: {
    schemaVersion: 1,
    commandId: id,
    eventId: id,
    eventType,
    originSurface: "native_overlay",
    transitionAt: at,
    expectedPriorState,
    expectedRevision: revision - 1,
    idempotencyKey: id,
  },
  gps: { latitude: 19.076, longitude: 72.8777, horizontalAccuracyM: 8, fixAt: at, provider: "test" },
  committedAt: at,
  revision,
});

describe("durable trip history projection", () => {
  it("pairs completed and cancelled trips from immutable events", () => {
    const trips = buildTripHistory([
      event("start-1", 2, "trip_start", "2026-11-04T09:00:00.000Z"),
      event("end-1", 3, "trip_end", "2026-11-04T09:20:00.000Z"),
      event("start-2", 5, "trip_start", "2026-11-04T10:00:00.000Z"),
      event("cancel-2", 6, "ride_cancel", "2026-11-04T10:04:00.000Z"),
      event("start-3", 8, "trip_start", "2026-11-04T11:00:00.000Z"),
    ]);

    expect(trips.map((trip) => trip.status)).toEqual(["active", "cancelled", "completed"]);
    expect(trips[1]).toMatchObject({ startEventId: "start-2", endEventId: "cancel-2" });
    expect(trips[2]).toMatchObject({ startEventId: "start-1", endEventId: "end-1" });
  });

  it("retains an unmatched close as a visible integrity issue instead of dropping it", () => {
    expect(buildTripHistory([
      event("orphan-end", 1, "trip_end", "2026-11-04T09:20:00.000Z"),
    ])).toMatchObject([{ id: "unmatched:orphan-end", status: "needs_attention", reason: "trip_close_without_start" }]);
  });

  it("flags overlapping starts without silently losing either trip", () => {
    const trips = buildTripHistory([
      event("start-1", 1, "trip_start", "2026-11-04T09:00:00.000Z"),
      event("start-2", 2, "trip_start", "2026-11-04T09:01:00.000Z"),
    ]);
    expect(trips.map((trip) => trip.status).sort()).toEqual(["active", "needs_attention"]);
  });
  it("shows a cancellation from approach as a cancelled ride without inventing a trip start", () => {
    expect(buildTripHistory([
      event("cancel-before-start", 1, "ride_cancel", "2026-11-04T09:20:00.000Z", "approach_active"),
    ])).toMatchObject([{
      id: "cancelled-before-start:cancel-before-start",
      status: "cancelled",
      reason: "cancelled_before_trip_start",
      endedAt: "2026-11-04T09:20:00.000Z",
    }]);
  });

});
