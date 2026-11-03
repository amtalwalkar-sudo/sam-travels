import { describe, expect, it } from "vitest";
import {
  EMPTY_DRIVER_STATE,
  createDriverCommand,
  transitionTarget,
  validateDriverCommand,
  validateDriverCompletion,
  type DriverIntent,
  type GpsFix,
} from "../packages/features/work-shift";

const transitionAt = new Date().toISOString();

const gps: GpsFix = {
  latitude: 19.076,
  longitude: 72.8777,
  horizontalAccuracyM: 8,
  fixAt: transitionAt,
  provider: "browser-geolocation",
};

describe("Work/Shift public capability contract", () => {
  it("creates and validates commands through the public entry point", () => {
    const command = createDriverCommand(
      EMPTY_DRIVER_STATE,
      "shift_start",
      "pwa",
      "contract-command-1",
      transitionAt,
    );

    expect(validateDriverCommand(command)).toEqual({ ok: true, value: command });
    expect(command.expectedRevision).toBe(0);
    expect(command.expectedPriorState).toBe("idle");
  });

  it("exposes the shared transition policy without changing its behavior", () => {
    expect(transitionTarget("idle", "shift_start")).toBe("shift_active");
    expect(transitionTarget("idle", "trip_start")).toBeNull();
  });

  it("exposes completion validation for the existing durable intent flow", () => {
    const command = createDriverCommand(
      EMPTY_DRIVER_STATE,
      "shift_start",
      "pwa",
      "contract-event-1",
      transitionAt,
    );
    const intent: DriverIntent = {
      command,
      status: "pending_location",
      createdAt: command.transitionAt,
      updatedAt: command.transitionAt,
    };

    const result = validateDriverCompletion(EMPTY_DRIVER_STATE, intent, gps);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.state).toBe("shift_active");
      expect(result.value.revision).toBe(1);
      expect(result.value.lastEventId).toBe(command.eventId);
    }
  });
});
