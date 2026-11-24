import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { exportBrowserSnapshot } from "../packages/storage-browser/src";
import { registerVehicleBrowserBackupParticipant } from "../apps/web/src/vehicle-backup";

describe("consistent Browser backup snapshot under concurrent writes", () => {
  let unregister: (() => void) | undefined;
  beforeEach(async () => {
    unregister = registerVehicleBrowserBackupParticipant();
    await browserDatabase.delete();
    await browserDatabase.open();
  });
  afterEach(() => {
    unregister?.();
    unregister = undefined;
    browserDatabase.close();
  });

  it("captures all tables from one committed boundary while a writer updates both", async () => {
    const at = "2026-11-24T00:00:00.000Z";
    await browserDatabase.records.put({
      id: "snapshot-boundary-record", schemaVersion: 1, createdAt: at, updatedAt: at,
      source: "web", revision: 1, data: { value: "before" },
    });
    await browserDatabase.table("driverState").put({
      id: "driver-state", value: { schemaVersion: 1, revision: 1, state: "idle" },
    });

    let releaseRead!: () => void;
    let markReadStarted!: () => void;
    const gate = new Promise<void>(resolve => { releaseRead = resolve; });
    const readStarted = new Promise<void>(resolve => { markReadStarted = resolve; });
    const originalTransaction = browserDatabase.transaction.bind(browserDatabase);
    const spy = vi.spyOn(browserDatabase, "transaction").mockImplementation(((mode: any, tables: any, scope: any) => {
      if (mode === "r" && Array.isArray(tables) && tables.some((table: any) => table.name === "records")) {
        return originalTransaction(mode, tables, async () => {
          markReadStarted();
          await Dexie.waitFor(gate);
          return scope();
        });
      }
      return originalTransaction(mode, tables, scope);
    }) as any);

    try {
      const exportPromise = exportBrowserSnapshot("0.1.0");
      await readStarted;
      const writePromise = browserDatabase.transaction("rw", [
        browserDatabase.records, browserDatabase.driverState,
      ], async () => {
        await browserDatabase.records.put({
          id: "snapshot-boundary-record", schemaVersion: 1, createdAt: at,
          updatedAt: "2026-11-24T00:01:00.000Z", source: "web", revision: 2,
          data: { value: "after" },
        });
        await browserDatabase.table("driverState").put({
          id: "driver-state", value: { schemaVersion: 1, revision: 2, state: "shift_active" },
        });
      });
      releaseRead();
      const snapshot = await exportPromise;
      await writePromise;

      expect(snapshot.data.records).toContainEqual(expect.objectContaining({
        id: "snapshot-boundary-record", revision: 1, data: { value: "before" },
      }));
      expect(snapshot.data.driverState).toContainEqual(expect.objectContaining({
        id: "driver-state", value: expect.objectContaining({ revision: 1, state: "idle" }),
      }));
      expect(await browserDatabase.records.get("snapshot-boundary-record")).toMatchObject({
        revision: 2, data: { value: "after" },
      });
      expect(await browserDatabase.table("driverState").get("driver-state")).toMatchObject({
        value: { revision: 2, state: "shift_active" },
      });
    } finally {
      releaseRead();
      spy.mockRestore();
    }
  });
});
