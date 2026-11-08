import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { DexieDriverWorkflowRepository } from "../packages/storage-browser/src/driver-workflow";
import { DexieRecordRepository } from "../packages/storage-browser/src";
import { WorkDriverSelectionService } from "../packages/application/src/work-driver-selection-service";
import { createDriverCommandV2, DriverWorkflowService } from "../packages/features/work-shift";
import type { DriverEvent } from "../packages/domain/src/driver-workflow";
import type { GpsFix } from "../packages/core/src/types";

const timestamp = new Date(Date.now() - 15_000).toISOString();
const records = [
  { id: "feature:driver-records:driver:parity-driver", schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp, source: "web" as const, revision: 1, data: { schemaVersion: 1, driverId: "parity-driver", name: "Parity Driver", lifecycleState: "active" } },
  { id: "feature:driver-records:assignment:parity-driver", schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp, source: "web" as const, revision: 1, data: { schemaVersion: 1, driverId: "parity-driver", assignments: [{ assignmentId: "parity-assignment", vehicleId: "feature:vehicle:MH01AB1234", assignedAt: timestamp }] } },
  { id: "feature:vehicle:MH01AB1234", schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp, source: "web" as const, revision: 1, data: { schemaVersion: 1, registrationNumber: "MH01AB1234", make: "Make", model: "Model", vehicleType: "Sedan", fuelType: "Petrol", yearOfManufacture: 2024, ownership: "Owned", lifecycleState: "active" } },
];

function gpsAt(fixAt: string): GpsFix {
  return { latitude: 19.076, longitude: 72.8777, horizontalAccuracyM: 8, fixAt, provider: "parity-fixture" };
}

function normalizeSnapshot(snapshot: Awaited<ReturnType<DexieDriverWorkflowRepository["getSnapshot"]>>) {
  return {
    state: snapshot.state,
    revision: snapshot.revision,
    ...(snapshot.shiftId ? { shiftId: snapshot.shiftId } : {}),
    ...(snapshot.activeTripId ? { activeTripId: snapshot.activeTripId } : {}),
    ...(snapshot.shiftContext ? { shiftContext: snapshot.shiftContext } : {}),
    ...(snapshot.tripContext ? { tripContext: snapshot.tripContext } : {}),
  };
}

function normalizeEvent(event: DriverEvent) {
  return {
    eventId: event.eventId,
    eventType: event.command.eventType,
    originSurface: event.command.originSurface,
    expectedRevision: event.command.expectedRevision,
    revision: event.revision,
    ...(event.command.driverContext ? { driverContext: event.command.driverContext } : {}),
    ...(event.command.tripContext ? { tripContext: event.command.tripContext } : {}),
    gps: {
      latitude: event.gps.latitude,
      longitude: event.gps.longitude,
      horizontalAccuracyM: event.gps.horizontalAccuracyM,
      provider: event.gps.provider,
    },
  };
}

