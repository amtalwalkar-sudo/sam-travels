import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { registerVehicleBrowserBackupParticipant } from "../apps/web/src/vehicle-backup";
import { registerDriverRecordsBrowserBackupParticipant } from "../apps/web/src/driver-records-backup";
import {
  exportBrowserSnapshot,
  listBrowserRecoveryCheckpoints,
  restoreBrowserSnapshot,
  recoverBrowserRestoreTransactions,
} from "../packages/storage-browser/src";
import { DexieDriverWorkflowRepository } from "../packages/storage-browser/src/driver-workflow";
import { createDriverCommand, createDriverCommandV2 } from "../packages/features/work-shift";
import { WorkDriverSelectionService } from "../packages/application/src/work-driver-selection-service";
import { DexieRecordRepository } from "../packages/storage-browser/src";
import { rebuildTripHistoryProjection, readTripHistoryProjection } from "../packages/features/logbook";
import type { GpsFix } from "../packages/core/src/types";

describe("Stage 4 recovery lifecycle", () => {
  let unregisterVehicle: (() => void) | undefined;
  let unregisterDrivers: (() => void) | undefined;
  beforeEach(async () => {
    unregisterVehicle = registerVehicleBrowserBackupParticipant();
    unregisterDrivers = registerDriverRecordsBrowserBackupParticipant();
    await browserDatabase.delete();
    await browserDatabase.open();
    rebuildTripHistoryProjection([]);
  });

  afterEach(() => { unregisterVehicle?.(); unregisterVehicle = undefined; unregisterDrivers?.(); unregisterDrivers = undefined; });

  it("retains a pre-restore checkpoint across IndexedDB reopen and rolls back atomically", async () => {
    const timestamp = "2026-11-06T10:00:00.000Z";
    await browserDatabase.records.put({
      id: "durable-business-record",
      schemaVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      source: "web",
      revision: 1,
      data: { label: "backup-source" },
    });
    const source = await exportBrowserSnapshot("0.1.0");
    await browserDatabase.records.put({
      id: "durable-business-record",
      schemaVersion: 1,
      createdAt: timestamp,
      updatedAt: "2026-11-06T10:01:00.000Z",
      source: "web",
      revision: 2,
      data: { label: "pre-restore-current" },
    });

    const restored = await restoreBrowserSnapshot({
      data: source.data,
      manifest: source.manifest,
      confirmed: true,
    });
    expect((await browserDatabase.records.get("durable-business-record"))?.data)
      .toEqual({ label: "backup-source" });

    browserDatabase.close();
    await browserDatabase.open();
    expect(await listBrowserRecoveryCheckpoints()).toEqual([
      expect.objectContaining({ id: restored.checkpointId, status: "restored_unverified" }),
    ]);

    await expect(recoverBrowserRestoreTransactions()).resolves.toEqual({ recovered: 1 });
    expect((await browserDatabase.records.get("durable-business-record"))?.data)
      .toEqual({ label: "pre-restore-current" });
    expect(await listBrowserRecoveryCheckpoints()).toEqual([
      expect.objectContaining({ id: restored.checkpointId, status: "rollback_complete" }),
    ]);
  });

  it("rebuilds the derived trip projection from restored authoritative events after restart", async () => {
    const repository = new DexieDriverWorkflowRepository();
    const timestamp="2026-11-08T00:00:00.000Z";
    await browserDatabase.records.bulkPut([
      {id:"feature:driver-records:driver:driver-001",schemaVersion:1,createdAt:timestamp,updatedAt:timestamp,source:"web",revision:1,data:{schemaVersion:1,driverId:"driver-001",name:"Example Driver",lifecycleState:"active",selectedForWork:true}},
      {id:"feature:driver-records:assignment:driver-001",schemaVersion:1,createdAt:timestamp,updatedAt:timestamp,source:"web",revision:1,data:{schemaVersion:1,driverId:"driver-001",assignments:[{assignmentId:"assignment-001",vehicleId:"feature:vehicle:MH01AB1234",assignedAt:timestamp}]}},
      {id:"feature:vehicle:MH01AB1234",schemaVersion:1,createdAt:timestamp,updatedAt:timestamp,source:"web",revision:1,data:{schemaVersion:1,registrationNumber:"MH01AB1234",make:"Make",model:"Model",vehicleType:"Sedan",fuelType:"Petrol",yearOfManufacture:2024,ownership:"Owned",lifecycleState:"active"}},
    ]);

    const transitions = [
      { type: "shift_start" as const, id: "recovery-shift", at: "2026-11-06T10:00:00.000Z" },
      { type: "trip_start" as const, id: "recovery-trip-start", at: "2026-11-06T10:05:00.000Z" },
      { type: "trip_end" as const, id: "recovery-trip-end", at: "2026-11-06T10:35:30.000Z" },
    ];
    for (const transition of transitions) {
      const command = createDriverCommand(
        await repository.getSnapshot(),
        transition.type,
        "pwa",
        transition.id,
        transition.at,
      );
      const gps: GpsFix = {
        latitude: 19.076,
        longitude: 72.8777,
        horizontalAccuracyM: 8,
        fixAt: transition.at,
        provider: "browser-geolocation",
      };
      await repository.queueIntent({
        command,
        status: "pending_location",
        createdAt: transition.at,
        updatedAt: transition.at,
      });
      await repository.completeIntent(command.eventId, gps, transition.at);
    }

    const expectedEvents = await repository.listEvents();
    rebuildTripHistoryProjection(expectedEvents);
    const expectedProjection = readTripHistoryProjection();
    expect(expectedProjection).toMatchObject([{
      status: "completed",
      startedAt: "2026-11-06T10:05:00.000Z",
      endedAt: "2026-11-06T10:35:30.000Z",
    }]);

    const snapshot = await exportBrowserSnapshot("0.1.0");
    await browserDatabase.table("driverEvents").clear();
    rebuildTripHistoryProjection([]);
    expect(readTripHistoryProjection()).toEqual([]);

    await restoreBrowserSnapshot({
      data: snapshot.data,
      manifest: snapshot.manifest,
      confirmed: true,
    });
    browserDatabase.close();
    await browserDatabase.open();

    const recoveredEvents = await new DexieDriverWorkflowRepository().listEvents();
    expect(recoveredEvents).toHaveLength(3);
    rebuildTripHistoryProjection(recoveredEvents);
    expect(readTripHistoryProjection()).toEqual(expectedProjection);
  });

  it("restores an active shift and pending trip intent as one consistent workflow", async () => {
    const timestamp = new Date(Date.now() - 10_000).toISOString();
    const repository = new DexieDriverWorkflowRepository();
    await browserDatabase.records.bulkPut([
      { id: "feature:driver-records:driver:restore-driver", schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp, source: "web", revision: 1,
        data: { schemaVersion: 1, driverId: "restore-driver", name: "Restore Driver", lifecycleState: "active" } },
      { id: "feature:driver-records:assignment:restore-driver", schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp, source: "web", revision: 1,
        data: { schemaVersion: 1, driverId: "restore-driver", assignments: [{ assignmentId: "restore-assignment", vehicleId: "feature:vehicle:MH01GH3456", assignedAt: timestamp }] } },
      { id: "feature:vehicle:MH01GH3456", schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp, source: "web", revision: 1,
        data: { schemaVersion: 1, registrationNumber: "MH01GH3456", make: "Make", model: "Model", vehicleType: "Sedan", fuelType: "Petrol",
          yearOfManufacture: 2024, ownership: "Owned", lifecycleState: "active" } },
    ]);
    await new WorkDriverSelectionService(new DexieRecordRepository(), repository, () => timestamp).selectDriver("restore-driver");

    const shiftAt = new Date(Date.now() - 4_000).toISOString();
    const shift = createDriverCommandV2(await repository.getSnapshot(), "shift_start", "pwa", "restore-active-shift", shiftAt,
      { schemaVersion: 1, readingKm: 12000 });
    await repository.queueIntent({ command: shift, status: "pending_location", createdAt: shiftAt, updatedAt: shiftAt });
    await repository.completeIntent(shift.eventId, {
      latitude: 19.076, longitude: 72.8777, horizontalAccuracyM: 8, fixAt: shiftAt, provider: "browser-geolocation",
    }, shiftAt);

    const pendingAt = new Date(Date.now() - 2_000).toISOString();
    const pending = createDriverCommandV2(await repository.getSnapshot(), "trip_create", "pwa", "restore-pending-trip", pendingAt);
    await repository.queueIntent({ command: pending, status: "pending_location", createdAt: pendingAt, updatedAt: pendingAt });
    const source = await exportBrowserSnapshot("0.1.0");

    await browserDatabase.records.clear();
    await browserDatabase.driverState.clear();
    await browserDatabase.driverIntents.clear();
    await browserDatabase.driverEvents.clear();
    await browserDatabase.driverOutbox.clear();
    await restoreBrowserSnapshot({ data: source.data, manifest: source.manifest, confirmed: true });
    await browserDatabase.close();
    await browserDatabase.open();

    const restoredRepository = new DexieDriverWorkflowRepository();
    expect(await restoredRepository.getSnapshot()).toMatchObject({ state: "shift_active", revision: 1, shiftId: "restore-active-shift" });
    expect(await restoredRepository.getIntent("restore-pending-trip")).toMatchObject({ status: "pending_location" });
    expect((await browserDatabase.records.get("work:selected-driver"))?.data).toMatchObject({
      driverId: "restore-driver", lockedShiftId: "restore-active-shift",
    });

    await restoredRepository.reactivateIntent("restore-pending-trip");
    const completed = await restoredRepository.completeIntent("restore-pending-trip", {
      latitude: 19.076, longitude: 72.8777, horizontalAccuracyM: 8, fixAt: pendingAt, provider: "browser-geolocation",
    }, pendingAt);
    expect(completed).toMatchObject({ state: "going_to_pickup", revision: 2, activeTripId: "restore-pending-trip" });
  });

});
