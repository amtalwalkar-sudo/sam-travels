import type { RecordEnvelope } from "../../core/src/types";
import type {
  CancellationFeeObligation,
  CompletedTripFinancialObligation,
  TripFinancialService,
} from "./trip-financial-service";
import type {
  PerformanceCompletenessV1,
  PerformanceDailyRevenueInputV1,
} from "../../domain/src/performance-calculation-v1";
import type {
  PerformanceCompletenessReadModel,
  PerformanceRevenueReadModel,
} from "./performance-calculation-service";

type SubmittedTripFinancialRecord = RecordEnvelope<
  CancellationFeeObligation | CompletedTripFinancialObligation
>;

function validOperationalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

/**
 * Adapts the authoritative submitted trip-closeout ledger into gross revenue.
 * Operational dates come only from the immutable trip context captured when
 * the obligation was created; timestamps or the currently selected shift are
 * never used to guess attribution.
 */
export class PerformanceTripRevenueAdapterV1
implements PerformanceRevenueReadModel, PerformanceCompletenessReadModel {
  private snapshot?: Promise<readonly SubmittedTripFinancialRecord[]>;

  constructor(
    private readonly tripFinancials: Pick<TripFinancialService, "submittedTripFinancialRecords">,
  ) {}

  async prepareSnapshot(_from: string, _to: string): Promise<void> {
    this.snapshot = this.tripFinancials.submittedTripFinancialRecords();
    await this.snapshot;
  }

  releaseSnapshot(): void {
    this.snapshot = undefined;
  }

  private async records(): Promise<readonly SubmittedTripFinancialRecord[]> {
    return this.snapshot ?? this.tripFinancials.submittedTripFinancialRecords();
  }

  async listVerifiedDailyRevenue(from: string, to: string): Promise<readonly PerformanceDailyRevenueInputV1[]> {
    const records = await this.records();
    const result: PerformanceDailyRevenueInputV1[] = [];
    for (const record of records) {
      const data = record.data;
      const context = data.tripContext;
      if (!context || !validOperationalDate(context.operationalDate) ||
          context.operationalDate < from || context.operationalDate > to) continue;
      if (data.kind === "completed_ride_financials") {
        if (!Number.isSafeInteger(data.farePaise) || (data.farePaise ?? -1) < 0) continue;
        result.push(Object.freeze({
          date: context.operationalDate,
          grossFarePaise: data.farePaise!,
          cancellationFeePaise: 0,
          verified: true,
          sourceRefs: Object.freeze([{ sourceId: record.id, revision: record.revision }]),
        }));
      } else if (data.kind === "cancellation_fee") {
        if (!Number.isSafeInteger(data.feePaise) || (data.feePaise ?? -1) < 0) continue;
        result.push(Object.freeze({
          date: context.operationalDate,
          grossFarePaise: 0,
          cancellationFeePaise: data.feePaise!,
          verified: true,
          sourceRefs: Object.freeze([{ sourceId: record.id, revision: record.revision }]),
        }));
      }
    }
    return Object.freeze(result);
  }

  async getCompleteness(from: string, to: string): Promise<readonly PerformanceCompletenessV1[]> {
    const records = await this.records();
    const unresolved = records.filter(record => {
      const data = record.data;
      const context = data.tripContext;
      const amountPresent = data.kind === "completed_ride_financials"
        ? Number.isSafeInteger(data.farePaise) && (data.farePaise ?? -1) >= 0
        : Number.isSafeInteger(data.feePaise) && (data.feePaise ?? -1) >= 0;
      return !context || !validOperationalDate(context.operationalDate) ||
        (!amountPresent && context.operationalDate >= from && context.operationalDate <= to);
    });
    if (!unresolved.length) return Object.freeze([
      Object.freeze({ source: "trip-financials", status: "complete" as const }),
    ]);
    return Object.freeze([Object.freeze({
      source: "trip-financials",
      status: "incomplete" as const,
      detail: unresolved.length + " submitted trip financial record(s) lack valid immutable revenue attribution or amount.",
    })]);
  }
}
