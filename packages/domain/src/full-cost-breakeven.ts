/**
 * Full-cost breakeven calculation v1.
 *
 * Pure calculation layer: source adapters must supply authoritative, versioned
 * daily activity and time-based allocations. This module never mutates sources.
 */
export const FULL_COST_BREAKEVEN_ID = "performance.full-cost-breakeven.v1" as const;
export const FULL_COST_BREAKEVEN_VERSION = 1 as const;

export type BreakevenCostKindV1 =
  | "fuel" | "maintenance" | "platform-fee" | "traffic-challan"
  | "miscellaneous" | "compliance" | "emi";

export type BreakevenDailyCostV1 = Readonly<{
  date: string;
  amountPaise: number;
  kind: Exclude<BreakevenCostKindV1, "fuel" | "maintenance">;
  sourceId: string;
  sourceRevision: number;
  scheduleVersion?: number;
}>;

export type BreakevenDailyActivityV1 = Readonly<{
  date: string;
  businessKm: number;
  fuelCostPaisePerKm?: Readonly<{ numerator: string; denominator: string }>;
  maintenanceRatePaisePerKm?: number;
  fuelCostPaise?: number;
  maintenanceCostPaise?: number;
  sourceRefs?: readonly Readonly<{ sourceId: string; revision: number }>[];
  distanceSourceId: string;
  distanceSourceRevision: number;
}>;

export type BreakevenCompletenessV1 = Readonly<{
  source: string;
  status: "complete" | "incomplete" | "unavailable" | "review-required";
  detail?: string;
}>;

export type BreakevenInputV1 = Readonly<{
  from: string;
  to: string;
  dailyActivity: readonly BreakevenDailyActivityV1[];
  datedCosts: readonly BreakevenDailyCostV1[];
  completeness: readonly BreakevenCompletenessV1[];
}>;

export type BreakevenDailyResultV1 = Readonly<{
  date: string;
  totalCostPaise: number;
  costs: Readonly<Record<BreakevenCostKindV1, number>>;
  businessKm: number;
  complete: boolean;
}>;

export type BreakevenPeriodResultV1 = Readonly<{
  from: string;
  to: string;
  totalCostPaise: number;
  daily: readonly BreakevenDailyResultV1[];
  weekly: readonly Readonly<{ week: string; from: string; to: string; totalCostPaise: number }>[];
  monthly: readonly Readonly<{ month: string; totalCostPaise: number }>[];
  yearly: readonly Readonly<{ year: string; totalCostPaise: number }>[];
  calculationId: typeof FULL_COST_BREAKEVEN_ID;
  calculationVersion: typeof FULL_COST_BREAKEVEN_VERSION;
  provenance: Readonly<{
    sourceIds: readonly string[];
    sourceRevisions: readonly Readonly<{ sourceId: string; revision: number; scheduleVersion?: number }>[];
    completeness: readonly BreakevenCompletenessV1[];
  }>;
}>;

const DAY_MS = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS: readonly BreakevenCostKindV1[] = Object.freeze([
  "fuel", "maintenance", "platform-fee", "traffic-challan", "miscellaneous", "compliance", "emi",
]);
function assertDate(value: string): void {
  if (!DATE.test(value) || !Number.isFinite(Date.parse(value + "T00:00:00Z")) ||
      new Date(Date.parse(value + "T00:00:00Z")).toISOString().slice(0,10) !== value) {
    throw new Error("breakeven_date_invalid");
  }
}
function days(from: string, to: string): string[] {
  assertDate(from); assertDate(to);
  const start = Date.parse(from + "T00:00:00Z"), end = Date.parse(to + "T00:00:00Z");
  if (end < start) throw new Error("breakeven_period_invalid");
  const count = (end - start) / DAY_MS + 1;
  if (!Number.isSafeInteger(count) || count > 36600) throw new Error("breakeven_period_too_large");
  return Array.from({ length: count }, (_, i) => new Date(start + i * DAY_MS).toISOString().slice(0,10));
}
function paise(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("breakeven_amount_invalid");
}
function safeAdd(a: number, b: number): number {
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) throw new Error("breakeven_amount_overflow");
  return sum;
}
function ratioCost(km: number, ratio?: Readonly<{ numerator: string; denominator: string }>): number {
  if (ratio === undefined) throw new Error("breakeven_fuel_rate_unavailable");
  if (!Number.isSafeInteger(km) || km < 0) throw new Error("breakeven_business_km_invalid");
  let numerator: bigint, denominator: bigint;
  try { numerator = BigInt(ratio.numerator); denominator = BigInt(ratio.denominator); }
  catch { throw new Error("breakeven_fuel_rate_invalid"); }
  if (numerator < 0n || denominator <= 0n) throw new Error("breakeven_fuel_rate_invalid");
  // Deterministic half-up paise rounding.
  const result = (BigInt(km) * numerator * 2n + denominator) / (2n * denominator);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("breakeven_amount_overflow");
  return Number(result);
}

