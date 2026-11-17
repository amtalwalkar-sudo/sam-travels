import type { PerformanceDailyCostInputV1, PreBusinessRecoverySourceV1, PerformanceCompletenessV1 } from "../../domain/src/performance-calculation-v1";
import type { BusinessStartDateCostAllocationService } from "./business-start-date-cost-allocation-service";
import type { CostAllocationSourceResultV1 } from "../../domain/src/business-start-date-cost-allocation";
import type { PerformanceEmiReadModel, PerformanceComplianceReadModel, PerformanceCompletenessReadModel } from "./performance-calculation-service";

const DAY_MS = 86_400_000;
function dayNumber(date: string): number {
  const value = Date.parse(date + "T00:00:00.000Z");
  if (!Number.isFinite(value) || new Date(value).toISOString().slice(0, 10) !== date) {
    throw new Error("performance_allocation_source_date_invalid");
  }
  return value / DAY_MS;
}
function blockedComplianceBases(sources: readonly CostAllocationSourceResultV1[]): Set<string> {
  return new Set(sources.filter(source => source.disposition === "overlap_review_required")
    .map(source => source.sourceId.endsWith(":overlap-withheld")
      ? source.sourceId.slice(0, -":overlap-withheld".length) : source.sourceId));
}
function canonicalDailyRows(
  source: CostAllocationSourceResultV1,
  from: string,
  to: string,
  kind: "emi" | "compliance",
): readonly PerformanceDailyCostInputV1[] {
  return Object.freeze(source.daily.flatMap(row => {
    if (row.date < from || row.date > to) return [];
    if (row.sourceId !== source.sourceId || row.sourceVersion !== source.sourceVersion ||
        !Number.isSafeInteger(row.amountPaise) || row.amountPaise < 0) {
      throw new Error("performance_canonical_allocation_row_invalid");
    }
    return [Object.freeze({
      date: row.date, kind, amountPaise: row.amountPaise, verified: true,
      sourceRefs: Object.freeze([Object.freeze({
        sourceId: row.sourceId, revision: row.sourceVersion,
      })]),
    })];
  }));
}
function recoverySource(
  source: CostAllocationSourceResultV1,
  origin: "emi" | "compliance",
  note: string,
): PreBusinessRecoverySourceV1 {
  return Object.freeze({
    sourceId: source.sourceId, revision: source.sourceVersion,
    amountPaise: source.sourceAmountPaise, note, origin,
  });
}

/**
 * Projects the canonical Business Start Date allocation rows into Performance.
 * Daily amounts are consumed verbatim; this adapter must not reconstruct or
 * re-spread an owning feature's allocation. Pre-business recovery eligibility
 * is based on the authoritative source date: EMI due date or Compliance
 * valid-from date. The full eligible source amount enters the shared recovery
 * pool, while unresolved overlap sources remain withheld.
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
      if (source.sourceKind !== "emi" || source.disposition !== "allocated" ||
          !source.sourcePeriod || source.sourcePeriod.from < report.businessStartDate) return [];
      return canonicalDailyRows(source, from, to, "emi");
    }));
  }

  async listDailyComplianceAllocations(from: string, to: string): Promise<readonly PerformanceDailyCostInputV1[]> {
    const report = await this.report();
    const blocked = blockedComplianceBases(report.result.sources);
    return Object.freeze(report.result.sources.flatMap(source => {
      if (source.sourceKind !== "compliance" || source.disposition !== "allocated" ||
          !source.sourcePeriod || source.sourcePeriod.from < report.businessStartDate ||
          blocked.has(source.sourceId.replace(/:allocated$/, ""))) return [];
      return canonicalDailyRows(source, from, to, "compliance");
    }));
  }

  async listPreBusinessEmiPortions(): Promise<readonly PreBusinessRecoverySourceV1[]> {
    const report = await this.report();
    return Object.freeze(report.result.sources.flatMap(source => {
      if (source.disposition === "overlap_review_required" || source.sourceAmountPaise <= 0) return [];
      if (source.sourceKind === "emi-pre-business-carry-forward") {
        return [recoverySource(source, "emi", "Pre-business EMI carry-forward from " + source.sourceId)];
      }
      if (source.sourceKind !== "emi" || !source.sourcePeriod ||
          source.sourcePeriod.from >= report.businessStartDate) return [];
      return [recoverySource(source, "emi",
        "Pre-business EMI instalment from " + (source.sourcePeriod.label ?? source.sourceId))];
    }));
  }

  async listPreBusinessCompliancePortions(): Promise<readonly PreBusinessRecoverySourceV1[]> {
    const report = await this.report();
    const blocked = blockedComplianceBases(report.result.sources);
    return Object.freeze(report.result.sources.filter(source =>
      source.sourceKind === "compliance" &&
      (source.disposition === "pre_business_historical" || source.disposition === "allocated") &&
      !blocked.has(source.sourceId.replace(/:allocated$/, "")) &&
      source.sourceAmountPaise > 0 && source.sourcePeriod &&
      source.sourcePeriod.from < report.businessStartDate,
    ).map(source => recoverySource(source, "compliance",
      "Pre-business compliance record (" + (source.sourcePeriod?.label ?? source.sourceId) + ")")));
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
