import type { PerformanceDailyCostInputV1, PerformanceCompletenessV1 } from "../../domain/src/performance-calculation-v1";
import type { FullCostBreakevenService } from "./full-cost-breakeven-service";
import type {
  PerformanceOperatingCostReadModel,
  PerformanceCompletenessReadModel,
} from "./performance-calculation-service";

const TRIP_FINANCIAL_PREFIX = "work:trip-financial-obligation:";

/**
 * Converts the established FullCostBreakeven source projection into the
 * Performance cost taxonomy while preserving category-specific source refs.
 * Fuel and Maintenance remain consumption/accrual costs, not pump purchases
 * or duplicated expense-ledger amounts.
 */
export class PerformanceOperatingCostAdapterV1 implements PerformanceOperatingCostReadModel {
  constructor(
    private readonly fullCost: Pick<FullCostBreakevenService, "getSourceProjection">,
  ) {}

  async listDailyCosts(from: string, to: string): Promise<readonly PerformanceDailyCostInputV1[]> {
    const projection = await this.fullCost.getSourceProjection(from, to);
    const result: PerformanceDailyCostInputV1[] = [];
    for (const activity of projection.dailyActivity) {
      if (activity.date < from || activity.date > to) continue;
      if (activity.fuelCostPaise > 0 && activity.fuelSourceRefs.length) result.push(Object.freeze({
        date: activity.date, kind: "fuel", amountPaise: activity.fuelCostPaise, verified: true,
        sourceRefs: Object.freeze(activity.fuelSourceRefs.map(ref => Object.freeze({ ...ref }))),
      }));
      if (activity.maintenanceCostPaise > 0 && activity.maintenanceSourceRefs.length) result.push(Object.freeze({
        date: activity.date, kind: "maintenance", amountPaise: activity.maintenanceCostPaise, verified: true,
        sourceRefs: Object.freeze(activity.maintenanceSourceRefs.map(ref => Object.freeze({ ...ref }))),
      }));
    }
    for (const cost of projection.datedCosts) {
      if (cost.date < from || cost.date > to || cost.amountPaise === 0) continue;
      let kind: PerformanceDailyCostInputV1["kind"];
      if (cost.kind === "platform-fee") kind = "platform-fee";
      else if (cost.kind === "traffic-challan") kind = "traffic-challan";
      else if (cost.kind === "miscellaneous") {
        kind = cost.sourceId.split("|").some(id => id.startsWith(TRIP_FINANCIAL_PREFIX))
          ? "toll-parking" : "miscellaneous";
      } else continue;
      const refs = cost.sourceRefs ?? [{ sourceId: cost.sourceId, revision: cost.sourceRevision }];
      if (!refs.length) continue;
      result.push(Object.freeze({
        date: cost.date, kind, amountPaise: cost.amountPaise, verified: true,
        sourceRefs: Object.freeze(refs.map(ref => Object.freeze({ sourceId: ref.sourceId, revision: ref.revision }))),
      }));
    }
    return Object.freeze(result);
  }
}

/** Combines independent source completeness without replacing source ownership. */
export class PerformanceCompletenessCompositeV1 implements PerformanceCompletenessReadModel {
  constructor(private readonly sources: readonly PerformanceCompletenessReadModel[]) {}
  async getCompleteness(from: string, to: string): Promise<readonly PerformanceCompletenessV1[]> {
    const results = await Promise.all(this.sources.map(source => source.getCompleteness(from, to)));
    return Object.freeze(results.flatMap(items => items.map(item => Object.freeze({ ...item }))));
  }
}
