import type { AtomicRecordRepository } from "../../core/src/repositories";
import type { RecordEnvelope } from "../../core/src/types";
import { FeatureRecordService, type FeatureRecordSource } from "./feature-record-service";

export type MaintenanceExpenseItemV1 = Readonly<{ id: string; description: string; amountPaise: number }>;
export type MaintenanceVisitV1 = Readonly<{
  schemaVersion: 1; kind: "visit"; vehicleId: string; maintenanceDate: string;
  maintenanceType: string; description: string; items: readonly MaintenanceExpenseItemV1[];
  totalPaise: number; odometerKm?: number; provider?: string;
  nextServiceDate?: string; nextServiceKm?: number;
}>;
export type GeneralMaintenanceExpenseV1 = Readonly<{
  schemaVersion: 1; kind: "expense"; vehicleId: string; expenseDate: string;
  expenseName: string; description: string; amountPaise: number;
  odometerKm?: number; provider?: string;
}>;
export type MaintenanceRateEntryV1 = Readonly<{
  effectiveFrom: string; ratePaisePerKm: number; savedAt: string; isDefault: boolean;
  commandId?: string; source?: "web" | "android" | "import" | "integration";
}>;
export type MaintenanceRateHistoryV1 = Readonly<{
  schemaVersion: 1; kind: "rate_history"; vehicleId: string; entries: readonly MaintenanceRateEntryV1[];
}>;
export type MaintenanceDailyAccrualV1 = Readonly<{
  schemaVersion: 1; kind: "daily_accrual"; vehicleId: string; operationalDate: string;
  dailyBusinessKmRecordId: string; dailyBusinessKmRevision: number; businessKm: number;
  /** Personal kilometres are separate from business maintenance amount. */ personalKm?: number; personalAmountPaise?: number;
  rateEffectiveFrom: string; ratePaisePerKm: number; amountPaise: number;
}>;
export type MaintenanceRecordV1 = MaintenanceVisitV1 | GeneralMaintenanceExpenseV1 | MaintenanceRateHistoryV1 | MaintenanceDailyAccrualV1;
export type MaintenanceRecordValidator = (value: unknown) => asserts value is MaintenanceRecordV1;
export type MaintenanceVehicleDirectory = {
  getById(id: string): Promise<RecordEnvelope<{ lifecycleState: string }> | undefined>;
};
export type MaintenanceVisitTotalCalculator = (items: readonly MaintenanceExpenseItemV1[]) => number;
export type MaintenanceBusinessDateResolver = (instant: string) => string;
export type MaintenanceVisitInput = Omit<MaintenanceVisitV1, "schemaVersion" | "kind" | "totalPaise">;
export type MaintenanceExpenseInput = Omit<GeneralMaintenanceExpenseV1, "schemaVersion" | "kind">;
export type MaintenanceRateHistoryEntry = MaintenanceRateEntryV1;

const PREFIX = "feature:maintenance:";
const VISIT_PREFIX = PREFIX + "visit:";
const EXPENSE_PREFIX = PREFIX + "expense:";
const RATE_PREFIX = PREFIX + "rate:";
const DEFAULT_RATE = 250;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function recordId(kind: "visit" | "expense", uuid: string): string {
  if (typeof uuid !== "string" || !UUID.test(uuid)) throw new Error("maintenance_record_uuid_invalid");
  return (kind === "visit" ? VISIT_PREFIX : EXPENSE_PREFIX) + uuid.toLowerCase();
}
function rateHistoryId(vehicleId: string): string {
  if (typeof vehicleId !== "string" || !vehicleId.startsWith("feature:vehicle:")) {
    throw new Error("maintenance_vehicle_identity_invalid");
  }
  return RATE_PREFIX + encodeURIComponent(vehicleId);
}
function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

/** Maintenance owns actual visits/expenses and per-vehicle rate history. */
export class MaintenanceService {
  private readonly records: FeatureRecordService<MaintenanceRecordV1>;
  private readonly repository: AtomicRecordRepository;

