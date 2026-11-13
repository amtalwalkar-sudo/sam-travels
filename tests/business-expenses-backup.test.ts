import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { exportBrowserSnapshot, restoreBrowserSnapshot } from "../packages/storage-browser/src";
import { registerVehicleBrowserBackupParticipant } from "../apps/web/src/vehicle-backup";
import { registerBusinessExpensesBrowserBackupParticipant } from "../apps/web/src/business-expenses-backup";

describe("Business Expenses browser backup participant", () => {
  let unregisterVehicle: (() => void) | undefined;
  let unregisterExpenses: (() => void) | undefined;
  const vehicleId = "feature:vehicle:MH01AB1234";
  const timestamp = "2026-11-14T20:00:00.000Z";

  beforeEach(async () => {
    await browserDatabase.delete();
    await browserDatabase.open();
    unregisterVehicle = registerVehicleBrowserBackupParticipant();
    unregisterExpenses = registerBusinessExpensesBrowserBackupParticipant();
  });
  afterEach(() => {
    unregisterExpenses?.(); unregisterExpenses = undefined;
    unregisterVehicle?.(); unregisterVehicle = undefined;
  });

  async function seedVehicle() {
    await browserDatabase.records.put({
      id: vehicleId, schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
      source: "web", revision: 1,
      data: {
        schemaVersion: 1, registrationNumber: "MH01AB1234", make: "Tata",
        model: "Ace", vehicleType: "LCV", fuelType: "CNG",
        yearOfManufacture: 2022, ownership: "Owned", lifecycleState: "active",
      },
    });
  }

  async function seedFuel() {
    const id = "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174000";
    await browserDatabase.records.put({
      id, schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
      source: "web", revision: 1, businessDate: "2026-11-15",
      data: {
        schemaVersion: 1, kind: "fuel_purchase", id, revision: 1,
        businessDate: "2026-11-15", occurredAt: timestamp, vehicleId,
        odometerKm: 45000, pricePaisePerKg: 9000, amountPaise: 18000, partialRefill: true,
      },
    });
  }

  it("exports and restores fuel facts under the required feature participant", async () => {
    await seedVehicle(); await seedFuel();
    const snapshot = await exportBrowserSnapshot("0.1.0");
    expect(snapshot.manifest.participants).toContainEqual({
      id: "business-expenses-records", featureId: "business-expenses",
      snapshotVersion: 1, restoreValidatorId: "business-expenses-records-v1",
    });
    expect(snapshot.data.records).toHaveLength(2);
    await browserDatabase.records.clear();
    await restoreBrowserSnapshot({ data: snapshot.data, manifest: snapshot.manifest as never, confirmed: true });
    expect(await browserDatabase.records.get(
      "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174000",
    )).toBeDefined();
  });

  it("rejects expense records with missing vehicle references", async () => {
    const id = "feature:business-expenses:entry:123e4567-e89b-42d3-a456-426614174010";
    await browserDatabase.records.put({
      id, schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
      source: "web", revision: 1, businessDate: "2026-11-15",
      data: {
        schemaVersion: 1, kind: "business_expense", id, revision: 1,
        sourceKind: "traffic_challan", businessDate: "2026-11-15",
        amountPaise: 1200, currencyCode: "INR", effect: "charge",
        vehicleId, description: "Signal violation", paymentStatus: "unpaid",
      },
    });
    await expect(exportBrowserSnapshot("0.1.0")).rejects.toThrow("business_expense_vehicle_not_found");
  });
});
