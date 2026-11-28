import { describe, expect, it } from "vitest";
import type { AtomicRecordBatchRepository, AtomicRecordMutation } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import {
  assertBusinessExpenseRecordV1, assertFuelPurchaseV1, assertBusinessExpenseEntryV1,
  calculateDailyBusinessExpenses, calculateFuelIntervals, calculateFuelCostRateHistory,
  fuelBusinessDateFromInstant,
} from "../packages/features/business-expenses";
import { BusinessExpensesService } from "../packages/application/src/business-expenses-service";
import type { SubmitHistoricalCorrectionV1 } from "../packages/application/src/historical-correction-service";

class MemoryRepository implements AtomicRecordBatchRepository {
  private rows = new Map<string, RecordEnvelope<unknown>>();
  async get<T>(id: string) { return this.rows.get(id) as RecordEnvelope<T> | undefined; }
  async put<T>(record: RecordEnvelope<T>) { this.rows.set(record.id, record as RecordEnvelope<unknown>); }
  async list<T>() { return [...this.rows.values()] as Array<RecordEnvelope<T>>; }
  async remove(id: string) { this.rows.delete(id); }
  async compareAndSetMany(mutations: readonly AtomicRecordMutation[]) {
    for (const item of mutations) {
      const current = this.rows.get(item.id);
      if (item.expectedRevision === null ? current !== undefined : current?.revision !== item.expectedRevision) return false;
    }
    mutations.forEach(item => this.rows.set(item.id, item.next as RecordEnvelope<unknown>));
    return true;
  }
  async compareAndSet<T>(id: string, expectedRevision: number | null, next: RecordEnvelope<T>) {
    const current = this.rows.get(id);
    if (expectedRevision === null ? current !== undefined : current?.revision !== expectedRevision) return false;
    this.rows.set(id, next as RecordEnvelope<unknown>);
    return true;
  }
}

const vehicleId = "feature:vehicle:MH01AB1234";
const vehicle: RecordEnvelope<{ lifecycleState: string }> = {
  id: vehicleId, schemaVersion: 1, createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z", source: "web", revision: 1,
  data: { lifecycleState: "active" },
};
const domain = {
  validateRecord: assertBusinessExpenseRecordV1,
  validateFuelPurchase: assertFuelPurchaseV1,
  validateExpenseEntry: assertBusinessExpenseEntryV1,
  calculateDailyExpenses: calculateDailyBusinessExpenses,
  calculateFuelIntervals,
  calculateFuelCostRateHistory,
  fuelBusinessDateFromInstant,
};

