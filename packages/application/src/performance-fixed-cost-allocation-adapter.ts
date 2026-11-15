import type { PerformanceDailyCostInputV1, PreBusinessRecoverySourceV1, PerformanceCompletenessV1 } from "../../domain/src/performance-calculation-v1";
import type { BusinessStartDateCostAllocationService } from "./business-start-date-cost-allocation-service";
import type { CostAllocationSourceResultV1 } from "../../domain/src/business-start-date-cost-allocation";
import type { PerformanceEmiReadModel, PerformanceComplianceReadModel, PerformanceCompletenessReadModel } from "./performance-calculation-service";

const DAY_MS = 86_400_000;
function dayNumber(date: string): number {
  const value = Date.parse(date + "T00:00:00.000Z");
  if (!Number.isFinite(value) || new Date(value).toISOString().slice(0, 10) !== date) {
    throw new Error("performance_compliance_source_date_invalid");
  }
  return value / DAY_MS;
}
function proportionalPaise(amountPaise: number, numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 0 || numerator < 0 ||
      denominator <= 0 || numerator > denominator) {
    throw new Error("performance_compliance_source_amount_invalid");
  }
  const result = (BigInt(amountPaise) * BigInt(numerator) * 2n + BigInt(denominator)) /
    (2n * BigInt(denominator));
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("performance_compliance_source_amount_overflow");
  return Number(result);
}
function postBusinessDailyRows(
  source: CostAllocationSourceResultV1,
  businessStartDate: string,
  from: string,
  to: string,
  amountPaise: number,
): readonly Readonly<{ date: string; amountPaise: number; sourceId: string; sourceVersion: number }>[] {
  const period = source.sourcePeriod;
  if (!period) return Object.freeze([]);
  const eligibleFrom = period.from < businessStartDate ? businessStartDate : period.from;
  const start = dayNumber(eligibleFrom), end = dayNumber(period.to);
  const totalDays = end - start + 1;
  if (totalDays <= 0) return Object.freeze([]);
  const quotient = Math.floor(amountPaise / totalDays);
  const remainder = amountPaise % totalDays;
  return Object.freeze(source.daily.flatMap(row => {
    if (row.date < from || row.date > to || row.date < eligibleFrom || row.date > period.to) return [];
    const offset = dayNumber(row.date) - start;
    return [Object.freeze({
      date: row.date,
      amountPaise: quotient + (offset < remainder ? 1 : 0),
      sourceId: row.sourceId,
      sourceVersion: row.sourceVersion,
    })];
  }));
}

function blockedComplianceBases(sources: readonly CostAllocationSourceResultV1[]): Set<string> {
  return new Set(sources.filter(source => source.disposition === "overlap_review_required")
    .map(source => source.sourceId.endsWith(":overlap-withheld")
      ? source.sourceId.slice(0, -":overlap-withheld".length) : source.sourceId));
}
function complianceSplit(source: CostAllocationSourceResultV1, businessStartDate: string) {
  const period = source.sourcePeriod;
  if (!period) return undefined;
  const from = dayNumber(period.from), to = dayNumber(period.to), start = dayNumber(businessStartDate);
  if (to < from) throw new Error("performance_compliance_source_period_invalid");
  const totalDays = to - from + 1;
  const preDays = Math.max(0, Math.min(totalDays, start - from));
  const preBusinessPaise = proportionalPaise(source.sourceAmountPaise, preDays, totalDays);
  return Object.freeze({
    preBusinessPaise,
    postBusinessPaise: source.sourceAmountPaise - preBusinessPaise,
  });
}

/**
 * Projects immutable EMI/Compliance source allocations into the separate
 * Performance v1.0 ports. EMI carry-forward is recovered over the v1.0
 * 18-month window, not also counted as an ordinary daily EMI. Compliance
 * amounts are split by their original validity dates: the pre-business share
 * enters recovery and only the post-business share remains in the normal
 * validity schedule. Unreviewed overlap sources are withheld.
 */
