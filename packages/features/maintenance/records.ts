/** Maintenance v1 records are vehicle-scoped and owned by the Maintenance capability. */
export type MaintenanceExpenseItemV1 = Readonly<{
  id: string;
  description: string;
  amountPaise: number;
}>;

export type MaintenanceVisitV1 = Readonly<{
  schemaVersion: 1;
  kind: "visit";
  vehicleId: string;
  maintenanceDate: string;
  maintenanceType: string;
  description: string;
  items: readonly MaintenanceExpenseItemV1[];
  totalPaise: number;
  odometerKm?: number;
  provider?: string;
  nextServiceDate?: string;
  nextServiceKm?: number;
}>;

export type GeneralMaintenanceExpenseV1 = Readonly<{
  schemaVersion: 1;
  kind: "expense";
  vehicleId: string;
  expenseDate: string;
  expenseName: string;
  description: string;
  amountPaise: number;
  odometerKm?: number;
  provider?: string;
}>;

export type MaintenanceRateEntryV1 = Readonly<{
  effectiveFrom: string;
  ratePaisePerKm: number;
  savedAt: string;
  isDefault: boolean;
  commandId?: string;
  source?: "web" | "android" | "import" | "integration";
}>;

export type MaintenanceRateHistoryV1 = Readonly<{
  schemaVersion: 1;
  kind: "rate_history";
  vehicleId: string;
  entries: readonly MaintenanceRateEntryV1[];
}>;

export type MaintenanceDailyAccrualV1 = Readonly<{
  schemaVersion: 1;
  kind: "daily_accrual";
  vehicleId: string;
  operationalDate: string;
  dailyBusinessKmRecordId: string;
  dailyBusinessKmRevision: number;
  businessKm: number;
  rateEffectiveFrom: string;
  ratePaisePerKm: number;
  amountPaise: number;
}>;

export type MaintenanceRecordV1 =
  | MaintenanceVisitV1
  | GeneralMaintenanceExpenseV1
  | MaintenanceRateHistoryV1
  | MaintenanceDailyAccrualV1;

export const MAINTENANCE_RECORD_ID_PREFIX = "feature:maintenance:";
export const MAINTENANCE_VISIT_ID_PREFIX = MAINTENANCE_RECORD_ID_PREFIX + "visit:";
export const MAINTENANCE_EXPENSE_ID_PREFIX = MAINTENANCE_RECORD_ID_PREFIX + "expense:";
export const MAINTENANCE_RATE_ID_PREFIX = MAINTENANCE_RECORD_ID_PREFIX + "rate:";
export const MAINTENANCE_DAILY_ACCRUAL_ID_PREFIX = MAINTENANCE_RECORD_ID_PREFIX + "daily-accrual:";
export const DEFAULT_MAINTENANCE_RATE_PAISE_PER_KM = 250;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VEHICLE_ID = /^feature:vehicle:[^\s:]+$/;

export function maintenanceRecordId(kind: "visit" | "expense", uuid: string): string {
  if (typeof uuid !== "string" || !UUID.test(uuid)) throw new Error("maintenance_record_uuid_invalid");
  const prefix = kind === "visit" ? MAINTENANCE_VISIT_ID_PREFIX : MAINTENANCE_EXPENSE_ID_PREFIX;
  return prefix + uuid.toLowerCase();
}

export function maintenanceRateHistoryRecordId(vehicleId: string): string {
  if (typeof vehicleId !== "string" || !VEHICLE_ID.test(vehicleId)) {
    throw new Error("maintenance_vehicle_identity_invalid");
  }
  return MAINTENANCE_RATE_ID_PREFIX + encodeURIComponent(vehicleId);
}

