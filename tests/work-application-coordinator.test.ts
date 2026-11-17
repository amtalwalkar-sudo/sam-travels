import { describe, expect, it } from "vitest";
import { WorkApplicationCoordinatorV1 } from "../packages/features/work";
import type { DriverWorkflowService } from "../packages/application/src/driver-workflow-service";

function coordinator() {
  return new WorkApplicationCoordinatorV1({
    runtime: {} as never,
    records: { list: async () => [] },
    maintenance: { accrueDailyBusinessKilometres: async () => ({} as never) },
    source: "web",
  });
}

describe("WorkApplicationCoordinatorV1", () => {
  it("owns startup outbox replay, pending reconciliation, and background resume order", async () => {
    const calls: string[] = [];
    const service = {
      events: async () => { calls.push("events"); return []; },
      replayCommittedEvents: async () => { calls.push("replay"); return { delivered: 0, pending: 0 }; },
      reconcilePending: async () => { calls.push("reconcile"); return []; },
      resumePendingBackground: async () => { calls.push("resume"); return []; },
      snapshot: async () => { calls.push("snapshot"); return { state: "idle", revision: 0 }; },
    } as unknown as DriverWorkflowService;

    const restored = await coordinator().initialize(service);
    expect(calls).toEqual(["events", "replay", "reconcile", "resume", "snapshot"]);
    expect(restored.snapshot.state).toBe("idle");
    expect(restored.pending).toEqual([]);
  });

  it("owns lifecycle resume ordering without re-running startup background scheduling", async () => {
    const calls: string[] = [];
    const service = {
      replayCommittedEvents: async () => { calls.push("replay"); return { delivered: 0, pending: 0 }; },
      snapshot: async () => { calls.push("snapshot"); return { state: "idle", revision: 1 }; },
      reconcilePending: async () => { calls.push("reconcile"); return []; },
    } as unknown as DriverWorkflowService;

    const resumed = await coordinator().resume(service);
    expect(calls).toEqual(["replay", "snapshot", "reconcile"]);
    expect(resumed.snapshot.revision).toBe(1);
    expect(resumed.pending).toEqual([]);
  });
});
