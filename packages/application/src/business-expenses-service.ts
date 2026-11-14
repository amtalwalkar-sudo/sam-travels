import type { AtomicRecordRepository } from "../../core/src/repositories";
import type { RecordEnvelope } from "../../core/src/types";
import { FeatureRecordService, type FeatureRecordSource } from "./feature-record-service";
import { projectHistoricalCorrectionsV1, type HistoricalCorrectionV1 } from "../../domain/src/historical-correction";
import type { SubmitHistoricalCorrectionV1 } from "./historical-correction-service";

export type FuelPurchaseV1 = Readonly<{
  schemaVersion: 1; kind: "fuel_purchase"; id: string; revision: number;
  businessDate: string; occurredAt: string; vehicleId: string; odometerKm: number;
  pricePaisePerKg: number; amountPaise: number; partialRefill: boolean;
  locationEvidence?: Readonly<{ latitude: number; longitude: number; accuracyMeters: number; capturedAt: string; provider: "device" }>;
}>;
export type BusinessExpenseEntryV1 = Readonly<{
  schemaVersion: 1; kind: "business_expense"; id: string; revision: number;
  sourceKind: "platform_fee" | "traffic_challan" | "miscellaneous";
  businessDate: string; amountPaise: number; currencyCode: "INR";
  effect: "charge" | "reversal"; reversesSourceId?: string; vehicleId?: string;
  driverId?: string; category?: string; description?: string; reference?: string;
  alreadyNettedFromIncome?: boolean; paymentStatus?: "unpaid" | "paid";
}>;
export type BusinessExpenseRecordV1 = FuelPurchaseV1 | BusinessExpenseEntryV1;
export type FuelPurchaseInputV1 = Omit<FuelPurchaseV1, "schemaVersion" | "kind" | "id" | "revision">;
export type BusinessExpenseEntryInputV1 = Omit<BusinessExpenseEntryV1, "schemaVersion" | "kind" | "id" | "revision">;
export type ExactRatioV1 = Readonly<{ numerator: string; denominator: string }>;
export type FuelIntervalV1 = Readonly<{
  calculationVersion: "business-expenses.fuel-interval.v1";
  status: "available" | "incomplete" | "needs_attention";
  startCheckpointId: string; endCheckpointId?: string;
  sourcePurchaseIds: readonly string[]; sourceRevisions: readonly number[]; distanceKm?: number;
  quantityMilliKg?: number; spendPaise?: number; kmPerKg?: ExactRatioV1;
  effectiveCostPaisePerKg?: ExactRatioV1; costPaisePerKm?: ExactRatioV1;
  issue?: "awaiting_full_checkpoint" | "odometer_not_increasing" | "ambiguous_timestamp" | "invalid_interval_sources";
}>;
export type DailyBusinessExpenseV1 = Readonly<{
  businessDate: string; currencyCode: "INR"; fuelPaise: number; platformFeesPaise: number;
  trafficChallansPaise: number; miscellaneousPaise: number; reportedSourceExpensePaise: number;
  normalOperatingExpensePaise: number; fullCostExpensePaise: number;
  sourceIds: readonly string[]; sourceRevisions: readonly number[];
}>;

export type BusinessExpensesDomain = Readonly<{
  validateRecord(value: unknown): asserts value is BusinessExpenseRecordV1;
  validateFuelPurchase(value: unknown): asserts value is FuelPurchaseV1;
  validateExpenseEntry(value: unknown): asserts value is BusinessExpenseEntryV1;
  calculateDailyExpenses(fuel: readonly FuelPurchaseV1[], entries: readonly BusinessExpenseEntryV1[]): readonly DailyBusinessExpenseV1[];
  calculateFuelIntervals(fuel: readonly FuelPurchaseV1[]): readonly FuelIntervalV1[];
}>;
export type BusinessExpenseVehicleDirectory = {
  getById(id: string): Promise<RecordEnvelope<{ lifecycleState: string }> | undefined>;
};
export type BusinessExpenseHistoricalCorrectionPortV1 = Readonly<{
  listForTarget(targetRecordId: string): Promise<HistoricalCorrectionV1[]>;
  submit?(input: SubmitHistoricalCorrectionV1): Promise<Readonly<{
    correction: HistoricalCorrectionV1; currentData: unknown; chainRevision: number;
  }>>;
}>;

