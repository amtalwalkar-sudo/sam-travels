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
      assertComplianceRecordV1(record.data);
      const vehicle = allRecords.find(item => item.id === record.data.vehicleId);
      if (!vehicle) throw new Error("compliance_vehicle_not_found");
      assertVehicleRecordV1(vehicle.data);
      if (vehicle.id !== "feature:vehicle:" + vehicle.data.registrationNumber) {
        throw new Error("compliance_vehicle_identity_mismatch");
      }
      if (record.data.renewedFromRecordId) {
        const previous = allRecords.find(item => item.id === record.data.renewedFromRecordId);
        if (!previous) throw new Error("compliance_renewal_source_not_found");
        assertComplianceRecordV1(previous.data);
        if (previous.data.vehicleId !== record.data.vehicleId ||
            previous.data.complianceName !== record.data.complianceName ||
            record.data.validFrom <= previous.data.validTo) {
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
        const vehicle = records.find(item => item.id === record.data.vehicleId);
        if (!vehicle) throw new Error("compliance_vehicle_not_found");
        assertVehicleRecordV1(vehicle.data);
        if (vehicle.id !== "feature:vehicle:" + vehicle.data.registrationNumber) {
          throw new Error("compliance_vehicle_identity_mismatch");
        }
        if (!record.data.renewedFromRecordId) continue;
        const previous = owned.find(item => item.id === record.data.renewedFromRecordId);
        if (!previous) throw new Error("compliance_renewal_source_not_found");
        if (previous.data.vehicleId !== record.data.vehicleId ||
            previous.data.complianceName !== record.data.complianceName ||
            record.data.validFrom <= previous.data.validTo) {
          throw new Error("compliance_renewal_source_mismatch");
        }
      }
    },
  });
}
