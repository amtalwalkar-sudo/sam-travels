import type { PerformanceDailyCostInputV1, PerformanceCompletenessV1 } from "../../domain/src/performance-calculation-v1";
import type { FullCostBreakevenService } from "./full-cost-breakeven-service";
import type {
  PerformanceOperatingCostReadModel,
  PerformanceOperatingCostKindV1,
  PerformanceCompletenessReadModel,
} from "./performance-calculation-service";

const TRIP_FINANCIAL_PREFIX = "work:trip-financial-obligation:";

/**
 * Converts the established FullCostBreakeven source projection into the
 * Performance cost taxonomy while preserving category-specific source refs.
 * Fuel and Maintenance remain consumption/accrual costs, not pump purchases
 * or duplicated expense-ledger amounts.
 */
export class PerformanceOperatingCostAdapterV1 implements PerformanceOperatingCostReadModel, PerformanceCompletenessReadModel {
  private snapshot?: { from: string; to: string; value: ReturnType<FullCostBreakevenService["getSourceProjection"]> };

  constructor(
    private readonly fullCost: Pick<FullCostBreakevenService, "getSourceProjection">,
  ) {}

  async prepareSnapshot(from: string, to: string): Promise<void> {
    const value = this.fullCost.getSourceProjection(from, to);
    this.snapshot = { from, to, value };
    const projection = await value;
    if (projection.businessStartDate !== undefined && projection.businessStartDate !== from) {
      throw new Error("performance_operating_snapshot_business_start_date_mismatch");
    }
  }

  releaseSnapshot(): void {
    this.snapshot = undefined;
  }

  async getSourceSnapshotIdentity(): Promise<string> {
    const snapshot = this.snapshot;
    if (!snapshot) throw new Error("performance_operating_snapshot_not_prepared");
    const projection = await snapshot.value;
    const refs = [
      ...projection.dailyActivity.flatMap(activity =>
        activity.sourceRefs.filter((ref): ref is NonNullable<typeof ref> => ref !== undefined)),
      ...projection.datedCosts.flatMap(cost =>
        cost.sourceRefs?.filter((ref): ref is NonNullable<typeof ref> => ref !== undefined) ??
        [{ sourceId: cost.sourceId, revision: cost.sourceRevision }]),
    ];
    return "performance-operating-sources:" + refs
      .map(ref => ref.sourceId + "@" + ref.revision)
      .sort()
      .join("|");
  }

  async getSnapshotIdentity(): Promise<string | undefined> {
    const snapshot = this.snapshot;
    if (!snapshot) throw new Error("performance_operating_snapshot_not_prepared");
    const projection = await snapshot.value;
    if (projection.businessStartDate === undefined || projection.businessSettingsRevision === undefined) {
      return undefined;
    }
    return "business-settings:" + projection.businessSettingsRevision + ":" + projection.businessStartDate;
  }

  private async projection(from: string, to: string) {
    if (this.snapshot?.from === from && this.snapshot.to === to) return this.snapshot.value;
    return this.fullCost.getSourceProjection(from, to);
  }

  async listDailyCosts(from: string, to: string): Promise<readonly Readonly<{
    date: string; kind: PerformanceOperatingCostKindV1; amountPaise: number; verified: boolean;
    sourceRefs: PerformanceDailyCostInputV1["sourceRefs"];
  }>[]> {
    const projection = await this.projection(from, to);
    const result: Array<Readonly<{
      date: string; kind: PerformanceOperatingCostKindV1; amountPaise: number; verified: boolean;
      sourceRefs: PerformanceDailyCostInputV1["sourceRefs"];
    }>> = [];
    for (const activity of projection.dailyActivity) {
      if (activity.date < from || activity.date > to) continue;
      if ((activity.fuelCostPaise ?? 0) > 0 && activity.fuelSourceRefs.length) result.push(Object.freeze({
        date: activity.date, kind: "fuel", amountPaise: activity.fuelCostPaise ?? 0, verified: true,
        sourceRefs: Object.freeze(activity.fuelSourceRefs.map(ref => Object.freeze({ ...ref }))),
      }));
      if ((activity.maintenanceCostPaise ?? 0) > 0 && activity.maintenanceSourceRefs.length) result.push(Object.freeze({
        date: activity.date, kind: "maintenance", amountPaise: activity.maintenanceCostPaise ?? 0, verified: true,
        sourceRefs: Object.freeze(activity.maintenanceSourceRefs.map(ref => Object.freeze({ ...ref }))),
      }));
    }
    for (const cost of projection.datedCosts) {
      if (cost.date < from || cost.date > to || cost.amountPaise === 0) continue;
      let kind: PerformanceOperatingCostKindV1;
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

  async getCompleteness(from: string, to: string): Promise<readonly PerformanceCompletenessV1[]> {
    const projection = await this.projection(from, to);
    return Object.freeze(projection.completeness.map(item => Object.freeze({ ...item })));
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