const PREFIX = "feature:business-expenses:";
const FUEL_PREFIX = PREFIX + "fuel:";
const ENTRY_PREFIX = PREFIX + "entry:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sourceId(prefix: string, uuid: string): string {
  if (typeof uuid !== "string" || !UUID.test(uuid)) throw new Error("business_expense_uuid_invalid");
  return prefix + uuid.toLowerCase();
}

/** Shared application service for authoritative expense facts and deterministic read models. */
export class BusinessExpensesService {
  private readonly records: FeatureRecordService<BusinessExpenseRecordV1>;

  constructor(
    repository: AtomicRecordRepository,
    private readonly domain: BusinessExpensesDomain,
    private readonly vehicles: BusinessExpenseVehicleDirectory,
    now: () => string = () => new Date().toISOString(),
    private readonly historicalCorrections?: BusinessExpenseHistoricalCorrectionPortV1,
  ) {
    this.records = new FeatureRecordService(repository, {
      featureId: "business-expenses",
      recordIdPrefix: PREFIX,
      validate: domain.validateRecord,
    }, now);
  }

  private async requireVehicle(vehicleId: string): Promise<void> {
    const vehicle = await this.vehicles.getById(vehicleId);
    if (!vehicle) throw new Error("business_expense_vehicle_not_found");
  }

  async createFuelPurchase(input: {
    uuid: string; data: FuelPurchaseInputV1; source: FeatureRecordSource;
  }): Promise<RecordEnvelope<FuelPurchaseV1>> {
    await this.requireVehicle(input.data.vehicleId);
    const id = sourceId(FUEL_PREFIX, input.uuid);
    const data: FuelPurchaseV1 = { ...input.data, schemaVersion: 1, kind: "fuel_purchase", id, revision: 1 };
    this.domain.validateFuelPurchase(data);
    return this.records.create({ id, data, source: input.source, businessDate: data.businessDate }) as
      Promise<RecordEnvelope<FuelPurchaseV1>>;
  }

  async createExpenseEntry(input: {
    uuid: string; data: BusinessExpenseEntryInputV1; source: FeatureRecordSource;
  }): Promise<RecordEnvelope<BusinessExpenseEntryV1>> {
    const id = sourceId(ENTRY_PREFIX, input.uuid);
    const data: BusinessExpenseEntryV1 = {
      ...input.data, schemaVersion: 1, kind: "business_expense", id, revision: 1,
    };
    if (data.sourceKind === "platform_fee" && !data.vehicleId) {
      throw new Error("platform_fee_vehicle_required");
    }
    if (data.sourceKind === "platform_fee" && data.alreadyNettedFromIncome === true) {
      throw new Error("business_expense_platform_fee_netting_not_supported");
    }
    this.domain.validateExpenseEntry(data);
    if (data.vehicleId) await this.requireVehicle(data.vehicleId);
    if (data.sourceKind === "traffic_challan" && !data.vehicleId) {
      throw new Error("traffic_challan_vehicle_required");
    }
    if (data.sourceKind === "traffic_challan" && !data.description?.trim() && !data.reference?.trim()) {
      throw new Error("traffic_challan_reason_or_reference_required");
    }
    if (data.sourceKind === "traffic_challan" && data.paymentStatus !== "unpaid" && data.paymentStatus !== "paid") {
      throw new Error("traffic_challan_payment_status_required");
    }
    if (data.sourceKind !== "traffic_challan" && data.paymentStatus !== undefined) {
      throw new Error("traffic_challan_payment_status_not_applicable");
    }
    if (data.sourceKind === "platform_fee" && !data.reference?.trim()) {
      throw new Error("platform_fee_source_reference_required");
    }
    if (data.sourceKind === "miscellaneous" && !data.category?.trim()) {
      throw new Error("miscellaneous_expense_category_required");
    }
    if (data.sourceKind !== "platform_fee" && data.alreadyNettedFromIncome !== undefined) {
      throw new Error("business_expense_income_treatment_not_applicable");
    }
    if (data.effect === "reversal") {
      const original = await this.records.get(data.reversesSourceId!);
      if (!original || original.data.kind !== "business_expense" ||
          original.data.effect !== "charge" || original.data.sourceKind !== data.sourceKind ||
          original.data.amountPaise !== data.amountPaise ||
          original.data.businessDate > data.businessDate ||
          (original.data.alreadyNettedFromIncome ?? false) !== (data.alreadyNettedFromIncome ?? false) ||
          original.data.paymentStatus !== data.paymentStatus) {
        throw new Error("business_expense_reversal_link_invalid");
      }
      const existing = await this.listExpenseEntries();
      if (existing.some(entry => entry.data.effect === "reversal" &&
          entry.data.reversesSourceId === data.reversesSourceId)) {
        throw new Error("business_expense_source_already_reversed");
      }
    }
    return this.records.create({ id, data, source: input.source, businessDate: data.businessDate }) as
      Promise<RecordEnvelope<BusinessExpenseEntryV1>>;
  }

