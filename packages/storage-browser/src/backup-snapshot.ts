import { assertDriverEventContract, assertDriverIntentContract, assertDriverOutboxContract, assertDriverStateContract } from "../../domain/src/driver-workflow";
import { assertRecordEnvelope, assertSnapshotManifest, BACKUP_SNAPSHOT_SCHEMA_VERSION } from "../../core/src/persistence-contract";
import type { Table } from "dexie";
import { browserDatabase } from "./database";
import type { SnapshotManifest } from "../../core/src/backup";
import { registerFeatures, registerBackupParticipants } from "../../core/src/features";

export interface BrowserSnapshotData {
  records: unknown[];
  driverState: unknown[];
  driverIntents: unknown[];
  driverEvents: unknown[];
  driverOutbox: unknown[];
}
type Checkpoint = {
  id: string;
  createdAt: string;
  status: "checkpoint" | "restored_unverified" | "verified" | "rollback_complete";
  snapshot: BrowserSnapshotData;
};
export type BrowserSnapshotTable = keyof BrowserSnapshotData;

export type BrowserBackupParticipant = {
  id: string;
  featureId: string | "platform";
  schemaVersion: number;
  tableNames: BrowserSnapshotTable[];
};

/** One authoritative mapping from registered feature obligations to browser tables. */
export const BROWSER_BACKUP_PARTICIPANTS: readonly BrowserBackupParticipant[] = Object.freeze([
  { id: "platform-records", featureId: "platform", schemaVersion: 1, tableNames: ["records"] },
  {
    id: "work-driver-state",
    featureId: "work",
    schemaVersion: 1,
    tableNames: ["driverState", "driverIntents", "driverOutbox"],
  },
  { id: "logbook-events", featureId: "logbook", schemaVersion: 1, tableNames: ["driverEvents"] },
]);

function resolveBrowserBackupParticipants(): BrowserBackupParticipant[] {
  const features = registerFeatures();
  const discovered = registerBackupParticipants(features);
  const featureParticipants = [...discovered.values()]
    .filter(contract => contract.required && contract.featureId !== "platform")
    .map(contract => {
      const participant = BROWSER_BACKUP_PARTICIPANTS.find(item => item.id === contract.id);
      if (
        !participant ||
        participant.featureId !== contract.featureId ||
        participant.schemaVersion !== contract.snapshotVersion
      ) {
        throw new Error("backup_feature_registration_mismatch:" + contract.featureId + ":" + contract.id);
      }
      return participant;
    });
  const platformParticipants = BROWSER_BACKUP_PARTICIPANTS.filter(item => item.featureId === "platform");
  const customParticipants = [...customBrowserFeatureBackupAdapters.values()].map(adapter => ({\n    id: adapter.participantId, featureId: adapter.feature.id, schemaVersion: adapter.feature.persistence!.backup.snapshotVersion, tableNames: ["records"] as BrowserSnapshotTable[],\n  }));\n  const resolved = [...platformParticipants, ...featureParticipants, ...customParticipants];
  const ids = resolved.map(item => item.id);
  if (new Set(ids).size !== ids.length) throw new Error("backup_duplicate_participant_id");
  return resolved;
}

export type BrowserFeatureBackupAdapter = Readonly<{
  feature: import("../../core/src/features").FeatureDefinition;
  participantId: string;
  recordIdPrefix: string;
  validateRecord(record: import("../../core/src/types").RecordEnvelope<unknown>, allFeatureRecords: readonly import("../../core/src/types").RecordEnvelope<unknown>[]): void;
  validateSnapshot?(allRecords: readonly import("../../core/src/types").RecordEnvelope<unknown>[]): void;
}>;

const customBrowserFeatureBackupAdapters = new Map<string, BrowserFeatureBackupAdapter>();

