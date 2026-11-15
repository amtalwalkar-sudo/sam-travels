export const TIMELINE_PRESENTATION_TIME_ZONE = "Asia/Kolkata" as const;

export function indiaCalendarDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMELINE_PRESENTATION_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
  return part("year") + "-" + part("month") + "-" + part("day");
}

export function moveTimelineDate(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Monday is the first day of the driver-facing calendar week. */
export function timelineWeekStart(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return moveTimelineDate(value, -(weekday === 0 ? 6 : weekday - 1));
}

export function timelineWeekDates(value: string): readonly string[] {
  const first = timelineWeekStart(value);
  return Array.from({ length: 7 }, (_, index) => moveTimelineDate(first, index));
}

export function formatTimelineDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TIMELINE_PRESENTATION_TIME_ZONE, day: "numeric", month: "short", year: "numeric",
  }).format(new Date(value + "T12:00:00+05:30"));
}

export function formatTimelineWeekday(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TIMELINE_PRESENTATION_TIME_ZONE, weekday: "short",
  }).format(new Date(value + "T12:00:00+05:30"));
}

export function formatTimelineEventTime(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TIMELINE_PRESENTATION_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(new Date(value));
}
