/**
 * Platform-neutral business expense and CNG measurement calculations.
 *
 * Source records remain authoritative facts owned by their feature adapters.
 * This module is deliberately storage- and presentation-neutral so browser
 * IndexedDB and Android Room can call the same implementation.
 */
export type ExpenseSourceKindV1 = "fuel" | "platform_fee" | "traffic_challan" | "miscellaneous";

export type FuelLocationEvidenceV1 = Readonly<{
  latitude: number; longitude: number; accuracyMeters: number; capturedAt: string; provider: "device";
}>;

export type FuelPurchaseV1 = Readonly<{
  schemaVersion: 1;
  kind: "fuel_purchase";
  id: string;
  revision: number;
  businessDate: string;
  occurredAt: string;
  vehicleId: string;
  odometerKm: number;
  pricePaisePerKg: number;
  amountPaise: number;
  partialRefill: boolean;
  locationEvidence?: FuelLocationEvidenceV1;
}>;

export type BusinessExpenseEntryV1 = Readonly<{
  schemaVersion: 1;
  kind: "business_expense";
  id: string;
  revision: number;
  sourceKind: Exclude<ExpenseSourceKindV1, "fuel">;
  businessDate: string;
  amountPaise: number;
  currencyCode: "INR";
  effect: "charge" | "reversal";
  reversesSourceId?: string;
  vehicleId?: string;
  driverId?: string;
  category?: string;
  description?: string;
  reference?: string;
  /** True when this fee has already been deducted from the corresponding income source. */
  alreadyNettedFromIncome?: boolean;
  paymentStatus?: "unpaid" | "paid";
}>;

export type ExactRatioV1 = Readonly<{ numerator: string; denominator: string }>;

export type FuelIntervalV1 = Readonly<{
  calculationVersion: "business-expenses.fuel-interval.v1";
  status: "available" | "incomplete" | "needs_attention";
  startCheckpointId: string;
  endCheckpointId?: string;
  sourcePurchaseIds: readonly string[];
  sourceRevisions: readonly number[];
  distanceKm?: number;
  quantityMilliKg?: number;
  spendPaise?: number;
  kmPerKg?: ExactRatioV1;
  effectiveCostPaisePerKg?: ExactRatioV1;
  costPaisePerKm?: ExactRatioV1;
  issue?: "awaiting_full_checkpoint" | "odometer_not_increasing" | "ambiguous_timestamp" | "invalid_interval_sources";
}>;

export type DailyBusinessExpenseV1 = Readonly<{
  businessDate: string;
  currencyCode: "INR";
  fuelPaise: number;
  platformFeesPaise: number;
  trafficChallansPaise: number;
  miscellaneousPaise: number;
  /** Includes all source charges, including platform fees already netted from income. */
  reportedSourceExpensePaise: number;
  /** Excludes challans and fees already deducted from net income. */
  normalOperatingExpensePaise: number;
  /** Includes challans, but does not double-count fees already deducted from net income. */
  fullCostExpensePaise: number;
  sourceIds: readonly string[];
  sourceRevisions: readonly number[];
}>;

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function validInstant(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new Error("business_expense_total_overflow");
  return result;
}

function ratio(numerator: bigint, denominator: bigint): ExactRatioV1 {
  if (numerator < 0n || denominator <= 0n) throw new Error("business_expense_ratio_invalid");
  return Object.freeze({ numerator: numerator.toString(), denominator: denominator.toString() });
}

/** Half-up quantity rounding to one gram (0.001 kg); source amount/rate remain unchanged. */
export function deriveFuelQuantityMilliKg(amountPaise: number, pricePaisePerKg: number): number {
  if (!positiveInteger(amountPaise) || !positiveInteger(pricePaisePerKg)) {
    throw new Error("fuel_amount_and_price_must_be_positive_integer_paise");
  }
  const numerator = BigInt(amountPaise) * 1000n;
  const denominator = BigInt(pricePaisePerKg);
  const rounded = (numerator * 2n + denominator) / (2n * denominator);
  if (rounded <= 0n || rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("fuel_quantity_out_of_range");
  }
  return Number(rounded);
}

function validFuelLocationEvidence(value: unknown): value is FuelLocationEvidenceV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Object.keys(row).sort().join("|") === ["latitude", "longitude", "accuracyMeters", "capturedAt", "provider"].sort().join("|") &&
    typeof row.latitude === "number" && Number.isFinite(row.latitude) && row.latitude >= -90 && row.latitude <= 90 &&
    typeof row.longitude === "number" && Number.isFinite(row.longitude) && row.longitude >= -180 && row.longitude <= 180 &&
    typeof row.accuracyMeters === "number" && Number.isFinite(row.accuracyMeters) && row.accuracyMeters > 0 &&
    validInstant(row.capturedAt) && row.provider === "device";
}