/** Register executable feature-owned backup and restore validation for namespaced records. */
export function registerBrowserFeatureBackupParticipant(adapter: BrowserFeatureBackupAdapter): () => void {
  const featureRegistry = registerFeatures([adapter.feature]);
  const contract = featureRegistry.get(adapter.feature.id)?.persistence;
  if (!contract || contract.backup.participantId !== adapter.participantId ||
      !adapter.recordIdPrefix.startsWith("feature:" + adapter.feature.id + ":")) {
    throw new Error("backup_feature_adapter_contract_mismatch:" + adapter.feature.id);
  }
  const discovered = registerBackupParticipants(featureRegistry).get(adapter.participantId);
  if (!discovered || discovered.featureId !== adapter.feature.id ||
      discovered.snapshotVersion !== contract.backup.snapshotVersion ||
      discovered.restoreValidatorId !== contract.restore.validatorId) {
    throw new Error("backup_feature_adapter_registration_mismatch:" + adapter.feature.id);
  }
  if (customBrowserFeatureBackupAdapters.has(adapter.participantId)) {
    throw new Error("backup_duplicate_participant_id:" + adapter.participantId);
  }
  for (const existing of customBrowserFeatureBackupAdapters.values()) {
    if (existing.recordIdPrefix === adapter.recordIdPrefix ||
        existing.recordIdPrefix.startsWith(adapter.recordIdPrefix) ||
        adapter.recordIdPrefix.startsWith(existing.recordIdPrefix)) {
      throw new Error("backup_feature_record_namespace_overlap");
    }
  }
  customBrowserFeatureBackupAdapters.set(adapter.participantId, Object.freeze({ ...adapter }));
  return () => { customBrowserFeatureBackupAdapters.delete(adapter.participantId); };
}

function currentParticipantManifest() {
  const required = [...registerBackupParticipants(registerFeatures()).values()].map(
    ({ id, featureId, snapshotVersion, restoreValidatorId }) => ({ id, featureId, snapshotVersion, restoreValidatorId }),
  );
  for (const adapter of customBrowserFeatureBackupAdapters.values()) {
    required.push({
      id: adapter.participantId,
      featureId: adapter.feature.id,
      snapshotVersion: adapter.feature.persistence!.backup.snapshotVersion,
      restoreValidatorId: adapter.feature.persistence!.restore.validatorId,
    });
  }
  return required.sort((a, b) => a.id.localeCompare(b.id));
}
const TABLE_NAMES: BrowserSnapshotTable[] = [...new Set(resolveBrowserBackupParticipants()
  .flatMap(participant => participant.tableNames))];
const EXCLUDED_TABLE_NAMES = ["backupCheckpoints", "credentialVault", "credentialVaultMeta", "diagnostics"] as const;
/**
 * Fail closed when a Dexie table is added without an explicit backup policy.
 * Recovery checkpoints and local credential-vault material are intentionally
 * excluded; every business table must be in TABLE_NAMES.
 */
export function assertBrowserBackupTableCoverage(
  actualTableNames: string[] = browserDatabase.tables.map(table => table.name),
): void {
  const registered = new Set<string>([...TABLE_NAMES, ...EXCLUDED_TABLE_NAMES]);
  const actual = new Set(actualTableNames);
  const missing = [...registered].filter(name => !actual.has(name));
  const unclassified = [...actual].filter(name => !registered.has(name));
  if (missing.length || unclassified.length || actual.size !== actualTableNames.length) {
    throw new Error(
      "backup_table_registration_mismatch:" +
      [...missing.map(name => "missing:" + name), ...unclassified.map(name => "unclassified:" + name)].join(","),
    );
  }
}

function liveTables() {
  assertBrowserBackupTableCoverage();
  return TABLE_NAMES.map(name => browserDatabase.table(name) as Table<unknown, string>);
}

async function readSnapshotTables(tables: Table<unknown, string>[]): Promise<BrowserSnapshotData> {
  const entries = await Promise.all(tables.map(async table => [table.name, await table.toArray()] as const));
  return Object.fromEntries(entries) as unknown as BrowserSnapshotData;
}

function rowKey(table: BrowserSnapshotTable, row: unknown): string {
  if (!row || typeof row !== "object") return JSON.stringify(row);
  const value = row as Record<string, unknown>;
  if (table === "driverIntents") {
    const command = value.command as Record<string, unknown> | undefined;
    return String(command?.eventId ?? "");
  }
  return String(value.id ?? value.eventId ?? "");
}

function snapshotsEqual(left: BrowserSnapshotData, right: BrowserSnapshotData): boolean {
  return TABLE_NAMES.every(name => {
    const canonical = (rows: unknown[]) => [...rows]
      .sort((a, b) => rowKey(name, a).localeCompare(rowKey(name, b)))
      .map(row => JSON.stringify(row));
    return JSON.stringify(canonical(left[name])) === JSON.stringify(canonical(right[name]));
  });
}
const checkpointTable = () => browserDatabase.table("backupCheckpoints") as Table<Checkpoint, string>;

