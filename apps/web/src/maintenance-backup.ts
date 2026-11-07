import type { RecordEnvelope } from "../../../packages/core/src/types";
import {
  MAINTENANCE_FEATURE,
  assertMaintenanceRecordIdentity,
  assertMaintenanceRecordV1,
  maintenanceBusinessDateFromInstant,
  maintenanceRateHistoryRecordId,
} from "../../../packages/features/maintenance";
import { assertVehicleRecordV1 } from "../../../packages/features/vehicle";
import { registerBrowserFeatureBackupParticipant } from "../../../packages/storage-browser/src";

const PREFIX = "feature:maintenance:";

function validateVehicleReference(
  vehicleId: string,
  records: readonly RecordEnvelope<unknown>[],
): RecordEnvelope<unknown> {
  const vehicle = records.find(item => item.id === vehicleId);
  if (!vehicle) throw new Error("maintenance_vehicle_not_found");
  const data = vehicle.data;
  assertVehicleRecordV1(data);
  if (vehicle.id !== "feature:vehicle:" + data.registrationNumber) {
    throw new Error("maintenance_vehicle_identity_mismatch");
  }
  return vehicle;
}

/** Register Maintenance backup validation for all owned records and Vehicle references. */
export function registerMaintenanceBrowserBackupParticipant(): () => void {
  return registerBrowserFeatureBackupParticipant({
    feature: MAINTENANCE_FEATURE,
    participantId: "maintenance-records",
    recordIdPrefix: PREFIX,
    validateRecord(record: RecordEnvelope<unknown>, allRecords: readonly RecordEnvelope<unknown>[]) {
      assertMaintenanceRecordIdentity(record.id);
      const data = record.data;
      assertMaintenanceRecordV1(data);
      const vehicle = validateVehicleReference(data.vehicleId, allRecords);
      if (data.kind === "rate_history") {
        if (record.id !== maintenanceRateHistoryRecordId(data.vehicleId)) {
          throw new Error("maintenance_rate_history_identity_mismatch");
        }
        if (data.entries[0].effectiveFrom !== maintenanceBusinessDateFromInstant(vehicle.createdAt)) {
          throw new Error("maintenance_default_rate_effective_date_mismatch");
        }
      } else {
        const expectedPrefix = data.kind === "visit" ? PREFIX + "visit:" : PREFIX + "expense:";
        if (!record.id.startsWith(expectedPrefix)) throw new Error("maintenance_record_identity_mismatch");
      }
    },
    validateSnapshot(records) {
      const owned = records.filter(record => record.id.startsWith(PREFIX));
      const ids = new Set<string>();
      const rateVehicles = new Set<string>();
      for (const record of owned) {
        assertMaintenanceRecordIdentity(record.id);
        const data = record.data;
        assertMaintenanceRecordV1(data);
        if (ids.has(record.id)) throw new Error("maintenance_backup_duplicate_identity");
        ids.add(record.id);
        const vehicle = validateVehicleReference(data.vehicleId, records);
        if (data.kind === "rate_history") {
          if (rateVehicles.has(data.vehicleId)) throw new Error("maintenance_rate_history_duplicate_vehicle");
          rateVehicles.add(data.vehicleId);
          if (record.id !== maintenanceRateHistoryRecordId(data.vehicleId) ||
              data.entries[0].effectiveFrom !== maintenanceBusinessDateFromInstant(vehicle.createdAt)) {
            throw new Error("maintenance_rate_history_identity_mismatch");
          }
        }
      }
    },
  });
}
