import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { registerVehicleBrowserBackupParticipant } from "../apps/web/src/vehicle-backup";
import { registerDriverRecordsBrowserBackupParticipant } from "../apps/web/src/driver-records-backup";
import { DexieDriverWorkflowRepository, DexieRecordRepository } from "../packages/storage-browser/src";
import { WorkDriverSelectionService } from "../packages/application/src/work-driver-selection-service";
import { DriverWorkflowService, createDriverCommandV2 } from "../packages/features/work";
import { createBackupForCurrentRuntime, restoreBackupForCurrentRuntime, markRestoreVerified, discardVerifiedRecoveryCheckpoint } from "../apps/web/src/backup-runtime";
import type { GpsFix } from "../packages/core/src/types";

describe("Stage 5 pending Work intent through encrypted restore", () => {
  let unregisterVehicle: (() => void) | undefined;
  let unregisterDrivers: (() => void) | undefined;
  beforeEach(async () => {
    unregisterVehicle = registerVehicleBrowserBackupParticipant();
    unregisterDrivers = registerDriverRecordsBrowserBackupParticipant();
    await browserDatabase.delete();
    await browserDatabase.open();
  });
  afterEach(() => {
    unregisterVehicle?.();
    unregisterDrivers?.();
    unregisterVehicle = undefined;
    unregisterDrivers = undefined;
    browserDatabase.close();
  });

  it("restores a pending intent, commits it once, and replays the outbox once", async () => {
    const at = new Date(Date.now() - 5_000).toISOString();
    const recoveryKey = "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=";
    await browserDatabase.records.bulkPut([
      { id: "feature:vehicle:MH01AB1234", schemaVersion: 1, createdAt: at, updatedAt: at, source: "web", revision: 1,
        data: { schemaVersion: 1, registrationNumber: "MH01AB1234", make: "Tata", model: "Ace", vehicleType: "LCV", fuelType: "Diesel", yearOfManufacture: 2022, ownership: "Owned", lifecycleState: "active" } },
      { id: "feature:driver-records:driver:stage5-driver", schemaVersion: 1, createdAt: at, updatedAt: at, source: "web", revision: 1,
        data: { schemaVersion: 1, driverId: "stage5-driver", name: "Stage Five Driver", lifecycleState: "active", selectedForWork: true } },
      { id: "feature:driver-records:assignment:stage5-driver", schemaVersion: 1, createdAt: at, updatedAt: at, source: "web", revision: 1,
        data: { schemaVersion: 1, driverId: "stage5-driver", assignments: [{ assignmentId: "stage5-assignment", vehicleId: "feature:vehicle:MH01AB1234", assignedAt: at }] } },
    ]);
    const workflow = new DexieDriverWorkflowRepository();
    await new WorkDriverSelectionService(new DexieRecordRepository(), workflow, () => at).selectDriver("stage5-driver");
    const gps = (transitionAt: string): GpsFix => ({
      latitude: 19.076, longitude: 72.8777, horizontalAccuracyM: 8,
      fixAt: transitionAt, provider: "stage5-restore-test",
    });
    const initialEffects: string[] = [];
    const initialService = new DriverWorkflowService(workflow, { capture: async value => gps(value) },
      async event => { initialEffects.push(event.eventId); });
    const shiftCommand = createDriverCommandV2(await workflow.getSnapshot(), "shift_start", "pwa",
      "stage5-shift-start", at, { schemaVersion: 1, readingKm: 12000 });
    expect((await initialService.dispatch(shiftCommand)).status).toBe("recorded");
    expect(initialEffects).toEqual(["stage5-shift-start"]);

    const pendingAt = new Date(Date.now() - 1_000).toISOString();
    const pendingCommand = createDriverCommandV2(await workflow.getSnapshot(), "trip_create", "pwa",
      "stage5-pending-trip", pendingAt);
    await workflow.queueIntent({
      command: pendingCommand, status: "pending_location",
      createdAt: pendingAt, updatedAt: pendingAt,
    });

    const { backup } = await createBackupForCurrentRuntime({ applicationVersion: "0.1.0", recoveryKey });
    await browserDatabase.records.clear();
    await browserDatabase.driverState.clear();
    await browserDatabase.driverIntents.clear();
    await browserDatabase.driverEvents.clear();
    await browserDatabase.driverOutbox.clear();

    const restored = await restoreBackupForCurrentRuntime({
      backup, secret: { recoveryKey }, confirmed: true,
    });
    expect(await workflow.getIntent("stage5-pending-trip")).toMatchObject({ status: "pending_location" });
    await markRestoreVerified(restored.checkpointId);
    await discardVerifiedRecoveryCheckpoint(restored.checkpointId);
    browserDatabase.close();
    await browserDatabase.open();

    const restoredRepository = new DexieDriverWorkflowRepository();
    const effects = new Set<string>();
    const appliedEffects: string[] = [];
    const restoredService = new DriverWorkflowService(restoredRepository,
      { capture: async value => gps(value) },
      async event => {
        if (!effects.has(event.eventId)) {
          effects.add(event.eventId);
          appliedEffects.push(event.eventId);
        }
      });
    await restoredService.resumePendingBackground();
    await vi.waitFor(async () => {
      expect(await restoredRepository.getIntent("stage5-pending-trip")).toMatchObject({ status: "recorded" });
    });
    expect(await restoredRepository.getSnapshot()).toMatchObject({
      state: "going_to_pickup", revision: 2, activeTripId: "stage5-pending-trip",
    });
    expect((await restoredRepository.listEvents()).filter(event => event.eventId === "stage5-pending-trip")).toHaveLength(1);
    expect((await browserDatabase.driverOutbox.toArray()).filter(row => row.eventId === "stage5-pending-trip")).toHaveLength(1);

    // Recreated service replays only durable unacknowledged rows; retrying the
    // already-recorded intent is also a no-op for both state and consumer effect.
    await restoredService.replayCommittedEvents();
    await restoredService.retryBackground("stage5-pending-trip");
    const recreatedService = new DriverWorkflowService(restoredRepository,
      { capture: async value => gps(value) },
      async event => {
        if (!effects.has(event.eventId)) {
          effects.add(event.eventId);
          appliedEffects.push(event.eventId);
        }
      });
    await recreatedService.replayCommittedEvents();
    expect(appliedEffects).toEqual(["stage5-pending-trip"]);
    expect(await restoredRepository.getSnapshot()).toMatchObject({ revision: 2, activeTripId: "stage5-pending-trip" });
    expect((await restoredRepository.listEvents()).filter(event => event.eventId === "stage5-pending-trip")).toHaveLength(1);
    expect((await browserDatabase.driverOutbox.toArray()).filter(row => row.eventId === "stage5-pending-trip")).toHaveLength(1);
    expect((await restoredRepository.listUndeliveredEvents())).toHaveLength(0);
  });
});
