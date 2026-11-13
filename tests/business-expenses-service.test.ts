import { describe, expect, it } from "vitest";
import type { AtomicRecordRepository } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import {
  assertBusinessExpenseRecordV1, assertFuelPurchaseV1, assertBusinessExpenseEntryV1,
  calculateDailyBusinessExpenses, calculateFuelIntervals,
} from "../packages/features/business-expenses";
import { BusinessExpensesService } from "../packages/application/src/business-expenses-service";

class MemoryRepository implements AtomicRecordRepository {
  private rows = new Map<string, RecordEnvelope<unknown>>();
  async get<T>(id: string) { return this.rows.get(id) as RecordEnvelope<T> | undefined; }
  async put<T>(record: RecordEnvelope<T>) { this.rows.set(record.id, record as RecordEnvelope<unknown>); }
  async list<T>() { return [...this.rows.values()] as Array<RecordEnvelope<T>>; }
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
};
function setup() {
  const repository = new MemoryRepository();
  const vehicles = { async getById(id: string) { return id === vehicleId ? vehicle : undefined; } };
  const service = new BusinessExpensesService(repository, domain, vehicles,
    () => "2026-11-15T00:00:00.000Z");
  return { service, repository };
}

describe("BusinessExpensesService", () => {
  it("stores immutable fuel purchases and derives daily totals from the actual purchase date", async () => {
    const { service } = setup();
    const purchase = await service.createFuelPurchase({
      uuid: "123e4567-e89b-42d3-a456-426614174000", source: "web",
      data: {
        businessDate: "2026-11-15", occurredAt: "2026-11-14T20:00:00.000Z",
        vehicleId, odometerKm: 45000, pricePaisePerKg: 9000, amountPaise: 18000,
        partialRefill: true,
      },
    });
    expect(purchase.id).toBe("feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174000");
    expect(purchase.businessDate).toBe("2026-11-15");
    expect((await service.listDailyExpenseOutputs())[0]).toMatchObject({
      businessDate: "2026-11-15", fuelPaise: 18000, normalOperatingExpensePaise: 18000,
    });
    await expect(service.createFuelPurchase({
      uuid: "123e4567-e89b-42d3-a456-426614174000", source: "web",
      data: {
        businessDate: "2026-11-15", occurredAt: "2026-11-14T20:00:00.000Z",
        vehicleId, odometerKm: 45000, pricePaisePerKg: 9000, amountPaise: 18000,
        partialRefill: true,
      },
    })).rejects.toThrow("feature_record_already_exists");
  });

  it("projects append-only audited fuel corrections into daily expense outputs", async () => {
    const repository = new MemoryRepository();
    const vehicles = { async getById(id: string) { return id === vehicleId ? vehicle : undefined; } };
    const fuelId = "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174030";
    const corrections = {
      async listForTarget(targetRecordId: string) {
        if (targetRecordId !== fuelId) return [];
        return [{
          schemaVersion: 1 as const, correctionId: "fuel-amount-fix", targetRecordId: fuelId,
          targetRecordRevision: 1, featureId: "business-expenses", chainRevision: 1,
          fieldPath: "amountPaise", beforeValue: 18000, afterValue: 25000,
          reason: "Corrected against the fuel receipt",
          actor: { role: "driver" as const, actorId: "driver-1" },
          recordedAt: "2026-11-15T01:00:00.000Z",
        }];
      },
    };
    const service = new BusinessExpensesService(repository, domain, vehicles,
      () => "2026-11-15T00:00:00.000Z", corrections);
    await service.createFuelPurchase({
      uuid: "123e4567-e89b-42d3-a456-426614174030", source: "web",
      data: {
        businessDate: "2026-11-15", occurredAt: "2026-11-14T20:00:00.000Z",
        vehicleId, odometerKm: 45000, pricePaisePerKg: 9000, amountPaise: 18000,
        partialRefill: true,
      },
    });
    const [daily] = await service.listDailyExpenseOutputs();
    expect(daily.fuelPaise).toBe(25000);
    expect(daily.sourceIds).toContain(fuelId);
  });

  it("keeps each Admin source distinct and applies the approved normal/full-cost treatment", async () => {
    const { service } = setup();
    await service.createExpenseEntry({ uuid: "123e4567-e89b-42d3-a456-426614174001", source: "web",
      data: { sourceKind: "platform_fee", businessDate: "2026-11-15", amountPaise: 5000,
        currencyCode: "INR", effect: "charge", reference: "trip-123", alreadyNettedFromIncome: true } });
    await service.createExpenseEntry({ uuid: "123e4567-e89b-42d3-a456-426614174002", source: "web",
      data: { sourceKind: "traffic_challan", businessDate: "2026-11-15", amountPaise: 2000,
        currencyCode: "INR", effect: "charge", vehicleId, description: "Signal violation", paymentStatus: "unpaid" } });
    await service.createExpenseEntry({ uuid: "123e4567-e89b-42d3-a456-426614174003", source: "web",
      data: { sourceKind: "miscellaneous", businessDate: "2026-11-15", amountPaise: 3000,
        currencyCode: "INR", effect: "charge", category: "Cleaning" } });
    const [daily] = await service.listDailyExpenseOutputs();
    expect(daily).toMatchObject({
      platformFeesPaise: 5000, trafficChallansPaise: 2000, miscellaneousPaise: 3000,
      reportedSourceExpensePaise: 10000, normalOperatingExpensePaise: 3000,
      fullCostExpensePaise: 5000,
    });
  });

  it("records a linked reversal as a separate source event on its own date", async () => {
    const { service } = setup();
    const original = await service.createExpenseEntry({
      uuid: "123e4567-e89b-42d3-a456-426614174010", source: "web",
      data: { sourceKind: "miscellaneous", businessDate: "2026-11-15", amountPaise: 1200,
        currencyCode: "INR", effect: "charge", category: "Parking" },
    });
    await service.createExpenseEntry({
      uuid: "123e4567-e89b-42d3-a456-426614174011", source: "web",
      data: { sourceKind: "miscellaneous", businessDate: "2026-11-16", amountPaise: 1200,
        currencyCode: "INR", effect: "reversal", reversesSourceId: original.id, category: "Parking" },
    });
    const daily = await service.listDailyExpenseOutputs();
    expect(daily.find(item => item.businessDate === "2026-11-15")?.miscellaneousPaise).toBe(1200);
    expect(daily.find(item => item.businessDate === "2026-11-16")?.miscellaneousPaise).toBe(-1200);
  });

  it("does not create fuel records for unknown vehicles or incorrect business-date context", async () => {
    const { service } = setup();
    await expect(service.createFuelPurchase({
      uuid: "123e4567-e89b-42d3-a456-426614174020", source: "web",
      data: { businessDate: "2026-11-15", occurredAt: "2026-11-14T20:00:00.000Z",
        vehicleId: "feature:vehicle:UNKNOWN", odometerKm: 10, pricePaisePerKg: 9000,
        amountPaise: 1000, partialRefill: false },
    })).rejects.toThrow("business_expense_vehicle_not_found");
    await expect(service.createFuelPurchase({
      uuid: "123e4567-e89b-42d3-a456-426614174021", source: "web",
      data: { businessDate: "2026-11-14", occurredAt: "2026-11-14T20:00:00.000Z",
        vehicleId, odometerKm: 10, pricePaisePerKg: 9000,
        amountPaise: 1000, partialRefill: false },
    })).rejects.toThrow("fuel_purchase_invalid");
  });
});
