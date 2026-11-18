import { describe, expect, it } from "vitest";
import type { AtomicRecordRepository } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import {
  assertBusinessExpenseRecordV1, assertFuelPurchaseV1, assertBusinessExpenseEntryV1,
  calculateDailyBusinessExpenses, calculateFuelIntervals, calculateFuelCostRateHistory,
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
  calculateFuelCostRateHistory,
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

  it("attaches captured GPS evidence to the authoritative Fuel purchase idempotently", async () => {
    const { service } = setup();
    const purchase = await service.createFuelPurchase({
      uuid: "123e4567-e89b-42d3-a456-426614174099", source: "web",
      data: {
        businessDate: "2026-11-15", occurredAt: "2026-11-14T20:00:00.000Z",
        vehicleId, odometerKm: 45000, pricePaisePerKg: 9000, amountPaise: 18000,
        partialRefill: true,
      },
    });
    const evidence = {
      latitude: 19.076, longitude: 72.8777, accuracyMeters: 12.5,
      capturedAt: "2026-11-14T20:00:02.000Z", provider: "device" as const, captureTiming: "late" as const,
    };
    const saved = await service.recordFuelLocationEvidence({ fuelPurchaseId: purchase.id, evidence });
    expect(saved).toMatchObject({ revision: 2, data: { locationEvidence: evidence } });
    await expect(service.recordFuelLocationEvidence({ fuelPurchaseId: purchase.id, evidence }))
      .resolves.toMatchObject({ revision: 2, data: { locationEvidence: evidence } });
    await expect(service.recordFuelLocationEvidence({
      fuelPurchaseId: purchase.id, evidence: { ...evidence, latitude: 19.1 },
    })).rejects.toThrow("fuel_location_evidence_already_recorded");
  });

  it("exposes a derived historical rate timeline from completed intervals", async () => {
    const { service } = setup();
    for (const [uuid, occurredAt, odometerKm, partialRefill, amountPaise] of [
      ["123e4567-e89b-42d3-a456-426614174040","2026-11-01T09:00:00.000Z",100,false,50_000],
      ["123e4567-e89b-42d3-a456-426614174041","2026-11-05T09:00:00.000Z",110,true,20_000],
      ["123e4567-e89b-42d3-a456-426614174042","2026-11-10T09:00:00.000Z",120,false,30_000],
    ] as const) {
      await service.createFuelPurchase({ uuid, source:"web", data: {
        businessDate: new Date(Date.parse(occurredAt)+330*60_000).toISOString().slice(0,10),
        occurredAt, vehicleId, odometerKm, pricePaisePerKg:10_000, amountPaise, partialRefill,
      }});
    }
    const history = await service.listFuelCostRateHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ effectiveFrom:"2026-11-11",
      costPaisePerKm:{numerator:"50000",denominator:"20"}, cumulativeSpendPaise:50_000,
      cumulativeDistanceKm:20 });
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
    await expect(service.listCorrectionReferences(fuelId)).resolves.toEqual([
      { sourceId: "historical-correction:fuel-amount-fix", revision: 1 },
    ]);
  });


  it("recalculates paid expense outputs on the corrected effective business date", async () => {
    const repository = new MemoryRepository();
    const vehicles = { async getById(id: string) { return id === vehicleId ? vehicle : undefined; } };
    const expenseId = "feature:business-expenses:entry:123e4567-e89b-42d3-a456-426614174088";
    const correction = {
      async listForTarget(targetRecordId: string) {
        return targetRecordId === expenseId ? [{
          schemaVersion: 1 as const, correctionId: "platform-fee-date-fix",
          targetRecordId: expenseId, targetRecordRevision: 1, featureId: "business-expenses",
          chainRevision: 1, fieldPath: "businessDate", beforeValue: "2026-11-15",
          afterValue: "2026-11-17", reason: "Corrected to the actual paid date",
          actor: { role: "driver" as const, actorId: "driver-1" },
          recordedAt: "2026-11-18T00:00:00.000Z", businessEffectiveDate: "2026-11-18",
        }] : [];
      },
    };
    const service = new BusinessExpensesService(repository, domain, vehicles,
      () => "2026-11-18T00:00:00.000Z", correction);
    await service.createExpenseEntry({
      uuid: "123e4567-e89b-42d3-a456-426614174088", source: "web",
      data: { sourceKind: "platform_fee", businessDate: "2026-11-15", amountPaise: 1_200,
        currencyCode: "INR", effect: "charge", vehicleId, reference: "paid pass" },
    });
    const outputs = await service.listDailyExpenseOutputs();
    expect(outputs).toContainEqual(expect.objectContaining({
      businessDate: "2026-11-17", platformFeesPaise: 1_200,
      sourceIds: [expenseId], sourceRevisions: [1],
    }));
    expect(outputs.some(row => row.businessDate === "2026-11-15")).toBe(false);
    await expect(service.listCorrectionReferences(expenseId)).resolves.toEqual([
      { sourceId: "historical-correction:platform-fee-date-fix", revision: 1 },
    ]);
  });

  it("rebuilds the prospective fuel cost/km timeline from corrected purchase amounts", async () => {
    const repository = new MemoryRepository();
    const vehicles = { async getById(id: string) { return id === vehicleId ? vehicle : undefined; } };
    const correctedPurchaseId = "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174051";
    const corrections = {
      async listForTarget(targetRecordId: string) {
        if (targetRecordId !== correctedPurchaseId) return [];
        return [{
          schemaVersion: 1 as const, correctionId: "fuel-interval-amount-fix",
          targetRecordId: correctedPurchaseId, targetRecordRevision: 1,
          featureId: "business-expenses", chainRevision: 1, fieldPath: "amountPaise",
          beforeValue: 20_000, afterValue: 25_000,
          reason: "Corrected against the original pump receipt",
          actor: { role: "driver" as const, actorId: "driver-1" },
          recordedAt: "2026-11-21T10:00:00.000Z",
        }];
      },
    };
    const service = new BusinessExpensesService(repository, domain, vehicles,
      () => "2026-11-21T10:00:00.000Z", corrections);
    const purchases = [
      ["123e4567-e89b-42d3-a456-426614174050", "2026-11-01T09:00:00.000Z", 100, false, 50_000],
      ["123e4567-e89b-42d3-a456-426614174051", "2026-11-05T09:00:00.000Z", 110, true, 20_000],
      ["123e4567-e89b-42d3-a456-426614174052", "2026-11-10T09:00:00.000Z", 120, false, 30_000],
    ] as const;
    for (const [uuid, occurredAt, odometerKm, partialRefill, amountPaise] of purchases) {
      await service.createFuelPurchase({ uuid, source: "web", data: {
        businessDate: new Date(Date.parse(occurredAt) + 330 * 60_000).toISOString().slice(0, 10),
        occurredAt, vehicleId, odometerKm, pricePaisePerKg: 10_000, amountPaise, partialRefill,
      }});
    }
    const history = await service.listFuelCostRateHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      completionBusinessDate: "2026-11-10", effectiveFrom: "2026-11-11",
      cumulativeSpendPaise: 55_000, cumulativeDistanceKm: 20,
      costPaisePerKm: { numerator: "55000", denominator: "20" },
      sourcePurchaseIds: [correctedPurchaseId, "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174052"],
    });
  });

  it("keeps each Admin source distinct and applies the approved normal/full-cost treatment", async () => {
    const { service } = setup();
    await service.createExpenseEntry({ uuid: "123e4567-e89b-42d3-a456-426614174001", source: "web",
      data: { sourceKind: "platform_fee", businessDate: "2026-11-15", amountPaise: 5000,
        currencyCode: "INR", effect: "charge", vehicleId, reference: "paid-pass-123" } });
    await service.createExpenseEntry({ uuid: "123e4567-e89b-42d3-a456-426614174002", source: "web",
      data: { sourceKind: "traffic_challan", businessDate: "2026-11-15", amountPaise: 2000,
        currencyCode: "INR", effect: "charge", vehicleId, description: "Signal violation", paymentStatus: "unpaid" } });
    await service.createExpenseEntry({ uuid: "123e4567-e89b-42d3-a456-426614174004", source: "web",
      data: { sourceKind: "traffic_challan", businessDate: "2026-11-15", amountPaise: 1000,
        currencyCode: "INR", effect: "charge", vehicleId, description: "Paid parking challan", paymentStatus: "paid" } });
    await service.createExpenseEntry({ uuid: "123e4567-e89b-42d3-a456-426614174003", source: "web",
      data: { sourceKind: "miscellaneous", businessDate: "2026-11-15", amountPaise: 3000,
        currencyCode: "INR", effect: "charge", category: "Cleaning" } });
    const [daily] = await service.listDailyExpenseOutputs();
    expect(daily).toMatchObject({
      platformFeesPaise: 5000, trafficChallansPaise: 1000, miscellaneousPaise: 3000,
      reportedSourceExpensePaise: 9000, normalOperatingExpensePaise: 8000,
      fullCostExpensePaise: 9000,
    });
  });

  it("requires vehicle attribution and rejects legacy netted treatment for paid platform charges", async () => {
    const { service } = setup();
    await expect(service.createExpenseEntry({ uuid: "123e4567-e89b-42d3-a456-426614174020", source: "web",
      data: { sourceKind: "platform_fee", businessDate: "2026-11-15", amountPaise: 5000,
        currencyCode: "INR", effect: "charge", reference: "paid-pass-456" } }))
      .rejects.toThrow("platform_fee_vehicle_required");
    await expect(service.createExpenseEntry({ uuid: "123e4567-e89b-42d3-a456-426614174021", source: "web",
      data: { sourceKind: "platform_fee", businessDate: "2026-11-15", amountPaise: 5000,
        currencyCode: "INR", effect: "charge", vehicleId, reference: "paid-pass-456",
        alreadyNettedFromIncome: true } }))
      .rejects.toThrow("business_expense_platform_fee_netting_not_supported");
  });

  it("records a linked reversal as a separate source event on its own date", async () => {
    const { service } = setup();
    const original = await service.createExpenseEntry({
      uuid: "123e4567-e89b-42d3-a456-426614174010", source: "web",
      data: { sourceKind: "miscellaneous", businessDate: "2026-11-15", amountPaise: 1200,
        currencyCode: "INR", effect: "charge", category: "Parking", tripExpenseTreatment: "standalone" },
    });
    await service.createExpenseEntry({
      uuid: "123e4567-e89b-42d3-a456-426614174011", source: "web",
      data: { sourceKind: "miscellaneous", businessDate: "2026-11-16", amountPaise: 1200,
        currencyCode: "INR", effect: "reversal", reversesSourceId: original.id, category: "Parking",
        tripExpenseTreatment: "standalone" },
    });
    const daily = await service.listDailyExpenseOutputs();
    expect(daily.find(item => item.businessDate === "2026-11-15")?.miscellaneousPaise).toBe(1200);
    expect(daily.find(item => item.businessDate === "2026-11-16")?.miscellaneousPaise).toBe(-1200);
  });

  it("requires an explicit treatment for new standalone toll and parking expenses", async () => {
    const { service } = setup();
    await expect(service.createExpenseEntry({
      uuid: "123e4567-e89b-42d3-a456-426614174074", source: "web",
      data: {
        sourceKind: "miscellaneous", businessDate: "2026-11-15", amountPaise: 500,
        currencyCode: "INR", effect: "charge", category: "Parking",
      },
    })).rejects.toThrow("business_expense_toll_parking_treatment_required");
    await expect(service.createExpenseEntry({
      uuid: "123e4567-e89b-42d3-a456-426614174075", source: "web",
      data: {
        sourceKind: "miscellaneous", businessDate: "2026-11-15", amountPaise: 500,
        currencyCode: "INR", effect: "charge", category: "Parking",
        tripExpenseTreatment: "standalone",
      },
    })).resolves.toMatchObject({ data: { tripExpenseTreatment: "standalone" } });
  });

  it("rejects a linked manual toll duplicate and allows its legacy reversal without erasing trip cost", async () => {
    const { service, repository } = setup();
    const tripId = "work:trip-financial-obligation:trip-dup";
    await repository.put({
      id: tripId, schemaVersion: 1, createdAt: "2026-11-15T00:00:00.000Z",
      updatedAt: "2026-11-15T00:00:00.000Z", source: "web", revision: 2,
      data: {
        schemaVersion: 1, tripId: "trip-dup", kind: "completed_ride_financials", status: "submitted",
        endRideEventId: "end-trip-dup", createdAt: "2026-11-15T00:00:00.000Z",
        tripContext: { schemaVersion: 1, shiftId: "shift-1", driverId: "driver-1",
          assignmentId: "assignment-1", vehicleId, operationalDate: "2026-11-15" },
        farePaise: 5000, tollPaise: 1200, tollPayer: "driver", parkingPaise: 700, parkingPayer: "driver",
      },
    });
    const linked = {
      sourceKind: "miscellaneous" as const, businessDate: "2026-11-15", amountPaise: 1200,
      currencyCode: "INR" as const, effect: "charge" as const, category: "Toll",
      tripExpenseTreatment: "already-in-trip-closeout" as const,
      tripFinancialSourceId: tripId, tripFinancialComponent: "toll" as const,
    };
    await expect(service.createExpenseEntry({
      uuid: "123e4567-e89b-42d3-a456-426614174070", source: "web", data: linked,
    })).rejects.toThrow("business_expense_trip_financial_duplicate");
    await expect(service.createExpenseEntry({
      uuid: "123e4567-e89b-42d3-a456-426614174073", source: "web",
      data: {
        sourceKind: "miscellaneous", businessDate: "2026-11-15", amountPaise: 700,
        currencyCode: "INR", effect: "charge", category: "Parking",
        tripExpenseTreatment: "already-in-trip-closeout",
        tripFinancialSourceId: tripId, tripFinancialComponent: "parking",
      },
    })).rejects.toThrow("business_expense_trip_financial_duplicate");

    const legacyId = "feature:business-expenses:entry:123e4567-e89b-42d3-a456-426614174071";
    await repository.put({
      id: legacyId, schemaVersion: 1, createdAt: "2026-11-15T00:00:00.000Z",
      updatedAt: "2026-11-15T00:00:00.000Z", businessDate: "2026-11-15",
      source: "web", revision: 1,
      data: { schemaVersion: 1, kind: "business_expense", id: legacyId, revision: 1, ...linked },
    });
    const reversal = await service.createExpenseEntry({
      uuid: "123e4567-e89b-42d3-a456-426614174072", source: "web",
      data: {
        sourceKind: "miscellaneous", businessDate: "2026-11-16", amountPaise: 1200,
        currencyCode: "INR", effect: "reversal", reversesSourceId: legacyId, category: "Toll",
        tripExpenseTreatment: "already-in-trip-closeout",
        tripFinancialSourceId: tripId, tripFinancialComponent: "toll",
      },
    });
    expect(reversal.data.tripFinancialSourceId).toBe(tripId);
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
