import type { RecordEnvelope } from "../../../packages/core/src/types";
import {
  COMPLIANCE_FEATURE,
  assertComplianceRecordIdentity,
  assertComplianceRecordV1,
} from "../../../packages/features/compliance";
import { assertVehicleRecordV1 } from "../../../packages/features/vehicle";
import { registerBrowserFeatureBackupParticipant } from "../../../packages/storage-browser/src";

const PREFIX = "feature:compliance:";

/** Validate Compliance payloads and renewal links before browser export or restore. */
export function registerComplianceBrowserBackupParticipant(): () => void {
  return registerBrowserFeatureBackupParticipant({
    feature: COMPLIANCE_FEATURE,
    participantId: "compliance-records",
    recordIdPrefix: PREFIX,
    validateRecord(record: RecordEnvelope<unknown>, allRecords: readonly RecordEnvelope<unknown>[]) {
      assertComplianceRecordIdentity(record.id);
      const data = record.data;
      assertComplianceRecordV1(data);
      const vehicle = allRecords.find(item => item.id === data.vehicleId);
      if (!vehicle) throw new Error("compliance_vehicle_not_found");
      const vehicleData = vehicle.data;
      assertVehicleRecordV1(vehicleData);
      if (vehicle.id !== "feature:vehicle:" + vehicleData.registrationNumber) {
        throw new Error("compliance_vehicle_identity_mismatch");
      }
      if (data.renewedFromRecordId) {
        const previous = allRecords.find(item => item.id === data.renewedFromRecordId);
        if (!previous) throw new Error("compliance_renewal_source_not_found");
        const previousData = previous.data;
        assertComplianceRecordV1(previousData);
        if (previousData.vehicleId !== data.vehicleId ||
            previousData.complianceName !== data.complianceName ||
            data.validFrom <= previousData.validTo) {
          throw new Error("compliance_renewal_source_mismatch");
        }
      }
    },
    validateSnapshot(records) {
      const owned = records.filter(record => record.id.startsWith(PREFIX));
      const ids = new Set<string>();
      for (const record of owned) {
        assertComplianceRecordIdentity(record.id);
        assertComplianceRecordV1(record.data);
        if (ids.has(record.id)) throw new Error("compliance_backup_duplicate_identity");
        ids.add(record.id);
      }
      for (const record of owned) {
        const data = record.data;
        assertComplianceRecordV1(data);
        const vehicle = records.find(item => item.id === data.vehicleId);
        if (!vehicle) throw new Error("compliance_vehicle_not_found");
        const vehicleData = vehicle.data;
        assertVehicleRecordV1(vehicleData);
        if (vehicle.id !== "feature:vehicle:" + vehicleData.registrationNumber) {
          throw new Error("compliance_vehicle_identity_mismatch");
        }
        if (!data.renewedFromRecordId) continue;
        const previous = owned.find(item => item.id === data.renewedFromRecordId);
        if (!previous) throw new Error("compliance_renewal_source_not_found");
        const previousData = previous.data;
        assertComplianceRecordV1(previousData);
        if (previousData.vehicleId !== data.vehicleId ||
            previousData.complianceName !== data.complianceName ||
            data.validFrom <= previousData.validTo) {
          throw new Error("compliance_renewal_source_mismatch");
        }
      }
    },
  });
}
