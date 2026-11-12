import { isComplianceCalendarDate } from "./records";

export type ComplianceOverlapReviewActorV1 = Readonly<{
  actorId: string;
  role: "admin" | "driver";
}>;

export type ComplianceOverlapReviewSourceV1 = Readonly<{
  recordId: string;
  recordRevision: number;
}>;

/** Append-only decision about one exact pairwise overlap and source revisions. */
export type ComplianceOverlapReviewV1 = Readonly<{
  schemaVersion: 1;
  eventId: string;
  sourceRecords: readonly [ComplianceOverlapReviewSourceV1, ComplianceOverlapReviewSourceV1];
  from: string;
  to: string;
  decision: "confirmed" | "rejected";
  decisionRevision: number;
  supersedesEventId?: string;
  actor: ComplianceOverlapReviewActorV1;
  rationale: string;
  recordedAt: string;
}>;

const REVIEW_ID = /^feature:compliance-overlap-review:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECORD_ID = /^feature:compliance:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function complianceOverlapReviewId(uuid: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) {
    throw new Error("compliance_overlap_review_uuid_invalid");
  }
  return "feature:compliance-overlap-review:" + uuid.toLowerCase();
}

function isInstant(value: unknown): value is string {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

export function assertComplianceOverlapReviewV1(value: unknown): asserts value is ComplianceOverlapReviewV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("compliance_overlap_review_invalid");
  }
  const row = value as Record<string, unknown>;
  const allowed = new Set([
    "schemaVersion", "eventId", "sourceRecords", "from", "to", "decision",
    "decisionRevision", "supersedesEventId", "actor", "rationale", "recordedAt",
  ]);
  if (Object.keys(row).some(key => !allowed.has(key)) ||
      row.schemaVersion !== 1 ||
      typeof row.eventId !== "string" || !REVIEW_ID.test(row.eventId) ||
      !Array.isArray(row.sourceRecords) || row.sourceRecords.length !== 2 ||
      !isComplianceCalendarDate(row.from) || !isComplianceCalendarDate(row.to) || row.from > row.to ||
      (row.decision !== "confirmed" && row.decision !== "rejected") ||
      !Number.isSafeInteger(row.decisionRevision) || (row.decisionRevision as number) < 1 ||
      typeof row.rationale !== "string" || !row.rationale.trim() || row.rationale.trim().length > 1000 ||
      !isInstant(row.recordedAt)) {
    throw new Error("compliance_overlap_review_invalid");
  }
  const [first, second] = row.sourceRecords as unknown[];
  for (const source of [first, second]) {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new Error("compliance_overlap_review_source_invalid");
    }
    const ref = source as Record<string, unknown>;
    if (Object.keys(ref).sort().join(",") !== "recordId,recordRevision" ||
        typeof ref.recordId !== "string" || !RECORD_ID.test(ref.recordId) ||
        !Number.isSafeInteger(ref.recordRevision) || (ref.recordRevision as number) < 1) {
      throw new Error("compliance_overlap_review_source_invalid");
    }
  }
  const a = first as ComplianceOverlapReviewSourceV1;
  const b = second as ComplianceOverlapReviewSourceV1;
  if (a.recordId === b.recordId || a.recordId.localeCompare(b.recordId) >= 0) {
    throw new Error("compliance_overlap_review_source_order_invalid");
  }
  if (row.decisionRevision === 1) {
    if (row.supersedesEventId !== undefined) throw new Error("compliance_overlap_review_chain_invalid");
  } else if (typeof row.supersedesEventId !== "string" ||
      !/^feature:compliance-overlap-review:[0-9a-f-]{36}$/i.test(row.supersedesEventId) ||
      row.supersedesEventId === row.eventId) {
    throw new Error("compliance_overlap_review_chain_invalid");
  }
  const actor = row.actor;
  if (!actor || typeof actor !== "object" || Array.isArray(actor)) {
    throw new Error("compliance_overlap_review_actor_required");
  }
  const actorRow = actor as Record<string, unknown>;
  if (Object.keys(actorRow).sort().join(",") !== "actorId,role" ||
      typeof actorRow.actorId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(actorRow.actorId) ||
      (actorRow.role !== "admin" && actorRow.role !== "driver")) {
    throw new Error("compliance_overlap_review_actor_required");
  }
}

export type ComplianceOverlapReviewStatus = "unreviewed" | "confirmed" | "rejected" | "stale";

/**
 * Resolve only a complete, unambiguous append-only decision chain for the exact
 * overlap and exact current source revisions. Forks and stale source revisions
 * fail closed instead of silently retaining confirmation.
 */
export function resolveComplianceOverlapReview(
  sourceRecords: readonly [ComplianceOverlapReviewSourceV1, ComplianceOverlapReviewSourceV1],
  from: string,
  to: string,
  reviews: readonly ComplianceOverlapReviewV1[],
): ComplianceOverlapReviewStatus {
  const orderedSources = [...sourceRecords].sort((a, b) => a.recordId.localeCompare(b.recordId)) as [
    ComplianceOverlapReviewSourceV1, ComplianceOverlapReviewSourceV1,
  ];
  const samePair = reviews.filter(review => {
    assertComplianceOverlapReviewV1(review);
    return review.sourceRecords[0].recordId === orderedSources[0].recordId &&
      review.sourceRecords[1].recordId === orderedSources[1].recordId &&
      review.from === from && review.to === to;
  });
  if (!samePair.length) return "unreviewed";
  const current = samePair.filter(review =>
    review.sourceRecords[0].recordRevision === orderedSources[0].recordRevision &&
    review.sourceRecords[1].recordRevision === orderedSources[1].recordRevision);
  if (!current.length) return "stale";
  const byRevision = new Map<number, ComplianceOverlapReviewV1[]>();
  for (const review of current) {
    const bucket = byRevision.get(review.decisionRevision) ?? [];
    bucket.push(review);
    byRevision.set(review.decisionRevision, bucket);
  }
  if ([...byRevision.values()].some(bucket => bucket.length !== 1)) return "stale";
  const max = Math.max(...byRevision.keys());
  let previous: string | undefined;
  for (let revision = 1; revision <= max; revision++) {
    const event = byRevision.get(revision)?.[0];
    if (!event || event.supersedesEventId !== previous) return "stale";
    previous = event.eventId;
  }
  return byRevision.get(max)![0].decision;
}
