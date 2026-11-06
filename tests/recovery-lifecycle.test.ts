import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import {
  exportBrowserSnapshot,
  listBrowserRecoveryCheckpoints,
  restoreBrowserSnapshot,
  rollbackBrowserRecoveryCheckpoint,
} from "../packages/storage-browser/src";
import { DexieDriverWorkflowRepository } from "../packages/storage-browser/src/driver-workflow";
import { createDriverCommand } from "../packages/features/work-shift";
import { rebuildTripHistoryProjection, readTripHistoryProjection } from "../packages/features/logbook";
import type { GpsFix } from "../packages/core/src/types";

describe("Stage 4 recovery lifecycle", () => {
  beforeEach(async () => {
    await browserDatabase.delete();
    await browserDatabase.open();
    rebuildTripHistoryProjection([]);
  });

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

    await rollbackBrowserRecoveryCheckpoint(restored.checkpointId);
    expect((await browserDatabase.records.get("durable-business-record"))?.data)
      .toEqual({ label: "pre-restore-current" });
    expect(await listBrowserRecoveryCheckpoints()).toEqual([
      expect.objectContaining({ id: restored.checkpointId, status: "rollback_complete" }),
    ]);
  });

  it("rebuilds the derived trip projection from restored authoritative events after restart", async () => {
    const repository = new DexieDriverWorkflowRepository();
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
});