  constructor(
    repository: AtomicRecordRepository,
    validate: MaintenanceRecordValidator,
    private readonly vehicles: MaintenanceVehicleDirectory,
    private readonly calculateVisitTotal: MaintenanceVisitTotalCalculator,
    private readonly businessDateFromInstant: MaintenanceBusinessDateResolver,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.repository = repository;
    this.records = new FeatureRecordService(repository, {
      featureId: "maintenance",
      recordIdPrefix: PREFIX,
      validate,
    }, now);
  }

  private async requireVehicle(vehicleId: string): Promise<RecordEnvelope<{ lifecycleState: string }>> {
    const vehicle = await this.vehicles.getById(vehicleId);
    if (!vehicle) throw new Error("maintenance_vehicle_not_found");
    return vehicle;
  }

  async createVisit(input: {
    uuid: string; data: MaintenanceVisitInput; source: FeatureRecordSource;
  }): Promise<RecordEnvelope<MaintenanceVisitV1>> {
    await this.requireVehicle(input.data.vehicleId);
    const data: MaintenanceVisitV1 = {
      ...input.data, schemaVersion: 1, kind: "visit",
      totalPaise: this.calculateVisitTotal(input.data.items),
    };
    if (data.nextServiceDate && data.nextServiceDate < data.maintenanceDate) {
      throw new Error("maintenance_next_service_date_before_visit");
    }
    return this.records.create({
      id: recordId("visit", input.uuid), data, source: input.source,
      businessDate: data.maintenanceDate,
    }) as Promise<RecordEnvelope<MaintenanceVisitV1>>;
  }

  async createExpense(input: {
    uuid: string; data: MaintenanceExpenseInput; source: FeatureRecordSource;
  }): Promise<RecordEnvelope<GeneralMaintenanceExpenseV1>> {
    await this.requireVehicle(input.data.vehicleId);
    const data: GeneralMaintenanceExpenseV1 = { ...input.data, schemaVersion: 1, kind: "expense" };
    return this.records.create({
      id: recordId("expense", input.uuid), data, source: input.source,
      businessDate: data.expenseDate,
    }) as Promise<RecordEnvelope<GeneralMaintenanceExpenseV1>>;
  }

  async getRateHistory(vehicleId: string): Promise<{
    record?: RecordEnvelope<MaintenanceRateHistoryV1>;
    entries: readonly MaintenanceRateHistoryEntry[];
  }> {
    const vehicle = await this.requireVehicle(vehicleId);
    const id = rateHistoryId(vehicleId);
    const storedRecord = await this.records.get(id);
    let record: RecordEnvelope<MaintenanceRateHistoryV1> | undefined;
    if (storedRecord) {
      if (storedRecord.data.kind !== "rate_history" || storedRecord.data.vehicleId !== vehicleId) {
        throw new Error("maintenance_rate_history_identity_mismatch");
      }
      record = storedRecord as RecordEnvelope<MaintenanceRateHistoryV1>;
    }
    const defaultEffectiveDate = this.businessDateFromInstant(vehicle.createdAt);
    if (record && (record.data.entries[0].effectiveFrom !== defaultEffectiveDate ||
        record.data.entries[0].savedAt !== vehicle.createdAt)) {
      throw new Error("maintenance_default_rate_effective_date_mismatch");
    }
    const entries = record
      ? record.data.entries
      : [{
          effectiveFrom: this.businessDateFromInstant(vehicle.createdAt),
          ratePaisePerKm: DEFAULT_RATE,
          savedAt: vehicle.createdAt,
          isDefault: true,
        }];
    return { record, entries };
  }

