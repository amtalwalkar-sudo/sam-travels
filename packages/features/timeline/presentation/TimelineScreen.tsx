import { useEffect, useMemo, useRef, useState } from "react";
import type { DriverEvent } from "../../../domain/src/driver-workflow";
import type { TimelineMetric, TimelineMetricId, TimelineShiftProjection } from "../../../domain/src/timeline";
import type { TimelineScreenContext } from "../runtime";
import type { TimelineLocationEnrichment, TimelineLocationMap } from "../../../application/src/timeline-reverse-geocoding";
import "./timeline.css";

type Mode = "today" | "week" | "date";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric",
});
const eventTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true,
});

function indiaDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
  return part("year") + "-" + part("month") + "-" + part("day");
}
function moveDate(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
function weekStart(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return moveDate(value, -(weekday === 0 ? 6 : weekday - 1));
}
function activeShiftAt(events: DriverEvent[], instant: number): DriverEvent | undefined {
  const ordered = [...events].sort((a, b) =>
    Date.parse(a.command.transitionAt) - Date.parse(b.command.transitionAt) ||
    a.revision - b.revision ||
    a.eventId.localeCompare(b.eventId));
  let active: DriverEvent | undefined;
  for (const event of ordered) {
    if (Date.parse(event.command.transitionAt) > instant) break;
    if (event.command.eventType === "shift_start") active = event;
    if (event.command.eventType === "shift_end") active = undefined;
  }
  return active;
}
function eventTitle(event: DriverEvent): string {
  const names: Record<string, string> = {
    shift_start: "Shift started", shift_end: "Shift ended",
    trip_create: "Going to pickup", start_ride: "Ride started",
    end_ride: "Ride completed", cancel_ride: "Pickup cancelled",
    trip_start: "Ride started", trip_end: "Ride completed", ride_cancel: "Ride cancelled",
  };
  return names[event.command.eventType] ?? event.command.eventType.replaceAll("_", " ");
}
function elapsed(start: string, end: string): number | undefined {
  const from = Date.parse(start), to = Date.parse(end);
  return Number.isFinite(from) && Number.isFinite(to) && to >= from ? (to - from) / 60_000 : undefined;
}
function durationLabel(minutes: number): string {
  const seconds = Math.round(minutes * 60);
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hours > 0
    ? [hours, mins, secs].map(value => String(value).padStart(2, "0")).join(":")
    : mins + "m " + String(secs).padStart(2, "0") + "s";
}
function metricLabel(metric: TimelineMetric): string {
  if (metric.status !== "available") {
    if (metric.status === "pending") return "In progress";
    if (metric.status === "invalid") return "Needs review";
    if (metric.status === "not_applicable") return "Not applicable";
    return "Not available";
  }
  if (metric.unit === "count") return String(metric.value);
  if (metric.unit === "minutes") return durationLabel(metric.value);
  if (metric.unit === "km") return metric.value.toFixed(1) + " km";
  if (metric.unit === "minor_currency_units") {
    if (metric.currency) {
      return new Intl.NumberFormat("en-IN", { style: "currency", currency: metric.currency, maximumFractionDigits: 2 })
        .format(metric.value / 100);
    }
    return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      .format(metric.value / 100) + " · currency not supplied";
  }
  return "Not available";
}
const METRICS: Array<[TimelineMetricId, string]> = [
  ["total_fare", "Total fare"], ["shift_duration", "Shift duration"],
  ["passenger_trip_time", "Passenger trip time"], ["pickup_time", "Pickup time"],
  ["idle_time", "Idle time"], ["completed_ride_count", "Completed rides"],
  ["cancelled_attempt_count", "Cancelled attempts"], ["toll_total", "Toll"],
  ["parking_total", "Parking"], ["business_km", "Business distance"],
];

function ShiftSummary({ shift }: { shift: TimelineShiftProjection }) {
  return <section className="timeline-summary" aria-label={"Summary for " + shift.anchorDate}>
    <header><strong>SHIFT SUMMARY</strong><span>READ ONLY</span></header>
    <div className="timeline-summary-grid">
      {METRICS.map(([id, label]) => {
        const metric = shift.metrics[id];
        return <div className="timeline-metric" key={id}>
          <small>{label}</small>
          <strong className={metric.status === "invalid" ? "needs-review" : metric.status === "unavailable" ? "not-available" : ""}>
            {metricLabel(metric)}
          </strong>
        </div>;
      })}
    </div>
  </section>;
}

function ShiftEvents({ events, shift, allEvents, locations, now, calendarDate }: {
  events: DriverEvent[];
  shift?: TimelineShiftProjection;
  allEvents: DriverEvent[];
  locations: Readonly<Record<string, TimelineLocationEnrichment>>;
  now: number;
  calendarDate: string;
}) {
  const ordered = [...events].sort((a, b) =>
    Date.parse(a.command.transitionAt) - Date.parse(b.command.transitionAt) ||
    a.revision - b.revision ||
    a.eventId.localeCompare(b.eventId));
  const tripStarts = allEvents.filter(event => event.command.eventType === "trip_create" || event.command.eventType === "trip_start");
  const rideStarts = allEvents.filter(event => event.command.eventType === "start_ride" || event.command.eventType === "trip_start");
  const blocks = ordered.map(event => {
    const kind = event.command.eventType;
    const at = event.command.transitionAt;
    let detail = "GPS evidence recorded";
    let extra = "";
    if (kind === "start_ride") {
      const start = [...tripStarts].reverse().find(item => Date.parse(item.command.transitionAt) <= Date.parse(at));
      const minutes = start ? elapsed(start.command.transitionAt, at) : undefined;
      detail = minutes === undefined ? "Pickup duration unavailable" : durationLabel(minutes) + " to pickup";
    } else if (kind === "cancel_ride" || kind === "ride_cancel") {
      const start = [...tripStarts].reverse().find(item => Date.parse(item.command.transitionAt) <= Date.parse(at));
      const minutes = start ? elapsed(start.command.transitionAt, at) : undefined;
      detail = minutes === undefined ? "Pickup duration unavailable" : durationLabel(minutes) + " until cancellation";
    } else if (kind === "end_ride" || kind === "trip_end") {
      const start = [...rideStarts].reverse().find(item => Date.parse(item.command.transitionAt) <= Date.parse(at));
      const minutes = start ? elapsed(start.command.transitionAt, at) : undefined;
      detail = minutes === undefined ? "Ride duration unavailable" : "Ride duration · " + durationLabel(minutes);
    } else if (kind === "trip_create") {
      detail = "Pickup journey";
    }
    if (kind === "start_ride" || kind === "trip_start") extra = "Ride fare · Not available";
    if (kind === "cancel_ride" || kind === "ride_cancel") extra = "Cancellation fee · Not available";
    return { event, detail, extra };
  });
  const shiftEvents = shift ? allEvents.filter(event => shift.eventIds.includes(event.eventId)) : ordered;
  const endsOnThisCalendarDay = events.some(event => event.command.eventType === "shift_end");
  const segmentStart = shift ? Date.parse(shift.anchorDate + "T04:00:00+05:30") : Number.NaN;
  const segmentEnd = shift ? Date.parse(moveDate(shift.anchorDate, 1) + "T04:00:00+05:30") : Number.NaN;
  const activeAtSegmentStart = Number.isFinite(segmentStart) ? activeShiftAt(allEvents, segmentStart) : undefined;
  const activeBeforeSegmentEnd = Number.isFinite(segmentEnd) ? activeShiftAt(allEvents, segmentEnd - 1) : undefined;
  const activeAtSegmentEnd = Number.isFinite(segmentEnd) ? activeShiftAt(allEvents, segmentEnd) : undefined;
  const continuedFromPrevious = !!activeAtSegmentStart &&
    Date.parse(activeAtSegmentStart.command.transitionAt) < segmentStart;
  const closedAtBoundary = Number.isFinite(segmentEnd) && allEvents.some(event =>
    event.command.eventType === "shift_end" && Date.parse(event.command.transitionAt) === segmentEnd);
  const ended = shiftEvents.some(event => event.command.eventType === "shift_end") || closedAtBoundary;
  const rotated = !ended && !!activeBeforeSegmentEnd && !!activeAtSegmentEnd && now >= segmentEnd;
  const rotationDivider = continuedFromPrevious && calendarDate === shift?.anchorDate;
  const shiftStarted = shiftEvents.find(event => event.command.eventType === "shift_start");
  const timerStart = continuedFromPrevious ? segmentStart : shiftStarted ? Date.parse(shiftStarted.command.transitionAt) : undefined;
  const liveEnd = Number.isFinite(segmentEnd) ? Math.min(now, segmentEnd) : now;
  const liveDuration = !ended && !rotated && timerStart !== undefined
    ? elapsed(new Date(timerStart).toISOString(), new Date(liveEnd).toISOString())
    : rotated && Number.isFinite(segmentEnd) && timerStart !== undefined
      ? elapsed(new Date(timerStart).toISOString(), new Date(segmentEnd).toISOString())
      : undefined;
  const statusLabel = ended ? "ENDED" : rotated ? "ROTATED · 04:00"
    : continuedFromPrevious ? "CONTINUED · ACTIVE"
      : liveDuration === undefined ? "IN PROGRESS" : "ACTIVE · " + durationLabel(liveDuration);
  return <section className="timeline-shift">
    <header className="timeline-shift-heading">
      <strong>{shift ? "SHIFT " + shift.anchorDate : "SHIFT ACTIVITY"}</strong>
      <span>{statusLabel}</span>
    </header>
    <div className="timeline-events">
      {rotationDivider && <article className="timeline-event boundary system">
        <div className="timeline-event-time">04:00 AM</div>
        <div className="timeline-event-content">
          <strong>SHIFT ROTATED · 04:00</strong>
          <small>Online session continued</small>
          {shift?.metrics.business_km.status === "pending" && <small>Odometer pending</small>}
        </div>
      </article>}
      {blocks.map(({ event, detail, extra }) => {
        const kind = event.command.eventType;
        const cancelled = kind === "cancel_ride" || kind === "ride_cancel";
        const boundary = kind === "shift_start" || kind === "shift_end";
        const ride = kind === "start_ride" || kind === "end_ride" || kind === "trip_start" || kind === "trip_end";
        const pickup = kind === "trip_create";
        const location = locations[event.eventId];
        return <article className={"timeline-event" + (cancelled ? " cancelled" : "") + (boundary ? " boundary" : "") + (ride ? " ride" : "") + (pickup ? " pickup" : "")} key={event.eventId}>
          <div className="timeline-event-time">{eventTimeFormatter.format(new Date(event.command.transitionAt))}</div>
          <div className="timeline-event-content">
            <strong>{eventTitle(event)}</strong>
            <small>{detail}</small>
            {extra && <small>{extra}</small>}
            <small>{location?.status === "resolved" ? location.label : location?.status === "network_disabled" ? "Location captured · Internet access disabled" : event.gps ? "Location captured · name not available" : "Location not available"}</small>
          </div>
        </article>;
      })}
    </div>
    {endsOnThisCalendarDay && shift && <ShiftSummary shift={shift} />}
  </section>;
}
function dateLabel(value: string): string {
  return dateFormatter.format(new Date(value + "T12:00:00+05:30"));
}

export function TimelineScreen({ context }: { context: TimelineScreenContext }) {
  const [mode, setMode] = useState<Mode>("today");
  const [anchorDate, setAnchorDate] = useState(indiaDate(new Date()));
  type LoadedTimeline = Awaited<ReturnType<TimelineScreenContext["loadTimeline"]>>;
  const [model, setModel] = useState<(LoadedTimeline["model"] & { locations: TimelineLocationMap }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [clock, setClock] = useState(Date.now());
  const [locationLookupEnabled, setLocationLookupEnabled] = useState(false);
  const refreshSequence = useRef(0);
  const activeRefresh = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function refresh(fromDate: string, toDate: string, allowLocationLookup = locationLookupEnabled) {
    activeRefresh.current?.abort();
    const controller = new AbortController();
    activeRefresh.current = controller;
    const requestId = ++refreshSequence.current;
    setLoading(true);
    setError("");
    let locationTaskStarted = false;
    try {
      const result = await context.loadTimeline(fromDate, toDate, allowLocationLookup, controller.signal);
      if (requestId === refreshSequence.current) {
        locationTaskStarted = true;
        setModel({ ...result.model, locations: {} });
        void result.locations.then((locations) => {
          if (requestId === refreshSequence.current) {
            setModel((current) => current ? { ...current, locations } : current);
          }
        }).catch(() => {
          // Location enrichment is optional; the core Timeline remains usable.
        }).finally(() => {
          if (requestId === refreshSequence.current && activeRefresh.current === controller) {
            activeRefresh.current = null;
          }
        });
      }
    } catch (cause) {
      if (requestId === refreshSequence.current) {
        setError(cause instanceof Error ? cause.message : "Timeline is temporarily unavailable");
      }
    } finally {
      if (requestId === refreshSequence.current) {
        setLoading(false);
        if (!locationTaskStarted && activeRefresh.current === controller) activeRefresh.current = null;
      }
    }
  }

  useEffect(() => () => {
    refreshSequence.current += 1;
    activeRefresh.current?.abort();
    activeRefresh.current = null;
  }, []);
  const range = useMemo(() => {
    if (mode === "today") return { from: indiaDate(new Date()), to: indiaDate(new Date()) };
    if (mode === "date") return { from: anchorDate, to: anchorDate };
    const from = weekStart(anchorDate);
    return { from, to: moveDate(from, 6) };
  }, [mode, anchorDate, clock]);

  useEffect(() => { void refresh(range.from, range.to, locationLookupEnabled); }, [context.loadTimeline, range.from, range.to, locationLookupEnabled]);

  // Refresh the derived locality projection when the PWA regains connectivity
  // or the app returns to the foreground. This is event-driven, never polling.
  useEffect(() => {
    if (!locationLookupEnabled) return;
    const resume = () => {
      if (document.visibilityState === "visible") void refresh(range.from, range.to, true);
    };
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [locationLookupEnabled, range.from, range.to, context.loadTimeline]);

  const dayGroups = useMemo(() => (model?.projection.calendarDays ?? [])
    .filter(day => day.date >= range.from && day.date <= range.to)
    .sort((a, b) => b.date.localeCompare(a.date)), [model, range]);
  const eventById = useMemo(() => new Map((model?.events ?? []).map(event => [event.eventId, event])), [model]);
  const shiftByEvent = useMemo(() => {
    const map = new Map<string, TimelineShiftProjection>();
    for (const shift of model?.projection.logicalShifts ?? []) for (const id of shift.eventIds) map.set(id, shift);
    return map;
  }, [model]);
  const allEvents = model?.events ?? [];
  const locations = model?.locations ?? {};
  const groupedDays = dayGroups.map(day => {
    const shifts = new Map<string, DriverEvent[]>();
    for (const id of day.eventIds) {
      const event = eventById.get(id);
      if (!event) continue;
      const shift = shiftByEvent.get(id);
      const key = shift?.id ?? "unassigned:" + id;
      const list = shifts.get(key) ?? [];
      list.push(event);
      shifts.set(key, list);
    }
    const groups = [...shifts.entries()].map(([id, events]) => ({
      id,
      events,
      shift: shiftByEvent.get(events[0]?.eventId ?? ""),
      firstAt: Math.min(...events.map(event => Date.parse(event.command.transitionAt))),
    }));
    groups.sort((a, b) => a.firstAt - b.firstAt || a.id.localeCompare(b.id));
    return { day, shifts: groups };
  });

  const previous = () => setAnchorDate(value => moveDate(value, mode === "week" ? -7 : -1));
  const next = () => setAnchorDate(value => moveDate(value, mode === "week" ? 7 : 1));

  return <section className="timeline-screen" aria-label="Timeline history">
    <div className="timeline-toolbar">
      <div className="timeline-heading">
        <small>YOUR WORKSPACE</small>
        <h2>Timeline</h2>
      </div>
      <button type="button" className="timeline-refresh" onClick={() => void refresh(range.from, range.to, locationLookupEnabled)} disabled={loading}>Refresh</button>
    </div>
    <div className="timeline-location-consent">
      <p>Optional location names send only GPS coordinates from events in this selected date range to Geoapify through the Sam Travels secure proxy when Internet Access is on. The API key stays on the server; your saved GPS records are not changed.</p>
      <button type="button" aria-pressed={locationLookupEnabled}
        onClick={() => setLocationLookupEnabled(enabled => !enabled)}>
        {locationLookupEnabled ? "Turn off location names" : "Allow location names"}
      </button>
    </div>
    <div className="timeline-filter" role="group" aria-label="Timeline date filter">
      <button type="button" className={mode === "today" ? "selected" : ""} onClick={() => setMode("today")}>Today</button>
      <button type="button" className={mode === "week" ? "selected" : ""} onClick={() => setMode("week")}>Week</button>
      <button type="button" className={mode === "date" ? "selected" : ""} onClick={() => setMode("date")}>By date</button>
    </div>
    {mode !== "today" && <div className="timeline-date-nav">
      <button type="button" onClick={previous} aria-label="Previous period">‹</button>
      {mode === "date"
        ? <label><span>Select date</span><input type="date" value={anchorDate} onChange={event => setAnchorDate(event.target.value)} /></label>
        : <strong>{dateLabel(range.from)} – {dateLabel(range.to)}</strong>}
      <button type="button" onClick={next} aria-label="Next period">›</button>
    </div>}
    {mode === "today" && <p className="timeline-date-label">{dateLabel(range.from)}</p>}
    {error && <p className="timeline-error" role="alert">{error}</p>}
    {!!model?.projection.integrityIssues.length && <aside className="timeline-integrity" role="alert">
      <strong>Some recorded activity needs review.</strong>
      <ul>{model.projection.integrityIssues.map((issue, index) => (
        <li key={issue.code + ":" + (issue.eventId ?? "record") + ":" + index}>
          {issue.code.replaceAll("_", " ")}
        </li>
      ))}</ul>
    </aside>}
    {loading && !model && <p className="timeline-empty">Loading your activity…</p>}
    {!loading && !error && groupedDays.length === 0 && <p className="timeline-empty">No activity recorded for this period.</p>}
    {groupedDays.map(({ day, shifts }) => <section className="timeline-day" key={day.date}>
      <h3>{dateLabel(day.date)}</h3>
      {shifts.map(group => <ShiftEvents key={group.id} events={group.events} shift={group.shift} allEvents={allEvents} locations={locations} now={clock} calendarDate={day.date} />)}
    </section>)}
    <p className="timeline-attribution">Location names powered by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></p>
    <p className="timeline-readonly-note">Timeline is read-only. Shift and trip records remain owned by Work and Log Book.</p>
  </section>;
}
