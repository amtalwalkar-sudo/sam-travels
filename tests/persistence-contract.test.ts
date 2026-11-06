import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import validRecord from "../fixtures/persistence/record-envelope-v1-valid.json";
import malformedRecord from "../fixtures/persistence/record-envelope-v1-missing-data.json";
import futureRecord from "../fixtures/persistence/record-envelope-v2-future.json";
import duplicateBackup from "../fixtures/persistence/backup-v1-duplicate-identities.json";
import futureManifest from "../fixtures/persistence/backup-v2-future-manifest.json";
import { assertRecordEnvelope } from "../packages/core/src/persistence-contract";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { DexieRecordRepository } from "../packages/storage-browser/src";
import { restoreBrowserSnapshot } from "../packages/storage-browser/src/backup-snapshot";

describe("formal persistence contracts and historical fixtures", () => {
  afterEach(async () => {
    await browserDatabase.delete();
  });

  it("accepts a representative historical v1 record envelope", () => {
    expect(() => assertRecordEnvelope(validRecord)).not.toThrow();
  });

  it("rejects malformed, partial, and future-version record envelopes", () => {
    expect(() => assertRecordEnvelope(malformedRecord)).toThrow("record_data_required");
    expect(() => assertRecordEnvelope(futureRecord)).toThrow("record_unsupported_schema_version");
    expect(() => assertRecordEnvelope({ ...validRecord, revision: 0 })).toThrow("record_invalid_revision");
    expect(() => assertRecordEnvelope({ ...validRecord, businessDate: "2025-02-30" })).toThrow("record_invalid_business_date");
    expect(() => assertRecordEnvelope({ ...validRecord, source: "unknown" })).toThrow("record_invalid_source");
    expect(() => assertRecordEnvelope({ ...validRecord, updatedAt: "2025-04-02T00:00:00.000Z" })).toThrow("record_invalid_timestamps");
  });

  it("rejects malformed records at the browser persistence adapter", async () => {
    const repository = new DexieRecordRepository();
    await expect(repository.put(malformedRecord as never)).rejects.toThrow("record_data_required");
    expect(await browserDatabase.records.count()).toBe(0);
  });

  it("opens a historical Dexie v1 database through the ordered v1-to-v5 migration chain", async () => {
    await browserDatabase.delete();
    const historical = new Dexie("sam-travels-browser");
    historical.version(1).stores({ records: "id,updatedAt,schemaVersion,deletedAt" });
    await historical.open();
    await historical.table("records").put(validRecord);
    await historical.close();

    await browserDatabase.open();
    expect(browserDatabase.verno).toBe(5);
    expect(await browserDatabase.records.get("historical-trip-001")).toMatchObject(validRecord);
    expect(browserDatabase.tables.map(table => table.name)).toEqual(expect.arrayContaining([
      "records", "driverState", "driverIntents", "driverEvents", "driverOutbox",
      "backupCheckpoints", "credentialVault", "credentialVaultMeta", "diagnostics",
    ]));
  });

  it("rejects duplicate identities and unsupported future backup manifests before checkpointing", async () => {
    await expect(restoreBrowserSnapshot({
      data: duplicateBackup.data as never,
      manifest: duplicateBackup.manifest as never,
      confirmed: true,
    })).rejects.toThrow("backup_invalid_or_duplicate_row_id:records");

    const empty = { records: [], driverState: [], driverIntents: [], driverEvents: [], driverOutbox: [] };
    await expect(restoreBrowserSnapshot({
      data: empty,
      manifest: futureManifest as never,
      confirmed: true,
    })).rejects.toThrow("backup_unsupported_schema");
    expect(await browserDatabase.table("backupCheckpoints").count()).toBe(0);
  });
});