  async setRate(input: {
    vehicleId: string; ratePaisePerKm: number; commandId: string; source: FeatureRecordSource;
  }): Promise<RecordEnvelope<MaintenanceRateHistoryV1>> {
    const vehicle = await this.requireVehicle(input.vehicleId);
    if (!Number.isSafeInteger(input.ratePaisePerKm) || input.ratePaisePerKm < 0) {
      throw new Error("maintenance_rate_invalid");
    }
    if (!UUID.test(input.commandId)) throw new Error("maintenance_rate_command_id_invalid");
    const timestamp = this.now();
    const effectiveFrom = this.businessDateFromInstant(timestamp);
    const id = rateHistoryId(input.vehicleId);
    const current = await this.records.get(id);
    if (current && current.data.kind !== "rate_history") throw new Error("maintenance_rate_history_identity_mismatch");
    if (current?.data.kind === "rate_history" &&
        (current.data.entries[0].effectiveFrom !== this.businessDateFromInstant(vehicle.createdAt) ||
         current.data.entries[0].savedAt !== vehicle.createdAt)) {
      throw new Error("maintenance_default_rate_effective_date_mismatch");
    }
    if (current?.data.kind === "rate_history") {
      const priorCommand = current.data.entries.find(entry => entry.commandId === input.commandId.toLowerCase());
      if (priorCommand) {
        if (priorCommand.ratePaisePerKm !== input.ratePaisePerKm) {
          throw new Error("maintenance_rate_idempotency_conflict");
        }
        return current as RecordEnvelope<MaintenanceRateHistoryV1>;
      }
    }
    const baseline = {
      effectiveFrom: this.businessDateFromInstant(vehicle.createdAt),
      ratePaisePerKm: DEFAULT_RATE,
      savedAt: vehicle.createdAt,
      isDefault: true,
    } as const;
    if (effectiveFrom < baseline.effectiveFrom) throw new Error("maintenance_rate_before_vehicle_creation");
    const entries: MaintenanceRateEntryV1[] = current?.data.kind === "rate_history"
      ? [...current.data.entries]
      : [baseline];
    const last = entries[entries.length - 1];
    if (effectiveFrom < last.effectiveFrom) throw new Error("maintenance_rate_effective_date_regression");
    entries.push({
      effectiveFrom, ratePaisePerKm: input.ratePaisePerKm, savedAt: timestamp,
      isDefault: false, commandId: input.commandId.toLowerCase(), source: input.source,
    });
    const data: MaintenanceRateHistoryV1 = {
      schemaVersion: 1, kind: "rate_history", vehicleId: input.vehicleId,
      entries: Object.freeze(entries),
    };
    if (!current) {
      return this.records.create({
        id, data, source: input.source, businessDate: effectiveFrom, now: timestamp,
      }) as Promise<RecordEnvelope<MaintenanceRateHistoryV1>>;
    }
    return this.records.update({
      id, expectedRevision: current.revision, data, now: timestamp,
    }) as Promise<RecordEnvelope<MaintenanceRateHistoryV1>>;
  }

  async getRateForDate(vehicleId: string, businessDate: string): Promise<MaintenanceRateHistoryEntry> {
    if (!isValidDate(businessDate)) throw new Error("maintenance_business_date_invalid");
    const { entries } = await this.getRateHistory(vehicleId);
    const eligible = entries.filter(entry => entry.effectiveFrom <= businessDate);
    if (!eligible.length) throw new Error("maintenance_rate_not_effective");
    return eligible[eligible.length - 1];
  }