describe("cross-adapter Work workflow parity and interruption recovery", () => {
  beforeEach(async () => {
    await browserDatabase.delete();
    await browserDatabase.open();
  });

  afterEach(() => {
    browserDatabase.close();
  });

  it("publishes the complete V2 workflow oracle for the Android Room adapter", async () => {
    await browserDatabase.records.bulkPut(records);
    const repository = new DexieDriverWorkflowRepository();
    const selection = new WorkDriverSelectionService(new DexieRecordRepository(), repository);
    await selection.selectDriver("parity-driver");

    const origins = ["pwa", "native_overlay", "pwa", "native_overlay", "pwa", "native_overlay", "pwa"] as const;
    const transitions = [
      ["shift_start", "parity-shift-start"],
      ["trip_create", "parity-trip-create"],
      ["start_ride", "parity-ride-start"],
      ["end_ride", "parity-ride-end"],
      ["trip_create", "parity-trip-cancel-create"],
      ["cancel_ride", "parity-trip-cancel"],
      ["shift_end", "parity-shift-end"],
    ] as const;
    let currentFixAt = new Date().toISOString();
    const service = new DriverWorkflowService(repository, {
      capture: async () => gpsAt(currentFixAt),
    });
    const snapshots = [];
    for (let index = 0; index < transitions.length; index += 1) {
      const [eventType, eventId] = transitions[index];
      const at = new Date().toISOString();
      currentFixAt = at;
      const command = createDriverCommandV2(
        await repository.getSnapshot(),
        eventType,
        origins[index],
        eventId,
        at,
      );
      const result = await service.dispatch(command);
      expect(result.status).toBe("recorded");
      snapshots.push(normalizeSnapshot(result.snapshot));
    }

    const events = (await repository.listEvents()).sort((a, b) => a.revision - b.revision);
    const oracle = {
      schemaVersion: 1,
      snapshots,
      events: events.map(normalizeEvent),
      selectedDriverUnlocked: !(await new DexieRecordRepository().get<{ lockedShiftId?: string }>("work:selected-driver"))?.data.lockedShiftId,
    };
    const outputDirectory = join(process.cwd(), "android/app/src/androidTest/assets/generated");
    mkdirSync(outputDirectory, { recursive: true });
    writeFileSync(join(outputDirectory, "driver-workflow-parity-oracle-v1.json"), JSON.stringify(oracle));
    expect(snapshots.map((snapshot) => snapshot.state)).toEqual([
      "shift_active", "going_to_pickup", "trip_active", "shift_active",
      "going_to_pickup", "shift_active", "idle",
    ]);
    expect(events).toHaveLength(7);
    expect(oracle.selectedDriverUnlocked).toBe(true);
  });

  it("recovers a pending transition after IndexedDB reopen without duplicating prior events", async () => {
    await browserDatabase.records.bulkPut(records);
    const repository = new DexieDriverWorkflowRepository();
    await new WorkDriverSelectionService(new DexieRecordRepository(), repository).selectDriver("parity-driver");
    let currentFixAt = new Date().toISOString();
    const service = new DriverWorkflowService(repository, { capture: async () => gpsAt(currentFixAt) });

    for (const [eventType, eventId] of [
      ["shift_start", "recover-shift"],
      ["trip_create", "recover-trip"],
      ["start_ride", "recover-ride"],
    ] as const) {
      currentFixAt = new Date().toISOString();
      const command = createDriverCommandV2(await repository.getSnapshot(), eventType, "pwa", eventId, currentFixAt);
      expect((await service.dispatch(command)).status).toBe("recorded");
    }

    currentFixAt = new Date().toISOString();
    const pendingCommand = createDriverCommandV2(
      await repository.getSnapshot(), "end_ride", "native_overlay", "recover-ride-end", currentFixAt,
    );
    await repository.queueIntent({
      command: pendingCommand,
      status: "pending_location",
      createdAt: currentFixAt,
      updatedAt: currentFixAt,
    });
    expect(await repository.listEvents()).toHaveLength(3);

    browserDatabase.close();
    await browserDatabase.open();
    const reopened = new DexieDriverWorkflowRepository();
    expect(await reopened.getSnapshot()).toMatchObject({ state: "trip_active", revision: 3, activeTripId: "recover-trip" });
    expect(await reopened.getIntent("recover-ride-end")).toMatchObject({ status: "pending_location" });

    const recoveredService = new DriverWorkflowService(reopened, { capture: async () => gpsAt(currentFixAt) });
    const recovered = await recoveredService.retry("recover-ride-end");
    expect(recovered.status).toBe("recorded");
    expect(recovered.snapshot).toMatchObject({ state: "shift_active", revision: 4, activeTripId: undefined });
    expect(await reopened.listEvents()).toHaveLength(4);
    expect(await browserDatabase.driverOutbox.count()).toBe(4);

    const delivered: string[] = [];
    const replayService = new DriverWorkflowService(reopened, { capture: async () => gpsAt(currentFixAt) }, async (event) => {
      delivered.push(event.eventId);
    });
    await expect(replayService.replayCommittedEvents()).resolves.toEqual({ delivered: 4, pending: 0 });
    expect(delivered).toEqual(["recover-shift", "recover-trip", "recover-ride", "recover-ride-end"]);
    expect(await reopened.listEvents()).toHaveLength(4);
  });
});
