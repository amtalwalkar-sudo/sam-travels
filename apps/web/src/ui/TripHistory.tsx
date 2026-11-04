import { useEffect, useState } from "react";
import { subscribeTripHistoryProjection } from "../../../../packages/features/logbook";
import type { TripHistoryRecord } from "../../../../packages/features/work-shift";

const time = (value?: string) => value
  ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "Not available";

export function TripHistory() {
  const [trips, setTrips] = useState<TripHistoryRecord[]>([]);
  useEffect(() => subscribeTripHistoryProjection(setTrips), []);
  return <section className="trip-history" aria-label="Trip history">
    <div className="trip-history-heading">
      <div><small>DRIVER ACTIVITY</small><h2>Trip history</h2></div>
      <span>{trips.length} {trips.length === 1 ? "trip" : "trips"}</span>
    </div>
    {!trips.length && <p className="trip-history-empty">No trips recorded yet. Trips from the PWA or floating overlay will appear here.</p>}
    <div className="trip-history-list">{trips.map((trip) => <article className="trip-history-item" key={trip.id}>
      <div className="trip-history-item-top">
        <strong>{trip.status === "active" ? "Trip in progress" : trip.status === "completed" ? "Completed trip" : trip.status === "cancelled" ? "Cancelled trip" : "Trip needs review"}</strong>
        <span className={"trip-history-status " + trip.status}>{trip.status.replaceAll("_", " ")}</span>
      </div>
      <div className="trip-history-times">
        <div><small>STARTED</small><span>{time(trip.startedAt)}</span></div>
        <div><small>{trip.endedAt ? "ENDED" : "LAST STATUS"}</small><span>{trip.endedAt ? time(trip.endedAt) : trip.status === "active" ? "In progress" : "Review required"}</span></div>
      </div>
      {trip.reason && <p className={trip.status === "needs_attention" ? "trip-history-error" : "trip-history-note"}>{trip.reason.replaceAll("_", " ")}</p>}
      <small className="trip-history-id">Trip reference · {trip.startEventId ?? trip.endEventId}</small>
    </article>)}</div>
  </section>;
}
