import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import {
  exportBrowserSnapshot,
  listBrowserRecoveryCheckpoints,
  restoreBrowserSnapshot,
} from "../packages/storage-browser/src";
import { registerVehicleBrowserBackupParticipant } from "../apps/web/src/vehicle-backup";

describe("Fuel location evidence backup ownership", () => {
  let unregisterVehicle: (() => void) | undefined;

  beforeEach(async () => {
    unregisterVehicle = registerVehicleBrowserBackupParticipant();
    await browserDatabase.delete();
    await browserDatabase.open();
  });

  afterEach(async () => {
    unregisterVehicle?.();
    unregisterVehicle = undefined;
    browserDatabase.close();
    await browserDatabase.delete();
  });

  it("round-trips Fuel GPS capture evidence while excluding device-local vault and recovery state", async () => {
    const timestamp = "2026-11-18T00:00:00.000Z";
    const fuelEventId = "feature:business-expenses:fuel:purchase-1";
    const locationEvidence = {
      eventId: fuelEventId,
      eventType: "fuel_purchase",
      latitude: 19.076,
      longitude: 72.8777,
      accuracyMeters: 12,
      fixAt: timestamp,
      capturedAt: timestamp,
      captureTiming: "at_entry",
    };
    const fuelLocationRecord = {
      id: "timeline-enrichment:fuel:" + fuelEventId,
      schemaVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      source: "integration" as const,
      revision: 1,
      data: locationEvidence,
    };
    await browserDatabase.records.put(fuelLocationRecord);
    await browserDatabase.credentialVault.put({
      name: "dropbox", nonce: "local-nonce", ciphertext: "local-secret-ciphertext", updatedAt: timestamp,
    });
    await browserDatabase.credentialVaultMeta.put({
      id: "credential-vault", salt: "local-salt", checkNonce: "local-check-nonce", checkCiphertext: "local-check-ciphertext",
    });
    await browserDatabase.diagnostics.put({
      id: "local-diagnostic",
      timestamp,
      subsystem: "backup-test",
      operation: "fuel-evidence-roundtrip",
      outcome: "success",
      failureCategory: "none",
      recoveryResult: "not_applicable",
      appVersion: "0.1.0",
      schemaVersion: 6,
    });
    await browserDatabase.backupCheckpoints.put({
      id: "local-checkpoint", createdAt: timestamp, status: "checkpoint",
      snapshot: { records: [], driverState: [], driverIntents: [], driverEvents: [], driverOutbox: [] },
    });

    const snapshot = await exportBrowserSnapshot("0.1.0");
    expect(snapshot.data.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: fuelLocationRecord.id, data: locationEvidence }),
    ]));
    expect(snapshot.manifest.participants).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "platform-records", featureId: "platform" }),
    ]));
    expect(snapshot.data).not.toHaveProperty("credentialVault");
    expect(snapshot.data).not.toHaveProperty("credentialVaultMeta");
    expect(snapshot.data).not.toHaveProperty("diagnostics");
    expect(snapshot.data).not.toHaveProperty("backupCheckpoints");

    await browserDatabase.records.clear();
    const restored = await restoreBrowserSnapshot({
      data: snapshot.data, manifest: snapshot.manifest, confirmed: true,
    });
    expect(await browserDatabase.records.get(fuelLocationRecord.id)).toMatchObject({
      revision: 1, data: locationEvidence,
    });
    expect(await browserDatabase.credentialVault.get("dropbox")).toMatchObject({
      ciphertext: "local-secret-ciphertext",
    });
    expect(await browserDatabase.credentialVaultMeta.get("credential-vault")).toMatchObject({
      salt: "local-salt",
    });
    expect(await browserDatabase.diagnostics.get("local-diagnostic")).toMatchObject({
      subsystem: "backup-test",
      operation: "fuel-evidence-roundtrip",
    });
    expect(await browserDatabase.backupCheckpoints.get("local-checkpoint")).toMatchObject({
      status: "checkpoint",
    });
    expect(restored.restoredCounts.records).toBe(1);
    expect(await listBrowserRecoveryCheckpoints()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: restored.checkpointId, status: "restored_unverified" }),
    ]));
  });
});
