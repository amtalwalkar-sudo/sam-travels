import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { exportBrowserSnapshot } from "../packages/storage-browser/src";
import { toCanonicalBackupSnapshotV1, fromCanonicalBackupSnapshotV1 } from "../packages/storage-browser/src/canonical-backup-snapshot";
import { registerBusinessSettingsBrowserBackupParticipant } from "../apps/web/src/business-settings-backup";
import { registerVehicleBrowserBackupParticipant } from "../apps/web/src/vehicle-backup";
import { registerDriverRecordsBrowserBackupParticipant } from "../apps/web/src/driver-records-backup";
import { registerFinanceBrowserBackupParticipant } from "../apps/web/src/finance-backup";
import { registerComplianceBrowserBackupParticipant } from "../apps/web/src/compliance-backup";
import { registerMaintenanceBrowserBackupParticipant } from "../apps/web/src/maintenance-backup";
import { registerBusinessExpensesBrowserBackupParticipant } from "../apps/web/src/business-expenses-backup";
import { registerPerformanceBrowserBackupParticipant } from "../apps/web/src/performance-backup";

const fixture = JSON.parse(readFileSync(
  new URL("../fixtures/semantic-backup-lifecycle-v1.json", import.meta.url), "utf8",
)) as any;

describe("shared semantic backup validator parity matrix", () => {
  let unregister: Array<() => void> = [];
  let exported: Awaited<ReturnType<typeof exportBrowserSnapshot>>;
  let canonical: ReturnType<typeof toCanonicalBackupSnapshotV1>;

  beforeEach(async () => {
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
    await browserDatabase.delete();
    await browserDatabase.open();
    await browserDatabase.records.bulkPut(fixture.populatedGraph.records as never);
    exported = await exportBrowserSnapshot("0.1.0");
    canonical = toCanonicalBackupSnapshotV1(exported.data, exported.manifest as never);
  });

  afterEach(async () => {
    unregister.reverse().forEach(dispose => dispose());
    unregister = [];
    await browserDatabase.delete();
  });

  it("accepts the shared populated graph before evaluating its negative cases", () => {
    expect(fromCanonicalBackupSnapshotV1(canonical, {
      applicationVersion: exported.manifest.applicationVersion,
      createdAt: exported.manifest.createdAt,
      businessTimezone: exported.manifest.businessTimezone,
    }).data.records.length).toBe(fixture.populatedGraph.recordCount);
  });

  it("rejects every shared malformed, dangling, wrongly-owned and broken-lineage case", () => {
    const validateMutatedCanonical = (caseId: string, expectedError: string) => {
      const scenario = fixture.validatorMatrix.negativeCases.find((item: any) => item.id === caseId)!;
      const candidate = JSON.parse(JSON.stringify(canonical)) as typeof canonical;
      const target = candidate.records.find(item => item.id === scenario.recordId)!;
      if (scenario.mutation === "set_data_amountPaise_zero") {
        const payload = JSON.parse(target.json); payload.data.amountPaise = 0; target.json = JSON.stringify(payload);
      } else if (scenario.mutation === "set_data_vehicleId_missing") {
        const payload = JSON.parse(target.json); payload.data.vehicleId = "feature:vehicle:MISSINGVEHICLE001"; target.json = JSON.stringify(payload);
      } else if (scenario.mutation === "set_participant_maintenance_records") {
        target.participantId = "maintenance-records";
      } else if (scenario.mutation === "set_headCorrectionId_missing") {
        const payload = JSON.parse(target.json); payload.data.headCorrectionId = "missing-correction"; target.json = JSON.stringify(payload);
      }
      expect(() => fromCanonicalBackupSnapshotV1(candidate, {
        applicationVersion: exported.manifest.applicationVersion,
        createdAt: exported.manifest.createdAt,
        businessTimezone: exported.manifest.businessTimezone,
      })).toThrow(expectedError);
    };
    validateMutatedCanonical("malformed-fuel-purchase", "fuel_purchase_invalid");
    validateMutatedCanonical("dangling-business-expense-vehicle", "business_expense_vehicle_not_found");
    validateMutatedCanonical("wrong-feature-participant-owner", "backup_canonical_record_owner_mismatch");
    validateMutatedCanonical("invalid-maintenance-correction-head", "maintenance_correction_backup_head_invalid");
  });
});
