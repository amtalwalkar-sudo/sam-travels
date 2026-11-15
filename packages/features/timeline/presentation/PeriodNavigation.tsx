import type { ReactNode } from "react";

export type TimelinePeriodMode = "day" | "week";
export type TimelinePeriodNavigationProps = Readonly<{
  mode: TimelinePeriodMode;
  selectedDate: string;
  today: string;
  weekStart: string;
  weekDays: readonly Readonly<{ date: string; label: string; activityCount: number; selected: boolean }>[];
  onModeChange: (mode: TimelinePeriodMode) => void;
  onDateChange: (date: string) => void;
  onMove: (direction: -1 | 1) => void;
  onToday: () => void;
  children?: ReactNode;
}>;

/** Period controls are a controlled presentation component; date policy lives in the adapter. */
export function PeriodNavigation(props: TimelinePeriodNavigationProps) {
  const { mode, selectedDate, today, weekStart, weekDays, onModeChange, onDateChange, onMove, onToday } = props;
  return <section className="timeline-period" aria-label="Choose activity period">
    <div className="timeline-period-top">
      <div className="timeline-period-switch" role="group" aria-label="Period view">
        <button type="button" aria-pressed={mode === "day"} className={mode === "day" ? "selected" : ""}
          onClick={() => onModeChange("day")}>Day</button>
        <button type="button" aria-pressed={mode === "week"} className={mode === "week" ? "selected" : ""}
          onClick={() => onModeChange("week")}>Week</button>
      </div>
      <button type="button" className="timeline-today" onClick={onToday} disabled={selectedDate === today}>Today</button>
    </div>
    <div className="timeline-period-range">
      <button type="button" aria-label={mode === "day" ? "Previous day" : "Previous week"} onClick={() => onMove(-1)}>‹</button>
      <label>
        <span>{mode === "day" ? "SELECTED DAY" : "SELECTED WEEK"}</span>
        <input aria-label="Choose date" type="date" value={selectedDate} onChange={event => onDateChange(event.target.value)} />
      </label>
      <button type="button" aria-label={mode === "day" ? "Next day" : "Next week"} onClick={() => onMove(1)}>›</button>
    </div>
    {mode === "week" && <div className="timeline-week-grid" role="group" aria-label={"Week beginning " + weekStart}>
      {weekDays.map(day => <button type="button" key={day.date}
        className={"timeline-week-day" + (day.selected ? " selected" : "")}
        aria-pressed={day.selected} onClick={() => onDateChange(day.date)}>
        <span>{day.label}</span><strong>{Number(day.date.slice(-2))}</strong>
        <small>{day.activityCount > 0 ? day.activityCount + " events" : "—"}</small>
      </button>)}
    </div>}
  </section>;
}
