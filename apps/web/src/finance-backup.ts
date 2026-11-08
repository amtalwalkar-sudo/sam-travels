import type { RecordEnvelope } from "../../../packages/core/src/types";
import { FINANCE_FEATURE, assertFinanceLoanRecordIdentity, assertFinanceLoanRecordV1,
  FINANCE_LOAN_PREPAYMENT_RECORD_PREFIX, assertFinanceLoanPrepaymentRecordIdentity,
  assertFinanceLoanPrepaymentStateV1 } from "../../../packages/features/finance";
import { assertVehicleRecordV1 } from "../../../packages/features/vehicle";
import { assertFinancePaymentLedgerV1 } from "../../../packages/application/src";
import type { FinanceLoanRecordV1 } from "../../../packages/application/src/finance-loan-service";
import { registerBrowserFeatureBackupParticipant } from "../../../packages/storage-browser/src";
const LOAN_PREFIX = "feature:finance:loan:";
const PAYMENT_PREFIX = "feature:finance:payments:";
const PREPAYMENT_PREFIX = FINANCE_LOAN_PREPAYMENT_RECORD_PREFIX;
const PREFIX = "feature:finance:";
function validatePaymentLinks(record: RecordEnvelope<unknown>, records: readonly RecordEnvelope<unknown>[]) {
  const ledger = record.data as {
    loanId: string;
    entries: readonly {
      kind: string; id: string; businessDate: string; scheduleVersion?: number;
      amountPaise: number; paidThroughInstallment?: number;
      allocations?: readonly { scheduleVersion: number; installmentNumber: number; amountPaise: number }[];
    }[];
  };
  assertFinancePaymentLedgerV1(record.data, ledger.loanId);
  if (!ledger.loanId.startsWith(LOAN_PREFIX) || record.id !== PAYMENT_PREFIX + ledger.loanId.slice(LOAN_PREFIX.length)) {
    throw new Error("finance_payment_ledger_identity_invalid");
  }
  const loan = records.find(item => item.id === ledger.loanId);
  if (!loan) throw new Error("finance_payment_loan_not_found");
  assertFinanceLoanRecordV1(loan.data);
  const loanData = loan.data as FinanceLoanRecordV1;
  const settlements = ledger.entries.filter(entry => entry.kind === "settlement");
  const lifecycleState = loanData.lifecycleState ?? "active";
  if ((lifecycleState === "closed" && settlements.length !== 1) ||
      (lifecycleState === "active" && settlements.length !== 0)) {
    throw new Error("finance_loan_settlement_lifecycle_mismatch");
  }
  const reversed = new Set(ledger.entries.filter(entry => entry.kind === "reversal")
    .map(entry => (entry as { paymentId?: string }).paymentId));
  const allocationTotals = new Map<string, number>();
  for (const entry of ledger.entries) if (entry.kind === "payment") {
    const version = loanData.scheduleVersions.find(item => item.version === entry.scheduleVersion);
    let rows: readonly { installmentNumber: number; dueDate: string; installmentAmountPaise: number }[] | undefined =
      (version?.output as { rows?: readonly { installmentNumber: number; dueDate: string; installmentAmountPaise: number }[] } | undefined)?.rows;
    if (!rows) {
      const prepaymentId = PREPAYMENT_PREFIX + ledger.loanId.slice(LOAN_PREFIX.length);
      const prepayment = records.find(item => item.id === prepaymentId);
      if (!prepayment) throw new Error("finance_payment_schedule_version_not_found");
      assertFinanceLoanPrepaymentStateV1(prepayment.data, loanData, ledger.loanId);
      const state = prepayment.data as { revisions: readonly { version: number; output: { rows: readonly { installmentNumber: number; dueDate: string; installmentAmountPaise: number }[] } }[] };
      rows = state.revisions.find(item => item.version === entry.scheduleVersion)?.output.rows;
    }
    if (!rows) throw new Error("finance_payment_schedule_version_not_found");
    for (const allocation of entry.allocations ?? []) {
      if (allocation.scheduleVersion !== entry.scheduleVersion) {
        throw new Error("finance_payment_allocation_schedule_reference_invalid");
      }
      const row = rows.find(item => item.installmentNumber === allocation.installmentNumber);
      if (!row) throw new Error("finance_payment_allocation_schedule_reference_invalid");
      if (row.dueDate > (entry.businessDate ?? "")) {
        throw new Error("finance_payment_allocation_future_installment");
      }
      if (!reversed.has(entry.id)) {
        const key = entry.scheduleVersion + ":" + allocation.installmentNumber;
        allocationTotals.set(key, (allocationTotals.get(key) ?? 0) + allocation.amountPaise);
        if (!Number.isSafeInteger(allocationTotals.get(key))) {
          throw new Error("finance_payment_allocation_total_invalid");
        }
      }
    }
  }
  const settlement = settlements[0];
  if (settlement) {
    const versionNumber = settlement.scheduleVersion;
    const version = loanData.scheduleVersions.find(item => item.version === versionNumber);
    let rows: readonly { installmentNumber: number; dueDate: string; installmentAmountPaise: number; closingPrincipalPaise: number }[] | undefined =
      (version?.output as { rows?: readonly { installmentNumber: number; dueDate: string; installmentAmountPaise: number; closingPrincipalPaise: number }[] } | undefined)?.rows;
    if (!rows) {
      const prepaymentId = PREPAYMENT_PREFIX + ledger.loanId.slice(LOAN_PREFIX.length);
      const prepayment = records.find(item => item.id === prepaymentId);
      if (!prepayment) throw new Error("finance_payment_schedule_version_not_found");
      const state = prepayment.data as { revisions: readonly { version: number; output: { rows: readonly { installmentNumber: number; dueDate: string; installmentAmountPaise: number; closingPrincipalPaise: number }[] } }[] };
      rows = state.revisions.find(item => item.version === versionNumber)?.output.rows;
    }
    if (!rows) throw new Error("finance_payment_schedule_version_not_found");
    const settlementRow = rows.find(row => row.dueDate === settlement.businessDate &&
      row.installmentNumber === settlement.paidThroughInstallment);
    if (!settlementRow || settlement.amountPaise !== settlementRow.closingPrincipalPaise ||
        settlement.amountPaise <= 0) throw new Error("finance_payment_settlement_amount_invalid");
    for (const row of rows.filter(item => item.dueDate <= settlement.businessDate)) {
      if ((allocationTotals.get(versionNumber + ":" + row.installmentNumber) ?? 0) !== row.installmentAmountPaise) {
        throw new Error("finance_payment_settlement_due_emi_not_fully_paid");
      }
    }
  }
  for (const [key, total] of allocationTotals) {
    const [versionNumber, installmentNumber] = key.split(":").map(Number);
    const version = loanData.scheduleVersions.find(item => item.version === versionNumber);
    const rows = (version?.output as { rows?: readonly { installmentNumber: number; installmentAmountPaise: number }[] } | undefined)?.rows ?? [];
    const row = rows.find(item => item.installmentNumber === installmentNumber);
    if (!row || total > row.installmentAmountPaise) {
      throw new Error("finance_payment_installment_overallocated");
    }
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
      else if (record.id.startsWith(PREPAYMENT_PREFIX)) {
        assertFinanceLoanPrepaymentRecordIdentity(record.id);
        const state = record.data as { loanId?: string };
        if (typeof state.loanId !== "string" || !state.loanId.startsWith(LOAN_PREFIX) ||
            record.id !== PREPAYMENT_PREFIX + state.loanId.slice(LOAN_PREFIX.length)) {
          throw new Error("finance_loan_prepayment_record_identity_invalid");
        }
        const loan = records.find(item => item.id === state.loanId);
        if (!loan) throw new Error("finance_loan_not_found");
        assertFinanceLoanRecordV1(loan.data);
        assertFinanceLoanPrepaymentStateV1(record.data, loan.data as FinanceLoanRecordV1, state.loanId);
      } else throw new Error("finance_backup_record_namespace_invalid");
    },
    validateSnapshot(records) {
      const loans = records.filter(record => record.id.startsWith(LOAN_PREFIX));
      const payments = records.filter(record => record.id.startsWith(PAYMENT_PREFIX));
      const prepayments = records.filter(record => record.id.startsWith(PREPAYMENT_PREFIX));
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
        const paymentId = PAYMENT_PREFIX + loan.id.slice(LOAN_PREFIX.length);
        const payment = records.find(item => item.id === paymentId);
        const settlementCount = ((payment?.data as { entries?: readonly { kind: string }[] } | undefined)?.entries ?? [])
          .filter(entry => entry.kind === "settlement").length;
        if ((loanData.lifecycleState === "closed" && settlementCount !== 1) ||
            ((loanData.lifecycleState ?? "active") === "active" && settlementCount !== 0)) {
          throw new Error("finance_loan_settlement_lifecycle_mismatch");
        }
      }
      const paymentIds = new Set<string>();
      for (const payment of payments) {
        if (paymentIds.has(payment.id)) throw new Error("finance_backup_duplicate_payment_ledger_identity");
        paymentIds.add(payment.id); validatePaymentLinks(payment, records);
      }
      const prepaymentIds = new Set<string>();
      for (const prepayment of prepayments) {
        if (prepaymentIds.has(prepayment.id)) throw new Error("finance_backup_duplicate_prepayment_state_identity");
        prepaymentIds.add(prepayment.id);
        assertFinanceLoanPrepaymentRecordIdentity(prepayment.id);
        const state = prepayment.data as { loanId?: string };
        if (typeof state.loanId !== "string" || !state.loanId.startsWith(LOAN_PREFIX) ||
            prepayment.id !== PREPAYMENT_PREFIX + state.loanId.slice(LOAN_PREFIX.length)) {
          throw new Error("finance_loan_prepayment_record_identity_invalid");
        }
        const loan = records.find(item => item.id === state.loanId);
        if (!loan) throw new Error("finance_loan_not_found");
        assertFinanceLoanRecordV1(loan.data);
        assertFinanceLoanPrepaymentStateV1(prepayment.data, loan.data as FinanceLoanRecordV1, state.loanId);
      }
    },
  });
}
