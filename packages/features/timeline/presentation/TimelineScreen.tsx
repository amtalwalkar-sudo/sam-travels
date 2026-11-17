import { useEffect, useMemo, useRef, useState } from "react";
import type { DriverEvent } from "../../../domain/src/driver-workflow";
import type { TimelineMetric, TimelineMetricId, TimelineShiftProjection } from "../../../domain/src/timeline";
import type { TimelineScreenContext } from "./timeline-screen-model";
import type { TimelineLocationEnrichment, TimelineLocationMap } from "../application/timeline-reverse-geocoding";
import type { TimelinePeriodMode } from "./PeriodNavigation";
import type { TimelineEventDetailModel } from "./TimelineEventDetail";
import type { TimelineShiftDetailModel } from "./TimelineShiftDetail";
import { timelineShiftDisplayStatus } from "./timeline-shift-status";
import { TimelineScreenShell, type TimelineDaySectionModel } from "./TimelineScreenShell";
import type { TimelineEventCardModel } from "./TimelineEventCard";
import { indiaCalendarDate, moveTimelineDate, timelineWeekStart, formatTimelineDate, formatTimelineWeekday, formatTimelineEventTime } from "./timeline-date";
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

function ShiftSummary({ shift, onOpen }: { shift: TimelineShiftProjection; onOpen: () => void }) {
  return <section className="timeline-summary" aria-label={"Summary for " + shift.anchorDate}>
    <header><strong>SHIFT SUMMARY</strong><button type="button" onClick={onOpen}>VIEW DETAILS ›</button></header>
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
  if (location?.status === "resolved") return location.label ?? "Location captured · place name not available";
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
  const [followsToday, setFollowsToday] = useState(true);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [model, setModel] = useState<TimelineModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [locationLookupEnabled, setLocationLookupEnabled] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEventDetailModel | null>(null);
  const [selectedShift, setSelectedShift] = useState<TimelineShiftDetailModel | null>(null);
  const detailReturnFocus = useRef<HTMLElement | null>(null);
  const detailWasOpen = useRef(false);
  const requestSequence = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const today = indiaCalendarDate(new Date(clockNow));
  const fromDate = mode === "week" ? timelineWeekStart(selectedDate) : selectedDate;
  const toDate = mode === "week" ? moveTimelineDate(fromDate, 6) : selectedDate;

  useEffect(() => {
    const updateClock = () => setClockNow(Date.now());
    window.addEventListener("focus", updateClock);
    window.addEventListener("pageshow", updateClock);
    document.addEventListener("visibilitychange", updateClock);
    return () => {
      window.removeEventListener("focus", updateClock);
      window.removeEventListener("pageshow", updateClock);
      document.removeEventListener("visibilitychange", updateClock);
    };
  }, []);

  useEffect(() => {
    if (followsToday) setSelectedDate(today);
  }, [today, followsToday]);

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

  useEffect(() => {
    if (selectedEvent || selectedShift) detailWasOpen.current = true;
    else if (detailWasOpen.current) {
      detailReturnFocus.current?.focus();
      detailReturnFocus.current = null;
      detailWasOpen.current = false;
    }
  }, [selectedEvent, selectedShift]);

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
      const { continued, status } = timelineShiftDisplayStatus(shift, ordered, allEvents, clockNow);
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
        status,
      };
    }).sort((a, b) => a.firstAt - b.firstAt || a.id.localeCompare(b.id));
  }, [day, eventById, shiftByEvent, allEvents, model, selectedDate, clockNow]);

  const openEvent = (eventId: string) => {
    if (!selectedEvent && document.activeElement instanceof HTMLElement) detailReturnFocus.current = document.activeElement;
    const event = eventById.get(eventId);
    if (!event) return;
    const location = locationLabel(event, model?.locations[eventId]);
    setSelectedEvent({
      title: eventTitle(event),
      category: eventKind(event).toUpperCase(),
      status: event.command.eventType === "cancel_ride" || event.command.eventType === "ride_cancel"
        ? "Cancelled attempt" : event.command.eventType === "end_ride" || event.command.eventType === "trip_end"
          ? "Completed" : "Recorded",
      time: formatTimelineEventTime(event.command.transitionAt) + " · " + formatTimelineDate(selectedDate),
      duration: eventDescription(event, allEvents),
      location,
      evidence: event.gps ? "GPS evidence is attached to this event" : "GPS evidence not available",
      fare: "Not available from the current public Timeline detail contract",
    });
  };

  const openShift = (shiftId: string) => {
    if (!selectedEvent && !selectedShift && document.activeElement instanceof HTMLElement) detailReturnFocus.current = document.activeElement;
    const shift = model?.projection.logicalShifts.find(item => item.id === shiftId);
    if (!shift) return;
    setSelectedEvent(null);
    setSelectedShift({
      title: "Shift · " + shift.anchorDate,
      status: "Read-only summary",
      rows: METRICS.map(([id, label]) => ({
        label,
        value: metricLabel(shift.metrics[id]),
        status: shift.metrics[id].status.replaceAll("_", " "),
      })),
    });
  };

  const onMove = (direction: -1 | 1) => {
    setFollowsToday(false);
    setSelectedDate(value => moveTimelineDate(value, direction * (mode === "week" ? 7 : 1)));
  };
  const onModeChange = (nextMode: TimelinePeriodMode) => setMode(nextMode);
  const onToday = () => { setFollowsToday(true); setSelectedDate(today); setMode("day"); };

  const daySections: TimelineDaySectionModel[] = groupedShifts.map(group => ({
    id: group.id,
    title: group.shift ? "Shift · " + group.shift.anchorDate : "Activity",
    status: group.status,
    events: group.events,
    summary: group.shift && group.events.some(event => {
      const source = eventById.get(event.id);
      return source?.command.eventType === "shift_end";
    })
      ? <ShiftSummary shift={group.shift} onOpen={() => openShift(group.shift!.id)} /> : undefined,
  }));
  const weekEventCount = weekDays.reduce((count, item) => count + item.activityCount, 0);
  const integrityIssues = (model?.projection.integrityIssues ?? []).map(issue => issue.code);

  return <TimelineScreenShell
    mode={mode}
    selectedDate={selectedDate}
    today={today}
    weekStart={fromDate}
    weekDays={weekDays}
    selectedPeriodLabel={mode === "day"
      ? formatTimelineDate(selectedDate)
      : formatTimelineDate(fromDate) + " – " + formatTimelineDate(toDate)}
    loading={loading}
    hasLoadedModel={!!model}
    error={error}
    locationLookupEnabled={locationLookupEnabled}
    integrityIssues={integrityIssues}
    daySections={daySections}
    weekEventCount={weekEventCount}
    selectedEvent={selectedEvent}
    selectedShift={selectedShift}
    onModeChange={onModeChange}
    onDateChange={date => { setFollowsToday(false); setSelectedDate(date); }}
    onMove={onMove}
    onToday={onToday}
    onRefresh={() => { void refresh(); }}
    onToggleLocationLookup={() => setLocationLookupEnabled(enabled => !enabled)}
    onOpenEvent={openEvent}
    onCloseEvent={() => setSelectedEvent(null)}
    onCloseShift={() => setSelectedShift(null)}
  />;
}
