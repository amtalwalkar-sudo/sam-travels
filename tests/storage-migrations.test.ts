import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBrowserDatabase, BROWSER_DATABASE_SCHEMA_VERSION, UnsupportedBrowserDatabaseVersionError } from "../packages/storage-browser/src/database";

const DATABASE_NAME = "sam-travels-browser-migration-tests";
const migrationDatabase = createBrowserDatabase(DATABASE_NAME);
const now = "2026-11-18T00:00:00.000Z";

async function createVersionOneDatabase() {
  const legacy = new Dexie(DATABASE_NAME);
  legacy.version(1).stores({
    records: "id,updatedAt,schemaVersion,deletedAt",
  });
  await legacy.open();
  await legacy.table("records").put({
    id: "vehicle:legacy-v1",
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    source: "web",
    revision: 4,
    data: { registrationNumber: "MH00AA0001", label: "legacy-v1" },
  });
  legacy.close();
}

async function createVersionFourDatabase() {
  const legacy = new Dexie(DATABASE_NAME);
  legacy.version(4).stores({
    records: "id,updatedAt,schemaVersion,deletedAt",
    driverState: "id",
    driverIntents: "&command.eventId,status,createdAt",
    driverEvents: "&eventId,committedAt,revision",
    driverOutbox: "&id,eventId,revision,delivered,createdAt",
    backupCheckpoints: "&id,createdAt,status",
    credentialVault: "&name,updatedAt",
    credentialVaultMeta: "&id",
  });
  await legacy.open();
  await legacy.table("records").put({
    id: "finance:loan:legacy-v4",
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    source: "web",
    revision: 7,
    data: { principalPaise: 25000000, label: "legacy-v4" },
  });
  await legacy.table("driverState").put({ id: "driver-state", value: { revision: 12 } });
  await legacy.table("driverIntents").put({
    command: { eventId: "intent-legacy-v4" },
    status: "pending",
    createdAt: now,
  });
  await legacy.table("driverEvents").put({
    eventId: "event-legacy-v4",
    committedAt: now,
    revision: 12,
  });
  await legacy.table("driverOutbox").put({
    id: "outbox-legacy-v4",
    eventId: "event-legacy-v4",
    revision: 12,
    delivered: false,
    createdAt: now,
  });
  await legacy.table("backupCheckpoints").put({
    id: "checkpoint-legacy-v4",
    createdAt: now,
    status: "checkpoint",
    snapshot: {},
  });
  await legacy.table("credentialVault").put({
    name: "dropbox",
    nonce: "nonce",
    ciphertext: "ciphertext",
    updatedAt: now,
  });
  await legacy.table("credentialVaultMeta").put({
    id: "credential-vault",
    salt: "salt",
    checkNonce: "nonce",
    checkCiphertext: "ciphertext",
  });
  legacy.close();
}

describe("browser IndexedDB schema upgrades", () => {
  beforeEach(async () => {
    migrationDatabase.close();
    await migrationDatabase.delete();
  });

  afterEach(async () => {
    migrationDatabase.close();
    await migrationDatabase.delete();
  });

  it("upgrades a v1 records-only database to the current schema without losing records", async () => {
    await createVersionOneDatabase();

    await migrationDatabase.open();

    expect(migrationDatabase.verno).toBe(BROWSER_DATABASE_SCHEMA_VERSION);
    expect(await migrationDatabase.records.get("vehicle:legacy-v1")).toMatchObject({
      revision: 4,
      data: { registrationNumber: "MH00AA0001", label: "legacy-v1" },
    });
    expect(migrationDatabase.tables.map((table) => table.name)).toEqual(
      expect.arrayContaining([
        "records",
        "driverState",
        "driverIntents",
        "driverEvents",
        "driverOutbox",
        "backupCheckpoints",
        "credentialVault",
        "credentialVaultMeta",
        "diagnostics",
      ]),
    );

    migrationDatabase.close();
    await migrationDatabase.open();
    expect(await migrationDatabase.records.get("vehicle:legacy-v1")).toMatchObject({
      revision: 4,
      data: { label: "legacy-v1" },
    });
  });

  it("upgrades a v4 database and preserves workflow, checkpoint and vault rows", async () => {
    await createVersionFourDatabase();

    await migrationDatabase.open();

    expect(migrationDatabase.verno).toBe(BROWSER_DATABASE_SCHEMA_VERSION);
    expect(await migrationDatabase.records.get("finance:loan:legacy-v4")).toMatchObject({
      revision: 7,
      data: { principalPaise: 25000000 },
    });
    expect(await migrationDatabase.driverState.get("driver-state")).toMatchObject({
      value: { revision: 12 },
    });
    expect(await migrationDatabase.driverIntents.get("intent-legacy-v4")).toMatchObject({
      status: "pending",
    });
    expect(await migrationDatabase.driverEvents.get("event-legacy-v4")).toMatchObject({
      revision: 12,
    });
    expect(await migrationDatabase.driverOutbox.get("outbox-legacy-v4")).toMatchObject({
      delivered: false,
      revision: 12,
    });
    expect(await migrationDatabase.backupCheckpoints.get("checkpoint-legacy-v4")).toMatchObject({
      status: "checkpoint",
    });
    expect(await migrationDatabase.credentialVault.get("dropbox")).toMatchObject({
      ciphertext: "ciphertext",
    });
    expect(await migrationDatabase.credentialVaultMeta.get("credential-vault")).toMatchObject({
      salt: "salt",
    });

    migrationDatabase.close();
    await migrationDatabase.open();
    expect(await migrationDatabase.driverOutbox.get("outbox-legacy-v4")).toMatchObject({
      delivered: false,
    });
  });

  it("fails closed on a future schema version and leaves its data unchanged", async () => {
    const future = new Dexie(DATABASE_NAME);
    future.version(7).stores({
      records: "id,updatedAt,schemaVersion,deletedAt",
      futureOnly: "id",
    });
    await future.open();
    await future.table("records").put({
      id: "future:record",
      schemaVersion: 99,
      createdAt: now,
      updatedAt: now,
      source: "web",
      revision: 1,
      data: { marker: "must-survive" },
    });
    await future.table("futureOnly").put({ id: "future-row" });
    future.close();

    await expect(migrationDatabase.open()).rejects.toBeInstanceOf(UnsupportedBrowserDatabaseVersionError);

    await future.open();
    expect(await future.table("records").get("future:record")).toMatchObject({
      data: { marker: "must-survive" },
    });
    expect(await future.table("futureOnly").get("future-row")).toEqual({ id: "future-row" });
    future.close();
  });
});
