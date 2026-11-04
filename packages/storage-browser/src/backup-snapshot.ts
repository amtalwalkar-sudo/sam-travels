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
    tableNames: ["driverState", "driverIntents", "driverEvents", "driverOutbox"],
  },
]);

function resolveBrowserBackupParticipants(): BrowserBackupParticipant[] {
  const features = registerFeatures();
  const discovered = registerBackupParticipants(features);
  const featureParticipants = [...discovered.values()]
    .filter(contract => contract.required)
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
  const resolved = [...platformParticipants, ...featureParticipants];
  const ids = resolved.map(item => item.id);
  if (new Set(ids).size !== ids.length) throw new Error("backup_duplicate_participant_id");
  return resolved;
}

const TABLE_NAMES: BrowserSnapshotTable[] = resolveBrowserBackupParticipants()
  .flatMap(participant => participant.tableNames);
const EXCLUDED_TABLE_NAMES = ["backupCheckpoints", "credentialVault", "credentialVaultMeta"] as const;
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

function validateSnapshot(data: BrowserSnapshotData, manifest: SnapshotManifest): void {
  if (manifest.schemaVersion !== 1) throw new Error("backup_unsupported_schema");
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
  for (const row of data.records) {
    if (!row || typeof row !== "object" || typeof (row as { id?: unknown }).id !== "string") {
      throw new Error("backup_invalid_record");
    }
    const id = (row as { id: string }).id;
    if (!id || ids.has(id)) throw new Error("backup_duplicate_record_id");
    ids.add(id);
  }
}

export async function exportBrowserSnapshot(applicationVersion: string): Promise<{
  data: BrowserSnapshotData;
  manifest: Omit<SnapshotManifest, "format" | "plaintextSha256">;
  plaintext: Uint8Array;
}> {
  const tables = liveTables();
  const data = await browserDatabase.transaction("r", tables, async () => ({
    records: await tables[0].toArray(),
    driverState: await tables[1].toArray(),
    driverIntents: await tables[2].toArray(),
    driverEvents: await tables[3].toArray(),
    driverOutbox: await tables[4].toArray(),
  })) as BrowserSnapshotData;
  const state = data.driverState.find(row => row && typeof row === "object" && (row as { id?: unknown }).id === "driver-state") as { value?: { revision?: number } } | undefined;
  const manifest = {
    applicationVersion,
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    businessTimezone: "Asia/Kolkata",
    snapshotRevision: Number.isSafeInteger(state?.value?.revision) ? state!.value!.revision! : 0,
    recordCounts: Object.fromEntries(TABLE_NAMES.map(name => [name, data[name].length])),
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
  const current = await browserDatabase.transaction("r", tables, async () => ({
    records: await tables[0].toArray(),
    driverState: await tables[1].toArray(),
    driverIntents: await tables[2].toArray(),
    driverEvents: await tables[3].toArray(),
    driverOutbox: await tables[4].toArray(),
  })) as BrowserSnapshotData;

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

    const verified = await browserDatabase.transaction("r", tables, async () => ({
      records: await tables[0].toArray(),
      driverState: await tables[1].toArray(),
      driverIntents: await tables[2].toArray(),
      driverEvents: await tables[3].toArray(),
      driverOutbox: await tables[4].toArray(),
    })) as BrowserSnapshotData;
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
  const restored = await browserDatabase.transaction("r", tables, async () => ({
    records: await tables[0].toArray(),
    driverState: await tables[1].toArray(),
    driverIntents: await tables[2].toArray(),
    driverEvents: await tables[3].toArray(),
    driverOutbox: await tables[4].toArray(),
  })) as BrowserSnapshotData;
  if (!snapshotsEqual(restored, checkpoint.snapshot)) {
    throw new Error("backup_checkpoint_rollback_verification_failed");
  }
}
