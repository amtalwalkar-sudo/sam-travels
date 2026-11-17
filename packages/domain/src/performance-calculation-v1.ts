import {
  buildPerformancePassbookV1,
  proratedDriverTargetForRangeV1,
  type PerformancePassbookV1,
  type PerformancePassbookSourceRefV1,
} from "./performance-passbook-v1";

/**
 * Performance Calculation Contract v1.0.
 *
 * Platform-neutral calculation only. Inputs are verified, immutable source
 * projections supplied by owning application modules; no storage, UI, network,
 * or native dependencies are permitted here.
 */
export const PERFORMANCE_CALCULATION_ID_V1 = "performance.calculation.v1" as const;
export const PERFORMANCE_CALCULATION_VERSION_V1 = 1 as const;
export const PERFORMANCE_BUSINESS_DAY_BOUNDARY = "04:00" as const;
export const PRE_BUSINESS_RECOVERY_MONTHS_V1 = 18 as const;

export type PerformanceCostKindV1 =
  | "fuel" | "maintenance" | "emi" | "compliance" | "platform-fee"
  | "traffic-challan" | "toll-parking" | "miscellaneous"
  | "pre-business-manual-recovery";

export type PerformanceSourceRefV1 = Readonly<{ sourceId: string; revision: number; scheduleVersion?: number }>;
export type PerformanceDailyRevenueInputV1 = Readonly<{
  date: string;
  grossFarePaise: number;
  cancellationFeePaise: number;
  verified: boolean;
  sourceRefs: readonly PerformanceSourceRefV1[];
}>;
export type PerformanceDailyCostInputV1 = Readonly<{
  date: string;
  kind: Exclude<PerformanceCostKindV1, "pre-business-manual-recovery">;
  amountPaise: number;
  verified: boolean;
  sourceRefs: readonly PerformanceSourceRefV1[];
}>;
export type PreBusinessRecoverySourceV1 = Readonly<{
  sourceId: string;
  revision: number;
  amountPaise: number;
  note: string;
  origin: "manual";
}>;
export type PerformanceCompletenessV1 = Readonly<{
  source: string;
  status: "complete" | "incomplete" | "unavailable" | "review-required";
  detail?: string;
}>;
export type PerformanceCalculationInputV1 = Readonly<{
  businessStartDate: string;
  periodFrom: string;
  periodTo: string;
  monthlyDriverTargetPaise: number;
  revenue: readonly PerformanceDailyRevenueInputV1[];
  costs: readonly PerformanceDailyCostInputV1[];
  preBusinessRecovery: readonly PreBusinessRecoverySourceV1[];
  completeness: readonly PerformanceCompletenessV1[];
  /** Shared Business Start Date source revision identity captured for this calculation. */
  sourceSnapshotId?: string;
}>;

export type PerformanceDailyResultV1 = Readonly<{
  date: string;
  grossRevenuePaise: number;
  costs: Readonly<Record<PerformanceCostKindV1, number>>;
  totalCostPaise: number;
  profitPaise: number;
  complete: boolean;
}>;
export type PerformanceCalculationResultV1 = Readonly<{
  calculationId: typeof PERFORMANCE_CALCULATION_ID_V1;
  calculationVersion: typeof PERFORMANCE_CALCULATION_VERSION_V1;
  businessStartDate: string;
  periodFrom: string;
  periodTo: string;
  daily: readonly PerformanceDailyResultV1[];
  period: Readonly<{
    revenuePaise: number;
    costPaise: number;
    profitPaise: number;
    /** Configured Admin monthly surplus target, before date-range proration. */
    monthlyDriverTargetPaise: number;
    /** Sum of calendar-day prorated target amounts for the selected date range. */
    targetPaise: number;
  }>;
  lifetime: Readonly<{
    revenuePaise: number;
    costPaise: number;
    profitPaise: number;
    targetPaise: number;
    /** Positive is ahead; negative is a cumulative shortfall. */
    targetPositionPaise: number;
    elapsedCalendarMonths: number;
  }>;
  /** Cumulative surplus-versus-target ledger from Business Start Date through periodTo. */
  passbook: PerformancePassbookV1;
  recovery: Readonly<{
    from: string;
    toExclusive: string;
    totalPaise: number;
    daily: readonly Readonly<{ date: string; amountPaise: number; sourceId: string; revision: number; origin: "manual"; note: string }>[];
  }>;
  provenance: Readonly<{
    sourceRefs: readonly PerformanceSourceRefV1[];
    completeness: readonly PerformanceCompletenessV1[];
    sourceSnapshotId?: string;
  }>;
}>;

