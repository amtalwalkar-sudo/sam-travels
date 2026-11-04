import { useEffect, useState } from "react";
import type { DriverEvent } from "../../../../packages/domain/src/driver-workflow";
import { buildTripHistory, type TripHistoryRecord } from "../../../../packages/domain/src/trip-history";
import { createDriverWorkflow } from "../driver-workflow";

const time = (value?: string) => value
  ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "Not available";

export function TripHistory() {
  const [trips, setTrips] = useState<TripHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    let repository: { listEvents: () => Promise<DriverEvent[]>; dispose?: () => void } | undefined;
    let timer = 0;

    const refresh = async () => {
      if (!repository) return;
      try {
        const events = await repository.listEvents();
        if (live) {
          setTrips(buildTripHistory(events));
          setError("");
          setLoading(false);
        }
      } catch (cause) {
        if (live) {
          setError(cause instanceof Error ? cause.message : "Trip history unavailable");
          setLoading(false);
        }
      }
    };

    void createDriverWorkflow().then(({ repository: driverRepository }) => {
      if (!live) {
        (driverRepository as typeof driverRepository & { dispose?: () => void }).dispose?.();
        return;
      }
      repository = driverRepository;
      void refresh();
      timer = window.setInterval(() => { void refresh(); }, 1500);
    }).catch((cause) => {
      if (live) {
        setError(cause instanceof Error ? cause.message : "Trip history unavailable");
        setLoading(false);
      }
    });

    return () => {
      live = false;
      window.clearInterval(timer);
      repository?.dispose?.();
    };
  }, []);

  return (
    <section className="trip-history" aria-label="Trip history">
      <div className="trip-history-heading">
        <div><small>DRIVER ACTIVITY</small><h2>Trip history</h2></div>
        <span>{trips.length} {trips.length === 1 ? "trip" : "trips"}</span>
      </div>
      {loading && <p className="trip-history-empty">Loading saved trip history…</p>}
      {!loading && error && <p className="trip-history-error">{error}</p>}
      {!loading && !error && trips.length === 0 && (
        <p className="trip-history-empty">No trips recorded yet. Trips started from the PWA or floating overlay will appear here.</p>
      )}
      <div className="trip-history-list">
        {trips.map((trip) => (
          <article className="trip-history-item" key={trip.id}>
            <div className="trip-history-item-top">
              <strong>{trip.status === "active" ? "Trip in progress" : trip.status === "completed" ? "Completed trip" : trip.status === "cancelled" ? "Cancelled trip" : "Trip needs review"}</strong>
              <span className={"trip-history-status " + trip.status}>{trip.status.replaceAll("_", " ")}</span>
            </div>
            <div className="trip-history-times">
              <div><small>STARTED</small><span>{time(trip.startedAt)}</span></div>
              <div><small>{trip.endedAt ? "ENDED" : "LAST STATUS"}</small><span>{trip.endedAt ? time(trip.endedAt) : trip.status === "active" ? "In progress" : "Review required"}</span></div>
            </div>
            {trip.reason && <p className="trip-history-error">History integrity: {trip.reason.replaceAll("_", " ")}</p>}
            <small className="trip-history-id">Trip reference · {trip.startEventId ?? trip.endEventId}</small>
          </article>
        ))}
      </div>
    </section>
  );
}
