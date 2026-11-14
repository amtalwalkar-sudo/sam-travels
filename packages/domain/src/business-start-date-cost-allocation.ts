/**
 * Business Start Date reporting allocation v1.
 *
 * Source dates and amounts are never mutated. Daily integer-paise rows are
 * canonical; month/year summaries are derived only by summing those rows.
 */
export const BUSINESS_START_DATE_ALLOCATION_CALCULATION_ID = "business-start-date-cost-allocation.v1" as const;
export const BUSINESS_START_DATE_ALLOCATION_CALCULATION_VERSION = 1 as const;

export type DailyCostAllocationV1 = Readonly<{
  date: string;
  amountPaise: number;
  sourceId: string;
  sourceKind: "compliance" | "emi" | "emi-pre-business-carry-forward";
  sourceVersion: number;
  scheduleVersion?: number;
}>;
export type AllocationDispositionV1 = "allocated" | "pre_business_historical" | "overlap_review_required";
export type CostAllocationSourceResultV1 = Readonly<{
  sourceId: string;
  sourceKind: "compliance" | "emi" | "emi-pre-business-carry-forward";
  sourceVersion: number;
  scheduleVersion?: number;
  sourceAmountPaise: number;
  disposition: AllocationDispositionV1;
  eligibleFrom?: string;
  eligibleTo?: string;
  daily: readonly DailyCostAllocationV1[];
}>;
export type BusinessStartDateAllocationResultV1 = Readonly<{
  calculationId: typeof BUSINESS_START_DATE_ALLOCATION_CALCULATION_ID;
  calculationVersion: typeof BUSINESS_START_DATE_ALLOCATION_CALCULATION_VERSION;
  businessStartDate: string;
  sources: readonly CostAllocationSourceResultV1[];
  daily: readonly Readonly<{ date: string; amountPaise: number }>[];
  monthly: readonly Readonly<{ month: string; amountPaise: number }>[];
  yearly: readonly Readonly<{ year: string; amountPaise: number }>[];
  allocatedAmountPaise: number;
  historicalAmountPaise: number;
  withheldAmountPaise: number;
}>;

export type ComplianceAllocationInputV1 = Readonly<{
  id: string;
  revision: number;
  complianceName: string;
  validFrom: string;
  validTo: string;
  totalCostPaise: number;
  overlapReviewStatus: "confirmed" | "rejected" | "unreviewed" | "stale" | "not_overlapping";
}>;
export type EmiAllocationRowV1 = Readonly<{
  installmentNumber: number;
  dueDate: string;
  installmentAmountPaise: number;
  scheduleVersion?: number;
}>;
export type EmiAllocationInputV1 = Readonly<{
  loanId: string;
  loanRevision: number;
  scheduleVersion: number;
  rows: readonly EmiAllocationRowV1[];
  allocationEndDate?: string;
}>;

const DAY_MS = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
function assertDate(value: unknown): asserts value is string {
  if (typeof value !== "string" || !DATE.test(value)) throw new Error("business_start_date_allocation_date_invalid");
  const timestamp = Date.parse(value + "T00:00:00.000Z");
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new Error("business_start_date_allocation_date_invalid");
  }
}
function day(value: string): number { assertDate(value); return Date.parse(value + "T00:00:00.000Z") / DAY_MS; }
function date(value: number): string { return new Date(value * DAY_MS).toISOString().slice(0, 10); }
function monthEnd(value: string): string {
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}
function addDays(value: string, count: number): string { return date(day(value) + count); }
function assertPaise(value: unknown, code: string, allowZero = true): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) throw new Error(code);
}
function distribute(input: {
  sourceId: string; sourceKind: DailyCostAllocationV1["sourceKind"]; sourceVersion: number; scheduleVersion?: number;
  amountPaise: number; from: string; to: string;
}): DailyCostAllocationV1[] {
  assertDate(input.from); assertDate(input.to); assertPaise(input.amountPaise, "business_start_date_allocation_amount_invalid");
  const count = day(input.to) - day(input.from) + 1;
  if (count < 1) throw new Error("business_start_date_allocation_period_invalid");
  const quotient = Math.floor(input.amountPaise / count);
  const remainder = input.amountPaise % count;
  return Array.from({ length: count }, (_, index) => ({
    date: date(day(input.from) + index),
    amountPaise: quotient + (index < remainder ? 1 : 0),
    sourceId: input.sourceId,
    sourceKind: input.sourceKind,
    sourceVersion: input.sourceVersion,
    ...(input.scheduleVersion !== undefined ? { scheduleVersion: input.scheduleVersion } : {}),
  }));
}

