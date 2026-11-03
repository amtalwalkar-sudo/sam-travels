import type { Table } from "dexie";
import { browserDatabase } from "../../storage-browser/src/database";
import type { BackupManifest } from "./crypto";

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
const TABLE_NAMES = ["records", "driverState", "driverIntents", "driverEvents", "driverOutbox"] as const;
const liveTables = () => TABLE_NAMES.map(name => browserDatabase.table(name) as Table<unknown, string>);
const checkpointTable = () => browserDatabase.table("backupCheckpoints") as Table<Checkpoint, string>;

function validateSnapshot(data: BrowserSnapshotData, manifest: BackupManifest): void {
  if (manifest.schemaVersion !== 1) throw new Error("backup_unsupported_schema");
  for (const name of TABLE_NAMES) {
    const rows = data[name];
    if (!Array.isArray(rows) || rows.length !== manifest.recordCounts[name]) {
      throw new Error("backup_record_count_mismatch:" + name);
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
  manifest: Omit<BackupManifest, "format" | "plaintextSha256">;
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
  manifest: BackupManifest;
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
    if (JSON.stringify(verified) !== JSON.stringify(input.data)) throw new Error("backup_post_restore_verification_failed");
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
  if (JSON.stringify(restored) !== JSON.stringify(checkpoint.snapshot)) {
    throw new Error("backup_checkpoint_rollback_verification_failed");
  }
}
