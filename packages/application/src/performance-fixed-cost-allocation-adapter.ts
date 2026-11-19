import type { PerformanceDailyCostInputV1, PerformanceCompletenessV1 } from "../../domain/src/performance-calculation-v1";
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
  correctionRefs: readonly Readonly<{ sourceId: string; revision: number }>[] = [],
): readonly PerformanceDailyCostInputV1[] {
  return Object.freeze(source.daily.flatMap(row => {
    if (row.date < from || row.date > to) return [];
    if (row.sourceId !== source.sourceId || row.sourceVersion !== source.sourceVersion ||
        !Number.isSafeInteger(row.amountPaise) || row.amountPaise < 0) {
      throw new Error("performance_canonical_allocation_row_invalid");
    }
    return [Object.freeze({
      date: row.date, kind, amountPaise: row.amountPaise, verified: true,
      sourceRefs: Object.freeze([
        Object.freeze({
          sourceId: row.sourceId, revision: row.sourceVersion,
          ...(row.scheduleVersion !== undefined ? { scheduleVersion: row.scheduleVersion } : {}),
        }),
        ...correctionRefs.map(ref => Object.freeze({ ...ref })),
      ]),
    })];
  }));
}

/**
 * Projects the canonical Business Start Date allocation rows into Performance.
 * Daily amounts are consumed verbatim; this adapter must not reconstruct or
 * re-spread an owning feature's allocation. Pre-business recovery eligibility
 * is based on the authoritative source date: EMI due date or Compliance
 * valid-from date. Pre-business portions are already included in the canonical
 * daily rows; no second recovery schedule is created here.
 */
export class PerformanceFixedCostAllocationAdapterV1
implements PerformanceEmiReadModel, PerformanceComplianceReadModel, PerformanceCompletenessReadModel {
  private snapshot?: ReturnType<BusinessStartDateCostAllocationService["getReport"]>;

  constructor(
    private readonly allocation: Pick<BusinessStartDateCostAllocationService, "getReport">,
  ) {}

  async prepareSnapshot(from: string, _to: string): Promise<void> {
    this.snapshot = this.allocation.getReport();
    const report = await this.snapshot;
    if (report.businessStartDate !== from || report.result.businessStartDate !== from) {
      throw new Error("performance_allocation_snapshot_business_start_date_mismatch");
    }
  }

  releaseSnapshot(): void {
    this.snapshot = undefined;
  }

  async getSnapshotIdentity(): Promise<string> {
    const report = await this.report();
    return "business-settings:" + report.businessSettingsRevision + ":" + report.businessStartDate;
  }

  async getSourceSnapshotIdentity(): Promise<string> {
    const report = await this.report();
    const correctionRefs = report.sourceCorrectionRefs ?? [];
    const sources = report.result.sources.map(source => {
      const baseId = source.sourceId.replace(/:allocated$/, "");
      const refs = correctionRefs.find(item => item.sourceId === baseId)?.refs ?? [];
      return source.sourceId + "@" + source.sourceVersion + ":" + source.disposition + ":" +
        source.daily.map(row => row.date + "=" + row.amountPaise).join(",") + ":" +
        refs.map(ref => ref.sourceId + "@" + ref.revision).sort().join(",");
    }).sort();
    return "performance-fixed-cost-sources:" + sources.join("|");
  }

  private async report() {
    return this.snapshot ?? this.allocation.getReport();
  }

  async listPreBusinessRecoveryEntries() {
    const report = await this.report();
    return Object.freeze(report.result.sources.flatMap(source => {
      if ((source.sourceKind !== "emi" && source.sourceKind !== "compliance") ||
          source.disposition !== "allocated" || !source.sourcePeriod ||
          source.sourcePeriod.from >= report.businessStartDate) return [];
      return [Object.freeze({
        sourceId: source.sourceId, revision: source.sourceVersion,
        amountPaise: source.sourceAmountPaise, note: source.sourcePeriod.label,
        origin: source.sourceKind,
        ...(source.scheduleVersion !== undefined ? { scheduleVersion: source.scheduleVersion } : {}),
      })];
    }));
  }

  async listDailyEmiAllocations(from: string, to: string): Promise<readonly PerformanceDailyCostInputV1[]> {
    const report = await this.report();
    return Object.freeze(report.result.sources.flatMap(source => {
      if (source.sourceKind !== "emi" || source.disposition !== "allocated" ||
          (source.sourcePeriod?.from ?? "") < from) return [];
      return canonicalDailyRows(source, from, to, "emi");
    }));
  }

  async listDailyComplianceAllocations(from: string, to: string): Promise<readonly PerformanceDailyCostInputV1[]> {
    const report = await this.report();
    const blocked = blockedComplianceBases(report.result.sources);
    const correctionRefs = report.sourceCorrectionRefs ?? [];
    return Object.freeze(report.result.sources.flatMap(source => {
      if (source.sourceKind !== "compliance" || source.disposition !== "allocated" ||
          (source.sourcePeriod?.from ?? "") < from ||
          blocked.has(source.sourceId.replace(/:allocated$/, ""))) return [];
      const baseId = source.sourceId.replace(/:allocated$/, "");
      const refs = correctionRefs.find(item => item.sourceId === baseId)?.refs ?? [];
      return canonicalDailyRows(source, from, to, "compliance", refs);
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
    const historicalWithoutEligibleDays = report.result.sources.filter(source =>
      (source.sourceKind === "compliance" || source.sourceKind === "emi") &&
      source.disposition === "pre_business_historical");
    if (blocked.length || missingPeriod.length || incompleteDaily.length || historicalWithoutEligibleDays.length) return Object.freeze([Object.freeze({
      source: "finance-and-compliance-allocation",
      status: "review-required" as const,
      detail: [
        ...blocked.map(source => source.sourceId + " has unresolved overlap"),
        ...missingPeriod.map(source => source.sourceId + " lacks its original validity window"),
        ...incompleteDaily.map(source => source.sourceId + " has incomplete daily allocation rows"),
        ...historicalWithoutEligibleDays.map(source => source.sourceId + " ended before the Business Start Date and has no eligible allocation days"),
      ].sort().join("; "),
    })]);
    return Object.freeze([Object.freeze({
      source: "finance-and-compliance-allocation",
      status: "complete" as const,
    })]);
  }
}