const DAY_MS = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COST_KINDS: readonly PerformanceCostKindV1[] = Object.freeze([
  "fuel", "maintenance", "emi", "compliance", "platform-fee",
  "traffic-challan", "toll-parking", "miscellaneous",
  "pre-business-manual-recovery",
]);

function assertDate(value: string): number {
  if (!DATE.test(value)) throw new Error("performance_date_invalid");
  const time = Date.parse(value + "T00:00:00.000Z");
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) {
    throw new Error("performance_date_invalid");
  }
  return time / DAY_MS;
}
function dateAt(day: number): string { return new Date(day * DAY_MS).toISOString().slice(0, 10); }
function addMonthsClamped(value: string, months: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const targetMonthIndex = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay))).toISOString().slice(0, 10);
}
function safeAmount(value: number, code: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(code);
}
function add(a: number, b: number): number {
  const result = a + b;
  if (!Number.isSafeInteger(result)) throw new Error("performance_amount_overflow");
  return result;
}
function validateRefs(refs: readonly PerformanceSourceRefV1[]): void {
  if (!Array.isArray(refs) || refs.some(ref =>
    !ref.sourceId.trim() || !Number.isSafeInteger(ref.revision) || ref.revision < 1 ||
    (ref.scheduleVersion !== undefined && (!Number.isSafeInteger(ref.scheduleVersion) || ref.scheduleVersion < 1)))) {
    throw new Error("performance_source_provenance_invalid");
  }
}

/**
 * Recovers the aggregate eligible pre-business pool in 18 equal monthly
 * instalments. The first instalment starts on the Business Start Date and the
 * final instalment is due in the month containing its 18-month anniversary.
 * Each month's instalment is spread over that calendar month's remaining
 * operational dates; paise remainders go to the earliest dates. Source shares
 * are retained for audit provenance without changing the aggregate schedule.
 */