  async accrueDailyBusinessKilometres(input: { vehicleId: string; operationalDate: string; source: FeatureRecordSource }): Promise<RecordEnvelope<MaintenanceDailyAccrualV1>> {
    await this.requireVehicle(input.vehicleId);
    if (!isValidDate(input.operationalDate)) throw new Error("maintenance_business_date_invalid");
    const dailyBusinessKmRecordId = "work:daily-business-km:" + encodeURIComponent(input.vehicleId) + ":" + input.operationalDate;
    const daily = await this.repository.get<{
      schemaVersion: number; kind: string; vehicleId: string; operationalDate: string;
      entries: Array<{ businessKm: number; allocationStatus: string }>;
      totalBusinessKm: number; unallocatedBusinessKm: number;
    }>(dailyBusinessKmRecordId);
    if (!daily) throw new Error("maintenance_daily_business_km_missing");
    const source = daily.data;
    if (source.schemaVersion !== 1 || source.kind !== "daily_business_kilometres" ||
        source.vehicleId !== input.vehicleId || source.operationalDate !== input.operationalDate ||
        !Array.isArray(source.entries)) throw new Error("maintenance_daily_business_km_invalid");
    let allocatedKm = 0;
    let unallocatedKm = 0;
    for (const entry of source.entries) {
      if (!Number.isSafeInteger(entry.businessKm) || entry.businessKm < 0) throw new Error("maintenance_daily_business_km_invalid");
      if (entry.allocationStatus === "allocated") allocatedKm += entry.businessKm;
      else if (entry.allocationStatus === "awaiting_operational_boundary") unallocatedKm += entry.businessKm;
      else throw new Error("maintenance_daily_business_km_allocation_invalid");
      if (!Number.isSafeInteger(allocatedKm) || !Number.isSafeInteger(unallocatedKm)) throw new Error("maintenance_daily_business_km_total_invalid");
    }
    if (unallocatedKm !== 0 || source.unallocatedBusinessKm !== 0 || source.totalBusinessKm !== allocatedKm) {
      throw new Error("maintenance_daily_business_km_not_fully_allocated");
    }
    const rate = await this.getRateForDate(input.vehicleId, input.operationalDate);
    const id = "feature:maintenance:daily-accrual:" + encodeURIComponent(input.vehicleId) + ":" + input.operationalDate;
    const data: MaintenanceDailyAccrualV1 = {
      schemaVersion: 1, kind: "daily_accrual", vehicleId: input.vehicleId, operationalDate: input.operationalDate,
      dailyBusinessKmRecordId, dailyBusinessKmRevision: daily.revision, businessKm: allocatedKm,
      rateEffectiveFrom: rate.effectiveFrom, ratePaisePerKm: rate.ratePaisePerKm,
      amountPaise: allocatedKm * rate.ratePaisePerKm,
    };
    if (!Number.isSafeInteger(data.amountPaise)) throw new Error("maintenance_daily_accrual_amount_out_of_range");
    const existing = await this.records.get(id);
    if (existing) {
      if (JSON.stringify(existing.data) !== JSON.stringify(data)) throw new Error("maintenance_daily_accrual_immutable_conflict");
      return existing as RecordEnvelope<MaintenanceDailyAccrualV1>;
    }
    try {
      return await this.records.create({ id, data, source: input.source, businessDate: input.operationalDate }) as RecordEnvelope<MaintenanceDailyAccrualV1>;
    } catch (error) {
      const raced = await this.records.get(id);
      if (raced && JSON.stringify(raced.data) === JSON.stringify(data)) return raced as RecordEnvelope<MaintenanceDailyAccrualV1>;
      throw error;
    }
  }

  async listVehicleRecords(vehicleId: string): Promise<{
    accruals: readonly RecordEnvelope<MaintenanceDailyAccrualV1>[];
    visits: readonly RecordEnvelope<MaintenanceVisitV1>[];
    expenses: readonly RecordEnvelope<GeneralMaintenanceExpenseV1>[];
    rateHistory: readonly MaintenanceRateHistoryEntry[];
  }> {
    await this.requireVehicle(vehicleId);
    const records = await this.records.list();
    const owned = records.filter(record => record.data.vehicleId === vehicleId);
    const accruals = owned.filter(record => record.data.kind === "daily_accrual") as RecordEnvelope<MaintenanceDailyAccrualV1>[];
    const visits = owned.filter(record => record.data.kind === "visit") as RecordEnvelope<MaintenanceVisitV1>[];
    const expenses = owned.filter(record => record.data.kind === "expense") as RecordEnvelope<GeneralMaintenanceExpenseV1>[];
    const rate = await this.getRateHistory(vehicleId);
    return {
      accruals: Object.freeze(accruals.sort((a, b) => b.data.operationalDate.localeCompare(a.data.operationalDate))),
      visits: Object.freeze(visits.sort((a, b) => b.data.maintenanceDate.localeCompare(a.data.maintenanceDate))),
      expenses: Object.freeze(expenses.sort((a, b) => b.data.expenseDate.localeCompare(a.data.expenseDate))),
      rateHistory: rate.entries,
    };
  }

