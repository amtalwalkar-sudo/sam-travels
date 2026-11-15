import type { ReactNode } from "react";
import "./timeline.css";
import { PeriodNavigation, type TimelinePeriodMode } from "./PeriodNavigation";
import { TimelineEventDetail, type TimelineEventDetailModel } from "./TimelineEventDetail";
import { TimelineShiftDetail, type TimelineShiftDetailModel } from "./TimelineShiftDetail";
import { TimelineShiftSection } from "./TimelineShiftSection";
import type { TimelineEventCardModel } from "./TimelineEventCard";

export type TimelineDaySectionModel = Readonly<{
  id: string;
  title: string;
  status: string;
  events: readonly TimelineEventCardModel[];
  summary?: ReactNode;
}>;

export type TimelineScreenShellProps = Readonly<{
  mode: TimelinePeriodMode;
  selectedDate: string;
  today: string;
  weekStart: string;
  weekDays: readonly Readonly<{ date: string; label: string; activityCount: number; selected: boolean }>[];
  selectedPeriodLabel: string;
  loading: boolean;
  hasLoadedModel: boolean;
  error: string;
  locationLookupEnabled: boolean;
  integrityIssues: readonly string[];
  daySections: readonly TimelineDaySectionModel[];
  weekEventCount: number;
  selectedEvent: TimelineEventDetailModel | null;
  selectedShift: TimelineShiftDetailModel | null;
  onModeChange: (mode: TimelinePeriodMode) => void;
  onDateChange: (date: string) => void;
  onMove: (direction: -1 | 1) => void;
  onToday: () => void;
  onRefresh: () => void;
  onToggleLocationLookup: () => void;
  onOpenEvent: (eventId: string) => void;
  onCloseEvent: () => void;
  onCloseShift: () => void;
}>;

/**
 * Replaceable Timeline shell. It accepts only presentation values and callbacks;
 * no source records, query objects, feature runtime, or application services cross this boundary.
 */
export function TimelineScreenShell(props: TimelineScreenShellProps) {
  const {
    mode, selectedDate, today, weekStart, weekDays, selectedPeriodLabel, loading,
    hasLoadedModel, error, locationLookupEnabled, integrityIssues, daySections,
    weekEventCount, selectedEvent, selectedShift, onModeChange, onDateChange, onMove, onToday,
    onRefresh, onToggleLocationLookup, onOpenEvent, onCloseEvent, onCloseShift,
  } = props;
  return <section className="timeline-screen" aria-label="Timeline history">
    <header className="timeline-toolbar">
      <div className="timeline-heading"><small>YOUR WORK</small><h2>Timeline</h2></div>
      <button type="button" className="timeline-refresh" onClick={onRefresh} disabled={loading}>Refresh</button>
    </header>
    <div className="timeline-location-consent">
      <p>Optional location names send only GPS coordinates from events in this selected period to Geoapify through the secure proxy when Internet Access is on. Saved GPS records are never changed.</p>
      <button type="button" aria-pressed={locationLookupEnabled} onClick={onToggleLocationLookup}>
        {locationLookupEnabled ? "Turn off location names" : "Allow location names"}
      </button>
    </div>
    <PeriodNavigation mode={mode} selectedDate={selectedDate} today={today} weekStart={weekStart}
      weekDays={weekDays} onModeChange={onModeChange} onDateChange={onDateChange}
      onMove={onMove} onToday={onToday} />
    <p className="timeline-selected-period">{selectedPeriodLabel}</p>
    {error && <p className="timeline-error" role="alert">{error}</p>}
    {loading && hasLoadedModel && <p className="timeline-refreshing" role="status">Refreshing activity · showing the last loaded records</p>}
    {integrityIssues.length > 0 && <aside className="timeline-integrity" role="alert">
      <strong>Some recorded activity needs review.</strong>
      <ul>{integrityIssues.map((issue, index) => <li key={issue + ":" + index}>{issue.replaceAll("_", " ")}</li>)}</ul>
    </aside>}
    {loading && !hasLoadedModel && <p className="timeline-empty" role="status">Loading your activity…</p>}
    {!loading && !error && mode === "day" && daySections.length === 0 &&
      <p className="timeline-empty">No activity recorded for this day.</p>}
    {mode === "day" && daySections.map(section => <TimelineShiftSection key={section.id}
      id={section.id} title={section.title} status={section.status}
      events={section.events} onOpenEvent={onOpenEvent} summary={section.summary} />)}
    {mode === "week" && <section className="timeline-week-summary" aria-label="Week activity summary">
      <h3>Week at a glance</h3>
      <p>{weekEventCount} recorded events across the selected week.</p>
      <p>Select any day above to open its chronological shift sequence.</p>
    </section>}
    <p className="timeline-attribution">Location names powered by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></p>
    <p className="timeline-readonly-note">Timeline is read-only. Shift and trip records remain owned by Work and Log Book.</p>
    <TimelineEventDetail event={selectedEvent} onClose={onCloseEvent} />
    <TimelineShiftDetail shift={selectedShift} onClose={onCloseShift} />
  </section>;
}
