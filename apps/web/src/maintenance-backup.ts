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
import {
  assertHistoricalCorrectionV1,
  projectHistoricalCorrectionsV1,
} from "../../../packages/domain/src/historical-correction";

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

/** Validate Maintenance's append-only correction chains inside a complete backup snapshot. */
export function validateMaintenanceCorrectionSnapshot(records: readonly RecordEnvelope<unknown>[]): void {
  const originals = new Map(records.filter(record =>
    record.id.startsWith(PREFIX + "expense:")).map(record => [record.id, record]));
  const correctionsByTarget = new Map<string, Array<RecordEnvelope<unknown>>>();
  for (const record of records.filter(item => item.id.startsWith("historical-correction:"))) {
    const data = record.data as { featureId?: unknown; targetRecordId?: unknown } | undefined;
    if (data?.featureId !== "maintenance") continue;
    assertHistoricalCorrectionV1(record.data);
    if (typeof data.targetRecordId !== "string" || !data.targetRecordId.startsWith(PREFIX + "expense:") ||
        record.id !== "historical-correction:" + (record.data as { correctionId: string }).correctionId) {
      throw new Error("maintenance_correction_backup_identity_invalid");
    }
    const rows = correctionsByTarget.get(data.targetRecordId) ?? [];
    rows.push(record);
    correctionsByTarget.set(data.targetRecordId, rows);
  }

  for (const [targetId, rows] of correctionsByTarget) {
    const target = originals.get(targetId);
    if (!target || target.revision < 1) throw new Error("maintenance_correction_backup_target_missing");
    const ordered = rows.map(row => row.data as import("../../../packages/domain/src/historical-correction").HistoricalCorrectionV1)
      .sort((a, b) => a.chainRevision - b.chainRevision);
    if (ordered.some((row, index) => row.chainRevision !== index + 1 ||
        row.targetRecordId !== targetId || row.targetRecordRevision !== target.revision ||
        row.featureId !== "maintenance")) {
      throw new Error("maintenance_correction_backup_chain_invalid");
    }
    const projection = projectHistoricalCorrectionsV1(target.data, ordered);
    if (projection.status !== "valid" ||
        !Number.isSafeInteger((projection.data as { amountPaise?: number }).amountPaise) ||
        ((projection.data as { amountPaise: number }).amountPaise) < 0) {
      throw new Error("maintenance_correction_backup_projection_invalid");
    }
    const chainHeadId = "historical-correction-chain:" + encodeURIComponent(targetId);
    const head = records.find(record => record.id === chainHeadId);
    const headData = head?.data as { schemaVersion?: number; targetRecordId?: string; chainRevision?: number; headCorrectionId?: string } | undefined;
    if (!head || headData?.schemaVersion !== 1 || headData.targetRecordId !== targetId ||
        headData.chainRevision !== projection.chainRevision ||
        headData.headCorrectionId !== projection.headCorrectionId) {
      throw new Error("maintenance_correction_backup_head_invalid");
    }
  }

  const maintenanceHeads = records.filter(record => record.id.startsWith("historical-correction-chain:") &&
    (record.data as { targetRecordId?: string } | undefined)?.targetRecordId?.startsWith(PREFIX + "expense:"));
  if (maintenanceHeads.some(head => !correctionsByTarget.has(
    (head.data as { targetRecordId: string }).targetRecordId))) {
    throw new Error("maintenance_correction_backup_chain_missing");
  }
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
        const source = daily.data as { schemaVersion?: number; kind?: string; vehicleId?: string; operationalDate?: string; entries?: Array<{ businessKm?: number; personalKm?: number; allocationStatus?: string }>; totalBusinessKm?: number; unallocatedBusinessKm?: number };
        const entries = source.entries ?? [];
        const allocatedTotal = entries.reduce((sum, entry) => sum + (entry.businessKm ?? 0), 0);
        const personalTotal = entries.reduce((sum, entry) => sum + (entry.personalKm ?? 0), 0);
        if (source.schemaVersion !== 1 || source.kind !== "daily_business_kilometres" || source.vehicleId !== data.vehicleId ||
            source.operationalDate !== data.operationalDate || !Array.isArray(source.entries) || source.unallocatedBusinessKm !== 0 ||
            entries.some(entry => entry.allocationStatus !== "allocated" || !Number.isSafeInteger(entry.businessKm) || (entry.businessKm ?? -1) < 0) ||
            allocatedTotal !== data.businessKm || source.totalBusinessKm !== data.businessKm ||
            (data.personalKm ?? 0) !== personalTotal || (data.personalAmountPaise ?? 0) !== personalTotal * data.ratePaisePerKm) {
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
      validateMaintenanceCorrectionSnapshot(records);
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
