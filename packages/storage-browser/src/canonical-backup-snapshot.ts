import type { SnapshotManifest } from "../../core/src/backup";
import { BACKUP_SNAPSHOT_SCHEMA_VERSION } from "../../core/src/persistence-contract";
import { assertBrowserSnapshotForCanonical, type BrowserSnapshotData } from "./backup-snapshot";

/** Stable cross-platform interchange envelope; adapter implementation IDs stay platform-local. */
export interface CanonicalBackupSnapshotV1 {
  format: "sam-travels-canonical-snapshot-v1";
  schemaVersion: number;
  snapshotRevision: number;
  participants: NonNullable<SnapshotManifest["participants"]>;
  records: Array<{ participantId: string; id: string; json: string; schemaVersion: number; updatedAt: string }>;
}
function canonicalOwnerForRecord(id: string, participants: CanonicalBackupSnapshotV1["participants"]): string {
  if (id === "driver-state" || id === "legacy-driver-state" || id.startsWith("driver-intent:") || id.startsWith("driver-outbox:")) return "work-driver-state";
  return participants.find(item => item.featureId !== "platform" && id.startsWith("feature:" + item.featureId + ":"))?.id ?? "platform-records";
}
export function toCanonicalBackupSnapshotV1(data: BrowserSnapshotData, manifest: SnapshotManifest): CanonicalBackupSnapshotV1 {
  assertBrowserSnapshotForCanonical(data, manifest);
  const participants = (manifest.participants ?? []).map(({ id, featureId, snapshotVersion, restoreValidatorId }) => ({ id, featureId, snapshotVersion, restoreValidatorId })).sort((x,y) => x.id.localeCompare(y.id));
  const records: CanonicalBackupSnapshotV1["records"] = [];
  const add = (participantId: string, id: string, value: unknown, schemaVersion: number, updatedAt: unknown) => {
    if (typeof updatedAt !== "string" || !updatedAt.trim()) throw new Error("backup_canonical_updated_at_missing:" + id);
    records.push({ participantId, id, json: JSON.stringify(value), schemaVersion, updatedAt });
  };
  for (const row of data.records as Array<Record<string, unknown>>) add(canonicalOwnerForRecord(String(row.id), participants), String(row.id), row, Number(row.schemaVersion ?? 1), row.updatedAt);
  for (const row of data.driverState as Array<Record<string, unknown>>) add("work-driver-state", String(row.id), row, 1, row.updatedAt ?? row.createdAt ?? manifest.createdAt);
  for (const row of data.driverIntents as Array<Record<string, unknown>>) {
    const command = row.command as Record<string, unknown> | undefined;
    add("work-driver-state", "driver-intent:" + String(command?.eventId ?? ""), row, 1, row.updatedAt ?? row.createdAt ?? command?.transitionAt);
  }
  for (const row of data.driverOutbox as Array<Record<string, unknown>>) add("work-driver-state", "driver-outbox:" + String(row.revision ?? String(row.id).split(":").at(-1)), row, 1, row.updatedAt ?? row.createdAt);
  for (const row of data.driverEvents as Array<Record<string, unknown>>) add("logbook-events", String(row.eventId), row, 1, row.updatedAt ?? row.createdAt ?? (row.command as Record<string, unknown> | undefined)?.transitionAt);
  records.sort((x,y) => (x.participantId + ":" + x.id).localeCompare(y.participantId + ":" + y.id));
  return { format: "sam-travels-canonical-snapshot-v1", schemaVersion: manifest.schemaVersion, snapshotRevision: manifest.snapshotRevision, participants, records };
}
export function fromCanonicalBackupSnapshotV1(canonical: CanonicalBackupSnapshotV1, metadata: Pick<SnapshotManifest,"applicationVersion"|"createdAt"|"businessTimezone">): { data: BrowserSnapshotData; manifest: SnapshotManifest } {
  if (!canonical || canonical.format !== "sam-travels-canonical-snapshot-v1" || canonical.schemaVersion !== BACKUP_SNAPSHOT_SCHEMA_VERSION || !Array.isArray(canonical.records) || !Array.isArray(canonical.participants)) throw new Error("backup_canonical_snapshot_invalid");
  const data: BrowserSnapshotData = { records: [], driverState: [], driverIntents: [], driverEvents: [], driverOutbox: [] };
  const seen = new Set<string>();
  for (const row of canonical.records) {
    const key = row.participantId + ":" + row.id;
    if (!row.participantId || !row.id || seen.has(key) || typeof row.json !== "string" || !Number.isSafeInteger(row.schemaVersion) || row.schemaVersion < 1 || typeof row.updatedAt !== "string" || !row.updatedAt.trim()) throw new Error("backup_canonical_record_invalid");
    seen.add(key);
    const value = JSON.parse(row.json);
    if (row.participantId === "logbook-events") data.driverEvents.push(value);
    else if (row.participantId === "work-driver-state") {
      if (row.id === "driver-state" || row.id === "legacy-driver-state") data.driverState.push(value);
      else if (row.id.startsWith("driver-intent:")) data.driverIntents.push(value);
      else if (row.id.startsWith("driver-outbox:")) data.driverOutbox.push(value);
      else throw new Error("backup_canonical_work_record_invalid");
    } else data.records.push(value);
  }
  return { data, manifest: {
    applicationVersion: metadata.applicationVersion, schemaVersion: canonical.schemaVersion, createdAt: metadata.createdAt,
    businessTimezone: metadata.businessTimezone, snapshotRevision: canonical.snapshotRevision,
    recordCounts: { records: data.records.length, driverState: data.driverState.length, driverIntents: data.driverIntents.length, driverEvents: data.driverEvents.length, driverOutbox: data.driverOutbox.length },
    participants: canonical.participants,
  }};
}
