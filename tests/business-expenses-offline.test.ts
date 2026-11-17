import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { DexieRecordRepository } from "../packages/storage-browser/src";
import { NetworkAccessDisabledError, NetworkGateway } from "../packages/core/src/network";
import { BusinessExpensesService } from "../packages/application/src/business-expenses-service";
import {
  assertBusinessExpenseRecordV1,
  assertFuelPurchaseV1,
  assertBusinessExpenseEntryV1,
  calculateDailyBusinessExpenses,
  calculateFuelIntervals,
  calculateFuelCostRateHistory,
} from "../packages/features/business-expenses";

describe("offline-first fuel purchase persistence", () => {
  beforeEach(async () => {
    await browserDatabase.delete();
    await browserDatabase.open();
  });
  afterEach(async () => {
    await browserDatabase.delete();
  });

  it("saves a fuel purchase to IndexedDB while network access is disabled and restores it after reopen", async () => {
    const repository = new DexieRecordRepository();
    const timestamp = "2026-11-17T10:00:00.000Z";
    const vehicleId = "feature:vehicle:MH01AB1234";
    await repository.put({
      id: vehicleId, schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
      source: "web", revision: 1,
      data: { schemaVersion: 1, registrationNumber: "MH01AB1234", lifecycleState: "active" },
    });
    await repository.setNetworkEnabled(false);

    const network = new NetworkGateway(repository);
    const remoteCall = vi.fn(async () => "unexpected");
    await expect(network.run(remoteCall)).rejects.toBeInstanceOf(NetworkAccessDisabledError);
    expect(remoteCall).not.toHaveBeenCalled();

    const service = new BusinessExpensesService(repository, {
      validateRecord: assertBusinessExpenseRecordV1,
      validateFuelPurchase: assertFuelPurchaseV1,
      validateExpenseEntry: assertBusinessExpenseEntryV1,
      calculateDailyExpenses: calculateDailyBusinessExpenses,
      calculateFuelIntervals,
      calculateFuelCostRateHistory,
    }, {
      getById: async id => repository.get(id),
    }, () => timestamp);

    const saved = await service.createFuelPurchase({
      uuid: "123e4567-e89b-42d3-a456-426614174099",
      source: "web",
      data: {
        businessDate: "2026-11-17",
        occurredAt: timestamp,
        vehicleId,
        odometerKm: 45_100,
        pricePaisePerKg: 9_000,
        amountPaise: 18_000,
        partialRefill: false,
      },
    });

    await browserDatabase.close();
    await browserDatabase.open();

    const restoredRepository = new DexieRecordRepository();
    expect(await restoredRepository.getNetworkEnabled()).toBe(false);
    expect(await restoredRepository.get(saved.id)).toMatchObject({
      revision: 1,
      data: { kind: "fuel_purchase", amountPaise: 18_000, pricePaisePerKg: 9_000 },
    });
    const restoredService = new BusinessExpensesService(restoredRepository, {
      validateRecord: assertBusinessExpenseRecordV1,
      validateFuelPurchase: assertFuelPurchaseV1,
      validateExpenseEntry: assertBusinessExpenseEntryV1,
      calculateDailyExpenses: calculateDailyBusinessExpenses,
      calculateFuelIntervals,
      calculateFuelCostRateHistory,
    }, {
      getById: async id => restoredRepository.get(id),
    }, () => timestamp);
    await expect(restoredService.listDailyExpenseOutputs()).resolves.toEqual([
      expect.objectContaining({ businessDate: "2026-11-17", fuelPaise: 18_000 }),
    ]);
  });
});
