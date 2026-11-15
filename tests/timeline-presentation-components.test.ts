import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PeriodNavigation, TimelineEventCard, TimelineEventDetail, TimelineShiftSection, TimelineScreenShell } from "../packages/features/timeline";

describe("Timeline presentation component contracts", () => {
  it("renders the week as seven independently selectable calendar days", () => {
    const html = renderToStaticMarkup(createElement(PeriodNavigation, {
      mode: "week",
      selectedDate: "2026-11-12",
      today: "2026-11-15",
      weekStart: "2026-11-09",
      weekDays: [
        { date: "2026-11-09", label: "Mon", activityCount: 0, selected: false },
        { date: "2026-11-10", label: "Tue", activityCount: 1, selected: false },
        { date: "2026-11-11", label: "Wed", activityCount: 0, selected: false },
        { date: "2026-11-12", label: "Thu", activityCount: 3, selected: true },
        { date: "2026-11-13", label: "Fri", activityCount: 0, selected: false },
        { date: "2026-11-14", label: "Sat", activityCount: 2, selected: false },
        { date: "2026-11-15", label: "Sun", activityCount: 0, selected: false },
      ],
      onModeChange: vi.fn(), onDateChange: vi.fn(), onMove: vi.fn(), onToday: vi.fn(),
    }));
    expect((html.match(/class="timeline-week-day/g) ?? []).length).toBe(7);
    expect(html).toContain("3 events");
    expect(html).toContain("aria-pressed=\"true\"");
    expect(html).toContain("Choose date");
  });

  it("renders an event as a controlled leaf with a stable event identity", () => {
    const html = renderToStaticMarkup(createElement(TimelineEventCard, {
      event: {
        id: "ride-42", time: "09:30 AM", title: "Ride completed",
        description: "Ride duration · 24m 10s", location: "Bandra West", kind: "ride",
      },
      onOpen: vi.fn(),
    }));
    expect(html).toContain("ride-42");
    expect(html).toContain("Ride completed");
    expect(html).toContain("View details");
  });

  it("keeps the event detail layer read-only and renders only supplied evidence", () => {
    const html = renderToStaticMarkup(createElement(TimelineEventDetail, {
      event: {
        title: "Ride completed", category: "RIDE", status: "Completed",
        time: "09:30 AM", duration: "24m 10s", location: "Bandra West",
        evidence: "GPS evidence is attached to this event", fare: "Not available",
      },
      onClose: vi.fn(),
    }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain("GPS evidence is attached to this event");
    expect(html).not.toMatch(/<input|<select|Delete|Edit record/i);
  });

  it("composes shift sections from independent event renderers and an optional summary slot", () => {
    const html = renderToStaticMarkup(createElement(TimelineShiftSection, {
      id: "logical-shift-2026-11-12", title: "Shift · 2026-11-12", status: "ENDED",
      events: [{
        id: "shift-start", time: "08:00 AM", title: "Shift started",
        description: "Recorded driver action", location: "Andheri", kind: "shift",
      }],
      onOpenEvent: vi.fn(),
      summary: createElement("p", null, "Shift summary"),
    }));
    expect(html).toContain("Shift · 2026-11-12");
    expect(html).toContain("Shift summary");
    expect(html).toContain("Shift started");
  });
  it("renders the screen shell from a presentation-only fixture without an application runtime", () => {
    const html = renderToStaticMarkup(createElement(TimelineScreenShell, {
      mode: "day",
      selectedDate: "2026-11-12",
      today: "2026-11-15",
      weekStart: "2026-11-09",
      weekDays: [{ date: "2026-11-12", label: "Thu", activityCount: 2, selected: true }],
      selectedPeriodLabel: "12 Nov 2026",
      loading: false,
      hasLoadedModel: true,
      error: "",
      locationLookupEnabled: false,
      integrityIssues: [],
      daySections: [],
      weekEventCount: 2,
      selectedEvent: null,
      onModeChange: vi.fn(), onDateChange: vi.fn(), onMove: vi.fn(), onToday: vi.fn(),
      onRefresh: vi.fn(), onToggleLocationLookup: vi.fn(), onOpenEvent: vi.fn(), onCloseEvent: vi.fn(),
    }));
    expect(html).toContain('aria-label="Timeline history"');
    expect(html).toContain("12 Nov 2026");
    expect(html).toContain("No activity recorded for this day.");
    expect(html).toContain("Timeline is read-only");
  });

});