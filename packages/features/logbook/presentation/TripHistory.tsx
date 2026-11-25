import type { TripHistoryRecord } from "../../../domain/src/trip-history";

const time = (value?: string) => value
  ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "Not available";
const duration = (start?: string, end?: string) => {
  if (!start || !end) return "";
  const ms = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(ms) || ms < 0) return "";
  const minutes = Math.floor(ms / 60_000), hours = Math.floor(minutes / 60);
  return hours ? hours + "h " + (minutes % 60) + "m" : minutes + "m";
};
const accuracy = (metres?: number) => Number.isFinite(metres) && metres! >= 0 ? Math.round(metres!) + " m" : "";

export function TripHistory({ trips }: { trips: readonly TripHistoryRecord[] }) {
  return <section className="trip-history" aria-label="Trip history">
    <div className="trip-history-heading">
      <div><small>DRIVER ACTIVITY</small><h2>Trip history</h2></div>
      <span>{trips.length} {trips.length === 1 ? "trip" : "trips"}</span>
    </div>
    {!trips.length && <p className="trip-history-empty">No trips recorded yet. Trips from Work or Admin historical entry will appear here.</p>}
    <div className="trip-history-list">{trips.map(trip => {
      const elapsed = duration(trip.startedAt, trip.endedAt);
      const startAccuracy = accuracy(trip.startGps?.horizontalAccuracyM);
      const endAccuracy = accuracy(trip.endGps?.horizontalAccuracyM);
      return <article className="trip-history-item" key={trip.id}>
        <div className="trip-history-item-top">
          <strong>{trip.source === "historical_backfill" ? "Historical trip" : trip.status === "active" ? "Trip in progress" : trip.status === "completed" ? "Completed trip" : trip.status === "cancelled" ? "Cancelled trip" : "Trip needs review"}</strong>
          <span className={"trip-history-status " + trip.status}>{trip.status.replaceAll("_", " ")}</span>
        </div>
        <div className="trip-history-times">
          <div><small>STARTED</small><span>{time(trip.startedAt)}</span></div>
          <div><small>{trip.endedAt ? "ENDED" : "LAST STATUS"}</small><span>{trip.endedAt ? time(trip.endedAt) : trip.status === "active" ? "In progress" : "Review required"}</span></div>
        </div>
        {(elapsed || startAccuracy || endAccuracy) && <div className="trip-history-evidence">
          {elapsed && <div><small>DURATION</small><span>{elapsed}</span></div>}
          {startAccuracy && <div><small>START GPS ACCURACY</small><span>{startAccuracy}</span></div>}
          {endAccuracy && <div><small>END GPS ACCURACY</small><span>{endAccuracy}</span></div>}
        </div>}
        {trip.source === "historical_backfill" && <div className="trip-history-evidence">
          <div><small>FARE</small><span>₹{((trip.farePaise ?? 0) / 100).toFixed(2)}</span></div>
          <div><small>RECORD TYPE</small><span>Admin-declared historical trip</span></div>
          <div><small>OPERATIONAL DATE</small><span>{trip.operationalDate ?? "Not available"}</span></div>
          <div><small>DRIVER / VEHICLE</small><span>{trip.driverId ?? "—"} / {trip.vehicleId ?? "—"}</span></div>
        </div>}
        {trip.reason && <p className={trip.status === "needs_attention" ? "trip-history-error" : "trip-history-note"}>{trip.reason.replaceAll("_", " ")}</p>}
        <small className="trip-history-id">{trip.source === "historical_backfill"
          ? "Historical record · " + trip.id + " · entered by " + (trip.actor?.actorId ?? "Admin")
          : "Work event reference · " + (trip.startEventId ?? trip.endEventId ?? trip.creationEventId ?? trip.id)}</small>
      </article>;
    })}</div>
  </section>;
}
