import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import fixture from "../android/app/src/androidTest/assets/timeline-parity-events-v1.json";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { DexieDriverWorkflowRepository } from "../packages/storage-browser/src/driver-workflow";
import { TimelineProjectionService, type TimelineEventSource } from "../packages/application/src/timeline-projection-service";
import type { DriverEvent } from "../packages/domain/src/driver-workflow";

const events = fixture as unknown as DriverEvent[];

class AndroidRoomBridgeFixture implements TimelineEventSource {
  async listEvents(): Promise<DriverEvent[]> {
    // The Android instrumentation test loads this same asset through the actual
    // Room gateway. This adapter models the JSON payload returned by that bridge.
    return events.map(event => structuredClone(event));
  }
}

describe("PWA and Android Timeline application-boundary parity", () => {
  beforeEach(async () => {
    await browserDatabase.delete();
    await browserDatabase.open();
  });

  it("projects identical business output from Dexie and the Android Room bridge contract", async () => {
    await browserDatabase.table("driverEvents").bulkPut(events);
    const pwa = new TimelineProjectionService(new DexieDriverWorkflowRepository());
    const android = new TimelineProjectionService(new AndroidRoomBridgeFixture());

    const [pwaResult, androidResult] = await Promise.all([pwa.project(), android.project()]);
    expect(pwaResult).toEqual(androidResult);
    expect(pwaResult.logicalShifts.map(shift => shift.anchorDate)).toEqual(["2026-11-04", "2026-11-05"]);
    expect(pwaResult.logicalShifts.map(shift => shift.metrics.passenger_trip_time)).toEqual([
      { status: "available", value: 10, unit: "minutes" },
      { status: "available", value: 20, unit: "minutes" },
    ]);
    expect(pwaResult.logicalShifts[0].metrics.completed_ride_count).toEqual({
      status: "available", value: 1, unit: "count",
    });
  });

  it("keeps unavailable Finance and Vehicle sources identical across platforms", async () => {
    await browserDatabase.table("driverEvents").bulkPut(events);
    const pwa = new TimelineProjectionService(new DexieDriverWorkflowRepository());
    const android = new TimelineProjectionService(new AndroidRoomBridgeFixture());
    const [left, right] = await Promise.all([pwa.project(), android.project()]);
    for (const shift of left.logicalShifts) {
      expect(shift.metrics.total_fare.status).toBe("unavailable");
      expect(shift.metrics.business_km.status).toBe("unavailable");
    }
    expect(left).toEqual(right);
  });
});