export class PerformanceFixedCostAllocationAdapterV1
implements PerformanceEmiReadModel, PerformanceComplianceReadModel, PerformanceCompletenessReadModel {
  private snapshot?: ReturnType<BusinessStartDateCostAllocationService["getReport"]>;

  constructor(
    private readonly allocation: Pick<BusinessStartDateCostAllocationService, "getReport">,
  ) {}

  async prepareSnapshot(): Promise<void> {
    this.snapshot = this.allocation.getReport();
    await this.snapshot;
  }

  releaseSnapshot(): void {
    this.snapshot = undefined;
  }

  private async report() {
    return this.snapshot ?? this.allocation.getReport();
  }

  async listDailyEmiAllocations(from: string, to: string): Promise<readonly PerformanceDailyCostInputV1[]> {
    const report = await this.report();
    return Object.freeze(report.result.sources.flatMap(source => {
      if (source.sourceKind !== "emi" || source.disposition !== "allocated") return [];
      const split = complianceSplit(source, report.businessStartDate);
      if (!split) return [];
      return postBusinessDailyRows(source, report.businessStartDate, from, to, split.postBusinessPaise)
        .map(row => Object.freeze({
          date: row.date, kind: "emi" as const, amountPaise: row.amountPaise, verified: true,
          sourceRefs: Object.freeze([{ sourceId: row.sourceId, revision: row.sourceVersion }]),
        }));
    }));
  }

  async listDailyComplianceAllocations(from: string, to: string): Promise<readonly PerformanceDailyCostInputV1[]> {
    const report = await this.report();
    const blocked = blockedComplianceBases(report.result.sources);
    return Object.freeze(report.result.sources.flatMap(source => {
      if (source.sourceKind !== "compliance" || source.disposition !== "allocated" ||
          blocked.has(source.sourceId.replace(/:allocated$/, ""))) return [];
      const split = complianceSplit(source, report.businessStartDate);
      if (!split) return [];
      return postBusinessDailyRows(source, report.businessStartDate, from, to, split.postBusinessPaise)
        .map(row => Object.freeze({
          date: row.date, kind: "compliance" as const, amountPaise: row.amountPaise, verified: true,
          sourceRefs: Object.freeze([{ sourceId: row.sourceId, revision: row.sourceVersion }]),
        }));
    }));
  }

  async listPreBusinessEmiPortions(): Promise<readonly PreBusinessRecoverySourceV1[]> {
    const report = await this.report();
    return Object.freeze(report.result.sources.flatMap(source => {
      if (source.disposition === "overlap_review_required" || source.sourceAmountPaise <= 0) return [];
      if (source.sourceKind === "emi-pre-business-carry-forward") return [Object.freeze({
        sourceId: source.sourceId, revision: source.sourceVersion,
        amountPaise: source.sourceAmountPaise,
        note: "Pre-business EMI carry-forward from " + source.sourceId,
        origin: "emi" as const,
      })];
      if (source.sourceKind !== "emi") return [];
      const split = complianceSplit(source, report.businessStartDate);
      if (!split || split.preBusinessPaise === 0) return [];
      return [Object.freeze({
        sourceId: source.sourceId, revision: source.sourceVersion,
        amountPaise: split.preBusinessPaise,
        note: "Pre-business portion of " + (source.sourcePeriod?.label ?? source.sourceId),
        origin: "emi" as const,
      })];
    }));
  }

  async listPreBusinessCompliancePortions(): Promise<readonly PreBusinessRecoverySourceV1[]> {
    const report = await this.report();
    const blocked = blockedComplianceBases(report.result.sources);
    return Object.freeze(report.result.sources.filter(source =>
      source.sourceKind === "compliance" &&
      (source.disposition === "pre_business_historical" || source.disposition === "allocated") &&
      !blocked.has(source.sourceId.replace(/:allocated$/, "")) &&
      source.sourceAmountPaise > 0,
    ).flatMap(source => {
      const split = complianceSplit(source, report.businessStartDate);
      if (!split || split.preBusinessPaise === 0) return [];
      return [Object.freeze({
        sourceId: source.sourceId, revision: source.sourceVersion,
        amountPaise: split.preBusinessPaise,
        note: "Pre-business compliance portion (" + (source.sourcePeriod?.label ?? source.sourceId) + ")",
        origin: "compliance" as const,
      })];
    }));
  }

  async getCompleteness(_from: string, _to: string): Promise<readonly PerformanceCompletenessV1[]> {
    const report = await this.report();
    const blocked = report.result.sources.filter(source =>
      source.disposition === "overlap_review_required");
    const missingPeriod = report.result.sources.filter(source =>
      (source.sourceKind === "compliance" || source.sourceKind === "emi") &&
      source.disposition === "allocated" && !source.sourcePeriod);
    const incompleteDaily = report.result.sources.filter(source => {
      if ((source.sourceKind !== "compliance" && source.sourceKind !== "emi") ||
          source.disposition !== "allocated" || !source.eligibleFrom || !source.eligibleTo) return false;
      const expectedDays = dayNumber(source.eligibleTo) - dayNumber(source.eligibleFrom) + 1;
      const dates = source.daily.map(row => row.date);
      return expectedDays <= 0 || dates.length !== expectedDays ||
        dates[0] !== source.eligibleFrom || dates[dates.length - 1] !== source.eligibleTo ||
        dates.some((date, index) => index > 0 && dayNumber(date) !== dayNumber(dates[index - 1]) + 1);
    });
    if (blocked.length || missingPeriod.length || incompleteDaily.length) return Object.freeze([Object.freeze({
      source: "finance-and-compliance-allocation",
      status: "review-required" as const,
      detail: [
        ...blocked.map(source => source.sourceId + " has unresolved overlap"),
        ...missingPeriod.map(source => source.sourceId + " lacks its original validity window"),
        ...incompleteDaily.map(source => source.sourceId + " has incomplete daily allocation rows"),
      ].sort().join("; "),
    })]);
    return Object.freeze([Object.freeze({
      source: "finance-and-compliance-allocation",
      status: "complete" as const,
    })]);
  }
}
