import type { RecordEnvelope } from "./types";
import type { SnapshotManifest } from "./backup";

/**
 * Versioned persistence contracts shared by application services and storage adapters.
 * Increment RECORD_ENVELOPE_SCHEMA_VERSION only with an explicit migration.
 */
export const RECORD_ENVELOPE_SCHEMA_VERSION = 1 as const;
export const BACKUP_SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const SUPPORTED_RECORD_SOURCES = ["web", "android", "import", "integration"] as const;

function isIsoInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !isBusinessDate(match[1])) return false;
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) return false;
  return Number.isFinite(Date.parse(value));
}

function isBusinessDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Fail closed at every authoritative record persistence ingress and backup restore ingress. */
export function assertRecordEnvelope(value: unknown): asserts value is RecordEnvelope<unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("record_invalid_envelope");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id.trim() || record.id !== record.id.trim()) throw new Error("record_identity_required");
  if (record.schemaVersion !== RECORD_ENVELOPE_SCHEMA_VERSION) {
    throw new Error("record_unsupported_schema_version");
  }
  if (!isIsoInstant(record.createdAt) || !isIsoInstant(record.updatedAt) ||
      Date.parse(record.updatedAt) < Date.parse(record.createdAt)) {
    throw new Error("record_invalid_timestamps");
  }
  if (!SUPPORTED_RECORD_SOURCES.includes(record.source as typeof SUPPORTED_RECORD_SOURCES[number])) {
    throw new Error("record_invalid_source");
  }
  if (!Number.isSafeInteger(record.revision) || (record.revision as number) < 1) {
    throw new Error("record_invalid_revision");
  }
  if (!Object.prototype.hasOwnProperty.call(record, "data")) throw new Error("record_data_required");
  if (record.businessDate !== undefined && !isBusinessDate(record.businessDate)) {
    throw new Error("record_invalid_business_date");
  }
  if (record.deletedAt !== undefined && record.deletedAt !== null && !isIsoInstant(record.deletedAt)) {
    throw new Error("record_invalid_deleted_at");
  }
}

/** Validate the versioned top-level backup manifest before any restore checkpoint or mutation. */
export function assertSnapshotManifest(value: unknown): asserts value is SnapshotManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("backup_invalid_manifest");
  const manifest = value as Record<string, unknown>;
  if (manifest.schemaVersion !== BACKUP_SNAPSHOT_SCHEMA_VERSION) throw new Error("backup_unsupported_schema");
  if (typeof manifest.applicationVersion !== "string" || !manifest.applicationVersion.trim() ||
      !isIsoInstant(manifest.createdAt) ||
      typeof manifest.businessTimezone !== "string" || !manifest.businessTimezone.trim()) {
    throw new Error("backup_invalid_manifest");
  }
  if (!Number.isSafeInteger(manifest.snapshotRevision) || (manifest.snapshotRevision as number) < 0) {
    throw new Error("backup_invalid_snapshot_revision");
  }
  if (!manifest.recordCounts || typeof manifest.recordCounts !== "object" || Array.isArray(manifest.recordCounts)) {
    throw new Error("backup_invalid_record_counts");
  }
  for (const [table, count] of Object.entries(manifest.recordCounts as Record<string, unknown>)) {
    if (!table.trim() || !Number.isSafeInteger(count) || (count as number) < 0) {
      throw new Error("backup_invalid_record_counts");
    }
  }
  if (manifest.participants !== undefined) {
    if (!Array.isArray(manifest.participants)) throw new Error("backup_invalid_participant_manifest");
    const ids = new Set<string>();
    for (const participant of manifest.participants) {
      if (!participant || typeof participant !== "object" || Array.isArray(participant)) {
        throw new Error("backup_invalid_participant_manifest");
      }
      const item = participant as Record<string, unknown>;
      if (typeof item.id !== "string" || !item.id.trim() ||
          typeof item.featureId !== "string" || !item.featureId.trim() ||
          typeof item.restoreValidatorId !== "string" || !item.restoreValidatorId.trim() ||
          !Number.isSafeInteger(item.snapshotVersion) || (item.snapshotVersion as number) < 1 ||
          ids.has(item.id)) {
        throw new Error("backup_invalid_participant_manifest");
      }
      ids.add(item.id);
    }
  }
}