  async getActualExpenseTotal(vehicleId: string): Promise<number> {
    await this.requireVehicle(vehicleId);
    const records = await this.records.list();
    const owned = records.filter(record => record.data.vehicleId === vehicleId);
    return owned.reduce((total, record) => {
      const amount = record.data.kind === "visit" ? record.data.totalPaise
        : record.data.kind === "expense" ? record.data.amountPaise : 0;
      const next = total + amount;
      if (!Number.isSafeInteger(next)) throw new Error("maintenance_actual_expense_total_out_of_range");
      return next;
    }, 0);
  }

  async getServiceReminderStates(vehicleId: string, asOf: string): Promise<readonly Readonly<{
    visit: RecordEnvelope<MaintenanceVisitV1>;
    dateDue: boolean;
    kilometreStatus: "not_applicable" | "odometer_unavailable" | "not_due" | "due";
    latestOdometerKm?: number;
  }>[]> {
    await this.requireVehicle(vehicleId);
    if (!isValidDate(asOf)) throw new Error("maintenance_business_date_invalid");
    const records = await this.records.list();
    const owned = records.filter(record => record.data.vehicleId === vehicleId);
    const readings = owned.flatMap(record => {
      if (record.data.kind === "visit" && record.data.odometerKm !== undefined) {
        return [{ date: record.data.maintenanceDate, savedAt: record.updatedAt, km: record.data.odometerKm }];
      }
      if (record.data.kind === "expense" && record.data.odometerKm !== undefined) {
        return [{ date: record.data.expenseDate, savedAt: record.updatedAt, km: record.data.odometerKm }];
      }
      return [];
    }).filter(reading => reading.date <= asOf)
      .sort((a, b) => a.date.localeCompare(b.date) || a.savedAt.localeCompare(b.savedAt));
    const latest = readings[readings.length - 1];
    const states = owned.filter(record => record.data.kind === "visit" &&
      (record.data.nextServiceDate !== undefined || record.data.nextServiceKm !== undefined))
      .map(record => {
        const visit = record as RecordEnvelope<MaintenanceVisitV1>;
        const dateDue = visit.data.nextServiceDate !== undefined && visit.data.nextServiceDate <= asOf;
        const kilometreStatus = visit.data.nextServiceKm === undefined ? "not_applicable"
          : !latest ? "odometer_unavailable"
          : latest.km >= visit.data.nextServiceKm ? "due" : "not_due";
        return Object.freeze({
          visit,
          dateDue,
          kilometreStatus,
          ...(latest ? { latestOdometerKm: latest.km } : {}),
        });
      });
    return Object.freeze(states);
  }

  async getDateReminders(vehicleId: string, asOf: string): Promise<readonly RecordEnvelope<MaintenanceVisitV1>[]> {
    await this.requireVehicle(vehicleId);
    if (!isValidDate(asOf)) throw new Error("maintenance_business_date_invalid");
    const records = await this.records.list();
    return Object.freeze(records.filter(record =>
      record.data.kind === "visit" && record.data.vehicleId === vehicleId &&
      !!record.data.nextServiceDate && record.data.nextServiceDate <= asOf,
    ) as RecordEnvelope<MaintenanceVisitV1>[]);
  }
}
