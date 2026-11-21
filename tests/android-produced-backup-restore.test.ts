import "fake-indexeddb/auto";
import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { exportBrowserSnapshot, markBrowserRestoreVerified, discardVerifiedBrowserCheckpoint } from "../packages/storage-browser/src";
import { toCanonicalBackupSnapshotV1 } from "../packages/storage-browser/src/canonical-backup-snapshot";
import { restoreBackupForCurrentRuntime } from "../apps/web/src/backup-runtime";
import { registerBusinessSettingsBrowserBackupParticipant } from "../apps/web/src/business-settings-backup";
import { registerVehicleBrowserBackupParticipant } from "../apps/web/src/vehicle-backup";
import { registerDriverRecordsBrowserBackupParticipant } from "../apps/web/src/driver-records-backup";
import { registerFinanceBrowserBackupParticipant } from "../apps/web/src/finance-backup";
import { registerComplianceBrowserBackupParticipant } from "../apps/web/src/compliance-backup";
import { registerMaintenanceBrowserBackupParticipant } from "../apps/web/src/maintenance-backup";
import { registerBusinessExpensesBrowserBackupParticipant } from "../apps/web/src/business-expenses-backup";
import { registerPerformanceBrowserBackupParticipant } from "../apps/web/src/performance-backup";
import { parseBackupPackage, decryptBackupWithRecoveryKey } from "../packages/features/backup";

describe("Android-produced populated encrypted package through production Browser restore", () => {
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

  it.skipIf(!existsSync("fixtures/generated/android-populated-semantic-backup-v2.json"))("authenticates, restores, reopens and re-exports the Android writer's populated Stage 1 graph", async () => {
    const fixture = JSON.parse(readFileSync(
      "fixtures/generated/android-populated-semantic-backup-v2.json", "utf8",
    )) as { recoveryKey: string; backup: unknown; expectedSnapshot: unknown };
    const backup = parseBackupPackage(new TextEncoder().encode(JSON.stringify(fixture.backup)));
    const plaintext = await decryptBackupWithRecoveryKey(backup, fixture.recoveryKey);
    const importedCanonical = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext));
    // The Android artifact carries the exact canonical Room export that was
    // encrypted. Check the decrypted payload against that source oracle before
    // exercising Browser/Dexie production restore.
    expect(importedCanonical).toEqual(fixture.expectedSnapshot);

    const restored = await restoreBackupForCurrentRuntime({
      backup,
      secret: { recoveryKey: fixture.recoveryKey },
      confirmed: true,
    });
    expect(restored.restoredCount).toBe(importedCanonical.records.length);

    const importedExport = await exportBrowserSnapshot("0.1.0");
    const restoredCanonical = toCanonicalBackupSnapshotV1(
      importedExport.data, importedExport.manifest as never,
    );
    expect(restoredCanonical).toEqual(importedCanonical);

    await markBrowserRestoreVerified(restored.checkpointId);
    await discardVerifiedBrowserCheckpoint(restored.checkpointId);
    browserDatabase.close();
    await browserDatabase.open();
    const reopened = await exportBrowserSnapshot("0.1.0");
    expect(toCanonicalBackupSnapshotV1(reopened.data, reopened.manifest as never))
      .toEqual(importedCanonical);
  });
});