export function assertMaintenanceRecordIdentity(id: string): void {
  if (typeof id !== "string") throw new Error("maintenance_record_identity_invalid");
  const match = /^(feature:maintenance:(?:visit|expense):)(.+)$/.exec(id);
  if (match) {
    if (!UUID.test(match[2]) || id !== match[1] + match[2].toLowerCase()) {
      throw new Error("maintenance_record_identity_invalid");
    }
    return;
  }
  if (id.startsWith(MAINTENANCE_DAILY_ACCRUAL_ID_PREFIX)) {
    const suffix = id.slice(MAINTENANCE_DAILY_ACCRUAL_ID_PREFIX.length);
    const split = suffix.lastIndexOf(":");
    if (split < 1) throw new Error("maintenance_record_identity_invalid");
    try {
      const vehicleId = decodeURIComponent(suffix.slice(0, split));
      const date = suffix.slice(split + 1);
      if (encodeURIComponent(vehicleId) !== suffix.slice(0, split) || !VEHICLE_ID.test(vehicleId) || !isMaintenanceDate(date)) throw new Error();
      return;
    } catch { throw new Error("maintenance_record_identity_invalid"); }
  }
  if (id.startsWith(MAINTENANCE_RATE_ID_PREFIX)) {
    try {
      const vehicleId = decodeURIComponent(id.slice(MAINTENANCE_RATE_ID_PREFIX.length));
      if (encodeURIComponent(vehicleId) !== id.slice(MAINTENANCE_RATE_ID_PREFIX.length) ||
          !VEHICLE_ID.test(vehicleId)) throw new Error();
      return;
    } catch {
      throw new Error("maintenance_record_identity_invalid");
    }
  }
  throw new Error("maintenance_record_identity_invalid");
}

