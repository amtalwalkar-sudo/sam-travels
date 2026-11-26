import type { AtomicRecordBatchRepository } from "../../core/src/repositories";
import type { RecordEnvelope } from "../../core/src/types";
import { assertHistoricalTripBackfillV1, type HistoricalTripBackfillV1 } from "../../domain/src/historical-trip-backfill";
import { projectHistoricalCorrectionsV1, type HistoricalCorrectionV1 } from "../../domain/src/historical-correction";
import {
  HistoricalCorrectionService,
  type HistoricalCorrectionActorProvider,
  type SubmitHistoricalCorrectionV1,
} from "./historical-correction-service";

export const HISTORICAL_TRIP_BACKFILL_CORRECTION_FEATURE = "historical-trip-backfill-finance";

export type HistoricalTripBackfillCorrectionProjectionV1 = Readonly<{
  data: HistoricalTripBackfillV1;
  correctionChainRevision: number;
  correctionRefs: readonly Readonly<{ sourceId: string; revision: number; chainRevision: number }>[];
}>;

type ChainHeadV1 = Readonly<{
  schemaVersion: 1;
  targetRecordId: string;
  chainRevision: number;
  headCorrectionId?: string;
}>;

/** Append-only correction authority for Admin-declared historical trips. */
export class HistoricalTripBackfillCorrectionServiceV1 {
  private readonly corrections: HistoricalCorrectionService;

  constructor(
    private readonly records: AtomicRecordBatchRepository,
    actorProvider: HistoricalCorrectionActorProvider,
    source: RecordEnvelope<unknown>["source"] = "web",
    now?: () => string,
  ) {
    this.corrections = new HistoricalCorrectionService(records, actorProvider, {
      async resolve(record) {
        if (!record.id.startsWith("historical-trip-backfill:") || !record.data ||
            typeof record.data !== "object") throw new Error("historical_trip_backfill_correction_target_invalid");
        const data = record.data as Record<string, unknown>;
        if (data.kind !== "historical_trip_backfill" || data.status !== "submitted" ||
            data.schemaVersion !== 1 || record.id !== "historical-trip-backfill:" + data.backfillId) {
          throw new Error("historical_trip_backfill_correction_target_invalid");
        }
        return {
          featureId: HISTORICAL_TRIP_BACKFILL_CORRECTION_FEATURE,
          allowedFieldPaths: ["farePaise", "tollPaise", "tollPayer", "parkingPaise", "parkingPayer"],
          validateProjectedData(value) {
            try { assertHistoricalTripBackfillV1(value); }
            catch { throw new Error("historical_trip_backfill_correction_projection_invalid"); }
          },
        };
      },
    }, source, now);
  }

  listForTarget(targetRecordId: string): Promise<HistoricalCorrectionV1[]> {
    return this.corrections.listForTarget(targetRecordId);
  }

  submit(input: SubmitHistoricalCorrectionV1) {
    return this.corrections.submit(input);
  }

  async project(record: RecordEnvelope<HistoricalTripBackfillV1>): Promise<HistoricalTripBackfillCorrectionProjectionV1> {
    const original = await this.records.get<HistoricalTripBackfillV1>(record.id);
    if (!original || original.deletedAt || original.revision !== record.revision ||
        original.id !== "historical-trip-backfill:" + original.data.backfillId) {
      throw new Error("historical_trip_backfill_correction_source_changed");
    }
    assertHistoricalTripBackfillV1(original.data);
    const history = await this.corrections.listForTarget(original.id);
    if (history.some(item => item.featureId !== HISTORICAL_TRIP_BACKFILL_CORRECTION_FEATURE ||
        item.targetRecordRevision !== original.revision)) {
      throw new Error("historical_trip_backfill_correction_chain_invalid");
    }
    const projection = projectHistoricalCorrectionsV1(original.data, history);
    if (projection.status !== "valid") throw new Error("historical_trip_backfill_correction_projection_invalid");
    const headId = "historical-correction-chain:" + encodeURIComponent(original.id);
    const head = await this.records.get<ChainHeadV1>(headId);
    if (history.length === 0 ? !!head :
        !head || head.data.schemaVersion !== 1 || head.data.targetRecordId !== original.id ||
        head.data.chainRevision !== projection.chainRevision ||
        head.data.headCorrectionId !== projection.headCorrectionId ||
        head.revision !== projection.chainRevision) {
      throw new Error("historical_trip_backfill_correction_chain_head_invalid");
    }
    const refs = await Promise.all(history.map(async item => {
      const correction = await this.records.get<HistoricalCorrectionV1>("historical-correction:" + item.correctionId);
      if (!correction || correction.revision !== 1) throw new Error("historical_trip_backfill_correction_record_invalid");
      return Object.freeze({ sourceId: correction.id, revision: correction.revision, chainRevision: item.chainRevision });
    }));
    return Object.freeze({
      data: projection.data as HistoricalTripBackfillV1,
      correctionChainRevision: projection.chainRevision,
      correctionRefs: Object.freeze(refs),
    });
  }
}