function validateSnapshotRows(data: BrowserSnapshotData): void {
  for (const row of data.driverState) {
    if (!row || typeof row !== "object" || (row as { id?: unknown }).id !== "driver-state") {
      throw new Error("backup_invalid_driver_state_row");
    }
    assertDriverStateContract((row as { value?: unknown }).value);
  }
  data.driverIntents.forEach(assertDriverIntentContract);
  data.driverEvents.forEach(assertDriverEventContract);
  data.driverOutbox.forEach(assertDriverOutboxContract);
}

function validateSnapshot(data: BrowserSnapshotData, manifest: SnapshotManifest): void {
  assertSnapshotManifest(manifest);
  if (manifest.schemaVersion !== BACKUP_SNAPSHOT_SCHEMA_VERSION) throw new Error("backup_unsupported_schema");
  if (manifest.participants) {
    const canonical = (items: NonNullable<SnapshotManifest["participants"]>) =>
      items.map(item => [item.id, item.featureId, item.snapshotVersion, item.restoreValidatorId].join("|")).sort();
    if (JSON.stringify(canonical(manifest.participants)) !== JSON.stringify(canonical(currentParticipantManifest()))) {
      throw new Error("backup_participant_manifest_mismatch");
    }
  }
  for (const name of TABLE_NAMES) {
    const rows = data[name];
    if (!Array.isArray(rows) || rows.length !== manifest.recordCounts[name]) {
      throw new Error("backup_record_count_mismatch:" + name);
    }
  }
  const state = data.driverState.find(row => row && typeof row === "object" && (row as { id?: unknown }).id === "driver-state") as { value?: { revision?: number } } | undefined;
  const revision = Number.isSafeInteger(state?.value?.revision) ? state!.value!.revision! : 0;
  if (revision !== manifest.snapshotRevision) throw new Error("backup_snapshot_revision_mismatch");
  const primaryKeys: Record<BrowserSnapshotTable, (row: Record<string, unknown>) => string> = {
    records: row => String(row.id ?? ""),
    driverState: row => String(row.id ?? ""),
    driverIntents: row => String((row.command as Record<string, unknown> | undefined)?.eventId ?? ""),
    driverEvents: row => String(row.eventId ?? ""),
    driverOutbox: row => String(row.id ?? ""),
  };
  for (const name of TABLE_NAMES) {
    const ids = new Set<string>();
    for (const row of data[name]) {
      if (!row || typeof row !== "object") throw new Error("backup_invalid_row:" + name);
      const id = primaryKeys[name](row as Record<string, unknown>);
      if (!id || ids.has(id)) throw new Error("backup_invalid_or_duplicate_row_id:" + name);
      ids.add(id);
    }
  }
  const ids = new Set<string>();
  validateSnapshotRows(data);
  for (const row of data.records) {
    assertRecordEnvelope(row);
    const id = row.id;
    if (!id || ids.has(id)) throw new Error("backup_duplicate_record_id");
    ids.add(id);
  }
  const typedRecords = data.records as import("../../core/src/types").RecordEnvelope<unknown>[];
  for (const adapter of customBrowserFeatureBackupAdapters.values()) {
    const owned = typedRecords.filter(record => record.id.startsWith(adapter.recordIdPrefix));
    owned.forEach(record => adapter.validateRecord(record, typedRecords));
    adapter.validateSnapshot?.(typedRecords);
  }
}

export async function exportBrowserSnapshot(applicationVersion: string): Promise<{
  data: BrowserSnapshotData;
  manifest: Omit<SnapshotManifest, "format" | "plaintextSha256">;
  plaintext: Uint8Array;
}> {
  const tables = liveTables();
  const data = await browserDatabase.transaction("r", tables, () => readSnapshotTables(tables));
  data.records.forEach(assertRecordEnvelope);
  validateSnapshotRows(data);
  const state = data.driverState.find(row => row && typeof row === "object" && (row as { id?: unknown }).id === "driver-state") as { value?: { revision?: number } } | undefined;
  const manifest = {
    applicationVersion,
    schemaVersion: BACKUP_SNAPSHOT_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    businessTimezone: "Asia/Kolkata",
    snapshotRevision: Number.isSafeInteger(state?.value?.revision) ? state!.value!.revision! : 0,
    recordCounts: Object.fromEntries(TABLE_NAMES.map(name => [name, data[name].length])),
    participants: currentParticipantManifest(),
  };
  return { data, manifest, plaintext: new TextEncoder().encode(JSON.stringify(data)) };
}