export function assertFuelPurchaseV1(value: unknown): asserts value is FuelPurchaseV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("fuel_purchase_invalid");
  const row = value as Record<string, unknown>;
  const required = ["schemaVersion", "kind", "id", "revision", "businessDate", "occurredAt",
    "vehicleId", "odometerKm", "pricePaisePerKg", "amountPaise", "partialRefill"];
  const optional = ["locationEvidence"];
  if (required.some(key => !(key in row)) || Object.keys(row).some(key => !required.includes(key) && !optional.includes(key)) ||
      row.schemaVersion !== 1 || row.kind !== "fuel_purchase" ||
      typeof row.id !== "string" || !row.id.trim() ||
      !Number.isSafeInteger(row.revision) || (row.revision as number) < 1 ||
      !validDate(row.businessDate) || !validInstant(row.occurredAt) ||
      row.businessDate !== new Date(Date.parse(row.occurredAt as string) + 330 * 60_000).toISOString().slice(0, 10) ||
      typeof row.vehicleId !== "string" || !row.vehicleId.startsWith("feature:vehicle:") ||
      !Number.isSafeInteger(row.odometerKm) || (row.odometerKm as number) <= 0 ||
      !positiveInteger(row.pricePaisePerKg) || !positiveInteger(row.amountPaise) ||
      typeof row.partialRefill !== "boolean" ||
      (row.locationEvidence !== undefined && !validFuelLocationEvidence(row.locationEvidence))) {
    throw new Error("fuel_purchase_invalid");
  }
}

export function assertBusinessExpenseEntryV1(value: unknown): asserts value is BusinessExpenseEntryV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("business_expense_entry_invalid");
  const row = value as Record<string, unknown>;
  const required = ["schemaVersion", "kind", "id", "revision", "sourceKind", "businessDate",
    "amountPaise", "currencyCode", "effect"];
  const optional = ["reversesSourceId", "vehicleId", "driverId", "category", "description", "reference", "alreadyNettedFromIncome", "paymentStatus"];
  if (required.some(key => !(key in row)) ||
      Object.keys(row).some(key => !required.includes(key) && !optional.includes(key)) ||
      row.schemaVersion !== 1 || row.kind !== "business_expense" ||
      typeof row.id !== "string" || !row.id.trim() ||
      !Number.isSafeInteger(row.revision) || (row.revision as number) < 1 ||
      !["platform_fee", "traffic_challan", "miscellaneous"].includes(String(row.sourceKind)) ||
      !validDate(row.businessDate) || !positiveInteger(row.amountPaise) ||
      row.currencyCode !== "INR" || !["charge", "reversal"].includes(String(row.effect)) ||
      (row.effect === "reversal" && (typeof row.reversesSourceId !== "string" || !row.reversesSourceId.trim())) ||
      (row.effect === "charge" && row.reversesSourceId !== undefined) ||
      (row.alreadyNettedFromIncome !== undefined && typeof row.alreadyNettedFromIncome !== "boolean") ||
      (row.paymentStatus !== undefined && !["unpaid", "paid"].includes(String(row.paymentStatus))) ||
      (row.sourceKind === "traffic_challan" && row.paymentStatus === undefined) ||
      (row.sourceKind !== "traffic_challan" && row.paymentStatus !== undefined) ||
      (row.vehicleId !== undefined && (typeof row.vehicleId !== "string" || !row.vehicleId.startsWith("feature:vehicle:"))) ||
      (row.driverId !== undefined && (typeof row.driverId !== "string" || !row.driverId.startsWith("feature:driver:")))) {
    throw new Error("business_expense_entry_invalid");
  }
}

/**
 * Pairs consecutive full-tank checkpoints. Partial purchases between them and
 * the closing full refill contribute quantity and spend; the opening baseline
 * purchase does not. Invalid odometer order is withheld, never guessed.
 */
