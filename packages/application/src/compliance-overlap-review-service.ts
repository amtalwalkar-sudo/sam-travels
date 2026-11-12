import type { AtomicRecordBatchRepository } from "../../core/src/repositories";
import { RECORD_ENVELOPE_SCHEMA_VERSION } from "../../core/src/persistence-contract";
import type { RecordEnvelope } from "../../core/src/types";
import {
  assertComplianceRecordIdentity,
  assertComplianceRecordV1,
  type ComplianceRecordV1,
} from "../../features/compliance/records";
import {
  assertComplianceOverlapReviewV1,
  complianceOverlapReviewId,
  type ComplianceOverlapReviewActorV1,
  type ComplianceOverlapReviewV1,
} from "../../features/compliance/overlap-review";

const EVENT_PREFIX = "compliance-overlap-review:";
const HEAD_PREFIX = "compliance-overlap-review-head:";

type ReviewHeadV1 = Readonly<{
  schemaVersion: 1;
  overlapKey: string;
  decisionRevision: number;
  headEventId: string;
}>;

export type ComplianceOverlapReviewActorProvider = Readonly<{
  currentActor(): Promise<ComplianceOverlapReviewActorV1>;
}>;

/** Persists append-only review decisions and serializes each overlap's decision chain. */
export class ComplianceOverlapReviewService {
  constructor(
    private readonly records: AtomicRecordBatchRepository,
    private readonly actorProvider: ComplianceOverlapReviewActorProvider,
    private readonly source: RecordEnvelope<unknown>["source"],
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async list(): Promise<ComplianceOverlapReviewV1[]> {
    const rows = await this.records.list<ComplianceOverlapReviewV1>();
    return rows.filter(row => row.id.startsWith(EVENT_PREFIX)).map(row => {
      assertComplianceOverlapReviewV1(row.data);
      if (row.data.eventId !== row.id) throw new Error("compliance_overlap_review_identity_mismatch");
      return row.data;
    }).sort((a, b) =>
      a.sourceRecords[0].recordId.localeCompare(b.sourceRecords[0].recordId) ||
      a.from.localeCompare(b.from) || a.decisionRevision - b.decisionRevision,
    );
  }

  async recordDecision(input: Readonly<{
    uuid: string;
    firstRecordId: string;
    secondRecordId: string;
    from: string;
    to: string;
    decision: "confirmed" | "rejected";
    rationale: string;
  }>): Promise<ComplianceOverlapReviewV1> {
    if (!input.rationale.trim() || input.rationale.trim().length > 1000 ||
        input.firstRecordId === input.secondRecordId) {
      throw new Error("compliance_overlap_review_command_invalid");
    }
    const eventId = complianceOverlapReviewId(input.uuid);
    const ids = [input.firstRecordId, input.secondRecordId].sort();
    assertComplianceRecordIdentity(ids[0]);
    assertComplianceRecordIdentity(ids[1]);
    const [first, second] = await Promise.all([
      this.records.get<ComplianceRecordV1>(ids[0]),
      this.records.get<ComplianceRecordV1>(ids[1]),
    ]);
    if (!first || !second) throw new Error("compliance_overlap_review_source_not_found");
    assertComplianceRecordV1(first.data);
    assertComplianceRecordV1(second.data);
    if (first.data.vehicleId !== second.data.vehicleId ||
        first.data.complianceName !== second.data.complianceName) {
      throw new Error("compliance_overlap_review_source_mismatch");
    }
    const from = first.data.validFrom > second.data.validFrom ? first.data.validFrom : second.data.validFrom;
    const to = first.data.validTo < second.data.validTo ? first.data.validTo : second.data.validTo;
    if (from > to || input.from !== from || input.to !== to) {
      throw new Error("compliance_overlap_review_scope_mismatch");
    }
    const actor = await this.actorProvider.currentActor();
    if (!actor || !/^[A-Za-z0-9_-]{1,128}$/.test(actor.actorId) ||
        (actor.role !== "admin" && actor.role !== "driver")) {
      throw new Error("compliance_overlap_review_actor_required");
    }
    const overlapKey = [ids[0], ids[1], from, to].join("|");
    const headId = HEAD_PREFIX + encodeURIComponent(overlapKey);
    const head = await this.records.get<ReviewHeadV1>(headId);
    let decisionRevision = 1;
    let supersedesEventId: string | undefined;
    if (head) {
      if (head.data.schemaVersion !== 1 || head.data.overlapKey !== overlapKey ||
          !Number.isSafeInteger(head.data.decisionRevision) || head.data.decisionRevision < 1 ||
          !head.data.headEventId.startsWith(EVENT_PREFIX)) {
        throw new Error("compliance_overlap_review_chain_needs_attention");
      }
      const previous = await this.records.get<ComplianceOverlapReviewV1>(head.data.headEventId);
      if (!previous) throw new Error("compliance_overlap_review_chain_needs_attention");
      assertComplianceOverlapReviewV1(previous.data);
      if (previous.data.eventId !== head.data.headEventId ||
          previous.data.decisionRevision !== head.data.decisionRevision) {
        throw new Error("compliance_overlap_review_chain_needs_attention");
      }
      decisionRevision = head.data.decisionRevision + 1;
      supersedesEventId = head.data.headEventId;
    }
    const recordedAt = this.now();
    const review: ComplianceOverlapReviewV1 = {
      schemaVersion: 1,
      eventId,
      sourceRecords: [
        { recordId: ids[0], recordRevision: first.revision },
        { recordId: ids[1], recordRevision: second.revision },
      ],
      from,
      to,
      decision: input.decision,
      decisionRevision,
      ...(supersedesEventId ? { supersedesEventId } : {}),
      actor,
      rationale: input.rationale.trim(),
      recordedAt,
    };
    assertComplianceOverlapReviewV1(review);
    const eventEnvelope: RecordEnvelope<ComplianceOverlapReviewV1> = {
      id: eventId,
      schemaVersion: RECORD_ENVELOPE_SCHEMA_VERSION,
      createdAt: recordedAt,
      updatedAt: recordedAt,
      source: this.source,
      revision: 1,
      createdBy: { personId: actor.actorId, role: actor.role },
      data: review,
    };
    const nextHead: RecordEnvelope<ReviewHeadV1> = {
      id: headId,
      schemaVersion: RECORD_ENVELOPE_SCHEMA_VERSION,
      createdAt: head?.createdAt ?? recordedAt,
      updatedAt: recordedAt,
      source: this.source,
      revision: (head?.revision ?? 0) + 1,
      data: { schemaVersion: 1, overlapKey, decisionRevision, headEventId: eventId },
    };
    const committed = await this.records.compareAndSetMany([
      { id: eventId, expectedRevision: null, next: eventEnvelope },
      { id: headId, expectedRevision: head?.revision ?? null, next: nextHead },
    ]);
    if (!committed) throw new Error("compliance_overlap_review_stale_chain");
    return review;
  }
}
