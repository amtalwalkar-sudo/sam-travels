import { assertDriverCommandContract, assertDriverEventContract, assertDriverIntentContract, assertDriverOutboxContract, assertDriverStateContract } from "../packages/domain/src/driver-workflow";
import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import validRecord from "../fixtures/persistence/record-envelope-v1-valid.json";
import malformedRecord from "../fixtures/persistence/record-envelope-v1-missing-data.json";
import futureRecord from "../fixtures/persistence/record-envelope-v2-future.json";
import duplicateBackup from "../fixtures/persistence/backup-v1-duplicate-identities.json";
import futureManifest from "../fixtures/persistence/backup-v2-future-manifest.json";
import { assertRecordEnvelope } from "../packages/core/src/persistence-contract";
import { BROWSER_DATABASE_SCHEMA_VERSION, browserDatabase } from "../packages/storage-browser/src/database";
import { DexieRecordRepository } from "../packages/storage-browser/src";
import { restoreBrowserSnapshot } from "../packages/storage-browser/src/backup-snapshot";
import { registerVehicleBrowserBackupParticipant } from "../apps/web/src/vehicle-backup";

describe("formal persistence contracts and historical fixtures", () => {
  let unregisterVehicle: (() => void) | undefined;
  beforeEach(() => { unregisterVehicle = registerVehicleBrowserBackupParticipant(); });
  afterEach(async () => {
    unregisterVehicle?.();
    unregisterVehicle = undefined;
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
    expect(() => assertRecordEnvelope({ ...validRecord, createdBy: { personId: "person-1", role: "driver" } })).not.toThrow();
    expect(() => assertRecordEnvelope({ ...validRecord, createdBy: { personId: "", role: "admin" } })).toThrow("record_invalid_author_provenance");
    expect(() => assertRecordEnvelope({ ...validRecord, createdBy: { personId: "person-1", role: "owner" } })).toThrow("record_invalid_author_provenance");
  });

  it("rejects malformed records at the browser persistence adapter", async () => {
    const repository = new DexieRecordRepository();
    // Envelope validation must reject before any IndexedDB operation is attempted.
    await expect(repository.put(malformedRecord as never)).rejects.toThrow("record_data_required");
  });

  it("opens a historical Dexie v1 database through the ordered v1-to-v5 migration chain", async () => {
    await browserDatabase.delete();
    const historical = new Dexie("sam-travels-browser");
    historical.version(1).stores({ records: "id,updatedAt,schemaVersion,deletedAt" });
    await historical.open();
    await historical.table("records").put(validRecord);
    await historical.close();

    await browserDatabase.open();
    expect(browserDatabase.verno).toBe(BROWSER_DATABASE_SCHEMA_VERSION);
    expect(await browserDatabase.records.get("historical-trip-001")).toMatchObject(validRecord);
    expect(browserDatabase.tables.map(table => table.name)).toEqual(expect.arrayContaining([
      "records", "driverState", "driverIntents", "driverEvents", "driverOutbox",
      "backupCheckpoints", "credentialVault", "credentialVaultMeta", "diagnostics",
    ]));
  });

  it("accepts the explicitly supported legacy v1 backup without a participant manifest", async () => {
    await browserDatabase.open();
    const result = await restoreBrowserSnapshot({
      data: { records: [], driverState: [], driverIntents: [], driverEvents: [], driverOutbox: [] },
      manifest: {
        applicationVersion: "0.1.0",
        schemaVersion: 1,
        createdAt: "2025-04-03T08:00:00.000Z",
        businessTimezone: "Asia/Kolkata",
        snapshotRevision: 0,
        recordCounts: { records: 0, driverState: 0, driverIntents: 0, driverEvents: 0, driverOutbox: 0 },
      },
      confirmed: true,
    });
    expect(result.restoredCounts).toEqual({
      records: 0, driverState: 0, driverIntents: 0, driverEvents: 0, driverOutbox: 0,
    });
  });

  it("validates persisted Work commands, intents, states, events and outbox discriminants", () => {
    const command = {
      schemaVersion: 1, commandId: "command-1", eventId: "event-1", eventType: "shift_start",
      originSurface: "pwa", transitionAt: "2026-11-06T08:00:00Z",
      expectedPriorState: "idle", expectedRevision: 0, idempotencyKey: "idem-1",
    };
    const event = {
      eventId: "event-1", command,
      gps: { latitude: 19.076, longitude: 72.8777, horizontalAccuracyM: 8, fixAt: "2026-11-06T08:00:00Z", provider: "test" },
      committedAt: "2026-11-06T08:00:01Z", revision: 1,
    };
    assertDriverCommandContract(command);
    assertDriverIntentContract({ command, status: "pending_location", createdAt: command.transitionAt, updatedAt: command.transitionAt });
    assertDriverStateContract({ schemaVersion: 1, revision: 0, state: "idle" });
    assertDriverEventContract(event);
    assertDriverOutboxContract({
      id: "driver-state:1", eventId: "event-1", revision: 1,
      integrationId: "logbook.work-driver-events.v1", contractVersion: 1,
      eventName: "work.driver-event-committed", payloadVersion: 1,
      delivered: false, createdAt: "2026-11-06T08:00:01Z",
    });
    expect(() => assertDriverCommandContract({ ...command, eventType: "unknown" })).toThrow("invalid_command");
    expect(() => assertDriverIntentContract({ command, status: "unknown", createdAt: command.transitionAt, updatedAt: command.transitionAt })).toThrow("invalid_driver_intent");
    expect(() => assertDriverEventContract({ ...event, revision: 2 })).toThrow("invalid_driver_event");
  });

  it("rejects duplicate identities and unsupported future backup manifests before checkpointing", async () => {
    await browserDatabase.open();
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
