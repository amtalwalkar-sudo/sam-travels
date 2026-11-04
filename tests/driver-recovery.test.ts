import { describe, expect, it } from "vitest";
import { createDriverCommand, DriverWorkflowService, EMPTY_DRIVER_STATE, isWithinGpsRecoveryWindow, type DriverWorkflowRepository } from "../packages/features/work-shift";
import { vi } from "vitest";

describe("driver GPS recovery window", () => {
  const transition = Date.parse("2026-11-04T10:00:00.000Z");

  it("allows reconciliation while the original event-time evidence window is open", () => {
    expect(isWithinGpsRecoveryWindow(new Date(transition).toISOString(), transition + 29_999)).toBe(true);
  });

  it("rejects delayed recovery rather than attaching a later fix to an old gesture", () => {
    expect(isWithinGpsRecoveryWindow(new Date(transition).toISOString(), transition + 30_001)).toBe(false);
  });

  it("rejects malformed transition timestamps", () => {
    expect(isWithinGpsRecoveryWindow("invalid", transition)).toBe(false);
  });
});
