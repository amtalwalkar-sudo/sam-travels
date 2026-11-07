import type { RecordEnvelope } from "../../../packages/core/src/types";
import { FINANCE_FEATURE, assertFinanceLoanRecordIdentity, assertFinanceLoanRecordV1 } from "../../../packages/features/finance";
import { assertVehicleRecordV1 } from "../../../packages/features/vehicle";
import { assertFinancePaymentLedgerV1 } from "../../../packages/application/src";
import type { FinanceLoanRecordV1 } from "../../../packages/application/src/finance-loan-service";
import { registerBrowserFeatureBackupParticipant } from "../../../packages/storage-browser/src";
const LOAN_PREFIX = "feature:finance:loan:";
const PAYMENT_PREFIX = "feature:finance:payments:";
const PREFIX = "feature:finance:";
function validatePaymentLinks(record: RecordEnvelope<unknown>, records: readonly RecordEnvelope<unknown>[]) {
  const ledger = record.data as { loanId: string; entries: readonly { kind: string; scheduleVersion?: number; allocations?: readonly { scheduleVersion: number; installmentNumber: number }[] }[] };
  assertFinancePaymentLedgerV1(record.data, ledger.loanId);
  if (!ledger.loanId.startsWith(LOAN_PREFIX) || record.id !== PAYMENT_PREFIX + ledger.loanId.slice(LOAN_PREFIX.length)) throw new Error("finance_payment_ledger_identity_invalid");
  const loan = records.find(item => item.id === ledger.loanId);
  if (!loan) throw new Error("finance_payment_loan_not_found");
  assertFinanceLoanRecordV1(loan.data);
  for (const entry of ledger.entries) if (entry.kind === "payment") {
    const version = loan.data.scheduleVersions.find(item => item.version === entry.scheduleVersion);
    if (!version) throw new Error("finance_payment_schedule_version_not_found");
    const rows = (version.output as { rows?: readonly { installmentNumber: number }[] }).rows ?? [];
    for (const allocation of entry.allocations ?? []) if (allocation.scheduleVersion !== entry.scheduleVersion ||
      !rows.some(row => row.installmentNumber === allocation.installmentNumber)) throw new Error("finance_payment_allocation_schedule_reference_invalid");
  }
}
export function registerFinanceBrowserBackupParticipant(): () => void {
  return registerBrowserFeatureBackupParticipant({
    feature: FINANCE_FEATURE, participantId: "finance-records", recordIdPrefix: PREFIX,
    validateRecord(record: RecordEnvelope<unknown>, records: readonly RecordEnvelope<unknown>[]) {
      if (record.id.startsWith(LOAN_PREFIX)) {
        assertFinanceLoanRecordIdentity(record.id); assertFinanceLoanRecordV1(record.data);
        const loanData = record.data as FinanceLoanRecordV1;
        const vehicle = records.find(item => item.id === loanData.details.vehicleId);
        if (!vehicle) throw new Error("finance_loan_vehicle_not_found");
        const data = vehicle.data; assertVehicleRecordV1(data);
        if (vehicle.id !== "feature:vehicle:" + data.registrationNumber) throw new Error("finance_loan_vehicle_identity_mismatch");
      } else if (record.id.startsWith(PAYMENT_PREFIX)) validatePaymentLinks(record, records);
      else throw new Error("finance_backup_record_namespace_invalid");
    },
    validateSnapshot(records) {
      const loans = records.filter(record => record.id.startsWith(LOAN_PREFIX));
      const payments = records.filter(record => record.id.startsWith(PAYMENT_PREFIX));
      const ids = new Set<string>();
      for (const loan of loans) {
        assertFinanceLoanRecordIdentity(loan.id); assertFinanceLoanRecordV1(loan.data);
        if (ids.has(loan.id)) throw new Error("finance_backup_duplicate_loan_identity");
        ids.add(loan.id);
        const loanData = loan.data as FinanceLoanRecordV1;
        const vehicle = records.find(item => item.id === loanData.details.vehicleId);
        if (!vehicle) throw new Error("finance_loan_vehicle_not_found");
        const data = vehicle.data; assertVehicleRecordV1(data);
        if (vehicle.id !== "feature:vehicle:" + data.registrationNumber) throw new Error("finance_loan_vehicle_identity_mismatch");
      }
      const paymentIds = new Set<string>();
      for (const payment of payments) {
        if (paymentIds.has(payment.id)) throw new Error("finance_backup_duplicate_payment_ledger_identity");
        paymentIds.add(payment.id); validatePaymentLinks(payment, records);
      }
    },
  });
}
