import type { RecordEnvelope } from "../../core/src/types";

export type CorrectionActorV1 = Readonly<{
  role: "driver" | "admin";
  /** Stable person ID, shared across all roles held by the same person. */
  actorId: string;
  /** Required for Admin actions; supplied only by trusted Admin PIN verification. */
  adminPinVerifiedAt?: string;
}>;

export type CorrectionJsonValue =
  | null | boolean | number | string
  | readonly CorrectionJsonValue[]
  | { readonly [key: string]: CorrectionJsonValue };

export type HistoricalCorrectionV1 = Readonly<{
  schemaVersion: 1;
  correctionId: string;
  targetRecordId: string;
  targetRecordRevision: number;
  featureId: string;
  chainRevision: number;
  supersedesCorrectionId?: string;
  fieldPath: string;
  beforeValue: CorrectionJsonValue;
  afterValue: CorrectionJsonValue;
  reason: string;
  actor: CorrectionActorV1;
  recordedAt: string;
  businessEffectiveDate?: string;
}>;

export type HistoricalCorrectionProjectionV1<T> = Readonly<{
  status: "valid" | "needs_attention";
  data: T;
  chainRevision: number;
  headCorrectionId?: string;
  reason?: "correction_chain_fork" | "correction_chain_gap" |
    "correction_chain_link_invalid" | "correction_before_value_mismatch";
}>;

const SAFE_FIELD = /^[A-Za-z][A-Za-z0-9_]*$/;
const FORBIDDEN_FIELDS = new Set(["__proto__", "prototype", "constructor"]);

function isInstant(value: unknown): value is string {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function isBusinessDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function assertHistoricalCorrectionV1(value: unknown): asserts value is HistoricalCorrectionV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("historical_correction_invalid");
  const row = value as Record<string, unknown>;
  if (row.schemaVersion !== 1 ||
      typeof row.correctionId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(row.correctionId) ||
      typeof row.targetRecordId !== "string" || !row.targetRecordId.trim() ||
      !Number.isSafeInteger(row.targetRecordRevision) || (row.targetRecordRevision as number) < 1 ||
      typeof row.featureId !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(row.featureId) ||
      !Number.isSafeInteger(row.chainRevision) || (row.chainRevision as number) < 1 ||
      typeof row.fieldPath !== "string" || !row.fieldPath.split(".").every(part =>
        SAFE_FIELD.test(part) && !FORBIDDEN_FIELDS.has(part)) ||
      typeof row.reason !== "string" || !row.reason.trim() || row.reason.trim().length > 1000 ||
      !isInstant(row.recordedAt)) throw new Error("historical_correction_invalid");
  if (row.supersedesCorrectionId !== undefined &&
      (typeof row.supersedesCorrectionId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(row.supersedesCorrectionId))) {
    throw new Error("historical_correction_invalid_chain_link");
  }
  if (row.businessEffectiveDate !== undefined && !isBusinessDate(row.businessEffectiveDate)) {
    throw new Error("historical_correction_invalid_business_date");
  }
  if (!row.actor || typeof row.actor !== "object" || Array.isArray(row.actor)) {
    throw new Error("historical_correction_actor_required");
  }
  const actor = row.actor as Record<string, unknown>;
  if ((actor.role !== "driver" && actor.role !== "admin") ||
      typeof actor.actorId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(actor.actorId) ||
      (actor.role === "admin" && (typeof actor.adminPinVerifiedAt !== "string" || !isInstant(actor.adminPinVerifiedAt))) ||
      (actor.role === "driver" && actor.adminPinVerifiedAt !== undefined)) {
    throw new Error("historical_correction_actor_required");
  }
  assertJsonValue(row.beforeValue);
  assertJsonValue(row.afterValue);
  if (jsonEqual(row.beforeValue, row.afterValue)) throw new Error("historical_correction_no_change");
}