export function allocatePreBusinessRecoveryV1(
  businessStartDate: string,
  sources: readonly PreBusinessRecoverySourceV1[],
): Readonly<{
  from: string;
  toExclusive: string;
  totalPaise: number;
  daily: readonly Readonly<{
    date: string;
    amountPaise: number;
    sourceId: string;
    revision: number;
    origin: "manual";
    note: string;
  }>[];
}> {
  const startDay = assertDate(businessStartDate);
  const toExclusive = addMonthsClamped(businessStartDate, PRE_BUSINESS_RECOVERY_MONTHS_V1);
  const seen = new Set<string>();
  let totalPaise = 0;
  for (const source of sources) {
    safeAmount(source.amountPaise, "performance_recovery_amount_invalid");
    if (!source.sourceId.trim() || !Number.isSafeInteger(source.revision) || source.revision < 1 ||
        typeof source.note !== "string" || !source.note.trim() ||
        source.origin !== "manual" || seen.has(source.sourceId)) {
      throw new Error("performance_recovery_source_invalid");
    }
    seen.add(source.sourceId);
    totalPaise = add(totalPaise, source.amountPaise);
  }
  const daily: { date: string; amountPaise: number; sourceId: string; revision: number; origin: "manual"; note: string }[] = [];
  if (totalPaise === 0) return Object.freeze({ from: businessStartDate, toExclusive, totalPaise, daily: Object.freeze(daily) });

  // Equal monthly instalments are calculated from the aggregate pool, not
  // independently per source. Cumulative apportionment preserves every
  // source's provenance while ensuring each month exactly reconciles.
  const monthlyBase = Math.floor(totalPaise / PRE_BUSINESS_RECOVERY_MONTHS_V1);
  const monthlyRemainder = totalPaise % PRE_BUSINESS_RECOVERY_MONTHS_V1;
  const monthTotal = (monthIndex: number): number =>
    monthlyBase + (monthIndex < monthlyRemainder ? 1 : 0);
  let cumulativePoolAllocated = 0;
  let previousSourceShares = sources.map(() => 0);
  const cumulativeSourceShares = (monthlyAmount: number): number[] => {
    cumulativePoolAllocated = add(cumulativePoolAllocated, monthlyAmount);
    let cumulativeSourceAmount = 0;
    const cumulativePrefixTargets = sources.map(source => {
      cumulativeSourceAmount = add(cumulativeSourceAmount, source.amountPaise);
      return Number(
        (BigInt(cumulativePoolAllocated) * BigInt(cumulativeSourceAmount)) / BigInt(totalPaise),
      );
    });
    const nextShares = cumulativePrefixTargets.map((prefix, index) =>
      prefix - (index > 0 ? cumulativePrefixTargets[index - 1] : 0));
    const monthlyShares = nextShares.map((target, index) => target - previousSourceShares[index]);
    previousSourceShares = nextShares;
    return monthlyShares;
  };
  for (let monthIndex = 0; monthIndex < PRE_BUSINESS_RECOVERY_MONTHS_V1; monthIndex++) {
    const monthStart = addMonthsClamped(businessStartDate, monthIndex);
    const monthEndExclusive = addMonthsClamped(businessStartDate, monthIndex + 1);
    const start = Math.max(startDay, assertDate(monthStart));
    const end = assertDate(monthEndExclusive);
    const dayCount = end - start;
    if (dayCount <= 0) throw new Error("performance_recovery_period_invalid");
    const instalment = monthTotal(monthIndex);
    const sourceShares = cumulativeSourceShares(instalment);
    sources.forEach((source, sourceIndex) => {
      const amount = sourceShares[sourceIndex];
      const quotient = Math.floor(amount / dayCount);
      const remainder = amount % dayCount;
      for (let offset = 0; offset < dayCount; offset++) {
        const amountPaise = quotient + (offset < remainder ? 1 : 0);
        if (amountPaise > 0) daily.push({
          date: dateAt(start + offset), amountPaise, sourceId: source.sourceId,
          revision: source.revision, origin: source.origin, note: source.note,
        });
      }
    });
  }
  const allocated = daily.reduce((sum, row) => add(sum, row.amountPaise), 0);
  if (allocated !== totalPaise) throw new Error("performance_recovery_reconciliation_failed");
  return Object.freeze({
    from: businessStartDate, toExclusive,
    totalPaise,
    daily: Object.freeze(daily.map(row => Object.freeze(row))),
  });
}

