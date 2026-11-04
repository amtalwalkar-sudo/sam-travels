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
  it("marks an expired pending intent once and then leaves it stable", async () => {
    const transitionAt = "2026-11-04T10:00:00.000Z";
    const command = createDriverCommand(EMPTY_DRIVER_STATE, "shift_start", "pwa", "expired-reconcile", transitionAt);
    const pending: Array<{ command: typeof command; status: "pending_location" | "needs_attention"; createdAt: string; updatedAt: string; reason?: string }> = [
      { command, status: "pending_location", createdAt: transitionAt, updatedAt: transitionAt },
    ];
    const markNeedsAttention = vi.fn(async (_id: string, reason: string) => {
      pending[0] = { ...pending[0], status: "needs_attention", reason };
    });
    const repository = {
      listPending: async () => [...pending],
      markNeedsAttention,
      getSnapshot: async () => EMPTY_DRIVER_STATE,
    } as unknown as DriverWorkflowRepository;
    const service = new DriverWorkflowService(repository, { capture: async () => { throw new Error("not_used"); } });
    const now = Date.parse(transitionAt) + 31_000;

    await service.reconcilePending(now);
    await service.reconcilePending(now + 1_000);

    expect(markNeedsAttention).toHaveBeenCalledTimes(1);
    expect(pending[0]).toMatchObject({ status: "needs_attention", reason: "gps_recovery_window_expired" });
  });

});
