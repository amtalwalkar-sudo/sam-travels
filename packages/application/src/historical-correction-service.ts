import type { AtomicRecordRepository } from "../../core/src/repositories";
import { RECORD_ENVELOPE_SCHEMA_VERSION } from "../../core/src/persistence-contract";
import type { RecordEnvelope } from "../../core/src/types";
import {
  assertCorrectionAuthority,
  assertHistoricalCorrectionV1,
  projectHistoricalCorrectionsV1,
  type CorrectionActorV1,
  type CorrectionJsonValue,
  type HistoricalCorrectionV1,
} from "../../domain/src/historical-correction";

const CORRECTION_PREFIX = "historical-correction:";

export type HistoricalCorrectionTargetPolicyV1 = Readonly<{
  featureId: string;
  /** Must come from trusted persisted author provenance, never from a form value. */
  originalAuthorId?: string;
  /** Feature-owned allowlist; broad object mutation is deliberately unsupported. */
  allowedFieldPaths: readonly string[];
  validateProjectedData(data: unknown): void;
}>;

export type HistoricalCorrectionActorProvider = Readonly<{
  currentActor(): Promise<CorrectionActorV1>;
}>;

export type HistoricalCorrectionTargetResolver = Readonly<{
  resolve(record: RecordEnvelope<unknown>): Promise<HistoricalCorrectionTargetPolicyV1>;
}>;

export type SubmitHistoricalCorrectionV1 = Readonly<{
  correctionId: string;
  targetRecordId: string;
  expectedTargetRevision: number;
  expectedChainRevision: number;
  fieldPath: string;
  afterValue: CorrectionJsonValue;
  reason: string;
  businessEffectiveDate?: string;
}>;

function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object" ||
      Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => sameJson(value, right[index]));
  }
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  const keys = Object.keys(a).sort();
  return keys.join("\0") === Object.keys(b).sort().join("\0") &&
    keys.every(key => sameJson(a[key], b[key]));
}

function sameIntent(existing: HistoricalCorrectionV1, input: SubmitHistoricalCorrectionV1, actor: CorrectionActorV1): boolean {
  return existing.targetRecordId === input.targetRecordId &&
    existing.targetRecordRevision === input.expectedTargetRevision &&
    existing.chainRevision === input.expectedChainRevision + 1 &&
    existing.fieldPath === input.fieldPath &&
    sameJson(existing.afterValue, input.afterValue) &&
    existing.reason === input.reason.trim() &&
    existing.actor.role === actor.role && existing.actor.actorId === actor.actorId &&
    existing.businessEffectiveDate === input.businessEffectiveDate;
}

/**
 * Shared append-only correction writer. It never updates or deletes the original record.
 * A feature must supply trusted author provenance and its own field/value validation policy.
 */