export function calculatePerformanceV1(input: PerformanceCalculationInputV1): PerformanceCalculationResultV1 {
  const businessStartDay = assertDate(input.businessStartDate);
  const periodFromDay = assertDate(input.periodFrom);
  const periodToDay = assertDate(input.periodTo);
  if (periodToDay < periodFromDay) throw new Error("performance_period_invalid");
  if (periodToDay < businessStartDay) throw new Error("performance_period_before_business_start");
  safeAmount(input.monthlyDriverTargetPaise, "performance_monthly_target_invalid");

  const recovery = allocatePreBusinessRecoveryV1(input.businessStartDate, input.preBusinessRecovery);

  const revenueByDate = new Map<string, number>();
  const refs: PerformanceSourceRefV1[] = [];
  const passbookSourceRefsByDate = new Map<string, PerformancePassbookSourceRefV1[]>();
  const addPassbookSourceRefs = (date: string, sourceRefs: readonly PerformanceSourceRefV1[]) => {
    if (sourceRefs.length === 0) return;
    const dailyRefs = passbookSourceRefsByDate.get(date) ?? [];
    dailyRefs.push(...sourceRefs);
    passbookSourceRefsByDate.set(date, dailyRefs);
  };
  const completeness = input.completeness.map(item => Object.freeze({ ...item }));
  for (const row of input.revenue) {
    const day = assertDate(row.date);
    safeAmount(row.grossFarePaise, "performance_revenue_invalid");
    safeAmount(row.cancellationFeePaise, "performance_revenue_invalid");
    validateRefs(row.sourceRefs);
    if (day < businessStartDay) continue;
    if (!row.verified) {
      completeness.push({ source: "revenue:" + row.date, status: "incomplete", detail: "Unverified revenue excluded from authoritative totals." });
      continue;
    }
    revenueByDate.set(row.date, add(revenueByDate.get(row.date) ?? 0,
      add(row.grossFarePaise, row.cancellationFeePaise)));
    refs.push(...row.sourceRefs);
    addPassbookSourceRefs(row.date, row.sourceRefs);
  }

  const costsByDate = new Map<string, Record<PerformanceCostKindV1, number>>();
  for (const row of input.costs) {
    const day = assertDate(row.date);
    safeAmount(row.amountPaise, "performance_cost_invalid");
    validateRefs(row.sourceRefs);
    if (day < businessStartDay) continue;
    if (!row.verified) {
      completeness.push({ source: "cost:" + row.date + ":" + row.kind, status: "incomplete", detail: "Unverified cost excluded from authoritative totals." });
      continue;
    }
    const bucket = costsByDate.get(row.date) ?? Object.fromEntries(COST_KINDS.map(kind => [kind, 0])) as Record<PerformanceCostKindV1, number>;
    bucket[row.kind] = add(bucket[row.kind], row.amountPaise);
    costsByDate.set(row.date, bucket);
    refs.push(...row.sourceRefs);
    addPassbookSourceRefs(row.date, row.sourceRefs);
  }
  for (const row of recovery.daily) {
    const bucket = costsByDate.get(row.date) ?? Object.fromEntries(COST_KINDS.map(kind => [kind, 0])) as Record<PerformanceCostKindV1, number>;
    bucket["pre-business-manual-recovery"] = add(bucket["pre-business-manual-recovery"], row.amountPaise);
    costsByDate.set(row.date, bucket);
    addPassbookSourceRefs(row.date, [{ sourceId: row.sourceId, revision: row.revision }]);
  }
  for (const source of input.preBusinessRecovery) refs.push({ sourceId: source.sourceId, revision: source.revision });

  const lifetimeTo = input.periodTo;
  const lifetimeDays = assertDate(lifetimeTo) - businessStartDay + 1;
  if (lifetimeDays > 36600) throw new Error("performance_period_too_large");
  const daily: PerformanceDailyResultV1[] = [];
  const lifetimeDailySurplus: {
    date: string; profitPaise: number; sourceRefs: readonly PerformancePassbookSourceRefV1[];
  }[] = [];
  let lifetimeRevenuePaise = 0, lifetimeCostPaise = 0, periodRevenuePaise = 0, periodCostPaise = 0;
  for (let offset = 0; offset < lifetimeDays; offset++) {
    const date = dateAt(businessStartDay + offset);
    const costs = costsByDate.get(date) ?? Object.fromEntries(COST_KINDS.map(kind => [kind, 0])) as Record<PerformanceCostKindV1, number>;
    const revenuePaise = revenueByDate.get(date) ?? 0;
    const totalCostPaise = COST_KINDS.reduce((sum, kind) => add(sum, costs[kind]), 0);
    const profitPaise = revenuePaise - totalCostPaise;
    lifetimeRevenuePaise = add(lifetimeRevenuePaise, revenuePaise);
    lifetimeCostPaise = add(lifetimeCostPaise, totalCostPaise);
    lifetimeDailySurplus.push({ date, profitPaise, sourceRefs: passbookSourceRefsByDate.get(date) ?? [] });
    if (date >= input.periodFrom && date <= input.periodTo) {
      periodRevenuePaise = add(periodRevenuePaise, revenuePaise);
      periodCostPaise = add(periodCostPaise, totalCostPaise);
      const isDateScopedSource = (source: string): boolean => {
        const [kind, sourceDate] = source.split(":");
        return (kind === "revenue" || kind === "cost") &&
          sourceDate?.length === 10 && sourceDate[4] === "-" && sourceDate[7] === "-";
      };
      const dateScopedIssue = completeness.some(item =>
        isDateScopedSource(item.source) && item.source.split(":")[1] === date &&
        item.status !== "complete");
      const globalIssue = completeness.some(item =>
        !isDateScopedSource(item.source) && item.status !== "complete");
      daily.push(Object.freeze({
        date, grossRevenuePaise: revenuePaise, costs: Object.freeze({ ...costs }),
        totalCostPaise, profitPaise,
        complete: !dateScopedIssue && !globalIssue,
      }));
    }
  }

  const elapsedCalendarMonths = (() => {
    const [sy, sm] = input.businessStartDate.split("-").map(Number);
    const [ey, em] = input.periodTo.split("-").map(Number);
    return (ey - sy) * 12 + (em - sm) + 1;
  })();
  const lifetimeTargetPaise = proratedDriverTargetForRangeV1(
    input.monthlyDriverTargetPaise, input.businessStartDate, input.periodTo,
  );
  const periodTargetPaise = proratedDriverTargetForRangeV1(
    input.monthlyDriverTargetPaise,
    input.periodFrom < input.businessStartDate ? input.businessStartDate : input.periodFrom,
    input.periodTo,
  );
  safeAmount(lifetimeTargetPaise, "performance_target_overflow");
  safeAmount(periodTargetPaise, "performance_target_overflow");

  const lifetimeProfitPaise = lifetimeRevenuePaise - lifetimeCostPaise;
  const periodProfitPaise = periodRevenuePaise - periodCostPaise;

  return Object.freeze({
    calculationId: PERFORMANCE_CALCULATION_ID_V1,
    calculationVersion: PERFORMANCE_CALCULATION_VERSION_V1,
    businessStartDate: input.businessStartDate,
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
    daily: Object.freeze(daily),
    period: Object.freeze({
      revenuePaise: periodRevenuePaise, costPaise: periodCostPaise,
      profitPaise: periodProfitPaise,
      monthlyDriverTargetPaise: input.monthlyDriverTargetPaise,
      targetPaise: periodTargetPaise,
    }),
    lifetime: Object.freeze({
      revenuePaise: lifetimeRevenuePaise, costPaise: lifetimeCostPaise,
      profitPaise: lifetimeProfitPaise, targetPaise: lifetimeTargetPaise,
      targetPositionPaise: lifetimeProfitPaise - lifetimeTargetPaise,
      elapsedCalendarMonths,
    }),
    passbook: buildPerformancePassbookV1({
      businessStartDate: input.businessStartDate,
      periodTo: input.periodTo,
      monthlyDriverTargetPaise: input.monthlyDriverTargetPaise,
      daily: lifetimeDailySurplus,
    }),
    recovery,
    provenance: Object.freeze({
      sourceRefs: Object.freeze(refs.sort((a,b) => a.sourceId.localeCompare(b.sourceId) || a.revision - b.revision)),
      completeness: Object.freeze(completeness),
      ...(input.sourceSnapshotId ? { sourceSnapshotId: input.sourceSnapshotId } : {}),
    }),
  });
}
