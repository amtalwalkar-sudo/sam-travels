import { describe, expect, it } from "vitest";
import type { DriverEvent } from "../packages/domain/src/driver-workflow";
import type { TimelineShiftProjection } from "../packages/domain/src/timeline";
import { timelineShiftDisplayStatus } from "../packages/features/timeline";

function event(
  eventId: string,
  eventType: DriverEvent["command"]["eventType"],
  transitionAt: string,
  revision: number,
): DriverEvent {
  return {
    eventId,
    command: {
      schemaVersion: 1,
      commandId: eventId,
      eventId,
      eventType,
      originSurface: "pwa",
      transitionAt,
      expectedPriorState: "idle",
      expectedRevision: revision,
      idempotencyKey: eventId,
    },
    gps: null as unknown as DriverEvent["gps"],
    committedAt: transitionAt,
    revision,
  };
}

function shift(anchorDate: string, eventIds: string[]): TimelineShiftProjection {
  return { id: "logical-" + anchorDate, anchorDate, eventIds, metrics: {} } as unknown as TimelineShiftProjection;
}

describe("Timeline logical-shift presentation status", () => {
  it("distinguishes an active shift from a shift continued across the 04:00 boundary", () => {
    const start = event("start", "shift_start", "2026-11-14T05:00:00+05:30", 1);
    const active = timelineShiftDisplayStatus(
      shift("2026-11-14", ["start"]), [start], [start],
      Date.parse("2026-11-14T12:00:00+05:30"),
    );
    expect(active).toEqual({ continued: false, status: "IN PROGRESS" });

    const continuedStart = event("early-start", "shift_start", "2026-11-14T02:00:00+05:30", 1);
    const trip = event("trip", "trip_create", "2026-11-14T05:15:00+05:30", 2);
    const continued = timelineShiftDisplayStatus(
      shift("2026-11-14", ["trip"]), [trip], [continuedStart, trip],
      Date.parse("2026-11-14T12:00:00+05:30"),
    );
    expect(continued).toEqual({ continued: true, status: "CONTINUED · ACTIVE" });
  });

  it("marks a continuing physical shift as rotated at the next 04:00 boundary", () => {
    const start = event("start", "shift_start", "2026-11-14T05:00:00+05:30", 1);
    const trip = event("trip", "trip_create", "2026-11-14T07:00:00+05:30", 2);
    const result = timelineShiftDisplayStatus(
      shift("2026-11-14", ["start", "trip"]), [start, trip], [start, trip],
      Date.parse("2026-11-15T05:00:00+05:30"),
    );
    expect(result.status).toBe("ROTATED · 04:00");
  });

  it("treats a shift ending exactly at 04:00 as ended, not as a fabricated active continuation", () => {
    const start = event("start", "shift_start", "2026-11-14T05:00:00+05:30", 1);
    const end = event("end", "shift_end", "2026-11-15T04:00:00+05:30", 2);
    const result = timelineShiftDisplayStatus(
      shift("2026-11-14", ["start"]), [start], [start, end],
      Date.parse("2026-11-15T05:00:00+05:30"),
    );
    expect(result).toEqual({ continued: false, status: "ENDED" });
  });

  it("keeps an in-segment shift end authoritative", () => {
    const start = event("start", "shift_start", "2026-11-14T05:00:00+05:30", 1);
    const end = event("end", "shift_end", "2026-11-14T18:00:00+05:30", 2);
    const result = timelineShiftDisplayStatus(
      shift("2026-11-14", ["start", "end"]), [start, end], [start, end],
      Date.parse("2026-11-15T05:00:00+05:30"),
    );
    expect(result.status).toBe("ENDED");
  });
});