export function calculateFuelIntervals(purchases: readonly FuelPurchaseV1[]): readonly FuelIntervalV1[] {
  const ids = new Set<string>();
  for (const purchase of purchases) {
    assertFuelPurchaseV1(purchase);
    if (ids.has(purchase.id)) throw new Error("fuel_purchase_duplicate_identity");
    ids.add(purchase.id);
  }
  const ordered = [...purchases].sort((a, b) =>
    a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
  const vehicles = new Map<string, FuelPurchaseV1[]>();
  for (const purchase of ordered) {
    const group = vehicles.get(purchase.vehicleId) ?? [];
    group.push(purchase);
    vehicles.set(purchase.vehicleId, group);
  }
  const intervals: FuelIntervalV1[] = [];
  for (const vehiclePurchases of vehicles.values()) {
    const checkpoints = vehiclePurchases.filter(item => !item.partialRefill);
    for (let index = 0; index < checkpoints.length; index++) {
      const start = checkpoints[index];
      const end = checkpoints[index + 1];
      const intervalSources = vehiclePurchases.filter(item =>
        item.occurredAt > start.occurredAt && (!end || item.occurredAt <= end.occurredAt));
      const sourceIds = Object.freeze(intervalSources.map(item => item.id));
      const sourceRevisions = Object.freeze(intervalSources.map(item => item.revision));
      if (!end) {
        intervals.push(Object.freeze({
          calculationVersion: "business-expenses.fuel-interval.v1",
          status: "incomplete", startCheckpointId: start.id,
          sourcePurchaseIds: sourceIds, sourceRevisions, issue: "awaiting_full_checkpoint",
        }));
        continue;
      }
      const sameInstant = vehiclePurchases.some(item => item.id !== start.id && item.id !== end.id &&
        (item.occurredAt === start.occurredAt || item.occurredAt === end.occurredAt));
      const distance = end.odometerKm - start.odometerKm;
      if (sameInstant) {
        intervals.push(Object.freeze({ calculationVersion: "business-expenses.fuel-interval.v1",
          status: "needs_attention", startCheckpointId: start.id, endCheckpointId: end.id,
          sourcePurchaseIds: sourceIds, sourceRevisions, issue: "ambiguous_timestamp" }));
        continue;
      }
      if (distance <= 0) {
        intervals.push(Object.freeze({ calculationVersion: "business-expenses.fuel-interval.v1",
          status: "needs_attention", startCheckpointId: start.id, endCheckpointId: end.id,
          sourcePurchaseIds: sourceIds, sourceRevisions, issue: "odometer_not_increasing" }));
        continue;
      }
      if (intervalSources[intervalSources.length - 1]?.id !== end.id) {
        intervals.push(Object.freeze({ calculationVersion: "business-expenses.fuel-interval.v1",
          status: "needs_attention", startCheckpointId: start.id, endCheckpointId: end.id,
          sourcePurchaseIds: sourceIds, sourceRevisions, issue: "invalid_interval_sources" }));
        continue;
      }
      let quantity = 0n;
      let spend = 0n;
      for (const item of intervalSources) {
        quantity += BigInt(deriveFuelQuantityMilliKg(item.amountPaise, item.pricePaisePerKg));
        spend += BigInt(item.amountPaise);
      }
      if (quantity <= 0n || spend <= 0n || quantity > BigInt(Number.MAX_SAFE_INTEGER) ||
          spend > BigInt(Number.MAX_SAFE_INTEGER)) {
        intervals.push(Object.freeze({ calculationVersion: "business-expenses.fuel-interval.v1",
          status: "needs_attention", startCheckpointId: start.id, endCheckpointId: end.id,
          sourcePurchaseIds: sourceIds, sourceRevisions, issue: "invalid_interval_sources" }));
        continue;
      }
      intervals.push(Object.freeze({
        calculationVersion: "business-expenses.fuel-interval.v1",
        status: "available", startCheckpointId: start.id, endCheckpointId: end.id,
        sourcePurchaseIds: sourceIds, sourceRevisions,
        distanceKm: distance, quantityMilliKg: Number(quantity), spendPaise: Number(spend),
        kmPerKg: ratio(BigInt(distance) * 1000n, quantity),
        effectiveCostPaisePerKg: ratio(spend * 1000n, quantity),
        costPaisePerKm: ratio(spend, BigInt(distance)),
      }));
    }
  }
  return Object.freeze(intervals.sort((a, b) =>
    a.startCheckpointId.localeCompare(b.startCheckpointId) ||
    (a.endCheckpointId ?? "").localeCompare(b.endCheckpointId ?? "")));
}
/** Canonical daily expense totals; weekly/monthly rollups must sum these daily outputs. */
export function calculateDailyBusinessExpenses(
  fuelPurchases: readonly FuelPurchaseV1[],
  entries: readonly BusinessExpenseEntryV1[],
): readonly DailyBusinessExpenseV1[] {
  const daily = new Map<string, {
    fuel: number; fees: number; challans: number; miscellaneous: number;
    reported: number; normal: number; full: number; ids: string[]; revisions: number[];
  }>();
  const ensure = (date: string) => {
    let row = daily.get(date);
    if (!row) {
      row = { fuel: 0, fees: 0, challans: 0, miscellaneous: 0, reported: 0,
        normal: 0, full: 0, ids: [], revisions: [] };
      daily.set(date, row);
    }
    return row;
  };
  const seen = new Set<string>();
  for (const purchase of fuelPurchases) {
    assertFuelPurchaseV1(purchase);
    if (seen.has(purchase.id)) throw new Error("business_expense_duplicate_source_identity");
    seen.add(purchase.id);
    const row = ensure(purchase.businessDate);
    row.fuel = safeAdd(row.fuel, purchase.amountPaise);
    row.reported = safeAdd(row.reported, purchase.amountPaise);
    row.normal = safeAdd(row.normal, purchase.amountPaise);
    row.full = safeAdd(row.full, purchase.amountPaise);
    row.ids.push(purchase.id); row.revisions.push(purchase.revision);
  }
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  if (byId.size !== entries.length || entries.some(entry => seen.has(entry.id))) throw new Error("business_expense_duplicate_source_identity");
  for (const entry of entries) assertBusinessExpenseEntryV1(entry);
  for (const entry of entries) {
    const row = ensure(entry.businessDate);
    const sign = entry.effect === "reversal" ? -1 : 1;
    const amount = sign * entry.amountPaise;
    row.reported = safeAdd(row.reported, amount);
    if (entry.sourceKind === "platform_fee") {
      row.fees = safeAdd(row.fees, amount);
      if (!entry.alreadyNettedFromIncome) {
        row.normal = safeAdd(row.normal, amount);
        row.full = safeAdd(row.full, amount);
      }
    } else if (entry.sourceKind === "traffic_challan") {
      row.challans = safeAdd(row.challans, amount);
      row.full = safeAdd(row.full, amount);
    } else {
      row.miscellaneous = safeAdd(row.miscellaneous, amount);
      row.normal = safeAdd(row.normal, amount);
      row.full = safeAdd(row.full, amount);
    }
    row.ids.push(entry.id); row.revisions.push(entry.revision);
  }
  const reversedSourceIds = new Set<string>();
  for (const entry of entries.filter(item => item.effect === "reversal")) {
    const original = byId.get(entry.reversesSourceId!);
    if (reversedSourceIds.has(entry.reversesSourceId!)) throw new Error("business_expense_reversal_link_invalid");
    reversedSourceIds.add(entry.reversesSourceId!);
    if (!original || original.effect !== "charge" || original.sourceKind !== entry.sourceKind ||
        original.amountPaise !== entry.amountPaise || original.businessDate > entry.businessDate ||
        (original.alreadyNettedFromIncome ?? false) !== (entry.alreadyNettedFromIncome ?? false) ||
        original.paymentStatus !== entry.paymentStatus) {
      throw new Error("business_expense_reversal_link_invalid");
    }
  }
  return Object.freeze([...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([businessDate, row]) =>
    Object.freeze({
      businessDate, currencyCode: "INR" as const,
      fuelPaise: row.fuel, platformFeesPaise: row.fees, trafficChallansPaise: row.challans,
      miscellaneousPaise: row.miscellaneous, reportedSourceExpensePaise: row.reported,
      normalOperatingExpensePaise: row.normal, fullCostExpensePaise: row.full,
      sourceIds: Object.freeze(row.ids.map((id, index) => ({ id, revision: row.revisions[index] }))
        .sort((a, b) => a.id.localeCompare(b.id)).map(item => item.id)),
      sourceRevisions: Object.freeze(row.ids.map((id, index) => ({ id, revision: row.revisions[index] }))
        .sort((a, b) => a.id.localeCompare(b.id)).map(item => item.revision)),
    }),
  ));
}


export type BusinessExpenseRecordV1 = FuelPurchaseV1 | BusinessExpenseEntryV1;

/** Discriminated validator used at the shared record-store boundary. */
export function assertBusinessExpenseRecordV1(value: unknown): asserts value is BusinessExpenseRecordV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("business_expense_record_invalid");
  }
  const kind = (value as Record<string, unknown>).kind;
  if (kind === "fuel_purchase") assertFuelPurchaseV1(value);
  else if (kind === "business_expense") assertBusinessExpenseEntryV1(value);
  else throw new Error("business_expense_record_kind_invalid");
}