describe("Fuel correction command retry", () => {
  it("calculates vehicle fuel totals without a Work assignment and excludes driver-attributed expenses", async () => {
    const repository = new MemoryRepository();
    const vehicles = { async getById(id: string) { return id === vehicleId ? vehicle : undefined; } };
    const operating = {
      async get() { throw new Error("operating_assignment_missing"); },
      async getForReadOnly() { throw new Error("operating_assignment_missing"); },
      async getVehicleForReadOnly() { return { schemaVersion: 1 as const, vehicleId, vehicleRevision: 1 }; },
      async assertCurrent() { throw new Error("operating_assignment_missing"); },
      async assertVehicleCurrentForReadOnly() { return { schemaVersion: 1 as const, vehicleId, vehicleRevision: 1 }; },
    };
    const service = new BusinessExpensesService(repository, domain, vehicles,
      () => "2026-11-15T00:00:00.000Z", undefined, operating);
    const fuelId = "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174031";
    await repository.put({ id: fuelId, schemaVersion: 1, createdAt: "2026-11-14T20:00:00.000Z",
      updatedAt: "2026-11-14T20:00:00.000Z", source: "web", revision: 1,
      data: { schemaVersion: 1, kind: "fuel_purchase", id: fuelId, revision: 1,
        businessDate: "2026-11-14", occurredAt: "2026-11-14T20:00:00.000Z",
        vehicleId, odometerKm: 45000, pricePaisePerKg: 9000, amountPaise: 25000, partialRefill: true } });
    const entryId = "feature:business-expenses:entry:123e4567-e89b-42d3-a456-426614174032";
    await repository.put({ id: entryId, schemaVersion: 1, createdAt: "2026-11-14T20:00:00.000Z",
      updatedAt: "2026-11-14T20:00:00.000Z", source: "web", revision: 1,
      data: { schemaVersion: 1, kind: "business_expense", id: entryId, revision: 1,
        sourceKind: "miscellaneous", businessDate: "2026-11-14", amountPaise: 5000,
        currencyCode: "INR", effect: "charge", driverId: "feature:driver-records:driver:driver-one" } });
    await expect(service.listDailyExpenseOutputs()).resolves.toEqual([expect.objectContaining({
      businessDate: "2026-11-14", fuelPaise: 25000, miscellaneousPaise: 0, normalOperatingExpensePaise: 25000,
    })]);
  });

  it("preserves target and chain revisions so an ambiguous UI retry replays the same intent", async () => {
    const repository = new MemoryRepository();
    const vehicles = { async getById(id: string) { return id === vehicleId ? vehicle : undefined; } };
    let submitted: SubmitHistoricalCorrectionV1 | undefined;
    const corrections = {
      async listForTarget() { return []; },
      async submit(input: SubmitHistoricalCorrectionV1) {
        submitted = input;
        return { correction: {} as never, currentData: {}, chainRevision: input.expectedChainRevision + 1 };
      },
    };
    const service = new BusinessExpensesService(repository, domain, vehicles,
      () => "2026-11-15T00:00:00.000Z", corrections);
    const purchase = await service.createFuelPurchase({
      uuid: "123e4567-e89b-42d3-a456-426614174090", source: "web",
      data: { businessDate: "2026-11-14", occurredAt: "2026-11-14T20:00:00.000Z",
        vehicleId, odometerKm: 45000, pricePaisePerKg: 9000, amountPaise: 18000, partialRefill: false },
    });
    await service.correctSource({
      correctionId: "fuel-ui-retry-1", targetRecordId: purchase.id, fieldPath: "amountPaise",
      afterValue: 25000, reason: "Receipt correction",
      expectedTargetRevision: purchase.revision, expectedChainRevision: 0,
    });
    expect(submitted).toMatchObject({
      correctionId: "fuel-ui-retry-1", expectedTargetRevision: purchase.revision,
      expectedChainRevision: 0, fieldPath: "amountPaise", afterValue: 25000,
    });
  });
  it("rebuilds fuel quantity and cost-per-km intervals from a corrected price per kg", async () => {
    const repository = new MemoryRepository();
    const vehicles = { async getById(id: string) { return id === vehicleId ? vehicle : undefined; } };
    const correctedId = "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174091";
    const corrections = {
      async listForTarget(targetRecordId: string) {
        if (targetRecordId !== correctedId) return [];
        return [{
          schemaVersion: 1 as const, correctionId: "fuel-price-fix", targetRecordId: correctedId,
          targetRecordRevision: 1, featureId: "business-expenses", chainRevision: 1,
          fieldPath: "pricePaisePerKg", beforeValue: 10000, afterValue: 12500,
          reason: "Receipt rate verified", actor: { role: "driver" as const, actorId: "driver-1" },
          recordedAt: "2026-11-21T10:00:00.000Z",
        }];
      },
    };
    const service = new BusinessExpensesService(repository, domain, vehicles,
      () => "2026-11-21T10:00:00.000Z", corrections);
    const purchases = [
      ["123e4567-e89b-42d3-a456-426614174092", "2026-11-01T09:00:00.000Z", 100, false, 50000],
      ["123e4567-e89b-42d3-a456-426614174091", "2026-11-05T09:00:00.000Z", 110, true, 20000],
      ["123e4567-e89b-42d3-a456-426614174093", "2026-11-10T09:00:00.000Z", 120, false, 30000],
    ] as const;
    for (const [uuid, occurredAt, odometerKm, partialRefill, amountPaise] of purchases) {
      await service.createFuelPurchase({ uuid, source: "web", data: {
        businessDate: fuelBusinessDateFromInstant(occurredAt), occurredAt, vehicleId,
        odometerKm, pricePaisePerKg: 10000, amountPaise, partialRefill,
      }});
    }
    const intervals = await service.listFuelIntervalOutputs();
    expect(intervals[0]).toMatchObject({
      status: "available", distanceKm: 20, quantityMilliKg: 4600, spendPaise: 50000,
      sourcePurchaseIds: [correctedId, "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174093"],
    });
    const rates = await service.listFuelCostRateHistory();
    expect(rates[0]).toMatchObject({
      cumulativeDistanceKm: 20, cumulativeSpendPaise: 50000,
      costPaisePerKm: { numerator: "50000", denominator: "20" },
    });
  });

});
