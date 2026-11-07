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
export type MaintenanceRecordV1 = MaintenanceVisitV1 | GeneralMaintenanceExpenseV1 | MaintenanceRateHistoryV1;
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

  constructor(
    repository: AtomicRecordRepository,
    validate: MaintenanceRecordValidator,
    private readonly vehicles: MaintenanceVehicleDirectory,
    private readonly calculateVisitTotal: MaintenanceVisitTotalCalculator,
    private readonly businessDateFromInstant: MaintenanceBusinessDateResolver,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
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

  async editVisit(input: {
    id: string; expectedRevision: number; data: MaintenanceVisitInput;
  }): Promise<RecordEnvelope<MaintenanceVisitV1>> {
    const current = await this.records.get(input.id);
    if (!current || current.data.kind !== "visit") throw new Error("maintenance_visit_not_found");
    if (current.data.vehicleId !== input.data.vehicleId) throw new Error("maintenance_vehicle_identity_immutable");
    await this.requireVehicle(input.data.vehicleId);
    const data: MaintenanceVisitV1 = {
      ...input.data, schemaVersion: 1, kind: "visit",
      totalPaise: this.calculateVisitTotal(input.data.items),
    };
    if (data.nextServiceDate && data.nextServiceDate < data.maintenanceDate) {
      throw new Error("maintenance_next_service_date_before_visit");
    }
    return this.records.update({ id: input.id, expectedRevision: input.expectedRevision, data }) as Promise<RecordEnvelope<MaintenanceVisitV1>>;
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

  async editExpense(input: {
    id: string; expectedRevision: number; data: MaintenanceExpenseInput;
  }): Promise<RecordEnvelope<GeneralMaintenanceExpenseV1>> {
    const current = await this.records.get(input.id);
    if (!current || current.data.kind !== "expense") throw new Error("maintenance_expense_not_found");
    if (current.data.vehicleId !== input.data.vehicleId) throw new Error("maintenance_vehicle_identity_immutable");
    await this.requireVehicle(input.data.vehicleId);
    const data: GeneralMaintenanceExpenseV1 = { ...input.data, schemaVersion: 1, kind: "expense" };
    return this.records.update({ id: input.id, expectedRevision: input.expectedRevision, data }) as Promise<RecordEnvelope<GeneralMaintenanceExpenseV1>>;
  }

  async getRateHistory(vehicleId: string): Promise<{
    record?: RecordEnvelope<MaintenanceRateHistoryV1>;
    entries: readonly MaintenanceRateHistoryEntry[];
  }> {
    const vehicle = await this.requireVehicle(vehicleId);
    const id = rateHistoryId(vehicleId);
    const record = await this.records.get(id);
    if (record && (record.data.kind !== "rate_history" || record.data.vehicleId !== vehicleId)) {
      throw new Error("maintenance_rate_history_identity_mismatch");
    }
    const entries = record
      ? record.data.entries
      : [{
          effectiveFrom: this.businessDateFromInstant(vehicle.createdAt),
          ratePaisePerKm: DEFAULT_RATE,
          savedAt: vehicle.createdAt,
          isDefault: true,
        }];
    return { record: record as RecordEnvelope<MaintenanceRateHistoryV1> | undefined, entries };
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
        current.data.entries.some(entry => entry.commandId === input.commandId.toLowerCase())) {
      return current as RecordEnvelope<MaintenanceRateHistoryV1>;
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

  async listVehicleRecords(vehicleId: string): Promise<{
    visits: readonly RecordEnvelope<MaintenanceVisitV1>[];
    expenses: readonly RecordEnvelope<GeneralMaintenanceExpenseV1>[];
    rateHistory: readonly MaintenanceRateHistoryEntry[];
  }> {
    await this.requireVehicle(vehicleId);
    const records = await this.records.list();
    const owned = records.filter(record => record.data.vehicleId === vehicleId);
    const visits = owned.filter(record => record.data.kind === "visit") as RecordEnvelope<MaintenanceVisitV1>[];
    const expenses = owned.filter(record => record.data.kind === "expense") as RecordEnvelope<GeneralMaintenanceExpenseV1>[];
    const rate = await this.getRateHistory(vehicleId);
    return {
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
