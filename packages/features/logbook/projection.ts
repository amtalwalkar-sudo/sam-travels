import type { DriverEvent } from "../../domain/src/driver-workflow";
import { buildTripHistory, type TripHistoryRecord } from "../../domain/src/trip-history";

let projection: TripHistoryRecord[] = [];
const listeners = new Set<(trips: TripHistoryRecord[]) => void>();

export function rebuildTripHistoryProjection(events: readonly DriverEvent[]): TripHistoryRecord[] {
  projection = buildTripHistory(events);
  const snapshot = readTripHistoryProjection();
  listeners.forEach((listener) => listener(snapshot));
  return snapshot;
}

export function readTripHistoryProjection(): TripHistoryRecord[] {
  return projection.map((trip) => ({ ...trip }));
}

export function subscribeTripHistoryProjection(listener: (trips: TripHistoryRecord[]) => void): () => void {
  listeners.add(listener);
  listener(readTripHistoryProjection());
  return () => listeners.delete(listener);
}