export function allocateComplianceCostV1(
  businessStartDate: string,
  record: ComplianceAllocationInputV1,
): CostAllocationSourceResultV1 {
  assertDate(businessStartDate); assertDate(record.validFrom); assertDate(record.validTo);
  assertPaise(record.totalCostPaise, "business_start_date_allocation_amount_invalid");
  if (typeof record.id !== "string" || !record.id.trim() || !Number.isSafeInteger(record.revision) || record.revision < 1 ||
      !record.complianceName.trim() || record.validTo < record.validFrom) {
    throw new Error("business_start_date_compliance_source_invalid");
  }
  const overlapBlocked = record.overlapReviewStatus !== "confirmed" &&
    record.overlapReviewStatus !== "not_overlapping";
  if (overlapBlocked) return Object.freeze({
    sourceId: record.id, sourceKind: "compliance", sourceVersion: record.revision,
    sourceAmountPaise: record.totalCostPaise, disposition: "overlap_review_required", daily: Object.freeze([]),
  });
  if (record.validTo < businessStartDate) return Object.freeze({
    sourceId: record.id, sourceKind: "compliance", sourceVersion: record.revision,
    sourceAmountPaise: record.totalCostPaise, disposition: "pre_business_historical", daily: Object.freeze([]),
  });
  const from = record.validFrom < businessStartDate ? businessStartDate : record.validFrom;
  const daily = distribute({ sourceId: record.id, sourceKind: "compliance", sourceVersion: record.revision,
    amountPaise: record.totalCostPaise, from, to: record.validTo });
  return Object.freeze({ sourceId: record.id, sourceKind: "compliance", sourceVersion: record.revision,
    sourceAmountPaise: record.totalCostPaise, disposition: "allocated", eligibleFrom: from,
    eligibleTo: record.validTo, daily: Object.freeze(daily) });
}

export function allocateScheduledEmisV1(
  businessStartDate: string,
  schedule: EmiAllocationInputV1,
): readonly CostAllocationSourceResultV1[] {
  assertDate(businessStartDate);
  if (typeof schedule.loanId !== "string" || !schedule.loanId.trim() || !Number.isSafeInteger(schedule.loanRevision) || schedule.loanRevision < 1 ||
      !Number.isSafeInteger(schedule.scheduleVersion) || schedule.scheduleVersion < 1 ||
      !Array.isArray(schedule.rows) || !schedule.rows.length) {
    throw new Error("business_start_date_emi_source_invalid");
  }
  if (schedule.allocationEndDate !== undefined) assertDate(schedule.allocationEndDate);
  const rows = [...schedule.rows].filter(row => schedule.allocationEndDate === undefined || row.dueDate <= schedule.allocationEndDate)
    .sort((a,b) => a.dueDate.localeCompare(b.dueDate));
  if (!rows.length) return Object.freeze([]);
  const seen = new Set<string>();
  rows.forEach((row,index) => {
    assertDate(row.dueDate); assertPaise(row.installmentAmountPaise, "business_start_date_emi_amount_invalid", false);
    const rowVersion = row.scheduleVersion ?? schedule.scheduleVersion;
    if (!Number.isSafeInteger(row.installmentNumber) || row.installmentNumber < 1 ||
        !Number.isSafeInteger(rowVersion) || rowVersion < 1 || seen.has(rowVersion + ":" + row.installmentNumber) ||
        (index > 0 && rows[index - 1].dueDate >= row.dueDate)) {
      throw new Error("business_start_date_emi_schedule_invalid");
    }
    seen.add(rowVersion + ":" + row.installmentNumber);
  });
  const periods = rows.map((row,index) => ({
    row,
    from: row.dueDate,
    to: index + 1 < rows.length ? addDays(rows[index + 1].dueDate, -1) : monthEnd(row.dueDate),
  }));
  if (schedule.allocationEndDate !== undefined) {
    for (const period of periods) if (period.to > schedule.allocationEndDate) (period as {to:string}).to = schedule.allocationEndDate;
  }
  const finalEnd = periods[periods.length - 1].to;
  const carryRows = periods.filter(period => period.to < businessStartDate);
  const carryAmount = carryRows.reduce((sum,period) => sum + period.row.installmentAmountPaise, 0);
  if (!Number.isSafeInteger(carryAmount)) throw new Error("business_start_date_emi_amount_overflow");
  const results: CostAllocationSourceResultV1[] = [];
  if (carryAmount > 0) {
    if (finalEnd < businessStartDate) {
      results.push(Object.freeze({
        sourceId: schedule.loanId + ":pre-business-emi-carry-forward",
        sourceKind: "emi-pre-business-carry-forward", sourceVersion: schedule.loanRevision, scheduleVersion: schedule.scheduleVersion,
        sourceAmountPaise: carryAmount, disposition: "pre_business_historical", daily: Object.freeze([]),
      }));
    } else {
      const sourceId = schedule.loanId + ":pre-business-emi-carry-forward";
      const daily = distribute({ sourceId, sourceKind: "emi-pre-business-carry-forward",
        sourceVersion: schedule.loanRevision, scheduleVersion: schedule.scheduleVersion, amountPaise: carryAmount, from: businessStartDate, to: finalEnd });
      results.push(Object.freeze({ sourceId, sourceKind: "emi-pre-business-carry-forward",
        sourceVersion: schedule.loanRevision, scheduleVersion: schedule.scheduleVersion, sourceAmountPaise: carryAmount, disposition: "allocated",
        eligibleFrom: businessStartDate, eligibleTo: finalEnd, daily: Object.freeze(daily) }));
    }
  }
  for (const period of periods.filter(item => item.to >= businessStartDate)) {
    const from = period.from < businessStartDate ? businessStartDate : period.from;
    const rowScheduleVersion = period.row.scheduleVersion ?? schedule.scheduleVersion;
    const sourceId = schedule.loanId + ":emi:" + period.row.installmentNumber + (period.row.scheduleVersion !== undefined ? ":v" + rowScheduleVersion : "");
    const daily = distribute({ sourceId, sourceKind: "emi", sourceVersion: schedule.loanRevision, scheduleVersion: rowScheduleVersion,
      amountPaise: period.row.installmentAmountPaise, from, to: period.to });
    results.push(Object.freeze({ sourceId, sourceKind: "emi", sourceVersion: schedule.loanRevision, scheduleVersion: rowScheduleVersion,
      sourceAmountPaise: period.row.installmentAmountPaise, disposition: "allocated",
      eligibleFrom: from, eligibleTo: period.to, daily: Object.freeze(daily) }));
  }
  return Object.freeze(results);
}

