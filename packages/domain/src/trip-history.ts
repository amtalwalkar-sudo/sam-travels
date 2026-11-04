import type { DriverEvent } from "./driver-workflow";

export type TripHistoryStatus = "active" | "completed" | "cancelled" | "needs_attention";

export interface TripHistoryRecord {
  id: string;
  startEventId?: string;
  startedAt?: string;
  startGps?: DriverEvent["gps"];
  endEventId?: string;
  endedAt?: string;
  endGps?: DriverEvent["gps"];
  status: TripHistoryStatus;
  reason?: string;
}

/**
 * Rebuild trip history from the immutable, revision-ordered driver event log.
 * This is deliberately a projection, not a second source of truth: it can be
 * regenerated after process death, restore, or a future projection rebuild.
 */
export function buildTripHistory(events: readonly DriverEvent[]): TripHistoryRecord[] {
  const ordered = [...events].sort((a, b) =>
    a.revision - b.revision ||
    Date.parse(a.committedAt) - Date.parse(b.committedAt) ||
    a.eventId.localeCompare(b.eventId),
  );
  const trips: TripHistoryRecord[] = [];
  let active: TripHistoryRecord | undefined;

  for (const event of ordered) {
    const kind = event.command.eventType;
    if (kind === "trip_start") {
      if (active) {
        active.status = "needs_attention";
        active.reason = "overlapping_trip_start";
      }
      active = {
        id: event.eventId,
        startEventId: event.eventId,
        startedAt: event.command.transitionAt,
        startGps: event.gps,
        status: "active",
      };
      trips.push(active);
      continue;
    }

    if (kind !== "trip_end" && kind !== "ride_cancel") continue;
    if (!active) {
      const cancelledBeforeTripStart = kind === "ride_cancel" && event.command.expectedPriorState === "approach_active";
      trips.push({
        id: (cancelledBeforeTripStart ? "cancelled-before-start:" : "unmatched:") + event.eventId,
        endEventId: event.eventId,
        endedAt: event.command.transitionAt,
        endGps: event.gps,
        status: cancelledBeforeTripStart ? "cancelled" : "needs_attention",
        reason: cancelledBeforeTripStart ? "cancelled_before_trip_start" : "trip_close_without_start",
      });
      continue;
    }

    active.endEventId = event.eventId;
    active.endedAt = event.command.transitionAt;
    active.endGps = event.gps;
    active.status = kind === "ride_cancel" ? "cancelled" : "completed";
    active = undefined;
  }

  return trips.sort((a, b) =>
    Date.parse(b.startedAt ?? b.endedAt ?? "") - Date.parse(a.startedAt ?? a.endedAt ?? ""),
  );
}
