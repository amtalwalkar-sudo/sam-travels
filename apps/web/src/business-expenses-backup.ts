import type { RecordEnvelope } from "../../../packages/core/src/types";
import {
  BUSINESS_EXPENSES_FEATURE,
  assertBusinessExpenseRecordV1,
  type BusinessExpenseRecordV1,
} from "../../../packages/features/business-expenses";
import { assertVehicleRecordV1 } from "../../../packages/features/vehicle";
import { assertDriverRecordV1 } from "../../../packages/features/driver-records";
import { registerBrowserFeatureBackupParticipant } from "../../../packages/storage-browser/src";

const PREFIX = "feature:business-expenses:";

function validateReferences(
  data: BusinessExpenseRecordV1,
  records: readonly RecordEnvelope<unknown>[],
): void {
  const vehicleId = data.kind === "fuel_purchase" ? data.vehicleId : data.vehicleId;
  if (vehicleId) {
    const vehicle = records.find(item => item.id === vehicleId);
    if (!vehicle) throw new Error("business_expense_vehicle_not_found");
    assertVehicleRecordV1(vehicle.data);
    if (vehicle.id !== "feature:vehicle:" + (vehicle.data as { registrationNumber: string }).registrationNumber) {
      throw new Error("business_expense_vehicle_identity_mismatch");
    }
  }
  if (data.kind === "business_expense" && data.driverId) {
    const driver = records.find(item => item.id === data.driverId);
    if (!driver) throw new Error("business_expense_driver_not_found");
    assertDriverRecordV1(driver.data);
  }
  if (data.kind === "business_expense") {
    if (data.sourceKind === "traffic_challan" && !data.vehicleId) throw new Error("traffic_challan_vehicle_required");
    if (data.sourceKind === "traffic_challan" && data.paymentStatus !== "unpaid" && data.paymentStatus !== "paid") throw new Error("traffic_challan_payment_status_required");
    if (data.sourceKind !== "traffic_challan" && data.paymentStatus !== undefined) throw new Error("traffic_challan_payment_status_not_applicable");
    if (data.sourceKind === "traffic_challan" && !data.description?.trim() && !data.reference?.trim()) throw new Error("traffic_challan_reason_or_reference_required");
    if (data.sourceKind === "platform_fee" && !data.reference?.trim()) throw new Error("platform_fee_source_reference_required");
    if (data.sourceKind === "miscellaneous" && !data.category?.trim()) throw new Error("miscellaneous_expense_category_required");
  }
}

/** Business expense records use the shared records table and the standard backup/restore participant. */
export function registerBusinessExpensesBrowserBackupParticipant(): () => void {
  return registerBrowserFeatureBackupParticipant({
    feature: BUSINESS_EXPENSES_FEATURE,
    participantId: "business-expenses-records",
    recordIdPrefix: PREFIX,
    validateRecord(record: RecordEnvelope<unknown>, allRecords: readonly RecordEnvelope<unknown>[]) {
      assertBusinessExpenseRecordV1(record.data);
      const data = record.data as BusinessExpenseRecordV1;
      if (record.id !== data.id || !record.id.startsWith(PREFIX)) {
        throw new Error("business_expense_record_identity_invalid");
      }
      validateReferences(data, allRecords);
    },
    validateSnapshot(records) {
      const owned = records.filter(record => record.id.startsWith(PREFIX));
      const byId = new Map(owned.map(record => [record.id, record]));
      if (byId.size !== owned.length) throw new Error("business_expense_backup_duplicate_identity");
      const reversed = new Set<string>();
      for (const record of owned) {
        assertBusinessExpenseRecordV1(record.data);
        const data = record.data as BusinessExpenseRecordV1;
        if (record.id !== data.id) throw new Error("business_expense_record_identity_invalid");
        validateReferences(data, records);
        if (data.kind === "business_expense" && data.effect === "reversal") {
          const originalId = data.reversesSourceId!;
          if (reversed.has(originalId)) throw new Error("business_expense_reversal_link_invalid");
          reversed.add(originalId);
          const original = byId.get(originalId)?.data as BusinessExpenseRecordV1 | undefined;
          if (!original || original.kind !== "business_expense" || original.effect !== "charge" ||
              original.sourceKind !== data.sourceKind || original.amountPaise !== data.amountPaise ||
              original.businessDate > data.businessDate ||
              (original.alreadyNettedFromIncome ?? false) !== (data.alreadyNettedFromIncome ?? false) ||
              original.paymentStatus !== data.paymentStatus) {
            throw new Error("business_expense_reversal_link_invalid");
          }
        }
      }
    },
  });
}