export function buildBusinessStartDateAllocationResultV1(
  businessStartDate: string,
  sources: readonly CostAllocationSourceResultV1[],
): BusinessStartDateAllocationResultV1 {
  assertDate(businessStartDate);
  const dailyTotals = new Map<string, number>();
  let allocatedAmountPaise = 0, historicalAmountPaise = 0, withheldAmountPaise = 0;
  for (const source of sources) {
    const sourceDailyTotal = source.daily.reduce((sum, row) => sum + row.amountPaise, 0);
    if (source.disposition === "allocated" && sourceDailyTotal !== source.sourceAmountPaise) throw new Error("business_start_date_allocation_source_reconciliation_failed");
    if (source.disposition !== "allocated" && sourceDailyTotal !== 0) throw new Error("business_start_date_allocation_nonallocated_source_has_daily_rows");
    if (source.disposition === "pre_business_historical") historicalAmountPaise += source.sourceAmountPaise;
    else if (source.disposition === "overlap_review_required") withheldAmountPaise += source.sourceAmountPaise;
    for (const row of source.daily) {
      assertDate(row.date); assertPaise(row.amountPaise, "business_start_date_allocation_amount_invalid");
      if (row.date < businessStartDate || !Number.isSafeInteger(row.sourceVersion) || row.sourceVersion < 1) {
        throw new Error("business_start_date_allocation_row_invalid");
      }
      dailyTotals.set(row.date, (dailyTotals.get(row.date) ?? 0) + row.amountPaise);
      allocatedAmountPaise += row.amountPaise;
    }
  }
  const daily = [...dailyTotals].sort(([a],[b]) => a.localeCompare(b))
    .map(([date,amountPaise]) => Object.freeze({ date, amountPaise }));
  const monthlyTotals = new Map<string,number>(), yearlyTotals = new Map<string,number>();
  for (const row of daily) {
    const month = row.date.slice(0,7), year = row.date.slice(0,4);
    monthlyTotals.set(month,(monthlyTotals.get(month) ?? 0)+row.amountPaise);
    yearlyTotals.set(year,(yearlyTotals.get(year) ?? 0)+row.amountPaise);
  }
  if (![allocatedAmountPaise,historicalAmountPaise,withheldAmountPaise].every(Number.isSafeInteger)) {
    throw new Error("business_start_date_allocation_total_overflow");
  }
  return Object.freeze({
    calculationId: BUSINESS_START_DATE_ALLOCATION_CALCULATION_ID,
    calculationVersion: BUSINESS_START_DATE_ALLOCATION_CALCULATION_VERSION,
    businessStartDate, sources: Object.freeze([...sources]),
    daily: Object.freeze(daily),
    monthly: Object.freeze([...monthlyTotals].sort(([a],[b])=>a.localeCompare(b)).map(([month,amountPaise])=>Object.freeze({month,amountPaise}))),
    yearly: Object.freeze([...yearlyTotals].sort(([a],[b])=>a.localeCompare(b)).map(([year,amountPaise])=>Object.freeze({year,amountPaise}))),
    allocatedAmountPaise, historicalAmountPaise, withheldAmountPaise,
  });
}
