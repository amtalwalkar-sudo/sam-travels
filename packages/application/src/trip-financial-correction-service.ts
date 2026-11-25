import type { AtomicRecordBatchRepository } from "../../core/src/repositories";
import type { RecordEnvelope } from "../../core/src/types";
import { HistoricalCorrectionService, type HistoricalCorrectionActorProvider, type SubmitHistoricalCorrectionV1 } from "./historical-correction-service";
import { projectHistoricalCorrectionsV1, type HistoricalCorrectionV1 } from "../../domain/src/historical-correction";
import {
  TRIP_FINANCIAL_OBLIGATION_PREFIX,
  type CancellationFeeObligation,
  type CompletedTripFinancialObligation,
} from "./trip-financial-service";
import { validateCancellationFeeSubmission, validateCompletedTripFinancialSubmission } from "./driver-form-definitions";

export type TripFinancialCorrectionReferenceV1 = Readonly<{
  sourceId: string;
  revision: number;
  chainRevision: number;
}>;

export type TripFinancialCorrectionProjectionV1 = Readonly<{
  data: CancellationFeeObligation | CompletedTripFinancialObligation;
  correctionChainRevision: number;
  correctionRefs: readonly TripFinancialCorrectionReferenceV1[];
}>;

type ChainHeadV1 = Readonly<{
  schemaVersion: 1;
  targetRecordId: string;
  chainRevision: number;
  headCorrectionId?: string;
}>;

/** Trip-financial-owned correction policy. Source obligations and Work events remain immutable. */
export class TripFinancialCorrectionServiceV1 {
  private readonly corrections: HistoricalCorrectionService;

  constructor(
    private readonly records: AtomicRecordBatchRepository,
    actorProvider: HistoricalCorrectionActorProvider,
    source: RecordEnvelope<unknown>["source"] = "web",
    now?: () => string,
  ) {
    this.corrections = new HistoricalCorrectionService(records, actorProvider, {
      async resolve(record) {
        if (!record.id.startsWith(TRIP_FINANCIAL_OBLIGATION_PREFIX) ||
            !record.data || typeof record.data !== "object") {
          throw new Error("trip_financial_correction_target_invalid");
        }
        const data = record.data as Record<string, unknown>;
        if (data.schemaVersion !== 1 || data.status !== "submitted" ||
            typeof data.tripId !== "string" || record.id !== TRIP_FINANCIAL_OBLIGATION_PREFIX + data.tripId) {
          throw new Error("trip_financial_correction_target_invalid");
        }
        if (data.kind === "completed_ride_financials") {
          return {
            featureId: "work-trip-finance",
            allowedFieldPaths: ["farePaise", "tollPaise", "tollPayer", "parkingPaise", "parkingPayer"],
            validateProjectedData(value) {
              const projected = value as Record<string, unknown>;
              if (projected.kind !== "completed_ride_financials" || projected.status !== "submitted") {
                throw new Error("trip_financial_correction_projection_invalid");
              }
              const issues = validateCompletedTripFinancialSubmission({
                tripId: projected.tripId,
                farePaise: projected.farePaise,
                tollPaise: projected.tollPaise,
                tollPayer: projected.tollPayer,
                parkingPaise: projected.parkingPaise,
                parkingPayer: projected.parkingPayer,
              });
              if (issues.length) throw new Error("trip_financial_correction_projection_invalid:" + issues[0]);
            },
          };
        }
        if (data.kind === "cancellation_fee") {
          return {
            featureId: "work-trip-finance",
            allowedFieldPaths: ["feePaise"],
            validateProjectedData(value) {
              const projected = value as Record<string, unknown>;
              if (projected.kind !== "cancellation_fee" || projected.status !== "submitted") {
                throw new Error("trip_financial_correction_projection_invalid");
              }
              const issues = validateCancellationFeeSubmission({
                tripId: projected.tripId,
                cancellationFeePaise: projected.feePaise,
              });
              if (issues.length) throw new Error("trip_financial_correction_projection_invalid:" + issues[0]);
            },
          };
        }
        throw new Error("trip_financial_correction_target_invalid");
      },
    }, source, now);
  }

  listForTarget(targetRecordId: string): Promise<HistoricalCorrectionV1[]> {
    return this.corrections.listForTarget(targetRecordId);
  }

  submit(input: SubmitHistoricalCorrectionV1) {
    return this.corrections.submit(input);
  }

  async project<T extends CancellationFeeObligation | CompletedTripFinancialObligation>(
    record: RecordEnvelope<T>,
  ): Promise<TripFinancialCorrectionProjectionV1> {
    const original = await this.records.get<T>(record.id);
    if (!original || original.deletedAt || original.revision !== record.revision ||
        original.id !== TRIP_FINANCIAL_OBLIGATION_PREFIX + original.data.tripId ||
        original.data.kind !== record.data.kind || original.data.tripId !== record.data.tripId) {
      throw new Error("trip_financial_correction_source_changed");
    }
    const history = await this.corrections.listForTarget(original.id);
    if (history.some(item => item.featureId !== "work-trip-finance" ||
        item.targetRecordRevision !== original.revision)) {
      throw new Error("trip_financial_correction_chain_invalid");
    }
    const projection = projectHistoricalCorrectionsV1(original.data, history);
    if (projection.status !== "valid") throw new Error("trip_financial_correction_projection_invalid");
    const chainHeadId = "historical-correction-chain:" + encodeURIComponent(original.id);
    const head = await this.records.get<ChainHeadV1>(chainHeadId);
    if (history.length === 0 ? !!head :
        !head || head.data.schemaVersion !== 1 || head.data.targetRecordId !== original.id ||
        head.data.chainRevision !== projection.chainRevision ||
        head.data.headCorrectionId !== projection.headCorrectionId ||
        head.revision !== projection.chainRevision) {
      throw new Error("trip_financial_correction_chain_head_invalid");
    }
    const correctionRefs = await Promise.all(history.map(async item => {
      const correction = await this.records.get<HistoricalCorrectionV1>("historical-correction:" + item.correctionId);
      if (!correction || correction.revision !== 1) throw new Error("trip_financial_correction_record_invalid");
      return Object.freeze({
        sourceId: correction.id,
        revision: correction.revision,
        chainRevision: item.chainRevision,
      });
    }));
    return Object.freeze({
      data: projection.data as CancellationFeeObligation | CompletedTripFinancialObligation,
      correctionChainRevision: projection.chainRevision,
      correctionRefs: Object.freeze(correctionRefs),
    });
  }
}