/** Calculates a date-inclusive period; all summaries are sums of canonical daily rows. */
export function calculateFullCostBreakevenV1(input: BreakevenInputV1): BreakevenPeriodResultV1 {
  const periodDays = days(input.from, input.to);
  const activityByDate = new Map<string, BreakevenDailyActivityV1>();
  for (const item of input.dailyActivity) {
    assertDate(item.date);
    if (activityByDate.has(item.date) || !Number.isSafeInteger(item.businessKm) || item.businessKm < 0 ||
        !item.distanceSourceId.trim() || !Number.isSafeInteger(item.distanceSourceRevision) || item.distanceSourceRevision < 1) {
      throw new Error("breakeven_activity_source_invalid");
    }
    activityByDate.set(item.date, item);
  }
  const costsByDate = new Map<string, BreakevenDailyCostV1[]>();
  for (const item of input.datedCosts) {
    assertDate(item.date); paise(item.amountPaise);
    if (!item.sourceId.trim() || !Number.isSafeInteger(item.sourceRevision) || item.sourceRevision < 1 ||
        (item.scheduleVersion !== undefined && (!Number.isSafeInteger(item.scheduleVersion) || item.scheduleVersion < 1))) {
      throw new Error("breakeven_cost_source_invalid");
    }
    const bucket = costsByDate.get(item.date) ?? [];
    bucket.push(item); costsByDate.set(item.date, bucket);
  }
  const daily: BreakevenDailyResultV1[] = periodDays.map(date => {
    const totals = Object.fromEntries(KINDS.map(kind => [kind, 0])) as Record<BreakevenCostKindV1, number>;
    const activity = activityByDate.get(date);
    let businessKm = activity?.businessKm ?? 0;
    if (activity) {
      if (businessKm > 0) {
        totals.fuel = activity.fuelCostPaise === undefined
          ? ratioCost(businessKm, activity.fuelCostPaisePerKm) : activity.fuelCostPaise;
        if (activity.maintenanceCostPaise !== undefined) {
          paise(activity.maintenanceCostPaise);
          totals.maintenance = activity.maintenanceCostPaise;
        } else {
          if (activity.maintenanceRatePaisePerKm === undefined) throw new Error("breakeven_maintenance_rate_unavailable");
          paise(activity.maintenanceRatePaisePerKm);
          totals.maintenance = safeAdd(0, businessKm * activity.maintenanceRatePaisePerKm);
          if (!Number.isSafeInteger(totals.maintenance)) throw new Error("breakeven_amount_overflow");
        }
        paise(totals.fuel);
      }
    }
    for (const cost of costsByDate.get(date) ?? []) totals[cost.kind] = safeAdd(totals[cost.kind], cost.amountPaise);
    const totalCostPaise = KINDS.reduce((sum, kind) => safeAdd(sum, totals[kind]), 0);
    const complete = input.completeness.every(item => item.status === "complete");
    return Object.freeze({ date, totalCostPaise, costs: Object.freeze(totals), businessKm, complete });
  });
  const weekly = new Map<string, { from: string; to: string; totalCostPaise: number }>();
  const monthly = new Map<string, number>(), yearly = new Map<string, number>();
  for (const row of daily) {
    const day = new Date(row.date + "T00:00:00Z");
    const weekday = day.getUTCDay() || 7;
    day.setUTCDate(day.getUTCDate() + 4 - weekday);
    const weekYear = day.getUTCFullYear();
    const yearStart = new Date(Date.UTC(weekYear, 0, 1));
    const weekNumber = Math.ceil((((day.getTime() - yearStart.getTime()) / DAY_MS) + 1) / 7);
    const week = `${weekYear}-W${String(weekNumber).padStart(2, "0")}`;
    const weeklyBucket = weekly.get(week) ?? { from: row.date, to: row.date, totalCostPaise: 0 };
    weeklyBucket.from = weeklyBucket.from < row.date ? weeklyBucket.from : row.date;
    weeklyBucket.to = weeklyBucket.to > row.date ? weeklyBucket.to : row.date;
    weeklyBucket.totalCostPaise = safeAdd(weeklyBucket.totalCostPaise, row.totalCostPaise);
    weekly.set(week, weeklyBucket);
    const month = row.date.slice(0,7), year = row.date.slice(0,4);
    monthly.set(month, safeAdd(monthly.get(month) ?? 0, row.totalCostPaise));
    yearly.set(year, safeAdd(yearly.get(year) ?? 0, row.totalCostPaise));
  }
  const sourceRevisions = [
    ...input.dailyActivity.flatMap(item => item.sourceRefs?.length
      ? item.sourceRefs.map(ref => ({ sourceId: ref.sourceId, revision: ref.revision }))
      : [{ sourceId: item.distanceSourceId, revision: item.distanceSourceRevision }]),
    ...input.datedCosts.map(item => ({ sourceId: item.sourceId, revision: item.sourceRevision,
      ...(item.scheduleVersion !== undefined ? { scheduleVersion: item.scheduleVersion } : {}) })),
  ].sort((a,b) => a.sourceId.localeCompare(b.sourceId) || a.revision - b.revision);
  return Object.freeze({
    from: input.from, to: input.to,
    totalCostPaise: daily.reduce((sum, row) => safeAdd(sum, row.totalCostPaise), 0),
    daily: Object.freeze(daily),
    weekly: Object.freeze([...weekly].sort(([a],[b]) => a.localeCompare(b)).map(([week,value]) => Object.freeze({week,...value}))),
    monthly: Object.freeze([...monthly].sort(([a],[b]) => a.localeCompare(b)).map(([month,totalCostPaise]) => Object.freeze({month,totalCostPaise}))),
    yearly: Object.freeze([...yearly].sort(([a],[b]) => a.localeCompare(b)).map(([year,totalCostPaise]) => Object.freeze({year,totalCostPaise}))),
    calculationId: FULL_COST_BREAKEVEN_ID,
    calculationVersion: FULL_COST_BREAKEVEN_VERSION,
    provenance: Object.freeze({
      sourceIds: Object.freeze([...new Set(sourceRevisions.map(item => item.sourceId))].sort()),
      sourceRevisions: Object.freeze(sourceRevisions),
      completeness: Object.freeze(input.completeness.map(item => Object.freeze({...item}))),
    }),
  });
}
