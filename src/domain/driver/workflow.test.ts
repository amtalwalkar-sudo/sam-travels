import { describe, expect, it } from "vitest";
import {
  completeDriverTransition,
  initialDriverWorkflowState,
  planDriverTransition,
  type DriverTransitionCommand,
  type GpsEvidence,
} from "./workflow";

const gps: GpsEvidence = {
  latitude: 19.076,
  longitude: 72.8777,
  horizontalAccuracyM: 12,
  fixTimestamp: "2026-11-03T10:00:00.000Z",
  policyVersion: "gps-event-fix-v1",
};

function command(type: DriverTransitionCommand["type"], id: string, expectedRevision: number): DriverTransitionCommand {
  return { id, type, occurredAt: "2026-11-03T10:00:00.000Z", expectedRevision };
}

describe("single-driver transition planner", () => {
  it("keeps the projection unchanged until compliant GPS evidence completes the intent", () => {
    const start = command("START_SHIFT", "evt-1", 0);
    const planned = planDriverTransition(initialDriverWorkflowState, start);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.value.status).toBe("PENDING_GPS");
    expect(initialDriverWorkflowState.shift).toBe("OFF");

    const completed = completeDriverTransition(initialDriverWorkflowState, planned.value, gps);
    expect(completed.ok).toBe(true);
    if (completed.ok) {
      expect(completed.value.shift).toBe("ON");
      expect(completed.value.revision).toBe(1);
      expect(completed.value.activeShiftStartedAt).toBe(start.occurredAt);
    }
  });

  it("rejects ride start before a shift is active", () => {
    expect(planDriverTransition(initialDriverWorkflowState, command("START_RIDE", "evt-2", 0)))
      .toEqual({ ok: false, error: "INVALID_TRANSITION" });
  });

  it("rejects stale concurrent commands instead of last-write-wins", () => {
    expect(planDriverTransition(
      { ...initialDriverWorkflowState, shift: "ON", revision: 4 },
      command("END_SHIFT", "evt-3", 3),
    )).toEqual({ ok: false, error: "STALE_REVISION" });
  });

  it("requires a fresh, accurate event fix and never substitutes missing evidence", () => {
    const planned = planDriverTransition(initialDriverWorkflowState, command("START_SHIFT", "evt-4", 0));
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(completeDriverTransition(initialDriverWorkflowState, planned.value, null))
      .toEqual({ ok: false, error: "GPS_REQUIRED" });
    expect(completeDriverTransition(initialDriverWorkflowState, planned.value, {
      ...gps, horizontalAccuracyM: 51,
    })).toEqual({ ok: false, error: "GPS_INACCURATE" });
    expect(completeDriverTransition(initialDriverWorkflowState, planned.value, {
      ...gps, fixTimestamp: "2026-11-03T10:00:31.000Z",
    })).toEqual({ ok: false, error: "GPS_STALE" });
  });

  it("supports explicit ride cancellation without recording a completed ride", () => {
    const state = {
      ...initialDriverWorkflowState,
      shift: "ON" as const,
      ride: "IN_PROGRESS" as const,
      activeShiftStartedAt: "2026-11-03T09:00:00.000Z",
      activeRideStartedAt: "2026-11-03T09:30:00.000Z",
      revision: 2,
    };
    const planned = planDriverTransition(state, command("CANCEL_RIDE", "evt-5", 2));
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const completed = completeDriverTransition(state, planned.value, gps);
    expect(completed.ok).toBe(true);
    if (completed.ok) {
      expect(completed.value.ride).toBe("NONE");
      expect(completed.value.activeRideStartedAt).toBeNull();
      expect(completed.value.shift).toBe("ON");
    }
  });
});
