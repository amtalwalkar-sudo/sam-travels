import { describe, expect, it } from "vitest";
import { buildTimelineProjection } from "../packages/domain/src/timeline";
import type { DriverEvent } from "../packages/domain/src/driver-workflow";

function event(eventId: string, eventType: string, transitionAt: string, revision: number): DriverEvent {
  return {
    eventId,
    revision,
    committedAt: transitionAt,
    command: {
      schemaVersion: 1,
      commandId: eventId,
      eventId,
      eventType,
      originSurface: "pwa",
      transitionAt,
      expectedPriorState: "shift_active",
      expectedRevision: revision - 1,
      idempotencyKey: eventId,
    },
  } as unknown as DriverEvent;
}

describe("Timeline projection contracts", () => {
  it("keeps legacy pickup-source status local to legacy shifts in mixed v1/v2 history", () => {
    const events = [
      event("legacy-shift-start", "shift_start", "2026-11-07T05:00:00.000Z", 1),
      event("legacy-trip-start", "trip_start", "2026-11-07T05:10:00.000Z", 2),
      event("legacy-trip-end", "trip_end", "2026-11-07T05:40:00.000Z", 3),
      event("legacy-shift-end", "shift_end", "2026-11-07T06:00:00.000Z", 4),
      event("v2-shift-start", "shift_start", "2026-11-08T05:00:00.000Z", 5),
      event("v2-trip-create", "trip_create", "2026-11-08T05:10:00.000Z", 6),
      event("v2-start-ride", "start_ride", "2026-11-08T05:20:00.000Z", 7),
      event("v2-end-ride", "end_ride", "2026-11-08T05:40:00.000Z", 8),
      event("v2-shift-end", "shift_end", "2026-11-08T06:00:00.000Z", 9),
    ];
    const projection = buildTimelineProjection({
      events,
      asOf: "2026-11-08T07:00:00.000Z",
      pickupIntervals: { status: "unavailable", reason: "legacy_pickup_source_not_connected" },
    });
    const legacy = projection.logicalShifts.find(shift => shift.id === "logical-shift:2026-11-07");
    const v2 = projection.logicalShifts.find(shift => shift.id === "logical-shift:2026-11-08");
    expect(legacy?.metrics.pickup_time).toMatchObject({
      status: "unavailable",
      reason: "legacy_pickup_source_not_connected",
    });
    expect(v2?.metrics.pickup_time).toMatchObject({
      status: "available",
      value: 10,
      unit: "minutes",
    });
  });

  it("preserves source timestamp precision in projected durations", () => {
    const projection = buildTimelineProjection({
      events: [
        event("precision-shift-start", "shift_start", "2026-11-08T10:00:00.000Z", 1),
        event("precision-shift-end", "shift_end", "2026-11-08T10:20:34.567Z", 2),
      ],
      asOf: "2026-11-08T10:21:00.000Z",
    });
    const duration = projection.logicalShifts[0].metrics.shift_duration;
    expect(duration.status).toBe("available");
    if (duration.status === "available") {
      expect(duration.value).toBeCloseTo(20.5761166667, 8);
    }
  });
});
