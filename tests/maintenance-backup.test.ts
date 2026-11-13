import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { exportBrowserSnapshot, restoreBrowserSnapshot } from "../packages/storage-browser/src";
import { maintenanceRateHistoryRecordId } from "../packages/features/maintenance";
import { registerVehicleBrowserBackupParticipant } from "../apps/web/src/vehicle-backup";
import { registerMaintenanceBrowserBackupParticipant } from "../apps/web/src/maintenance-backup";

describe("Maintenance browser backup participant", () => {
  let unregisterVehicle: (() => void) | undefined;
  let unregisterMaintenance: (() => void) | undefined;
  const vehicleId = "feature:vehicle:MH01AB1234";
  const timestamp = "2026-10-31T20:00:00.000Z";

  beforeEach(async () => {
    await browserDatabase.delete();
    await browserDatabase.open();
    unregisterVehicle = registerVehicleBrowserBackupParticipant();
    unregisterMaintenance = registerMaintenanceBrowserBackupParticipant();
  });
  afterEach(() => {
    unregisterMaintenance?.();
    unregisterMaintenance = undefined;
    unregisterVehicle?.();
    unregisterVehicle = undefined;
  });

  async function seedVehicle() {
    await browserDatabase.records.put({
      id: vehicleId, schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
      source: "web", revision: 1,
      data: {
        schemaVersion: 1, registrationNumber: "MH01AB1234", make: "Tata",
        model: "Ace", vehicleType: "LCV", fuelType: "Diesel",
        yearOfManufacture: 2022, ownership: "Owned", lifecycleState: "active",
      },
    });
  }

  async function seedMaintenance() {
    await browserDatabase.records.put({
      id: "feature:maintenance:visit:123e4567-e89b-42d3-a456-426614174000",
      schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
      source: "web", revision: 1, businessDate: "2026-10-05",
      data: {
        schemaVersion: 1, kind: "visit", vehicleId,
        maintenanceDate: "2026-10-05", maintenanceType: "Regular service",
        description: "Oil and filter replacement",
        items: [{ id: "123e4567-e89b-42d3-a456-426614174001", description: "Oil", amountPaise: 200000 }],
        totalPaise: 200000,
      },
    });
    await browserDatabase.records.put({
      id: maintenanceRateHistoryRecordId(vehicleId),
      schemaVersion: 1, createdAt: "2026-11-02T10:00:00.000Z",
      updatedAt: "2026-11-02T10:00:00.000Z", source: "web", revision: 1,
      businessDate: "2026-11-02",
      data: {
        schemaVersion: 1, kind: "rate_history", vehicleId,
        entries: [
          { effectiveFrom: "2026-11-01", ratePaisePerKm: 250, savedAt: timestamp, isDefault: true },
          {
            effectiveFrom: "2026-11-02", ratePaisePerKm: 300,
            savedAt: "2026-11-02T10:00:00.000Z", isDefault: false,
            commandId: "123e4567-e89b-42d3-a456-426614174002", source: "web",
          },
        ],
      },
    });
  }


  async function seedDailyAccrual(unallocated = 0) {
    const dailyId = "work:daily-business-km:" + encodeURIComponent(vehicleId) + ":2026-11-02";
    await browserDatabase.records.put({ id: dailyId, schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
      source: "integration", revision: 2, data: { schemaVersion: 1, kind: "daily_business_kilometres", vehicleId,
        operationalDate: "2026-11-02", entries: [
          { shiftId: "shift-a", shiftStartEventId: "shift-a", shiftEndEventId: "shift-end-a", shiftStartedAt: "2026-11-02T00:00:00.000Z", shiftEndedAt: "2026-11-02T08:00:00.000Z", startOdometerKm: 100, endOdometerKm: 220, businessKm: 120, allocationStatus: "allocated" },
          ...(unallocated ? [{ shiftId: "shift-b", shiftStartEventId: "shift-b", shiftEndEventId: "shift-end-b", shiftStartedAt: "2026-11-02T08:00:00.000Z", shiftEndedAt: "2026-11-02T10:00:00.000Z", startOdometerKm: 220, endOdometerKm: 220 + unallocated, businessKm: unallocated, allocationStatus: "awaiting_operational_boundary" }] : []),
        ], totalBusinessKm: 120, unallocatedBusinessKm: unallocated } });
    await browserDatabase.records.put({ id: "feature:maintenance:daily-accrual:" + encodeURIComponent(vehicleId) + ":2026-11-02",
      schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp, source: "integration", revision: 1, businessDate: "2026-11-02",
      data: { schemaVersion: 1, kind: "daily_accrual", vehicleId, operationalDate: "2026-11-02", dailyBusinessKmRecordId: dailyId,
        dailyBusinessKmRevision: 2, businessKm: 120, rateEffectiveFrom: "2026-11-02", ratePaisePerKm: 300, amountPaise: 36000 } });
  }

  it("exports and restores an immutable accrual linked to fully allocated daily kilometres and the effective rate", async () => {
    await seedVehicle(); await seedMaintenance(); await seedDailyAccrual();
    const snapshot = await exportBrowserSnapshot("0.1.0");
    expect(snapshot.data.records).toHaveLength(5);
    await browserDatabase.records.clear();
    await restoreBrowserSnapshot({ data: snapshot.data, manifest: snapshot.manifest as never, confirmed: true });
    expect(await browserDatabase.records.get("feature:maintenance:daily-accrual:" + encodeURIComponent(vehicleId) + ":2026-11-02")).toBeDefined();
  });

  it("rejects accrual backup when any source kilometres are still unallocated", async () => {
    await seedVehicle(); await seedMaintenance(); await seedDailyAccrual(25);
    await expect(exportBrowserSnapshot("0.1.0")).rejects.toThrow("maintenance_daily_accrual_source_invalid");
  });

  it("exports and restores visits and atomic per-vehicle rate history", async () => {
    await seedVehicle();
    await seedMaintenance();
    const snapshot = await exportBrowserSnapshot("0.1.0");
    expect(snapshot.manifest.participants).toContainEqual({
      id: "maintenance-records", featureId: "maintenance",
      snapshotVersion: 1, restoreValidatorId: "maintenance-records-v1",
    });
    expect(snapshot.data.records).toHaveLength(3);
    await browserDatabase.records.clear();
    await restoreBrowserSnapshot({
      data: snapshot.data, manifest: snapshot.manifest as never, confirmed: true,
    });
    expect(await browserDatabase.records.get(maintenanceRateHistoryRecordId(vehicleId))).toBeDefined();
  });

  it("restores pre-Maintenance snapshots when no Maintenance records exist", async () => {
    const snapshot = await exportBrowserSnapshot("0.1.0");
    const legacyManifest = {
      ...snapshot.manifest,
      participants: snapshot.manifest.participants?.filter(item => item.id !== "maintenance-records"),
    };
    await expect(restoreBrowserSnapshot({
      data: snapshot.data, manifest: legacyManifest as never, confirmed: true,
    })).resolves.toMatchObject({ restoredCounts: { records: 0 } });
  });

  it("rejects Maintenance records with missing Vehicle references", async () => {
    await browserDatabase.records.put({
      id: "feature:maintenance:expense:123e4567-e89b-42d3-a456-426614174010",
      schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
      source: "web", revision: 1,
      data: {
        schemaVersion: 1, kind: "expense", vehicleId,
        expenseDate: "2026-10-06", expenseName: "Towing",
        description: "Roadside towing", amountPaise: 120000,
      },
    });
    await expect(exportBrowserSnapshot("0.1.0")).rejects.toThrow("maintenance_vehicle_not_found");
  });

  it("rejects Maintenance visits whose derived total does not match the items", async () => {
    await browserDatabase.records.put({
      id: "feature:maintenance:visit:123e4567-e89b-42d3-a456-426614174000",
      schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
      source: "web", revision: 1,
      data: {
        schemaVersion: 1, kind: "visit", vehicleId,
        maintenanceDate: "2026-10-05", maintenanceType: "Service",
        description: "Visit",
        items: [{ id: "123e4567-e89b-42d3-a456-426614174001", description: "Oil", amountPaise: 100 }],
        totalPaise: 101,
      },
    });
    await expect(exportBrowserSnapshot("0.1.0")).rejects.toThrow("maintenance_visit_total_mismatch");
  });
});