export async function restoreBrowserSnapshot(input: {
  data: BrowserSnapshotData;
  manifest: SnapshotManifest;
  confirmed: boolean;
}): Promise<{ checkpointId: string; restoredCounts: Record<string, number> }> {
  if (input.confirmed !== true) throw new Error("backup_restore_confirmation_required");
  validateSnapshot(input.data, input.manifest);

  const tables = liveTables();
  const current = await browserDatabase.transaction("r", tables, () => readSnapshotTables(tables));

  const checkpointId = crypto.randomUUID();
  const checkpoint: Checkpoint = {
    id: checkpointId,
    createdAt: new Date().toISOString(),
    status: "checkpoint",
    snapshot: current,
  };
  await checkpointTable().add(checkpoint);

  try {
    await browserDatabase.transaction("rw", [...tables, checkpointTable()], async () => {
      for (let index = 0; index < tables.length; index += 1) {
        await tables[index].clear();
        const rows = input.data[TABLE_NAMES[index]];
        if (rows.length) await tables[index].bulkPut(rows);
      }
      await checkpointTable().put({ ...checkpoint, status: "restored_unverified" });
    });

    const verified = await browserDatabase.transaction("r", tables, () => readSnapshotTables(tables));
    if (!snapshotsEqual(verified, input.data)) throw new Error("backup_post_restore_verification_failed");
    return {
      checkpointId,
      restoredCounts: Object.fromEntries(TABLE_NAMES.map(name => [name, verified[name].length])),
    };
  } catch (error) {
    await browserDatabase.transaction("rw", [...tables, checkpointTable()], async () => {
      for (let index = 0; index < tables.length; index += 1) {
        await tables[index].clear();
        const rows = current[TABLE_NAMES[index]];
        if (rows.length) await tables[index].bulkPut(rows);
      }
      await checkpointTable().put({ ...checkpoint, status: "rollback_complete" });
    });
    throw error;
  }
}

export async function markBrowserRestoreVerified(checkpointId: string): Promise<void> {
  await browserDatabase.transaction("rw", checkpointTable(), async () => {
    const checkpoint = await checkpointTable().get(checkpointId);
    if (!checkpoint || checkpoint.status !== "restored_unverified") throw new Error("backup_checkpoint_not_pending_verification");
    await checkpointTable().put({ ...checkpoint, status: "verified" });
  });
}

export async function discardVerifiedBrowserCheckpoint(checkpointId: string): Promise<void> {
  await browserDatabase.transaction("rw", checkpointTable(), async () => {
    const checkpoint = await checkpointTable().get(checkpointId);
    if (!checkpoint || checkpoint.status !== "verified") throw new Error("backup_checkpoint_must_be_verified_before_discard");
    await checkpointTable().delete(checkpointId);
  });
}

export async function listBrowserRecoveryCheckpoints(): Promise<Array<Pick<Checkpoint, "id" | "createdAt" | "status">>> {
  return (await checkpointTable().toArray()).map(({ id, createdAt, status }) => ({ id, createdAt, status }));
}

/** Recover restore transactions left at checkpoint/restored_unverified by process death. */
export async function recoverBrowserRestoreTransactions(): Promise<{ recovered: number }> {
  const pending = (await checkpointTable().toArray()).filter(checkpoint =>
    checkpoint.status === "checkpoint" || checkpoint.status === "restored_unverified",
  );
  for (const checkpoint of pending) await rollbackBrowserRecoveryCheckpoint(checkpoint.id);
  return { recovered: pending.length };
}

export async function rollbackBrowserRecoveryCheckpoint(checkpointId: string): Promise<void> {
  const checkpoint = await checkpointTable().get(checkpointId);
  if (!checkpoint || (checkpoint.status !== "checkpoint" && checkpoint.status !== "restored_unverified" && checkpoint.status !== "rollback_complete")) {
    throw new Error("backup_checkpoint_not_rollback_eligible");
  }
  const tables = liveTables();
  await browserDatabase.transaction("rw", [...tables, checkpointTable()], async () => {
    for (let index = 0; index < tables.length; index += 1) {
      await tables[index].clear();
      const rows = checkpoint.snapshot[TABLE_NAMES[index]];
      if (rows.length) await tables[index].bulkPut(rows);
    }
    await checkpointTable().put({ ...checkpoint, status: "rollback_complete" });
  });
  const restored = await browserDatabase.transaction("r", tables, () => readSnapshotTables(tables));
  if (!snapshotsEqual(restored, checkpoint.snapshot)) {
    throw new Error("backup_checkpoint_rollback_verification_failed");
  }
}