function assertJsonValue(value: unknown, depth = 0): asserts value is CorrectionJsonValue {
  if (depth > 20) throw new Error("historical_correction_value_too_deep");
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    value.forEach(item => assertJsonValue(item, depth + 1));
    return;
  }
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_FIELDS.has(key)) throw new Error("historical_correction_value_invalid");
      assertJsonValue(item, depth + 1);
    }
    return;
  }
  throw new Error("historical_correction_value_invalid");
}

function jsonEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => jsonEqual(item, right[index]));
  }
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  const keys = Object.keys(a).sort();
  return keys.join("\0") === Object.keys(b).sort().join("\0") &&
    keys.every(key => jsonEqual(a[key], b[key]));
}

/** actorId is the stable person ID, not a role-specific account ID. */
/** Driver corrections are self-only. Admin corrections require a PIN-verified Admin actor. */
export function assertCorrectionAuthority(actor: CorrectionActorV1, originalAuthorId?: string): void {
  if (!actor.actorId) throw new Error("historical_correction_actor_unattributed");
  if (actor.role === "admin" && (!actor.adminPinVerifiedAt || !isInstant(actor.adminPinVerifiedAt))) {
    throw new Error("historical_correction_admin_verification_required");
  }
  if (actor.role === "driver" && !originalAuthorId) {
    throw new Error("historical_correction_target_author_unattributed");
  }
  if (actor.role === "driver" && actor.actorId !== originalAuthorId) {
    throw new Error("historical_correction_forbidden");
  }
}

function readPath(source: unknown, path: string): unknown {
  let current = source;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object" || !Object.prototype.hasOwnProperty.call(current, part)) {
      throw new Error("historical_correction_field_missing");
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function replacePath<T>(source: T, path: string[], value: CorrectionJsonValue): T {
  const [head, ...tail] = path;
  if (!head || !source || typeof source !== "object" || Array.isArray(source) ||
      !Object.prototype.hasOwnProperty.call(source, head)) {
    throw new Error("historical_correction_field_missing");
  }
  const copy: Record<string, unknown> = { ...(source as Record<string, unknown>) };
  if (tail.length === 0) copy[head] = value;
  else copy[head] = replacePath((source as Record<string, unknown>)[head], tail, value);
  return copy as T;
}

/** Deterministic projection. Forks, gaps and stale before-values never use last-write-wins. */
export function projectHistoricalCorrectionsV1<T>(
  original: T,
  corrections: readonly HistoricalCorrectionV1[],
): HistoricalCorrectionProjectionV1<T> {
  const ordered = [...corrections].sort((a, b) => a.chainRevision - b.chainRevision);
  let data = original;
  let head: string | undefined;
  for (let index = 0; index < ordered.length; index++) {
    const correction = ordered[index];
    assertHistoricalCorrectionV1(correction);
    if (index > 0 && correction.chainRevision === ordered[index - 1].chainRevision) {
      return { status: "needs_attention", data, chainRevision: index, headCorrectionId: head, reason: "correction_chain_fork" };
    }
    if (correction.chainRevision !== index + 1) {
      return { status: "needs_attention", data, chainRevision: index, headCorrectionId: head, reason: "correction_chain_gap" };
    }
    if (correction.supersedesCorrectionId !== head) {
      return { status: "needs_attention", data, chainRevision: index, headCorrectionId: head, reason: "correction_chain_link_invalid" };
    }
    let current: unknown;
    try { current = readPath(data, correction.fieldPath); }
    catch {
      return { status: "needs_attention", data, chainRevision: index, headCorrectionId: head, reason: "correction_before_value_mismatch" };
    }
    if (!jsonEqual(current, correction.beforeValue)) {
      return { status: "needs_attention", data, chainRevision: index, headCorrectionId: head, reason: "correction_before_value_mismatch" };
    }
    data = replacePath(data, correction.fieldPath.split("."), correction.afterValue);
    head = correction.correctionId;
  }
  return { status: "valid", data, chainRevision: ordered.length, headCorrectionId: head };
}

export function isHistoricalBusinessRecord<T>(record: RecordEnvelope<T>): boolean {
  return record.deletedAt === undefined || record.deletedAt === null;
}
