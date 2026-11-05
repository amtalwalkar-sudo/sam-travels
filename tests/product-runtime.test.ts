import { describe, expect, it } from "vitest";
import {
  calculateTripDurationMinutes,
  dispatchCommittedWorkEvent,
  initializeApplicationRuntimeRegistry,
  getApplicationRuntimeRegistry,
  LOGBOOK_WORK_EVENT_INTEGRATION,
  TRIP_DURATION_CALCULATION,
} from "../packages/features/logbook";
import type { DriverEvent } from "../packages/domain/src/driver-workflow";
import { executeRegisteredCalculation } from "../packages/core/src/feature-contracts";

describe("production Log Book runtime registrations", () => {
  it("shares one immutable application registry across startup and feature consumers", () => {
    const first = getApplicationRuntimeRegistry();
    const second = getApplicationRuntimeRegistry();
    expect(first).toBe(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.integrations.get(LOGBOOK_WORK_EVENT_INTEGRATION.id)).toBeDefined();
    expect(first.calculations.get(TRIP_DURATION_CALCULATION.id)).toBeDefined();
  });

  it("boots the application with its real versioned integration and calculation contracts", () => {
    const runtime = initializeApplicationRuntimeRegistry();
    expect(runtime.integrations.get(LOGBOOK_WORK_EVENT_INTEGRATION.id)).toMatchObject({
      producerFeatureId: "work",
      consumerFeatureId: "logbook",
      eventName: "work.driver-event-committed",
      payloadVersion: 1,
    });
    expect(runtime.calculations.get(TRIP_DURATION_CALCULATION.id)?.version).toBe(1);
  });

  it("calculates elapsed trip duration across ordinary and midnight intervals", () => {
    expect(calculateTripDurationMinutes({
      businessDate: "2026-11-04",
      startedAt: "2026-11-04T23:30:00.000Z",
      endedAt: "2026-11-05T00:15:30.000Z",
    })).toBe(45.5);
    expect(() => calculateTripDurationMinutes({
      businessDate: "2026-11-04",
      startedAt: "2026-11-04T10:00:00.000Z",
      endedAt: "2026-11-04T09:59:59.000Z",
    })).toThrow("Invalid trip duration interval");
  });

  it("runs the registered calculation version with mandatory regression fixtures", () => {
    const runtime = initializeApplicationRuntimeRegistry();
    const result = executeRegisteredCalculation(runtime.calculations, TRIP_DURATION_CALCULATION.id, {
      businessDate: "2026-11-04",
      startedAt: "2026-11-04T10:00:00.000Z",
      endedAt: "2026-11-04T10:01:12.600Z",
    }, { version: 1, inputSchemaVersion: 1, outputSchemaVersion: 1 });
    expect(result).toMatchObject({
      ownerFeatureId: "logbook",
      version: 1,
      outputSchemaVersion: 1,
      effectiveDate: "2026-11-04",
      unit: "minutes",
      value: 1.21,
    });
  });

  it("dispatches committed Work events through the registered Log Book integration", async () => {
    const runtime = initializeApplicationRuntimeRegistry();
    const event: DriverEvent = {
      eventId: "work-event-001",
      committedAt: "2026-11-04T12:00:00.000Z",
      revision: 1,
      gps: { latitude: 19.076, longitude: 72.8777, horizontalAccuracyM: 8, fixAt: "2026-11-04T12:00:00.000Z", provider: "test" },
      command: {
        schemaVersion: 1,
        commandId: "work-event-001",
        eventId: "work-event-001",
        eventType: "trip_start",
        originSurface: "pwa",
        transitionAt: "2026-11-04T12:00:00.000Z",
        expectedPriorState: "shift_active",
        expectedRevision: 0,
        idempotencyKey: "work-event-001",
      },
    };
    const received: string[] = [];
    await dispatchCommittedWorkEvent(runtime, event, message => {
      received.push(message.eventId);
    });
    expect(received).toEqual(["work-event-001"]);
    await expect(dispatchCommittedWorkEvent(runtime, {
      ...event,
      gps: { ...event.gps, latitude: 999 },
    }, () => undefined)).rejects.toThrow("Invalid feature integration payload");
    await expect(dispatchCommittedWorkEvent(runtime, {
      ...event,
      command: { ...event.command, eventId: "different-event-id" },
    }, () => undefined)).rejects.toThrow("Invalid feature integration payload");
  });
});
