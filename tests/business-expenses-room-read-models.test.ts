import { describe, expect, it } from "vitest";
import type { AtomicRecordRepository, AtomicRecordMutation } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import {
  assertBusinessExpenseRecordV1, assertFuelPurchaseV1, assertBusinessExpenseEntryV1,
  calculateDailyBusinessExpenses, calculateFuelIntervals, calculateFuelCostRateHistory,
  fuelBusinessDateFromInstant,
} from "../packages/features/business-expenses";
import { BusinessExpensesService } from "../packages/application/src/business-expenses-service";

class MemoryRepository implements AtomicRecordRepository {
  private rows = new Map<string, RecordEnvelope<unknown>>();
  async get<T>(id: string) { return this.rows.get(id) as RecordEnvelope<T> | undefined; }
  async put<T>(record: RecordEnvelope<T>) { this.rows.set(record.id, record as RecordEnvelope<unknown>); }
  async list<T>() { return [...this.rows.values()] as Array<RecordEnvelope<T>>; }
  async compareAndSetMany(mutations: readonly AtomicRecordMutation[]) {
    if (!mutations.length || new Set(mutations.map(item => item.id)).size !== mutations.length) {
      throw new Error("atomic_record_batch_invalid");
    }
    for (const item of mutations) {
      const current = this.rows.get(item.id);
      if (item.expectedRevision === null ? current !== undefined : current?.revision !== item.expectedRevision) return false;
      if (item.next.revision !== (item.expectedRevision ?? 0) + 1) throw new Error("atomic_record_batch_revision_invalid");
    }
    mutations.forEach(item => this.rows.set(item.id, item.next as RecordEnvelope<unknown>));
    return true;
  }
  async remove(id: string) { this.rows.delete(id); }
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
const vehicles = { async getById(id: string) { return id === vehicleId ? vehicle : undefined; } };

describe("Room-oriented business expense read models", () => {
  it("projects one corrected Fuel snapshot consistently into purchase and daily-cost readbacks", async () => {
    const repository = new MemoryRepository();
    const fuelId = "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174030";
    const corrections = {
      async listForTarget(targetRecordId: string) {
        return targetRecordId === fuelId ? [{
          schemaVersion: 1 as const, correctionId: "fuel-amount-fix", targetRecordId: fuelId,
          targetRecordRevision: 1, featureId: "business-expenses", chainRevision: 1,
          fieldPath: "amountPaise", beforeValue: 18000, afterValue: 25000,
          reason: "Corrected against the fuel receipt",
          actor: { role: "driver" as const, actorId: "driver-1" },
          recordedAt: "2026-11-15T01:00:00.000Z",
        }] : [];
      },
    };
    const service = new BusinessExpensesService(repository, domain, vehicles,
      () => "2026-11-15T00:00:00.000Z", corrections);
    await service.createFuelPurchase({
      uuid: "123e4567-e89b-42d3-a456-426614174030", source: "web",
      data: {
        businessDate: "2026-11-14", occurredAt: "2026-11-14T20:00:00.000Z",
        vehicleId, odometerKm: 45000, pricePaisePerKg: 9000, amountPaise: 18000,
        partialRefill: true,
      },
    });
    const readModels = await service.listFuelReadModels();
    expect(readModels.fuelPurchases[0].data.amountPaise).toBe(25000);
    expect(readModels.dailyExpenseOutputs[0]).toMatchObject({
      businessDate: "2026-11-14", fuelPaise: 25000, normalOperatingExpensePaise: 25000,
    });
  });

  it("assigns Admin challans to the current Driver with the canonical record identity", async () => {
    const repository = new MemoryRepository();
    const service = new BusinessExpensesService(repository, domain, vehicles,
      () => "2026-11-15T00:00:00.000Z", undefined, {
        get: async () => ({ vehicleId, driverId: "driver-1" }),
        assertCurrent: async () => undefined,
      } as never);
    const challan = await service.createExpenseEntry({
      uuid: "123e4567-e89b-42d3-a456-426614174097", source: "web",
      data: { sourceKind: "traffic_challan", businessDate: "2026-11-15", amountPaise: 30000,
        currencyCode: "INR", effect: "charge", vehicleId, paymentStatus: "paid",
        description: "Signal violation" },
    });
    expect(challan.data.driverId).toBe("feature:driver-records:driver:driver-1");
  });
});
