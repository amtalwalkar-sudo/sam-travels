import type { TripFinancialService, SubmittedTripFinancialRecordV1 } from "./trip-financial-service";
import type { HistoricalTripBackfillV1 } from "../../domain/src/historical-trip-backfill";
import type { RecordEnvelope } from "../../core/src/types";
import type { PerformanceCompletenessV1, PerformanceDailyRevenueInputV1 } from "../../domain/src/performance-calculation-v1";
import type { PerformanceCompletenessReadModel, PerformanceRevenueReadModel } from "./performance-calculation-service";

type SubmittedTripFinancialRecord = SubmittedTripFinancialRecordV1;
export type HistoricalTripBackfillRevenueReaderV1 = Readonly<{
  list(): Promise<readonly RecordEnvelope<HistoricalTripBackfillV1>[]>;
}>;

function validOperationalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

/** Projects Work fares and separately attributed Admin-declared historical fares. */
export class PerformanceTripRevenueAdapterV1 implements PerformanceRevenueReadModel, PerformanceCompletenessReadModel {
  private snapshot?: Promise<Readonly<{
    tripRecords: readonly SubmittedTripFinancialRecord[];
    backfills: readonly RecordEnvelope<HistoricalTripBackfillV1>[];
  }>>;

  constructor(
    private readonly tripFinancials: Pick<TripFinancialService, "submittedTripFinancialRecords">,
    private readonly backfillReader?: HistoricalTripBackfillRevenueReaderV1,
  ) {}

  async prepareSnapshot(_from: string, _to: string): Promise<void> {
    this.snapshot = Promise.all([
      this.tripFinancials.submittedTripFinancialRecords(),
      this.backfillReader?.list() ?? Promise.resolve([]),
    ]).then(([tripRecords, backfills]) => ({ tripRecords, backfills }));
    await this.snapshot;
  }

  releaseSnapshot(): void { this.snapshot = undefined; }

  private async records() {
    if (this.snapshot) return this.snapshot;
    const [tripRecords, backfills] = await Promise.all([
      this.tripFinancials.submittedTripFinancialRecords(),
      this.backfillReader?.list() ?? Promise.resolve([]),
    ]);
    return { tripRecords, backfills };
  }

  async getSourceSnapshotIdentity(): Promise<string> {
    const { tripRecords, backfills } = await this.records();
    return "performance-trip-revenue-sources:" + [
      ...tripRecords.flatMap(record => [
        record.id + "@" + record.revision,
        ...(record.correctionRefs ?? []).map(ref => ref.sourceId + "@" + ref.revision),
      ]),
      ...backfills.filter(record => !record.deletedAt).map(record => record.id + "@" + record.revision),
    ].sort().join("|");
  }

  async listVerifiedDailyRevenue(from: string, to: string): Promise<readonly PerformanceDailyRevenueInputV1[]> {
    const records = await this.records();
    const result: PerformanceDailyRevenueInputV1[] = [];
    for (const record of records.tripRecords) {
      const data = record.data, context = data.tripContext;
      if (!context || !validOperationalDate(context.operationalDate) ||
          context.operationalDate < from || context.operationalDate > to) continue;
      if (data.kind === "completed_ride_financials") {
        if (!Number.isSafeInteger(data.farePaise) || (data.farePaise ?? -1) < 0) continue;
        result.push(Object.freeze({
          date: context.operationalDate, grossFarePaise: data.farePaise!, cancellationFeePaise: 0,
          verified: true,
          sourceRefs: Object.freeze([
            { sourceId: record.id, revision: record.revision },
            ...(record.correctionRefs ?? []).map(ref => ({ sourceId: ref.sourceId, revision: ref.revision })),
          ]),
        }));
      } else if (data.kind === "cancellation_fee") {
        if (!Number.isSafeInteger(data.feePaise) || (data.feePaise ?? -1) < 0) continue;
        result.push(Object.freeze({
          date: context.operationalDate, grossFarePaise: 0, cancellationFeePaise: data.feePaise!,
          verified: true, attribution: "work_event",
          sourceRefs: Object.freeze([{ sourceId: record.id, revision: record.revision }]),
        }));
      }
    }
    for (const record of records.backfills) {
      const data = record.data;
      if (record.deletedAt || data.kind !== "historical_trip_backfill" || data.status !== "submitted" ||
          !validOperationalDate(data.operationalDate) || data.operationalDate < from || data.operationalDate > to ||
          !Number.isSafeInteger(data.farePaise) || data.farePaise < 0) continue;
      result.push(Object.freeze({
        date: data.operationalDate, grossFarePaise: data.farePaise, cancellationFeePaise: 0,
        verified: true, attribution: "admin_declared",
        sourceRefs: Object.freeze([{ sourceId: record.id, revision: record.revision }]),
      }));
    }
    return Object.freeze(result.sort((a,b)=>a.date.localeCompare(b.date) ||
      (a.attribution ?? "work_event").localeCompare(b.attribution ?? "work_event") ||
      a.sourceRefs[0].sourceId.localeCompare(b.sourceRefs[0].sourceId)));
  }

  async getCompleteness(from: string, to: string): Promise<readonly PerformanceCompletenessV1[]> {
    const records = await this.records();
    const unresolved = records.tripRecords.filter(record => {
      const data = record.data, context = data.tripContext;
      const amountPresent = data.kind === "completed_ride_financials"
        ? Number.isSafeInteger(data.farePaise) && (data.farePaise ?? -1) >= 0
        : Number.isSafeInteger(data.feePaise) && (data.feePaise ?? -1) >= 0;
      return !context || !validOperationalDate(context.operationalDate) ||
        (!amountPresent && context.operationalDate >= from && context.operationalDate <= to);
    });
    const invalidBackfills = records.backfills.filter(record => !record.deletedAt &&
      (record.data.kind !== "historical_trip_backfill" || !validOperationalDate(record.data.operationalDate) ||
       !Number.isSafeInteger(record.data.farePaise) || record.data.farePaise < 0));
    if (!unresolved.length && !invalidBackfills.length) return Object.freeze([
      Object.freeze({ source: "trip-financials", status: "complete" as const }),
      ...(this.backfillReader ? [Object.freeze({ source: "historical-trip-backfills", status: "complete" as const })] : []),
    ]);
    return Object.freeze([Object.freeze({
      source: "trip-financials-and-backfills", status: "incomplete" as const,
      detail: unresolved.length + " submitted Work trip financial record(s) lack valid immutable revenue attribution or amount." +
        (invalidBackfills.length ? " " + invalidBackfills.length + " historical backfill record(s) are invalid." : ""),
    })]);
  }
}
