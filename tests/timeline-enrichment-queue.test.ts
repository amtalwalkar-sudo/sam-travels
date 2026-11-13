import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NetworkAccessDisabledError } from "../packages/core/src/network";
import { TimelineEnrichmentQueue } from "../packages/application/src/timeline-enrichment-queue";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { DexieRecordRepository } from "../packages/storage-browser/src";
import type { DriverEvent } from "../packages/domain/src/driver-workflow";

function event(eventId: string): DriverEvent {
  return {
    eventId,
    command: { eventType: "trip_create", transitionAt: "2026-11-08T03:00:00.000Z" },
    gps: { latitude: 19.076, longitude: 72.8777, horizontalAccuracyM: 8, fixAt: "2026-11-08T03:00:00.000Z", provider: "gps" },
    committedAt: "2026-11-08T03:00:00.000Z",
    revision: 1,
  } as unknown as DriverEvent;
}

describe("durable Timeline enrichment queue", () => {
  beforeEach(async () => {
    await browserDatabase.delete();
    await browserDatabase.open();
  });
  afterEach(async () => {
    await browserDatabase.delete();
  });

  it("persists consented work separately and leaves the original event untouched", async () => {
    const records = new DexieRecordRepository();
    const reverse = vi.fn(async () => "Andheri, Mumbai");
    const queue = new TimelineEnrichmentQueue(records, { run: operation => operation() }, { provider: "geoapify", reverse });
    const source = event("event-1");
    await browserDatabase.driverEvents.put(source);
    const sourceBefore = JSON.stringify(await browserDatabase.driverEvents.get("event-1"));

    await queue.enqueue([source]);
    await queue.enqueue([source]);

    expect(JSON.stringify(await browserDatabase.driverEvents.get("event-1"))).toBe(sourceBefore);
    expect(await records.get("timeline-enrichment:event-1")).toMatchObject({
      id: "timeline-enrichment:event-1",
      data: { eventId: "event-1", status: "pending", latitude: 19.076, longitude: 72.8777 },
    });
    expect(reverse).not.toHaveBeenCalled();
  });

  it("queues Fuel Entry GPS evidence under a durable fuel-scoped enrichment identity", async () => {
    const records = new DexieRecordRepository();
    const reverse = vi.fn(async () => "Andheri, Mumbai, Maharashtra, India");
    const queue = new TimelineEnrichmentQueue(records, { run: operation => operation() }, { provider: "geoapify", reverse });
    const fuelEvent = {
      ...event("fuel:feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174000"),
      command: { eventType: "trip_completed", transitionAt: "2026-11-14T20:00:00.000Z" },
    } as unknown as DriverEvent;
    await queue.enqueue([fuelEvent]);
    expect(await records.get("timeline-enrichment:fuel:feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174000"))
      .toMatchObject({ data: { status: "pending", eventId: fuelEvent.eventId } });
    await queue.drain();
    expect(await queue.locations([fuelEvent.eventId])).toMatchObject({
      [fuelEvent.eventId]: { status: "resolved", label: "Andheri, Mumbai, Maharashtra, India" },
    });
    expect(reverse).toHaveBeenCalledTimes(1);
  });

  it("keeps offline work and drains it once network access returns", async () => {
    const records = new DexieRecordRepository();
    let enabled = false;
    const gateway = {
      run: async <T>(operation: () => Promise<T>) => {
        if (!enabled) throw new NetworkAccessDisabledError();
        return operation();
      },
    };
    const reverse = vi.fn(async () => "Andheri, Mumbai");
    const queue = new TimelineEnrichmentQueue(records, gateway, { provider: "geoapify", reverse });
    await queue.enqueue([event("event-2")]);

    await queue.drain();
    expect(reverse).not.toHaveBeenCalled();
    expect(await queue.locations(["event-2"])).toMatchObject({ "event-2": { status: "network_disabled" } });
    expect(await queue.nextWakeAt()).toBeUndefined();

    enabled = true;
    await queue.drain();
    expect(reverse).toHaveBeenCalledTimes(1);
    expect(await queue.locations(["event-2"])).toMatchObject({
      "event-2": { status: "resolved", label: "Andheri, Mumbai", provider: "geoapify" },
    });
  });

  it("stores transient failures with a retry time and does not drop the task", async () => {
    const records = new DexieRecordRepository();
    const now = Date.parse("2026-11-08T03:00:00.000Z");
    const reverse = vi.fn(async () => { throw new Error("proxy unavailable"); });
    const queue = new TimelineEnrichmentQueue(records, { run: operation => operation() }, { provider: "geoapify", reverse }, () => now);
    await queue.enqueue([event("event-3")]);
    await queue.drain();

    expect(await records.get("timeline-enrichment:event-3")).toMatchObject({
      data: { status: "retry_wait", attempts: 1, nextAttemptAt: "2026-11-08T03:00:30.000Z" },
    });
  });
  it("recovers pending enrichment after IndexedDB is reopened", async () => {
    const records = new DexieRecordRepository();
    const reverse = vi.fn(async () => "Mumbai");
    const queue = new TimelineEnrichmentQueue(records, { run: operation => operation() }, { provider: "geoapify", reverse });
    await queue.enqueue([event("event-restart")]);
    await browserDatabase.close();
    await browserDatabase.open();

    const recovered = new TimelineEnrichmentQueue(
      new DexieRecordRepository(),
      { run: operation => operation() },
      { provider: "geoapify", reverse },
    );
    expect(await recovered.locations(["event-restart"])).toMatchObject({
      "event-restart": { status: "pending" },
    });
    await recovered.drain();
    expect(await recovered.locations(["event-restart"])).toMatchObject({
      "event-restart": { status: "resolved", label: "Mumbai" },
    });
  });

  it("reuses a fresh resolved coordinate label for another event", async () => {
    const records = new DexieRecordRepository();
    const reverse = vi.fn(async () => "Andheri, Mumbai");
    const queue = new TimelineEnrichmentQueue(records, { run: operation => operation() }, { provider: "geoapify", reverse });
    await queue.enqueue([event("event-cache-a")]);
    await queue.drain();
    await queue.enqueue([event("event-cache-b")]);

    expect(await queue.locations(["event-cache-b"])).toMatchObject({
      "event-cache-b": { status: "resolved", label: "Andheri, Mumbai" },
    });
    await queue.drain();
    expect(reverse).toHaveBeenCalledTimes(1);
  });


  it("persists submit-time Fuel GPS evidence separately and preserves late-fix provenance", async () => {
    const records = new DexieRecordRepository();
    const reverse = vi.fn(async () => "Andheri, Mumbai");
    const queue = new TimelineEnrichmentQueue(records, { run: operation => operation() }, { provider: "geoapify", reverse });
    const eventId = "fuel:feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174050";
    await queue.recordFuelLocationCapture({
      eventId,
      captureTiming: "late",
      outcome: {
        status: "captured", latitude: 19.076, longitude: 72.8777,
        accuracyMeters: 12.5, fixAt: "2026-11-14T20:00:02.000Z", gpsProvider: "device",
      },
    });
    expect(await records.get("timeline-enrichment:" + eventId)).toMatchObject({
      data: {
        eventId, status: "pending", captureStatus: "captured", captureTiming: "late",
        latitude: 19.076, longitude: 72.8777, accuracyMeters: 12.5,
        fixAt: "2026-11-14T20:00:02.000Z", gpsProvider: "device",
      },
    });
    await queue.drain();
    expect(await records.get("timeline-enrichment:" + eventId)).toMatchObject({
      data: {
        status: "resolved", captureStatus: "captured", captureTiming: "late",
        accuracyMeters: 12.5, fixAt: "2026-11-14T20:00:02.000Z",
      },
    });
    expect(reverse).toHaveBeenCalledTimes(1);
  });

  it("records denied or timed-out Fuel GPS capture without creating geocoder work", async () => {
    const records = new DexieRecordRepository();
    const reverse = vi.fn(async () => "must not run");
    const queue = new TimelineEnrichmentQueue(records, { run: operation => operation() }, { provider: "geoapify", reverse });
    const eventId = "fuel:feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174051";
    await queue.recordFuelLocationCapture({
      eventId, captureTiming: "submission_event",
      outcome: { status: "permission_denied", reason: "permission_denied" },
    });
    expect(await records.get("timeline-enrichment:" + eventId)).toMatchObject({
      data: {
        eventId, status: "capture_unavailable", captureStatus: "permission_denied",
        captureTiming: "submission_event", captureReason: "permission_denied",
      },
    });
    await queue.drain();
    expect(reverse).not.toHaveBeenCalled();
    expect(await queue.locations([eventId])).toMatchObject({
      [eventId]: { status: "unavailable" },
    });
    expect(await queue.nextWakeAt()).toBeUndefined();
  });


});
