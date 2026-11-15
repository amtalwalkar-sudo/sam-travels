import type { PerformanceDailyCostInputV1, PreBusinessRecoverySourceV1, PerformanceCompletenessV1 } from "../../domain/src/performance-calculation-v1";
import type { BusinessStartDateCostAllocationService } from "./business-start-date-cost-allocation-service";
import type { PerformanceEmiReadModel, PerformanceComplianceReadModel, PerformanceCompletenessReadModel } from "./performance-calculation-service";

/**
 * Projects the existing immutable EMI/Compliance allocation report into the
 * separate Performance v1.0 source ports. EMI carry-forward is deliberately
 * moved to the 18-month recovery input and is never also emitted as a daily
 * EMI cost. Fully historical Compliance entries are treated likewise.
 *
 * The existing allocation report does not expose enough source-period detail
 * to split a Compliance record that overlaps business start. Such cases are
 * withheld and reported for review rather than guessed or double-counted.
 */
export class PerformanceFixedCostAllocationAdapterV1
implements PerformanceEmiReadModel, PerformanceComplianceReadModel, PerformanceCompletenessReadModel {
  constructor(
    private readonly allocation: Pick<BusinessStartDateCostAllocationService, "getReport">,
  ) {}

  private async report() {
    return this.allocation.getReport();
  }

  async listDailyEmiAllocations(from: string, to: string): Promise<readonly PerformanceDailyCostInputV1[]> {
    const report = await this.report();
    return Object.freeze(report.result.sources.flatMap(source => {
      if (source.sourceKind !== "emi") return [];
      return source.daily.filter(row => row.date >= from && row.date <= to).map(row => Object.freeze({
        date: row.date, kind: "emi" as const, amountPaise: row.amountPaise, verified: true,
        sourceRefs: Object.freeze([{ sourceId: row.sourceId, revision: row.sourceVersion }]),
      }));
    }));
  }

  async listDailyComplianceAllocations(from: string, to: string): Promise<readonly PerformanceDailyCostInputV1[]> {
    const report = await this.report();
    return Object.freeze(report.result.sources.flatMap(source => {
      if (source.sourceKind !== "compliance" || source.disposition !== "allocated") return [];
      return source.daily.filter(row => row.date >= from && row.date <= to).map(row => Object.freeze({
        date: row.date, kind: "compliance" as const, amountPaise: row.amountPaise, verified: true,
        sourceRefs: Object.freeze([{ sourceId: row.sourceId, revision: row.sourceVersion }]),
      }));
    }));
  }

  async listPreBusinessEmiPortions(): Promise<readonly PreBusinessRecoverySourceV1[]> {
    const report = await this.report();
    return Object.freeze(report.result.sources.filter(source =>
      source.sourceKind === "emi-pre-business-carry-forward" &&
      source.disposition !== "overlap_review_required" && source.sourceAmountPaise > 0,
    ).map(source => Object.freeze({
      sourceId: source.sourceId, revision: source.sourceVersion,
      amountPaise: source.sourceAmountPaise,
      note: "Pre-business EMI carry-forward from " + source.sourceId,
      origin: "emi" as const,
    })));
  }

  async listPreBusinessCompliancePortions(): Promise<readonly PreBusinessRecoverySourceV1[]> {
    const report = await this.report();
    return Object.freeze(report.result.sources.filter(source =>
      source.sourceKind === "compliance" && source.disposition === "pre_business_historical" &&
      source.sourceAmountPaise > 0,
    ).map(source => Object.freeze({
      sourceId: source.sourceId, revision: source.sourceVersion,
      amountPaise: source.sourceAmountPaise,
      note: "Compliance cost wholly before business start: " + source.sourceId,
      origin: "compliance" as const,
    })));
  }

  async getCompleteness(_from: string, _to: string): Promise<readonly PerformanceCompletenessV1[]> {
    const report = await this.report();
    const blocked = report.result.sources.filter(source =>
      source.disposition === "overlap_review_required");
    if (blocked.length) return Object.freeze([Object.freeze({
      source: "finance-and-compliance-allocation",
      status: "review-required" as const,
      detail: blocked.map(source => source.sourceId).sort().join(", ") +
        " require overlap review before their costs can be included.",
    })]);
    return Object.freeze([Object.freeze({
      source: "finance-and-compliance-allocation",
      status: "complete" as const,
    })]);
  }
}
