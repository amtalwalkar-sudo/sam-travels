import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import {
  exportBrowserSnapshot,
  registerBrowserFeatureBackupParticipant,
  restoreBrowserSnapshot,
} from "../packages/storage-browser/src";
import {
  BUSINESS_SETTINGS_FEATURE,
} from "../packages/features/business-settings";
import { assertBusinessSettingsRecordV1 } from "../packages/features/business-settings";\nimport { registerVehicleBrowserBackupParticipant } from "../apps/web/src/vehicle-backup";

describe("Business Settings backup participant", () => {
  let unregister: (() => void) | undefined;\n  let unregisterVehicle: (() => void) | undefined;

  beforeEach(async () => {
    await browserDatabase.delete();
    await browserDatabase.open();
    unregisterVehicle = registerVehicleBrowserBackupParticipant();\n    unregister = registerBrowserFeatureBackupParticipant({
      feature: BUSINESS_SETTINGS_FEATURE,
      participantId: "business-settings-records",
      recordIdPrefix: "feature:business-settings:",
      validateRecord(record) {
        if (record.id !== "feature:business-settings:business") {
          throw new Error("business_settings_backup_singleton_identity_invalid");
        }
        assertBusinessSettingsRecordV1(record.data);
      },
      validateSnapshot(records) {
        const owned = records.filter(record => record.id.startsWith("feature:business-settings:"));
        if (owned.length > 1 || owned.some(record => record.id !== "feature:business-settings:business")) {
          throw new Error("business_settings_backup_singleton_identity_invalid");
        }
      },
    });
  });

  afterEach(() => {
    unregisterVehicle?.();
    unregisterVehicle = undefined;
    unregister?.();
    unregister = undefined;
  });

  it("exports the required participant and restores the singleton into a clean store", async () => {
    const timestamp = "2026-11-07T00:00:00.000Z";
    await browserDatabase.records.put({
      id: "feature:business-settings:business",
      schemaVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      source: "web",
      revision: 1,
      data: { schemaVersion: 1, businessStartDate: "2020-02-29" },
    });

    const snapshot = await exportBrowserSnapshot("0.1.0");
    expect(snapshot.manifest.participants).toContainEqual({
      id: "business-settings-records",
      featureId: "business-settings",
      snapshotVersion: 1,
      restoreValidatorId: "business-settings-records-v1",
    });

    await browserDatabase.records.clear();
    await restoreBrowserSnapshot({
      data: snapshot.data,
      manifest: snapshot.manifest as never,
      confirmed: true,
    });
    expect(await browserDatabase.records.get("feature:business-settings:business")).toMatchObject({
      revision: 1,
      data: { schemaVersion: 1, businessStartDate: "2020-02-29" },
    });
  });

  it("rejects invalid dates and non-singleton identities before export", async () => {
    const timestamp = "2026-11-07T00:00:00.000Z";
    await browserDatabase.records.put({
      id: "feature:business-settings:business",
      schemaVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      source: "web",
      revision: 1,
      data: { schemaVersion: 1, businessStartDate: "2025-02-29" },
    });
    await expect(exportBrowserSnapshot("0.1.0"))
      .rejects.toThrow("business_settings_record_invalid");
  });

  it("restores a pre-feature backup that has no Business Settings records or participant entry", async () => {
    const snapshot = await exportBrowserSnapshot("0.1.0");
    const legacyManifest = {
      ...snapshot.manifest,
      participants: snapshot.manifest.participants?.filter(item => item.id !== "business-settings-records"),
    };
    await expect(restoreBrowserSnapshot({
      data: snapshot.data,
      manifest: legacyManifest as never,
      confirmed: true,
    })).resolves.toMatchObject({ restoredCounts: { records: 0 } });
  });

});
