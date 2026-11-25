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
});