export class HistoricalCorrectionService {
  constructor(
    private readonly records: AtomicRecordRepository,
    private readonly actorProvider: HistoricalCorrectionActorProvider,
    private readonly targetResolver: HistoricalCorrectionTargetResolver,
    private readonly source: RecordEnvelope<unknown>["source"],
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async listForTarget(targetRecordId: string): Promise<HistoricalCorrectionV1[]> {
    const rows = await this.records.list<HistoricalCorrectionV1>();
    return rows
      .filter(row => row.id.startsWith(CORRECTION_PREFIX) &&
        row.data?.schemaVersion === 1 && row.data.targetRecordId === targetRecordId)
      .map(row => {
        assertHistoricalCorrectionV1(row.data);
        return row.data;
      })
      .sort((a, b) => a.chainRevision - b.chainRevision);
  }

  async submit(input: SubmitHistoricalCorrectionV1): Promise<Readonly<{
    correction: HistoricalCorrectionV1;
    currentData: unknown;
    chainRevision: number;
  }>> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.correctionId) ||
        !input.targetRecordId.trim() ||
        !Number.isSafeInteger(input.expectedTargetRevision) || input.expectedTargetRevision < 1 ||
        !Number.isSafeInteger(input.expectedChainRevision) || input.expectedChainRevision < 0 ||
        !input.reason.trim() || input.reason.trim().length > 1000) {
      throw new Error("historical_correction_command_invalid");
    }

    const actor = await this.actorProvider.currentActor();
    if (!actor || (actor.role !== "driver" && actor.role !== "admin") ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(actor.actorId)) {
      throw new Error("historical_correction_actor_unavailable");
    }

    const correctionRecordId = CORRECTION_PREFIX + input.correctionId;
    const existing = await this.records.get<HistoricalCorrectionV1>(correctionRecordId);
    if (existing) {
      assertHistoricalCorrectionV1(existing.data);
      if (!sameIntent(existing.data, input, actor)) throw new Error("historical_correction_id_reused");
      const target = await this.records.get<unknown>(input.targetRecordId);
      if (!target || target.revision !== existing.data.targetRecordRevision) {
        throw new Error("historical_correction_target_revision_changed");
      }
      const corrections = await this.listForTarget(input.targetRecordId);
      const projection = projectHistoricalCorrectionsV1(target.data, corrections);
      if (projection.status !== "valid") throw new Error("historical_correction_chain_needs_attention");
      return { correction: existing.data, currentData: projection.data, chainRevision: projection.chainRevision };
    }

    const target = await this.records.get<unknown>(input.targetRecordId);
    if (!target || target.deletedAt) throw new Error("historical_correction_target_unavailable");
    if (target.revision !== input.expectedTargetRevision) throw new Error("historical_correction_target_revision_changed");

    const policy = await this.targetResolver.resolve(target);
    if (!policy.allowedFieldPaths.includes(input.fieldPath)) throw new Error("historical_correction_field_not_allowed");
    // Prefer immutable envelope provenance; resolver fallback exists only for verified legacy adapters.
    const originalAuthorId = target.createdBy?.personId ?? policy.originalAuthorId;
    assertCorrectionAuthority(actor, originalAuthorId);

    const corrections = await this.listForTarget(input.targetRecordId);
    if (corrections.some(item => item.targetRecordRevision !== target.revision)) {
      throw new Error("historical_correction_target_revision_changed");
    }
    const projection = projectHistoricalCorrectionsV1(target.data, corrections);
    if (projection.status !== "valid") throw new Error("historical_correction_chain_needs_attention");
    if (projection.chainRevision !== input.expectedChainRevision) {
      throw new Error("historical_correction_stale_chain");
    }

    const parts = input.fieldPath.split(".");
    let beforeValue: unknown = projection.data;
    for (const part of parts) {
      if (!beforeValue || typeof beforeValue !== "object" ||
          !Object.prototype.hasOwnProperty.call(beforeValue, part)) {
        throw new Error("historical_correction_field_missing");
      }
      beforeValue = (beforeValue as Record<string, unknown>)[part];
    }
    const recordedAt = this.now();
    const correction: HistoricalCorrectionV1 = {
      schemaVersion: 1,
      correctionId: input.correctionId,
      targetRecordId: input.targetRecordId,
      targetRecordRevision: target.revision,
      featureId: policy.featureId,
      chainRevision: projection.chainRevision + 1,
      ...(projection.headCorrectionId ? { supersedesCorrectionId: projection.headCorrectionId } : {}),
      fieldPath: input.fieldPath,
      beforeValue: beforeValue as CorrectionJsonValue,
      afterValue: input.afterValue,
      reason: input.reason.trim(),
      actor,
      recordedAt,
      ...(input.businessEffectiveDate ? { businessEffectiveDate: input.businessEffectiveDate } : {}),
    };
    assertHistoricalCorrectionV1(correction);
    const projected = projectHistoricalCorrectionsV1(target.data, [...corrections, correction]);
    if (projected.status !== "valid") throw new Error("historical_correction_projection_invalid");
    policy.validateProjectedData(projected.data);

    const envelope: RecordEnvelope<HistoricalCorrectionV1> = {
      id: correctionRecordId,
      schemaVersion: RECORD_ENVELOPE_SCHEMA_VERSION,
      createdAt: recordedAt,
      updatedAt: recordedAt,
      businessDate: input.businessEffectiveDate,
      source: this.source,
      revision: 1,
      data: correction,
    };
    if (!await this.records.compareAndSet(correctionRecordId, null, envelope)) {
      const replay = await this.records.get<HistoricalCorrectionV1>(correctionRecordId);
      if (replay) {
        assertHistoricalCorrectionV1(replay.data);
        if (sameIntent(replay.data, input, actor)) {
          return { correction: replay.data, currentData: projected.data, chainRevision: projected.chainRevision };
        }
      }
      throw new Error("historical_correction_id_conflict");
    }

    const committedCorrections = await this.listForTarget(input.targetRecordId);
    const committedProjection = projectHistoricalCorrectionsV1(target.data, committedCorrections);
    if (committedProjection.status !== "valid") {
      throw new Error("historical_correction_chain_needs_attention");
    }
    return {
      correction,
      currentData: committedProjection.data,
      chainRevision: committedProjection.chainRevision,
    };
  }
}