export function isMaintenanceDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function validMoney(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
function validOptionalNumber(value: unknown): boolean {
  return value === undefined || (Number.isSafeInteger(value) && (value as number) >= 0);
}
function validOptionalText(value: unknown): boolean {
  return value === undefined || (typeof value === "string" && value.trim().length > 0);
}
function hasExactKeys(record: Record<string, unknown>, required: readonly string[], optional: readonly string[]) {
  const keys = Object.keys(record);
  const allowed = new Set([...required, ...optional]);
  return required.every(key => Object.prototype.hasOwnProperty.call(record, key)) &&
    keys.every(key => allowed.has(key));
}

export function calculateMaintenanceVisitTotal(items: readonly MaintenanceExpenseItemV1[]): number {
  if (!Array.isArray(items) || items.length === 0) throw new Error("maintenance_visit_items_required");
  const total = items.reduce((sum, item) => {
    if (!item || typeof item !== "object" || !UUID.test(item.id) ||
        typeof item.description !== "string" || !item.description.trim() ||
        !validMoney(item.amountPaise)) throw new Error("maintenance_visit_item_invalid");
    const next = sum + item.amountPaise;
    if (!Number.isSafeInteger(next)) throw new Error("maintenance_visit_total_out_of_range");
    return next;
  }, 0);
  if (new Set(items.map(item => item.id.toLowerCase())).size !== items.length) {
    throw new Error("maintenance_visit_duplicate_item_id");
  }
  return total;
}

/** Strict discriminated payload validator used by application, backup and restore. */
export function assertMaintenanceRecordV1(value: unknown): asserts value is MaintenanceRecordV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("maintenance_record_invalid");
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1 || typeof record.kind !== "string" ||
      typeof record.vehicleId !== "string" || !VEHICLE_ID.test(record.vehicleId)) {
    throw new Error("maintenance_record_invalid");
  }

  if (record.kind === "visit") {
    const required = ["schemaVersion", "kind", "vehicleId", "maintenanceDate", "maintenanceType", "description", "items", "totalPaise"];
    const optional = ["odometerKm", "provider", "nextServiceDate", "nextServiceKm"];
    if (!hasExactKeys(record, required, optional) ||
        !isMaintenanceDate(record.maintenanceDate) ||
        typeof record.maintenanceType !== "string" || !record.maintenanceType.trim() ||
        typeof record.description !== "string" || !record.description.trim() ||
        !Array.isArray(record.items) || !validMoney(record.totalPaise) ||
        !validOptionalNumber(record.odometerKm) || !validOptionalText(record.provider) ||
        (record.nextServiceDate !== undefined && !isMaintenanceDate(record.nextServiceDate)) ||
        !validOptionalNumber(record.nextServiceKm) ||
        (record.nextServiceDate !== undefined && record.nextServiceDate < record.maintenanceDate)) {
      throw new Error("maintenance_visit_invalid");
    }
    if (calculateMaintenanceVisitTotal(record.items as MaintenanceExpenseItemV1[]) !== record.totalPaise) {
      throw new Error("maintenance_visit_total_mismatch");
    }
    return;
  }

  if (record.kind === "expense") {
    const required = ["schemaVersion", "kind", "vehicleId", "expenseDate", "expenseName", "description", "amountPaise"];
    const optional = ["odometerKm", "provider"];
    if (!hasExactKeys(record, required, optional) ||
        !isMaintenanceDate(record.expenseDate) ||
        typeof record.expenseName !== "string" || !record.expenseName.trim() ||
        typeof record.description !== "string" || !record.description.trim() ||
        !validMoney(record.amountPaise) ||
        !validOptionalNumber(record.odometerKm) || !validOptionalText(record.provider)) {
      throw new Error("maintenance_expense_invalid");
    }
    return;
  }

  if (record.kind === "rate_history") {
    if (!hasExactKeys(record, ["schemaVersion", "kind", "vehicleId", "entries"], []) ||
        !Array.isArray(record.entries) || record.entries.length === 0) {
      throw new Error("maintenance_rate_history_invalid");
    }
    const entries = record.entries as unknown[];
    let previousDate = "";
    let previousSavedAt = "";
    const commandIds = new Set<string>();
    entries.forEach((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error("maintenance_rate_entry_invalid");
      }
      const item = entry as Record<string, unknown>;
      const required = ["effectiveFrom", "ratePaisePerKm", "savedAt", "isDefault"];
      const optional = ["commandId", "source"];
      if (!hasExactKeys(item, required, optional) ||
          !isMaintenanceDate(item.effectiveFrom) || !validMoney(item.ratePaisePerKm) ||
          typeof item.savedAt !== "string" || !Number.isFinite(Date.parse(item.savedAt)) ||
          typeof item.isDefault !== "boolean" ||
          (item.source !== undefined && !["web", "android", "import", "integration"].includes(String(item.source)))) {
        throw new Error("maintenance_rate_entry_invalid");
      }
      if (index === 0) {
        if (item.isDefault !== true || item.ratePaisePerKm !== DEFAULT_MAINTENANCE_RATE_PAISE_PER_KM ||
            item.source !== undefined || item.commandId !== undefined) throw new Error("maintenance_default_rate_invalid");
      } else if (item.isDefault !== false || item.source === undefined ||
          typeof item.commandId !== "string" || !UUID.test(item.commandId)) {
        throw new Error("maintenance_rate_entry_invalid");
      }
      if (item.commandId !== undefined) {
        const commandId = String(item.commandId).toLowerCase();
        if (commandIds.has(commandId)) throw new Error("maintenance_rate_duplicate_command");
        commandIds.add(commandId);
      }
      const effectiveFrom = item.effectiveFrom as string;
      const savedAt = item.savedAt as string;
      if (effectiveFrom < previousDate ||
          (effectiveFrom === previousDate && savedAt < previousSavedAt)) {
        throw new Error("maintenance_rate_history_order_invalid");
      }
      previousDate = effectiveFrom;
      previousSavedAt = savedAt;
    });
    return;
  }

  if (record.kind === "daily_accrual") {
    if (!hasExactKeys(record, ["schemaVersion", "kind", "vehicleId", "operationalDate", "dailyBusinessKmRecordId", "dailyBusinessKmRevision", "businessKm", "rateEffectiveFrom", "ratePaisePerKm", "amountPaise"], []) ||
        !isMaintenanceDate(record.operationalDate) || !isMaintenanceDate(record.rateEffectiveFrom) ||
        typeof record.dailyBusinessKmRecordId !== "string" || !record.dailyBusinessKmRecordId.startsWith("work:daily-business-km:") ||
        !Number.isSafeInteger(record.dailyBusinessKmRevision) || (record.dailyBusinessKmRevision as number) < 1 ||
        !Number.isSafeInteger(record.businessKm) || (record.businessKm as number) < 0 ||
        !validMoney(record.ratePaisePerKm) || !validMoney(record.amountPaise) ||
        !Number.isSafeInteger((record.businessKm as number) * (record.ratePaisePerKm as number)) ||
        (record.businessKm as number) * (record.ratePaisePerKm as number) !== record.amountPaise) {
      throw new Error("maintenance_daily_accrual_invalid");
    }
    return;
  }

  throw new Error("maintenance_record_kind_invalid");
}