  private async projectCorrections<T extends BusinessExpenseRecordV1>(
    records: readonly RecordEnvelope<T>[],
  ): Promise<readonly RecordEnvelope<T>[]> {
    if (!this.historicalCorrections) return records;
    return Object.freeze(await Promise.all(records.map(async record => {
      const corrections = await this.historicalCorrections!.listForTarget(record.id);
      if (!corrections.length) return record;
      const projection = projectHistoricalCorrectionsV1(record.data, corrections);
      if (projection.status !== "valid") throw new Error("business_expense_historical_correction_projection_needs_attention");
      this.domain.validateRecord(projection.data);
      return Object.freeze({ ...record, data: projection.data as T });
    })));
  }

  async listFuelPurchases(): Promise<readonly RecordEnvelope<FuelPurchaseV1>[]> {
    const records = await this.records.list();
    const fuel = records.filter(item => item.data.kind === "fuel_purchase") as RecordEnvelope<FuelPurchaseV1>[];
    return await this.projectCorrections(fuel);
  }

  async listExpenseEntries(): Promise<readonly RecordEnvelope<BusinessExpenseEntryV1>[]> {
    const records = await this.records.list();
    const expenses = records.filter(item => item.data.kind === "business_expense") as RecordEnvelope<BusinessExpenseEntryV1>[];
    return await this.projectCorrections(expenses);
  }

  async listDailyExpenseOutputs(): Promise<readonly DailyBusinessExpenseV1[]> {
    const [fuel, expenses] = await Promise.all([this.listFuelPurchases(), this.listExpenseEntries()]);
    return this.domain.calculateDailyExpenses(fuel.map(item => item.data), expenses.map(item => item.data));
  }

  async listFuelIntervalOutputs(): Promise<readonly FuelIntervalV1[]> {
    const fuel = await this.listFuelPurchases();
    return this.domain.calculateFuelIntervals(fuel.map(item => item.data));
  }

  async correctSource(input: Readonly<{
    correctionId: string;
    targetRecordId: string;
    fieldPath: string;
    afterValue: import("../../domain/src/historical-correction").CorrectionJsonValue;
    reason: string;
    businessEffectiveDate?: string;
  }>) {
    if (!this.historicalCorrections?.submit) throw new Error("business_expense_historical_correction_unavailable");
    const target = await this.records.get(input.targetRecordId);
    if (!target) throw new Error("historical_correction_target_unavailable");
    const corrections = await this.historicalCorrections.listForTarget(input.targetRecordId);
    return this.historicalCorrections.submit({
      correctionId: input.correctionId,
      targetRecordId: input.targetRecordId,
      expectedTargetRevision: target.revision,
      expectedChainRevision: corrections.length,
      fieldPath: input.fieldPath,
      afterValue: input.afterValue,
      reason: input.reason,
      ...(input.businessEffectiveDate ? { businessEffectiveDate: input.businessEffectiveDate } : {}),
    });
  }

  async listAll(): Promise<readonly RecordEnvelope<BusinessExpenseRecordV1>[]> {
    return Object.freeze(await this.records.list());
  }
}
