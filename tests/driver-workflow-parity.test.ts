import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import parity from "./fixtures/driver-workflow-parity-v1.json";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { DexieDriverWorkflowRepository } from "../packages/storage-browser/src/driver-workflow";
import { DexieRecordRepository } from "../packages/storage-browser/src";
import { WorkDriverSelectionService } from "../packages/application/src/work-driver-selection-service";
import { createDriverCommandV2, DriverWorkflowService } from "../packages/features/work-shift";
import type { GpsFix } from "../packages/core/src/types";

const gpsAt = (fixAt: string): GpsFix => ({
  latitude: 19.076,
  longitude: 72.8777,
  horizontalAccuracyM: 8,
  fixAt,
  provider: "browser-geolocation",
});

describe("shared driver workflow parity and interruption contract", () => {
  beforeEach(async () => {
    await browserDatabase.close();
    await browserDatabase.delete();
    await browserDatabase.open();
  });

  it("recovers a durable v2 ride-start intent after the browser database is reopened", async () => {
    const base = Date.now() - 20_000;
    const timestamp = new Date(base - 60_000).toISOString();
    await browserDatabase.records.bulkPut([
      {
        id: "feature:driver-records:driver:parity-driver", schemaVersion: 1,
        createdAt: timestamp, updatedAt: timestamp, source: "web", revision: 1,
        data: { schemaVersion: 1, driverId: "parity-driver", name: "Parity Driver", lifecycleState: "active" },
      },
      {
        id: "feature:driver-records:assignment:parity-driver", schemaVersion: 1,
        createdAt: timestamp, updatedAt: timestamp, source: "web", revision: 1,
        data: { schemaVersion: 1, driverId: "parity-driver", assignments: [{
          assignmentId: "parity-assignment", vehicleId: "feature:vehicle:MH01CD5678", assignedAt: timestamp,
        }] },
      },
      {
        id: "feature:vehicle:MH01CD5678", schemaVersion: 1,
        createdAt: timestamp, updatedAt: timestamp, source: "web", revision: 1,
        data: { schemaVersion: 1, registrationNumber: "MH01CD5678", make: "Make", model: "Model",
          vehicleType: "Sedan", fuelType: "Petrol", yearOfManufacture: 2024, ownership: "Owned",
          lifecycleState: "active" },
      },
    ]);

    let repository = new DexieDriverWorkflowRepository();
    const selection = new WorkDriverSelectionService(new DexieRecordRepository(), repository);
    await selection.selectDriver("parity-driver");
    let service = new DriverWorkflowService(repository, {
      capture: async () => gpsAt(new Date().toISOString()),
    });
    const send = async (type: "shift_start" | "trip_create" | "end_ride" | "shift_end", id: string, offset: number) => {
      const at = new Date(base + offset).toISOString();
      const command = createDriverCommandV2(await repository.getSnapshot(), type, "pwa", id, at);
      const result = await service.dispatch(command);
      expect(result.status).toBe("recorded");
      return result.snapshot;
    };

    const states: string[] = [];
    states.push((await send("shift_start", "parity-shift-start", 0)).state);
    states.push((await send("trip_create", "parity-trip-create", 1_000)).state);

    const pendingAt = new Date(base + 2_000).toISOString();
    const pendingCommand = createDriverCommandV2(
      await repository.getSnapshot(), "start_ride", "native_overlay", parity.interruptedEventId, pendingAt,
    );
    const pendingIntent = {
      command: pendingCommand, status: "pending_location" as const,
      createdAt: new Date(base + 2_000).toISOString(), updatedAt: new Date(base + 2_000).toISOString(),
    };
    await repository.queueIntent(pendingIntent);

    // A close/reopen models the durable boundary used by browser startup recovery.
    await browserDatabase.close();
    await browserDatabase.open();
    repository = new DexieDriverWorkflowRepository();
    service = new DriverWorkflowService(repository, {
      capture: async () => gpsAt(pendingAt),
    });
    expect(await repository.getIntent(parity.interruptedEventId)).toMatchObject({ status: "pending_location" });
    const recovered = await service.retry(parity.interruptedEventId);
    expect(recovered.status).toBe("recorded");
    states.push(recovered.snapshot.state);

    states.push((await sendAfterRecovery(repository, service, "end_ride", "parity-ride-end", base + 3_000)).snapshot.state);
    states.push((await sendAfterRecovery(repository, service, "shift_end", "parity-shift-end", base + 4_000)).snapshot.state);

    expect(states).toEqual(parity.states);
    expect(await repository.getSnapshot()).toMatchObject({ state: "idle", revision: parity.finalRevision });
    expect(await repository.listEvents()).toHaveLength(parity.eventCount);
    expect(await browserDatabase.driverOutbox.count()).toBe(parity.outboxCount);
    expect(await repository.getIntent(parity.interruptedEventId)).toMatchObject({ status: "recorded" });
  });
});

async function sendAfterRecovery(
  repository: DexieDriverWorkflowRepository,
  service: DriverWorkflowService,
  type: "end_ride" | "shift_end",
  id: string,
  atMs: number,
) {
  const at = new Date(atMs).toISOString();
  const command = createDriverCommandV2(await repository.getSnapshot(), type, "pwa", id, at);
  return service.dispatch(command);
}
