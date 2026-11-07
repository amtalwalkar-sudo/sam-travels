import type { RecordEnvelope } from "../../../packages/core/src/types";
import {
  FINANCE_FEATURE,
  assertFinanceLoanRecordIdentity,
  assertFinanceLoanRecordV1,
} from "../../../packages/features/finance";
import { assertVehicleRecordV1 } from "../../../packages/features/vehicle";
import { registerBrowserFeatureBackupParticipant } from "../../../packages/storage-browser/src";

const PREFIX = "feature:finance:loan:";

/** Finance Loan backup validator: preserve schedule provenance and vehicle links. */
export function registerFinanceBrowserBackupParticipant(): () => void {
  return registerBrowserFeatureBackupParticipant({
    feature: FINANCE_FEATURE,
    participantId: "finance-records",
    recordIdPrefix: PREFIX,
    validateRecord(record: RecordEnvelope<unknown>, allRecords: readonly RecordEnvelope<unknown>[]) {
      assertFinanceLoanRecordIdentity(record.id);
      assertFinanceLoanRecordV1(record.data);
      const vehicle = allRecords.find(item => item.id === record.data.details.vehicleId);
      if (!vehicle) throw new Error("finance_loan_vehicle_not_found");
      assertVehicleRecordV1(vehicle.data);
      if (vehicle.id !== "feature:vehicle:" + vehicle.data.registrationNumber) {
        throw new Error("finance_loan_vehicle_identity_mismatch");
      }
    },
    validateSnapshot(records) {
      const loans = records.filter(record => record.id.startsWith(PREFIX));
      const ids = new Set<string>();
      for (const loan of loans) {
        assertFinanceLoanRecordIdentity(loan.id);
        assertFinanceLoanRecordV1(loan.data);
        if (ids.has(loan.id)) throw new Error("finance_backup_duplicate_loan_identity");
        ids.add(loan.id);
        const vehicle = records.find(item => item.id === loan.data.details.vehicleId);
        if (!vehicle) throw new Error("finance_loan_vehicle_not_found");
        assertVehicleRecordV1(vehicle.data);
        if (vehicle.id !== "feature:vehicle:" + vehicle.data.registrationNumber) {
          throw new Error("finance_loan_vehicle_identity_mismatch");
        }
      }
    },
  });
}
