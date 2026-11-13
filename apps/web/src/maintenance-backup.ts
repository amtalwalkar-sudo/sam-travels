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
        if (data.entries[0].effectiveFrom !== maintenanceBusinessDateFromInstant(vehicle.createdAt) ||
            data.entries[0].savedAt !== vehicle.createdAt) {
          throw new Error("maintenance_default_rate_effective_date_mismatch");
        }
      } else if (data.kind === "daily_accrual") {
        const expectedId = "feature:maintenance:daily-accrual:" + encodeURIComponent(data.vehicleId) + ":" + data.operationalDate;
        if (record.id !== expectedId) throw new Error("maintenance_daily_accrual_identity_mismatch");
        const daily = allRecords.find(item => item.id === data.dailyBusinessKmRecordId);
        if (!daily || daily.revision !== data.dailyBusinessKmRevision) throw new Error("maintenance_daily_accrual_source_missing_or_changed");
        const source = daily.data as { schemaVersion?: number; kind?: string; vehicleId?: string; operationalDate?: string; entries?: Array<{ businessKm?: number; allocationStatus?: string }>; totalBusinessKm?: number; unallocatedBusinessKm?: number };
        const entries = source.entries ?? [];
        const allocatedTotal = entries.reduce((sum, entry) => sum + (entry.businessKm ?? 0), 0);
        if (source.schemaVersion !== 1 || source.kind !== "daily_business_kilometres" || source.vehicleId !== data.vehicleId ||
            source.operationalDate !== data.operationalDate || !Array.isArray(source.entries) || source.unallocatedBusinessKm !== 0 ||
            entries.some(entry => entry.allocationStatus !== "allocated" || !Number.isSafeInteger(entry.businessKm) || (entry.businessKm ?? -1) < 0) ||
            allocatedTotal !== data.businessKm || source.totalBusinessKm !== data.businessKm) {
          throw new Error("maintenance_daily_accrual_source_invalid");
        }
        const rateRecord = allRecords.find(item => item.id === maintenanceRateHistoryRecordId(data.vehicleId));
        const rateEntries = (rateRecord?.data as { entries?: Array<{ effectiveFrom: string; ratePaisePerKm: number }> } | undefined)?.entries ?? [];
        const eligibleRates = rateEntries.filter(entry => entry.effectiveFrom <= data.operationalDate);
        const effectiveRate = eligibleRates[eligibleRates.length - 1];
        const effectiveFrom = effectiveRate?.effectiveFrom ?? maintenanceBusinessDateFromInstant(vehicle.createdAt);
        const ratePaisePerKm = effectiveRate?.ratePaisePerKm ?? 250;
        if (data.rateEffectiveFrom !== effectiveFrom || data.ratePaisePerKm !== ratePaisePerKm) {
          throw new Error("maintenance_daily_accrual_rate_snapshot_invalid");
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
              data.entries[0].effectiveFrom !== maintenanceBusinessDateFromInstant(vehicle.createdAt) ||
              data.entries[0].savedAt !== vehicle.createdAt) {
            throw new Error("maintenance_rate_history_identity_mismatch");
          }
        }
      }
    },
  });
}
