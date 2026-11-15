import { describe, expect, it } from "vitest";
import {
  indiaCalendarDate, moveTimelineDate, timelineWeekStart, timelineWeekDates,
  formatTimelineDate, formatTimelineEventTime,
} from "../packages/features/timeline/presentation/timeline-date";

describe("Timeline presentation calendar helpers", () => {
  it("uses the Asia/Kolkata calendar date rather than the UTC date", () => {
    expect(indiaCalendarDate(new Date("2026-11-14T19:00:00.000Z"))).toBe("2026-11-15");
    expect(indiaCalendarDate(new Date("2026-11-15T18:29:59.000Z"))).toBe("2026-11-15");
    expect(indiaCalendarDate(new Date("2026-11-15T18:30:00.000Z"))).toBe("2026-11-16");
  });

  it("starts weeks on Monday for Monday, Sunday and month/year boundaries", () => {
    expect(timelineWeekStart("2026-11-09")).toBe("2026-11-09");
    expect(timelineWeekStart("2026-11-15")).toBe("2026-11-09");
    expect(timelineWeekStart("2027-01-01")).toBe("2026-12-28");
    expect(timelineWeekDates("2026-11-15")).toEqual([
      "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12",
      "2026-11-13", "2026-11-14", "2026-11-15",
    ]);
  });

  it("moves calendar dates across month and year edges without local-device timezone drift", () => {
    expect(moveTimelineDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(moveTimelineDate("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("formats event instants and selected calendar dates in India time", () => {
    expect(formatTimelineDate("2026-11-15")).toContain("15");
    expect(formatTimelineEventTime("2026-11-15T18:30:00.000Z")).toMatch(/12:00/);
  });
});
