import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { DexieRecordRepository } from "../packages/storage-browser/src";
import { WorkDriverSelectionService } from "../packages/application/src/work-driver-selection-service";
import { driverRecordId } from "../packages/domain/src/driver-record-identity";

const at = "2026-11-19T08:00:00.000Z";
const driverRecord = (lifecycleState = "active") => ({
  id: driverRecordId("configured-driver"), schemaVersion: 1, createdAt: at, updatedAt: at,
  source: "web" as const, revision: 1,
  data: { schemaVersion: 1, driverId: "configured-driver", name: "Configured Driver", lifecycleState },

  it("ignores legacy soft-deleted selections and Driver profiles, and only repairs the selection explicitly", async () => {
    const records = new DexieRecordRepository();
    await browserDatabase.records.put(driverRecord());
    await browserDatabase.records.put({
      id: "work:selected-driver", schemaVersion: 1, createdAt: at, updatedAt: at,
      source: "web" as const, revision: 3, deletedAt: at,
      data: { schemaVersion: 1, driverId: "configured-driver" },
    });
    const service = new WorkDriverSelectionService(records, undefined, () => at,
      async () => ({ personId: "person-admin", role: "admin" }));
    expect(await service.getSelectedDriver()).toBeUndefined();
    await service.selectDriver("configured-driver");
    const repaired = await records.get("work:selected-driver");
    expect(repaired?.revision).toBe(4);
    expect(repaired?.deletedAt).toBeUndefined();
    expect(repaired?.updatedBy).toEqual({ personId: "person-admin", role: "admin" });

    const deletedDriverRecords = new DexieRecordRepository();
    await browserDatabase.records.put({ ...driverRecord(), deletedAt: at });
    await expect(new WorkDriverSelectionService(deletedDriverRecords).selectDriver("configured-driver"))
      .rejects.toThrow("driver_not_active");
    expect(await deletedDriverRecords.get("work:selected-driver")).toBeUndefined();
  });

  it("preserves original selection creator and records the authenticated updater", async () => {
    const records = new DexieRecordRepository();
    await browserDatabase.records.bulkPut([
      driverRecord(),
      { id: driverRecordId("second-driver"), schemaVersion: 1, createdAt: at, updatedAt: at,
        source: "web" as const, revision: 1,
        data: { schemaVersion: 1, driverId: "second-driver", name: "Second Driver", lifecycleState: "active" } },
    ]);
    const service = new WorkDriverSelectionService(records, undefined, () => at,
      async () => ({ personId: "person-admin", role: "admin" }));
    await service.selectDriver("configured-driver");
    await service.selectDriver("second-driver");
    const selected = await records.get("work:selected-driver");
    expect(selected?.createdBy).toEqual({ personId: "person-admin", role: "admin" });
    expect(selected?.updatedBy).toEqual({ personId: "person-admin", role: "admin" });
  });

});

describe("Admin operating Driver configuration", () => {
  beforeEach(async () => {
    await browserDatabase.close();
    await browserDatabase.delete();
    await browserDatabase.open();
  });

  it("writes the authoritative Work selection and makes repeat configuration idempotent", async () => {
    const records = new DexieRecordRepository();
    await browserDatabase.records.put(driverRecord());
    const service = new WorkDriverSelectionService(records, undefined, () => at);

    expect(await service.selectDriver("configured-driver")).toEqual({
      schemaVersion: 1, driverId: "configured-driver",
    });
    const first = await records.get("work:selected-driver");
    expect(first?.revision).toBe(1);

    expect(await service.selectDriver("configured-driver")).toEqual({
      schemaVersion: 1, driverId: "configured-driver",
    });
    expect((await records.get("work:selected-driver"))?.revision).toBe(1);
  });

  it("rejects missing or inactive Driver profiles without writing a Work selection", async () => {
    const records = new DexieRecordRepository();
    const service = new WorkDriverSelectionService(records);

    await expect(service.selectDriver("missing-driver")).rejects.toThrow("driver_not_active");
    await browserDatabase.records.put(driverRecord("inactive"));
    await expect(service.selectDriver("configured-driver")).rejects.toThrow("driver_not_active");
    expect(await records.get("work:selected-driver")).toBeUndefined();
  });

  it("refuses to change a selection locked by an active shift", async () => {
    const records = new DexieRecordRepository();
    await browserDatabase.records.bulkPut([
      driverRecord(),
      {
        id: "work:selected-driver", schemaVersion: 1, createdAt: at, updatedAt: at,
        source: "web" as const, revision: 2,
        data: { schemaVersion: 1, driverId: "configured-driver", lockedShiftId: "shift-active" },
      },
    ]);
    const service = new WorkDriverSelectionService(records);
    await expect(service.selectDriver("configured-driver")).rejects.toThrow("work_driver_selection_locked_during_shift");
    expect((await records.get("work:selected-driver"))?.revision).toBe(2);
  });

  it("retains the workflow-state guard when a workflow repository is supplied", async () => {
    const records = new DexieRecordRepository();
    await browserDatabase.records.put(driverRecord());
    const service = new WorkDriverSelectionService(records, {
      getSnapshot: async () => ({ state: "shift_active" } as never),
    });
    await expect(service.selectDriver("configured-driver")).rejects.toThrow("work_driver_selection_locked_during_shift");
    expect(await records.get("work:selected-driver")).toBeUndefined();
  });
});

describe("Admin operating Driver selection repair", () => {
  beforeEach(async () => {
    await browserDatabase.close();
    await browserDatabase.delete();
    await browserDatabase.open();
  });

  it("repairs an invalid but unlocked selection only through explicit Admin configuration", async () => {
    const records = new DexieRecordRepository();
    await browserDatabase.records.bulkPut([
      driverRecord(),
      {
        id: "work:selected-driver", schemaVersion: 1, createdAt: at, updatedAt: at,
        source: "web" as const, revision: 4,
        data: { schemaVersion: 99, legacyValue: true },
      },
    ]);
    const service = new WorkDriverSelectionService(records);
    expect(await service.selectDriver("configured-driver")).toEqual({
      schemaVersion: 1, driverId: "configured-driver",
    });
    expect(await records.get("work:selected-driver")).toMatchObject({
      revision: 5, data: { schemaVersion: 1, driverId: "configured-driver" },
    });
  });

  it("does not repair a malformed selection carrying a shift lock", async () => {
    const records = new DexieRecordRepository();
    await browserDatabase.records.bulkPut([
      driverRecord(),
      {
        id: "work:selected-driver", schemaVersion: 1, createdAt: at, updatedAt: at,
        source: "web" as const, revision: 4,
        data: { schemaVersion: 99, lockedShiftId: "legacy-shift" },
      },
    ]);
    const service = new WorkDriverSelectionService(records);
    await expect(service.selectDriver("configured-driver")).rejects.toThrow("work_driver_selection_locked_during_shift");
    expect((await records.get("work:selected-driver"))?.revision).toBe(4);
  });

});
