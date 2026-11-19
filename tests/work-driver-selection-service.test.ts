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
