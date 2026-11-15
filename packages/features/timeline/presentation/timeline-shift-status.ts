import type { DriverEvent } from "../../../domain/src/driver-workflow";
import type { TimelineShiftProjection } from "../../../domain/src/timeline";
import { moveTimelineDate } from "./timeline-date";

export type TimelineShiftDisplayStatus =
  | "ACTIVITY"
  | "ENDED"
  | "ROTATED · 04:00"
  | "CONTINUED · ACTIVE"
  | "IN PROGRESS";

export type TimelineShiftStatusResult = Readonly<{
  continued: boolean;
  status: TimelineShiftDisplayStatus;
}>;

function activeShiftAt(events: readonly DriverEvent[], instant: number): DriverEvent | undefined {
  const ordered = [...events].sort((a, b) =>
    Date.parse(a.command.transitionAt) - Date.parse(b.command.transitionAt) ||
    a.revision - b.revision || a.eventId.localeCompare(b.eventId));
  let active: DriverEvent | undefined;
  for (const event of ordered) {
    if (Date.parse(event.command.transitionAt) > instant) break;
    if (event.command.eventType === "shift_start") active = event;
    if (event.command.eventType === "shift_end") active = undefined;
  }
  return active;
}

/** Preserves the existing 04:00 logical-shift boundary and physical-shift continuity. */
export function timelineShiftDisplayStatus(
  shift: TimelineShiftProjection | undefined,
  segmentEvents: readonly DriverEvent[],
  allEvents: readonly DriverEvent[],
  now: number,
): TimelineShiftStatusResult {
  if (!shift) return { continued: false, status: "ACTIVITY" };
  const segmentStart = Date.parse(shift.anchorDate + "T04:00:00+05:30");
  const segmentEnd = Date.parse(moveTimelineDate(shift.anchorDate, 1) + "T04:00:00+05:30");
  const activeAtStart = activeShiftAt(allEvents, segmentStart);
  const activeAtEnd = activeShiftAt(allEvents, segmentEnd);
  const continued = !!activeAtStart && Date.parse(activeAtStart.command.transitionAt) < segmentStart;
  const endedInsideSegment = segmentEvents.some(event => event.command.eventType === "shift_end");
  const closedAtBoundary = allEvents.some(event =>
    event.command.eventType === "shift_end" && Date.parse(event.command.transitionAt) === segmentEnd);
  const rotated = now >= segmentEnd && !endedInsideSegment && !closedAtBoundary &&
    !!activeAtEnd && (shift.eventIds.includes(activeAtEnd.eventId) || continued);
  return {
    continued,
    status: endedInsideSegment || closedAtBoundary ? "ENDED" :
      rotated ? "ROTATED · 04:00" : continued ? "CONTINUED · ACTIVE" : "IN PROGRESS",
  };
}
