import { describe, expect, it } from "vitest";
import { TimelineProjectionService } from "../packages/application/src/timeline-projection-service";
import type { DriverEvent } from "../packages/domain/src/driver-workflow";

function sourceEvent(eventId: string, eventType: string, transitionAt: string, revision: number): DriverEvent {
  return {
    eventId,
    revision,
    committedAt: transitionAt,
    command: {
      schemaVersion: 1,
      commandId: eventId,
      eventId,
      eventType,
      originSurface: "pwa",
      transitionAt,
      expectedPriorState: revision === 1 ? "idle" : "shift_active",
      expectedRevision: revision - 1,
      idempotencyKey: eventId,
    },
    gps: { latitude: 19.076, longitude: 72.8777, horizontalAccuracyM: 8, fixAt: transitionAt, provider: "test" },
  } as unknown as DriverEvent;
}

describe("Timeline read-only query", () => {
  it("returns source events with the shared projection and preserves unavailable source evidence", async () => {
    const events = [
      sourceEvent("shift-start", "shift_start", "2026-11-08T03:00:00.000Z", 1),
      sourceEvent("shift-end", "shift_end", "2026-11-08T04:00:00.000Z", 2),
    ];
    let reads = 0;
    const service = new TimelineProjectionService({
      async listEvents() { reads += 1; return events; },
    });
    const result = await service.read("2026-11-08T04:01:00.000Z");
    expect(reads).toBe(1);
    expect(result.events).toEqual(events);
    expect(result.projection.logicalShifts).toHaveLength(1);
    expect(result.projection.logicalShifts[0].metrics.shift_duration).toMatchObject({
      status: "available", value: 60, unit: "minutes",
    });
    expect(result.projection.logicalShifts[0].metrics.total_fare).toMatchObject({
      status: "unavailable", reason: "finance_source_not_registered",
    });
    expect(result.projection.logicalShifts[0].metrics.business_km).toMatchObject({
      status: "unavailable", reason: "odometer_source_not_registered",
    });
  });

  it("keeps the existing projection-only query API", async () => {
    const service = new TimelineProjectionService({ async listEvents() { return []; } });
    const projection = await service.project("2026-11-08T04:01:00.000Z");
    expect(projection.schemaVersion).toBe(1);
    expect(projection.timeZone).toBe("Asia/Kolkata");
  });
});
