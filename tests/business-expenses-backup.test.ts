import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { exportBrowserSnapshot, restoreBrowserSnapshot } from "../packages/storage-browser/src";
import { registerVehicleBrowserBackupParticipant } from "../apps/web/src/vehicle-backup";
import { registerBusinessExpensesBrowserBackupParticipant } from "../apps/web/src/business-expenses-backup";
import { HistoricalCorrectionService } from "../packages/application/src/historical-correction-service";
import { projectHistoricalCorrectionsV1 } from "../packages/domain/src/historical-correction";
import {
  assertBusinessExpenseRecordV1, assertBusinessExpenseEntryV1, assertFuelPurchaseV1,
  calculateDailyBusinessExpenses, calculateFuelIntervals, calculateFuelCostRateHistory,
} from "../packages/features/business-expenses";
import { BusinessExpensesService } from "../packages/application/src/business-expenses-service";

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
      createdBy: { personId: "driver-1", role: "driver" },
      data: {
        schemaVersion: 1, kind: "fuel_purchase", id, revision: 1,
        businessDate: "2026-11-15", occurredAt: timestamp, vehicleId,
        odometerKm: 45000, pricePaisePerKg: 9000, amountPaise: 18000, partialRefill: true,
      },
    });
  }


  async function seedFuelInterval() {
    const purchases = [
      ["123e4567-e89b-42d3-a456-426614174050", "2026-11-01T09:00:00.000Z", "2026-11-01", 100, false, 50_000],
      ["123e4567-e89b-42d3-a456-426614174051", "2026-11-05T09:00:00.000Z", "2026-11-05", 110, true, 20_000],
      ["123e4567-e89b-42d3-a456-426614174052", "2026-11-10T09:00:00.000Z", "2026-11-10", 120, false, 30_000],
    ] as const;
    for (const [uuid, occurredAt, businessDate, odometerKm, partialRefill, amountPaise] of purchases) {
      const id = "feature:business-expenses:fuel:" + uuid;
      await browserDatabase.records.put({
        id, schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
        source: "web", revision: 1, businessDate,
        createdBy: { personId: "driver-1", role: "driver" },
        data: { schemaVersion: 1, kind: "fuel_purchase", id, revision: 1, businessDate,
          occurredAt, vehicleId, odometerKm, pricePaisePerKg: 10_000, amountPaise, partialRefill },
      });
    }
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

  it("restores fuel correction history and reproduces the corrected source projection", async () => {
    await seedVehicle(); await seedFuelInterval();
    const targetRecordId = "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174051";
    const correctionId = "backup-fuel-correction-" + crypto.randomUUID();
    const correctionService = new HistoricalCorrectionService(
      new (await import("../packages/storage-browser/src")).DexieRecordRepository(),
      { currentActor: async () => ({ role: "driver" as const, actorId: "driver-1" }) },
      {
        resolve: async record => {
          if (record.id !== targetRecordId) throw new Error("unsupported_target");
          return {
            featureId: "business-expenses",
            allowedFieldPaths: ["amountPaise"],
            validateProjectedData: assertFuelPurchaseV1,
          };
        },
      },
      "web",
      () => timestamp,
    );
    await correctionService.submit({
      correctionId, targetRecordId, expectedTargetRevision: 1, expectedChainRevision: 0,
      fieldPath: "amountPaise", afterValue: 25_000, reason: "Verified against the corrected pump receipt",
      businessEffectiveDate: "2026-11-15",
    });
    const secondCorrectionId = correctionId + "-second";
    await correctionService.submit({
      correctionId: secondCorrectionId, targetRecordId, expectedTargetRevision: 1, expectedChainRevision: 1,
      fieldPath: "amountPaise", afterValue: 27_000, reason: "Second receipt verification",
      businessEffectiveDate: "2026-11-15",
    });

    const snapshot = await exportBrowserSnapshot("0.1.0");
    expect(snapshot.data.records.some(row => (row as { id?: string }).id === "historical-correction:" + correctionId)).toBe(true);
    await browserDatabase.records.clear();
    await restoreBrowserSnapshot({ data: snapshot.data, manifest: snapshot.manifest as never, confirmed: true });

    const restoredRecords = new (await import("../packages/storage-browser/src")).DexieRecordRepository();
    const restoredCorrectionService = new HistoricalCorrectionService(
      restoredRecords,
      { currentActor: async () => ({ role: "driver" as const, actorId: "driver-1" }) },
      {
        resolve: async () => ({
          featureId: "business-expenses", allowedFieldPaths: ["amountPaise"],
          validateProjectedData: assertFuelPurchaseV1,
        }),
      },
      "web",
      () => timestamp,
    );
    const original = await restoredRecords.get(targetRecordId);
    const corrections = await restoredCorrectionService.listForTarget(targetRecordId);
    expect(original?.revision).toBe(1);
    expect((original?.data as { amountPaise: number }).amountPaise).toBe(20_000);
    expect(projectHistoricalCorrectionsV1(original!.data, corrections)).toMatchObject({
      status: "valid", data: { amountPaise: 27_000 }, chainRevision: 2,
    });
    const expenseDomain = {
      validateRecord: assertBusinessExpenseRecordV1,
      validateFuelPurchase: assertFuelPurchaseV1,
      validateExpenseEntry: assertBusinessExpenseEntryV1,
      calculateDailyExpenses: calculateDailyBusinessExpenses,
      calculateFuelIntervals,
      calculateFuelCostRateHistory,
    };
    const expenses = new BusinessExpensesService(
      restoredRecords, expenseDomain,
      { getById: async (id: string) => restoredRecords.get(id) } as never,
      () => timestamp, restoredCorrectionService,
    );
    const projectedPurchases = await expenses.listFuelPurchases();
    expect(projectedPurchases.find(row => row.id === targetRecordId)?.data.amountPaise).toBe(27_000);
    expect(await expenses.listCorrectionReferences(targetRecordId)).toEqual([
      { sourceId: "historical-correction:" + correctionId, revision: 1 },
      { sourceId: "historical-correction:" + secondCorrectionId, revision: 2 },
    ]);
    const rateHistory = await expenses.listFuelCostRateHistory();
    expect(rateHistory).toHaveLength(1);
    expect(rateHistory[0]).toMatchObject({
      completionBusinessDate: "2026-11-10", effectiveFrom: "2026-11-11",
      cumulativeSpendPaise: 57_000, cumulativeDistanceKm: 20,
      costPaisePerKm: { numerator: "57000", denominator: "20" },
      sourcePurchaseIds: [targetRecordId, "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174052"],
    });
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
