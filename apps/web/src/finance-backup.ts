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
      const data = record.data;
      assertFinanceLoanRecordV1(data);
      const vehicle = allRecords.find(item => item.id === data.details.vehicleId);
      if (!vehicle) throw new Error("finance_loan_vehicle_not_found");
      const vehicleData = vehicle.data;
      assertVehicleRecordV1(vehicleData);
      if (vehicle.id !== "feature:vehicle:" + vehicleData.registrationNumber) {
        throw new Error("finance_loan_vehicle_identity_mismatch");
      }
    },
    validateSnapshot(records) {
      const loans = records.filter(record => record.id.startsWith(PREFIX));
      const ids = new Set<string>();
      for (const loan of loans) {
        assertFinanceLoanRecordIdentity(loan.id);
        const data = loan.data;
        assertFinanceLoanRecordV1(data);
        if (ids.has(loan.id)) throw new Error("finance_backup_duplicate_loan_identity");
        ids.add(loan.id);
        const vehicle = records.find(item => item.id === data.details.vehicleId);
        if (!vehicle) throw new Error("finance_loan_vehicle_not_found");
        const vehicleData = vehicle.data;
        assertVehicleRecordV1(vehicleData);
        if (vehicle.id !== "feature:vehicle:" + vehicleData.registrationNumber) {
          throw new Error("finance_loan_vehicle_identity_mismatch");
        }
      }
    },
  });
}
