import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import fixture from "../android/app/src/androidTest/assets/timeline-parity-events-v1.json";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { exportBrowserSnapshot, restoreBrowserSnapshot, markBrowserRestoreVerified } from "../packages/storage-browser/src";
import { DexieDriverWorkflowRepository } from "../packages/storage-browser/src/driver-workflow";
import { TimelineProjectionService } from "../packages/application/src/timeline-projection-service";
import type { DriverEvent } from "../packages/domain/src/driver-workflow";

const events = fixture as unknown as DriverEvent[];

describe("PWA and Android Timeline application-boundary parity", () => {
  beforeEach(async () => {
    await browserDatabase.delete();
    await browserDatabase.open();
  });

  it("projects business output from events persisted and read back through Dexie", async () => {
    // Repeated delivery uses the stable event identity and must not create another stored event.
    await browserDatabase.table("driverEvents").bulkPut([...events, events[0]]);
    const repository = new DexieDriverWorkflowRepository();
    const persisted = await repository.listEvents();
    expect(persisted).toHaveLength(events.length);
    const pwaResult = await new TimelineProjectionService(repository).project();
    expect(pwaResult.logicalShifts.map(shift => shift.anchorDate)).toEqual(["2026-11-04", "2026-11-05"]);
    expect(pwaResult.logicalShifts.map(shift => shift.metrics.passenger_trip_time)).toEqual([
      { status: "available", value: 10, unit: "minutes" },
      { status: "available", value: 20, unit: "minutes" },
    ]);
    expect(pwaResult.logicalShifts[0].metrics.completed_ride_count).toEqual({
      status: "available", value: 1, unit: "count",
    });
  });

  it("preserves explicit unavailable states for Finance and Vehicle evidence after a real Dexie read", async () => {
    await browserDatabase.table("driverEvents").bulkPut(events);
    const result = await new TimelineProjectionService(new DexieDriverWorkflowRepository()).project();
    for (const shift of result.logicalShifts) {
      expect(shift.metrics.total_fare.status).toBe("unavailable");
      expect(shift.metrics.business_km.status).toBe("unavailable");
    }
  });
  it("rebuilds the same Timeline projection after snapshot restore and database restart", async () => {
    await browserDatabase.table("driverEvents").bulkPut(events);
    const beforeRestore = await new TimelineProjectionService(
      new DexieDriverWorkflowRepository(),
    ).project();

    const backup = await exportBrowserSnapshot("0.1.0");
    await browserDatabase.table("driverEvents").clear();
    expect(await browserDatabase.table("driverEvents").count()).toBe(0);

    const restored = await restoreBrowserSnapshot({
      data: backup.data,
      manifest: backup.manifest,
      confirmed: true,
    });

    browserDatabase.close();
    await browserDatabase.open();
    const afterRestoreAndRestart = await new TimelineProjectionService(
      new DexieDriverWorkflowRepository(),
    ).project();

    expect(afterRestoreAndRestart).toEqual(beforeRestore);
    expect(afterRestoreAndRestart.logicalShifts.map(shift => shift.id)).toEqual(
      beforeRestore.logicalShifts.map(shift => shift.id),
    );
    expect(afterRestoreAndRestart.logicalShifts.map(shift => shift.metrics)).toEqual(
      beforeRestore.logicalShifts.map(shift => shift.metrics),
    );

    await markBrowserRestoreVerified(restored.checkpointId);
  });


  it("emits the complete deterministic parity oracle from IndexedDB-backed ordinary, edge, and migrated legacy datasets", async () => {
    const repository = new DexieDriverWorkflowRepository();
    await browserDatabase.table("driverEvents").bulkPut(events);
    const normal = await new TimelineProjectionService(repository).project();
    await browserDatabase.table("driverEvents").clear();
    await browserDatabase.table("driverEvents").bulkPut(events.slice(0, 2));
    const edge = await new TimelineProjectionService(repository).project();
    await browserDatabase.table("driverEvents").clear();
    const legacy = [{ eventId: "event-legacy", kind: "trip_completed" }];
    await browserDatabase.table("driverEvents").bulkPut(legacy as unknown as DriverEvent[]);
    const migratedLegacy = await new TimelineProjectionService(repository).project();

    const outputDirectory = join(process.cwd(), "android/app/src/androidTest/assets/generated");
    mkdirSync(outputDirectory, { recursive: true });
    writeFileSync(join(outputDirectory, "timeline-projection-parity-oracle-v1.json"), JSON.stringify({
      normal: JSON.stringify(normal),
      edge: JSON.stringify(edge),
      migratedLegacy: JSON.stringify(migratedLegacy),
    }));
    expect(normal.logicalShifts).toHaveLength(2);
    expect(edge.logicalShifts[0].metrics.shift_duration.status).toBe("pending");
    expect(edge.logicalShifts[0].metrics.passenger_trip_time.status).toBe("pending");
    expect(migratedLegacy.integrityIssues.map(issue => issue.code)).toContain("invalid_event");
  });
});
