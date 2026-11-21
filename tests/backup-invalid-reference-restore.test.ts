import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { exportBrowserSnapshot } from "../packages/storage-browser/src";
import { toCanonicalBackupSnapshotV1 } from "../packages/storage-browser/src/canonical-backup-snapshot";
import { createEncryptedBackup } from "../packages/features/backup";
import { restoreBackupForCurrentRuntime } from "../apps/web/src/backup-runtime";
import fixture from "../fixtures/semantic-backup-lifecycle-v1.json";
import { registerBusinessSettingsBrowserBackupParticipant } from "../apps/web/src/business-settings-backup";
import { registerVehicleBrowserBackupParticipant } from "../apps/web/src/vehicle-backup";
import { registerDriverRecordsBrowserBackupParticipant } from "../apps/web/src/driver-records-backup";
import { registerFinanceBrowserBackupParticipant } from "../apps/web/src/finance-backup";
import { registerComplianceBrowserBackupParticipant } from "../apps/web/src/compliance-backup";
import { registerMaintenanceBrowserBackupParticipant } from "../apps/web/src/maintenance-backup";
import { registerBusinessExpensesBrowserBackupParticipant } from "../apps/web/src/business-expenses-backup";
import { registerPerformanceBrowserBackupParticipant } from "../apps/web/src/performance-backup";

describe("authenticated invalid-reference encrypted restore", () => {
  let unregister: Array<() => void> = [];

  beforeEach(async () => {
    await browserDatabase.delete();
    await browserDatabase.open();
    unregister = [
      registerBusinessSettingsBrowserBackupParticipant(),
      registerVehicleBrowserBackupParticipant(),
      registerDriverRecordsBrowserBackupParticipant(),
      registerFinanceBrowserBackupParticipant(),
      registerComplianceBrowserBackupParticipant(),
      registerMaintenanceBrowserBackupParticipant(),
      registerBusinessExpensesBrowserBackupParticipant(),
      registerPerformanceBrowserBackupParticipant(),
    ];
  });

  afterEach(async () => {
    unregister.reverse().forEach(dispose => dispose());
    unregister = [];
    browserDatabase.close();
    await browserDatabase.delete();
  });

  it("rejects a validly encrypted dangling Driver→Vehicle reference before checkpoint or replacement", async () => {
    await browserDatabase.records.bulkPut(fixture.populatedGraph.records as never);
    const exported = await exportBrowserSnapshot("0.1.0");
    const canonical = toCanonicalBackupSnapshotV1(exported.data, exported.manifest as never);
    const invalid = JSON.parse(JSON.stringify(canonical)) as typeof canonical;
    const assignment = invalid.records.find(
      row => row.id === fixture.operatingConfiguration.currentPairing.assignmentHistoryRecordId,
    )!;
    const envelope = JSON.parse(assignment.json) as {
      data: { assignments: Array<{ vehicleId: string }> };
    };
    envelope.data.assignments[0].vehicleId = "feature:vehicle:MISSING";
    assignment.json = JSON.stringify(envelope);

    const recoveryKey = "AQIDBAUGBwgJCgsMDQ4PEBESExMUFRYXGBkaGxwdHh8=";
    const encrypted = await createEncryptedBackup({
      plaintext: new TextEncoder().encode(JSON.stringify(invalid)),
      manifest: {
        ...exported.manifest,
        recordCounts: { records: canonical.records.length },
      },
      mode: "recovery-key-only",
      recoveryKey,
    });
    await browserDatabase.records.put({
      id: "destination-only-sentinel",
      schemaVersion: 1,
      createdAt: exported.manifest.createdAt,
      updatedAt: exported.manifest.createdAt,
      source: "integration",
      revision: 1,
      data: { value: "must-survive-rejection" },
    });

    await expect(restoreBackupForCurrentRuntime({
      backup: encrypted.backup,
      secret: { recoveryKey },
      confirmed: true,
    })).rejects.toBeDefined();
    expect((await browserDatabase.records.get("destination-only-sentinel"))?.data)
      .toEqual({ value: "must-survive-rejection" });
    expect(await browserDatabase.table("backupCheckpoints").count()).toBe(0);
  });
});
