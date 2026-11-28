import type { RecordEnvelope } from "../../core/src/types";
import type { HistoricalTripBackfillV1 } from "../../domain/src/historical-trip-backfill";
import type { BreakevenDailyCostV1 } from "../../domain/src/full-cost-breakeven";

export type HistoricalTripBackfillCostReaderV1 = Readonly<{
  list(): Promise<readonly RecordEnvelope<HistoricalTripBackfillV1>[]>;
}>;
export type HistoricalTripBackfillCostCorrectionReaderV1 = Readonly<{
  project(record: RecordEnvelope<HistoricalTripBackfillV1>): Promise<Readonly<{
    data: HistoricalTripBackfillV1;
    correctionRefs: readonly Readonly<{ sourceId: string; revision: number; chainRevision: number }>[];
  }>>;
}>;
type ProjectedHistoricalTripBackfillV1 = RecordEnvelope<HistoricalTripBackfillV1> & Readonly<{
  correctionRefs: readonly Readonly<{ sourceId: string; revision: number; chainRevision: number }>[];
}>;

export async function listProjectedHistoricalTripBackfillsV1(
  reader?: HistoricalTripBackfillCostReaderV1,
  corrections?: HistoricalTripBackfillCostCorrectionReaderV1,
): Promise<readonly ProjectedHistoricalTripBackfillV1[]> {
  const records = await reader?.list() ?? [];
  return corrections
    ? Promise.all(records.map(async record => {
        const projection = await corrections.project(record);
        return { ...record, data: projection.data, correctionRefs: projection.correctionRefs };
      }))
    : records.map(record => ({ ...record, correctionRefs: [] }));
}

export function projectHistoricalTripBackfillCostsV1(
  records: readonly ProjectedHistoricalTripBackfillV1[],
  vehicleId: string,
  from: string,
  to: string,
): BreakevenDailyCostV1[] {
  return records.flatMap(record => {
    const data = record.data;
    if (record.deletedAt || data.vehicleId !== vehicleId ||
        data.operationalDate < from || data.operationalDate > to) return [];
    const amountPaise = (data.tollPayer === "driver" ? data.tollPaise ?? 0 : 0) +
      (data.parkingPayer === "driver" ? data.parkingPaise ?? 0 : 0);
    return amountPaise > 0 ? [{
      date: data.operationalDate, amountPaise, kind: "miscellaneous" as const,
      sourceId: record.id, sourceRevision: record.revision,
      sourceRefs: [
        { sourceId: record.id, revision: record.revision },
        ...record.correctionRefs.map(ref => ({ sourceId: ref.sourceId, revision: ref.revision })),
      ],
    }] : [];
  });
}
