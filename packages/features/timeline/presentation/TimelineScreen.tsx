import { useEffect, useMemo, useRef, useState } from "react";
import type { DriverEvent } from "../../../domain/src/driver-workflow";
import type { TimelineMetric, TimelineMetricId, TimelineShiftProjection } from "../../../domain/src/timeline";
import type { TimelineScreenContext } from "../runtime";
import type { TimelineLocationEnrichment, TimelineLocationMap } from "../../../application/src/timeline-reverse-geocoding";
import { PeriodNavigation, type TimelinePeriodMode } from "./PeriodNavigation";
import { TimelineEventDetail, type TimelineEventDetailModel } from "./TimelineEventDetail";
import { TimelineShiftSection } from "./TimelineShiftSection";
import type { TimelineEventCardModel } from "./TimelineEventCard";
import { indiaCalendarDate, moveTimelineDate, timelineWeekStart, formatTimelineDate, formatTimelineWeekday, formatTimelineEventTime } from "./timeline-date";
import "./timeline.css";
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
function eventTitle(event: DriverEvent): string {
  const names: Record<string, string> = {
    shift_start: "Shift started", shift_end: "Shift ended",
    trip_create: "Pickup started", start_ride: "Ride started",
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
    if (metric.currency) return new Intl.NumberFormat("en-IN", {
      style: "currency", currency: metric.currency, maximumFractionDigits: 2,
    }).format(metric.value / 100);
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

function locationLabel(event: DriverEvent, location?: TimelineLocationEnrichment): string {
  if (location?.status === "resolved") return location.label;
  if (location?.status === "network_disabled") return "Location captured · Internet access disabled";
  if (location?.status === "pending") return "Location captured · place name pending";
  if (location?.status === "unavailable") return "Location captured · place name will retry";
  return event.gps ? "Location captured · name not available" : "Location not available";
}
function eventDescription(event: DriverEvent, allEvents: readonly DriverEvent[]): string {
  const kind = event.command.eventType;
  const at = event.command.transitionAt;
  const starts = allEvents.filter(item => item.command.eventType === "trip_create" || item.command.eventType === "trip_start");
  const rideStarts = allEvents.filter(item => item.command.eventType === "start_ride" || item.command.eventType === "trip_start");
  if (kind === "start_ride" || kind === "cancel_ride" || kind === "ride_cancel") {
    const start = [...starts].reverse().find(item => Date.parse(item.command.transitionAt) <= Date.parse(at));
    const minutes = start ? elapsed(start.command.transitionAt, at) : undefined;
    return minutes === undefined ? "Pickup duration unavailable" :
      durationLabel(minutes) + (kind === "start_ride" ? " to pickup" : " until cancellation");
  }
  if (kind === "end_ride" || kind === "trip_end") {
    const start = [...rideStarts].reverse().find(item => Date.parse(item.command.transitionAt) <= Date.parse(at));
    const minutes = start ? elapsed(start.command.transitionAt, at) : undefined;
    return minutes === undefined ? "Ride duration unavailable" : "Ride duration · " + durationLabel(minutes);
  }
  if (kind === "trip_create") return "Pickup journey started";
  if (kind === "shift_start" || kind === "shift_end") return "Recorded driver action";
  return "Recorded system activity";
}
function eventKind(event: DriverEvent): TimelineEventCardModel["kind"] {
  const kind = event.command.eventType;
  if (kind === "shift_start" || kind === "shift_end") return "shift";
  if (kind === "trip_create") return "pickup";
  if (kind === "start_ride" || kind === "end_ride" || kind === "trip_start" || kind === "trip_end") return "ride";
  if (kind === "cancel_ride" || kind === "ride_cancel") return "cancelled";
  return "other";
}

type LoadedTimeline = Awaited<ReturnType<TimelineScreenContext["loadTimeline"]>>;
type TimelineModel = LoadedTimeline["model"] & { locations: TimelineLocationMap };

export function TimelineScreen({ context }: { context: TimelineScreenContext }) {
  const [mode, setMode] = useState<TimelinePeriodMode>("day");
  const [selectedDate, setSelectedDate] = useState(indiaCalendarDate(new Date()));
  const [model, setModel] = useState<TimelineModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [locationLookupEnabled, setLocationLookupEnabled] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEventDetailModel | null>(null);
  const requestSequence = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const today = indiaDate(new Date());
  const fromDate = mode === "week" ? timelineWeekStart(selectedDate) : selectedDate;
  const toDate = mode === "week" ? moveTimelineDate(fromDate, 6) : selectedDate;

  const refresh = async (allowLocationLookup = locationLookupEnabled) => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError("");
    try {
      const result = await context.loadTimeline(fromDate, toDate, allowLocationLookup, controller.signal);
      if (requestId !== requestSequence.current) return;
      setModel({ ...result.model, locations: {} });
      void result.locations.then(locations => {
        if (requestId === requestSequence.current) setModel(current => current ? { ...current, locations } : current);
      }).catch(() => {
        // Optional locality enrichment never blocks or invalidates core history.
      }).finally(() => {
        if (requestId === requestSequence.current && activeRequest.current === controller) activeRequest.current = null;
      });
    } catch (cause) {
      if (requestId === requestSequence.current) {
        setError(cause instanceof Error ? cause.message : "Timeline is temporarily unavailable");
      }
    } finally {
      if (requestId === requestSequence.current) {
        setLoading(false);
        if (activeRequest.current === controller) activeRequest.current = null;
      }
    }
  };

  useEffect(() => {
    void refresh(locationLookupEnabled);
    return () => {
      requestSequence.current += 1;
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, [context.loadTimeline, fromDate, toDate, locationLookupEnabled]);

  useEffect(() => {
    if (!locationLookupEnabled) return;
    const resume = () => {
      if (document.visibilityState === "visible") void refresh(true);
    };
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("timeline-enrichment-updated", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("timeline-enrichment-updated", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [locationLookupEnabled, fromDate, toDate, context.loadTimeline]);

  const allEvents = model?.events ?? [];
  const eventById = useMemo(() => new Map(allEvents.map(event => [event.eventId, event])), [model]);
  const shiftByEvent = useMemo(() => {
    const map = new Map<string, TimelineShiftProjection>();
    for (const shift of model?.projection.logicalShifts ?? []) {
      for (const id of shift.eventIds) map.set(id, shift);
    }
    return map;
  }, [model]);
  const daysByDate = useMemo(() => new Map((model?.projection.calendarDays ?? []).map(day => [day.date, day])), [model]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = moveTimelineDate(fromDate, index);
    const day = daysByDate.get(date);
    return {
      date,
      label: formatTimelineWeekday(date),
      activityCount: day?.eventIds.length ?? 0,
      selected: date === selectedDate,
    };
  }), [fromDate, daysByDate, selectedDate]);

  const day = daysByDate.get(selectedDate);
  const groupedShifts = useMemo(() => {
    if (!day) return [];
    const grouped = new Map<string, DriverEvent[]>();
    for (const id of day.eventIds) {
      const event = eventById.get(id);
      if (!event) continue;
      const shift = shiftByEvent.get(id);
      const key = shift?.id ?? "unassigned:" + id;
      const events = grouped.get(key) ?? [];
      events.push(event);
      grouped.set(key, events);
    }
    return [...grouped.entries()].map(([id, events]) => {
      const ordered = [...events].sort((a, b) =>
        Date.parse(a.command.transitionAt) - Date.parse(b.command.transitionAt) ||
        a.revision - b.revision || a.eventId.localeCompare(b.eventId));
      const shift = shiftByEvent.get(ordered[0]?.eventId ?? "");
      const segmentStart = shift ? Date.parse(shift.anchorDate + "T04:00:00+05:30") : Number.NaN;
      const continued = Number.isFinite(segmentStart) && !!activeShiftAt(allEvents, segmentStart) &&
        Date.parse(activeShiftAt(allEvents, segmentStart)!.command.transitionAt) < segmentStart;
      const cards: TimelineEventCardModel[] = ordered.map(event => {
        const location = locationLabel(event, model?.locations[event.eventId]);
        const kind = eventKind(event);
        return {
          id: event.eventId,
          time: formatTimelineEventTime(event.command.transitionAt),
          title: eventTitle(event),
          description: eventDescription(event, allEvents),
          secondary: event.command.eventType === "start_ride" || event.command.eventType === "trip_start"
            ? "Fare · Not available"
            : event.command.eventType === "cancel_ride" || event.command.eventType === "ride_cancel"
              ? "Cancellation fee · Not available" : undefined,
          location,
          kind,
        };
      });
      if (continued && shift && selectedDate === shift.anchorDate) {
        cards.unshift({
          id: "system-rotation:" + shift.id,
          time: "04:00 AM",
          title: "Logical shift boundary",
          description: "Online session continued · system-generated",
          location: shift.metrics.business_km.status === "pending" ? "Odometer confirmation pending" : "No new driver action",
          kind: "system",
        });
      }
      return {
        id,
        events: cards,
        shift,
        firstAt: Math.min(...ordered.map(event => Date.parse(event.command.transitionAt))),
        status: ordered.some(event => event.command.eventType === "shift_end") ? "ENDED" : "ACTIVITY",
      };
    }).sort((a, b) => a.firstAt - b.firstAt || a.id.localeCompare(b.id));
  }, [day, eventById, shiftByEvent, allEvents, model, selectedDate]);

  const openEvent = (eventId: string) => {
    const event = eventById.get(eventId);
    if (!event) return;
    const location = locationLabel(event, model?.locations[eventId]);
    setSelectedEvent({
      title: eventTitle(event),
      category: eventKind(event).toUpperCase(),
      status: event.command.eventType === "cancel_ride" || event.command.eventType === "ride_cancel"
        ? "Cancelled attempt" : event.command.eventType === "end_ride" || event.command.eventType === "trip_end"
          ? "Completed" : "Recorded",
      time: eventTimeFormatter.format(new Date(event.command.transitionAt)) + " · " + formatTimelineDate(selectedDate),
      duration: eventDescription(event, allEvents),
      location,
      evidence: event.gps ? "GPS evidence is attached to this event" : "GPS evidence not available",
      fare: "Not available from the current public Timeline detail contract",
    });
  };

  const onMove = (direction: -1 | 1) => setSelectedDate(value => moveTimelineDate(value, direction * (mode === "week" ? 7 : 1)));
  const onModeChange = (nextMode: TimelinePeriodMode) => setMode(nextMode);
  const onToday = () => { setSelectedDate(today); setMode("day"); };

  return <section className="timeline-screen" aria-label="Timeline history">
    <header className="timeline-toolbar">
      <div className="timeline-heading"><small>YOUR WORK</small><h2>Timeline</h2></div>
      <button type="button" className="timeline-refresh" onClick={() => void refresh()} disabled={loading}>Refresh</button>
    </header>
    <div className="timeline-location-consent">
      <p>Optional location names send only GPS coordinates from events in this selected period to Geoapify through the secure proxy when Internet Access is on. Saved GPS records are never changed.</p>
      <button type="button" aria-pressed={locationLookupEnabled}
        onClick={() => setLocationLookupEnabled(enabled => !enabled)}>
        {locationLookupEnabled ? "Turn off location names" : "Allow location names"}
      </button>
    </div>
    <PeriodNavigation mode={mode} selectedDate={selectedDate} today={today} weekStart={fromDate}
      weekDays={weekDays} onModeChange={onModeChange} onDateChange={setSelectedDate}
      onMove={onMove} onToday={onToday} />
    <p className="timeline-selected-period">{mode === "day" ? dateLabel(selectedDate) : formatTimelineDate(fromDate) + " – " + formatTimelineDate(toDate)}</p>
    {error && <p className="timeline-error" role="alert">{error}</p>}
    {loading && model && <p className="timeline-refreshing" role="status">Refreshing activity · showing the last loaded records</p>}
    {!!model?.projection.integrityIssues.length && <aside className="timeline-integrity" role="alert">
      <strong>Some recorded activity needs review.</strong>
      <ul>{model.projection.integrityIssues.map((issue, index) => (
        <li key={issue.code + ":" + (issue.eventId ?? "record") + ":" + index}>{issue.code.replaceAll("_", " ")}</li>
      ))}</ul>
    </aside>}
    {loading && !model && <p className="timeline-empty" role="status">Loading your activity…</p>}
    {!loading && !error && mode === "day" && groupedShifts.length === 0 &&
      <p className="timeline-empty">No activity recorded for this day.</p>}
    {mode === "day" && groupedShifts.map(group => <TimelineShiftSection key={group.id} id={group.id}
      title={group.shift ? "Shift · " + group.shift.anchorDate : "Activity"}
      status={group.status} events={group.events} onOpenEvent={openEvent}
      summary={group.shift && group.events.some(event => event.kind === "shift") &&
        allEvents.some(event => group.shift!.eventIds.includes(event.eventId) && event.command.eventType === "shift_end")
        ? <ShiftSummary shift={group.shift} /> : undefined} />)}
    {mode === "week" && <section className="timeline-week-summary" aria-label="Week activity summary">
      <h3>Week at a glance</h3>
      <p>{weekDays.reduce((count, item) => count + item.activityCount, 0)} recorded events across the selected week.</p>
      <p>Select any day above to open its chronological shift sequence.</p>
    </section>}
    <p className="timeline-attribution">Location names powered by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></p>
    <p className="timeline-readonly-note">Timeline is read-only. Shift and trip records remain owned by Work and Log Book.</p>
    <TimelineEventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />
  </section>;
}
