import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RecordEnvelope } from "../packages/core/src/types";
import type { FinanceLoanRecordV1 } from "../packages/application/src/finance-loan-service";
import { createLoanPrepaymentRevisionV1, createLoanScheduleVersion, FINANCE_LOAN_PREPAYMENT_RECORD_PREFIX } from "../packages/features/finance";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { exportBrowserSnapshot, restoreBrowserSnapshot } from "../packages/storage-browser/src";
import { registerVehicleBrowserBackupParticipant } from "../apps/web/src/vehicle-backup";
import { registerFinanceBrowserBackupParticipant } from "../apps/web/src/finance-backup";

const vehicleId = "feature:vehicle:MH01AB1234";
const loanUuid = "123e4567-e89b-42d3-a456-426614174000";
const loanId = "feature:finance:loan:" + loanUuid;
const paymentId = "feature:finance:payments:" + loanUuid;
const prepaymentId = FINANCE_LOAN_PREPAYMENT_RECORD_PREFIX + loanUuid;
const timestamp = "2026-01-10T10:00:00.000Z";
const details = {
  loanName: "Vehicle loan", lenderName: "Example Bank", vehicleId,
  principalPaise: 10_000_000, annualInterestRateBasisPoints: 1200,
  loanStartDate: "2026-01-10", tenureMonths: 12, firstEmiDate: "2026-02-01",
};
const schedule = createLoanScheduleVersion(1, details, timestamp);
const loanData: FinanceLoanRecordV1 = {
  schemaVersion: 1, kind: "loan", details, currentScheduleVersion: 1, scheduleVersions: [schedule],
};
const loan: RecordEnvelope<FinanceLoanRecordV1> = {
  id: loanId, schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
  source: "web", revision: 1, data: loanData,
};
const principalBeforePaise = schedule.output.rows[1].closingPrincipalPaise;
const prepaymentRevision = createLoanPrepaymentRevisionV1({
  version: 2, previousScheduleVersion: 1, expectedLoanRevision: 1,
  expectedPaymentLedgerRevision: 1, source: "web", commandId: "prepay-command-001",
  effectiveDate: "2026-03-15", createdAt: "2026-03-15T10:00:00.000Z",
  mode: "reduce_tenure", principalBeforePaise, prepaymentAmountPaise: 2_000_000,
  annualInterestRateBasisPoints: details.annualInterestRateBasisPoints,
  regularEmiPaise: schedule.output.regularEmiPaise,
  remainingDueDates: schedule.output.rows.slice(2).map(row => row.dueDate),
});

describe("Finance browser backup participant", () => {
  let unregisterVehicle: (() => void) | undefined;
  let unregisterFinance: (() => void) | undefined;

  beforeEach(async () => {
    await browserDatabase.delete();
    await browserDatabase.open();
    unregisterVehicle = registerVehicleBrowserBackupParticipant();
    unregisterFinance = registerFinanceBrowserBackupParticipant();
  });
  afterEach(() => {
    unregisterFinance?.(); unregisterFinance = undefined;
    unregisterVehicle?.(); unregisterVehicle = undefined;
  });

  async function seedFinanceRecords() {
    await browserDatabase.records.put({
      id: vehicleId, schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
      source: "web", revision: 1,
      data: {
        schemaVersion: 1, registrationNumber: "MH01AB1234", make: "Tata",
        model: "Ace", vehicleType: "LCV", fuelType: "CNG",
        yearOfManufacture: 2022, ownership: "Owned", lifecycleState: "active",
      },
    });
    await browserDatabase.records.put(loan);
    await browserDatabase.records.put({
      id: paymentId, schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
      source: "web", revision: 1, data: { schemaVersion: 1, loanId, entries: [] },
    });
    await browserDatabase.records.put({
      id: prepaymentId, schemaVersion: 1, createdAt: "2026-03-15T10:00:00.000Z",
      updatedAt: "2026-03-15T10:00:00.000Z", businessDate: "2026-03-15",
      source: "web", revision: 1,
      data: {
        schemaVersion: 1, kind: "loan-prepayment-state", loanId,
        baseScheduleVersion: 1, currentScheduleVersion: 2, revisions: [prepaymentRevision],
      },
    });
  }

  it("round-trips loan, payment-ledger and prepayment schedule history together", async () => {
    await seedFinanceRecords();
    const snapshot = await exportBrowserSnapshot("0.1.0");
    expect(snapshot.manifest.participants).toContainEqual({
      id: "finance-records", featureId: "finance", snapshotVersion: 1, restoreValidatorId: "finance-records-v1",
    });
    expect(snapshot.data.records.map(record => (record as RecordEnvelope<unknown>).id).sort()).toEqual([
      loanId, paymentId, prepaymentId, vehicleId,
    ].sort());

    await browserDatabase.records.clear();
    await restoreBrowserSnapshot({ data: snapshot.data, manifest: snapshot.manifest as never, confirmed: true });
    expect(await browserDatabase.records.get(loanId)).toMatchObject({ data: { currentScheduleVersion: 1 } });
    expect(await browserDatabase.records.get(paymentId)).toMatchObject({ data: { loanId, entries: [] } });
    expect(await browserDatabase.records.get(prepaymentId)).toMatchObject({
      data: { loanId, currentScheduleVersion: 2, revisions: [expect.objectContaining({ version: 2 })] },
    });
  });

  it("rejects a Finance loan whose vehicle reference is missing", async () => {
    await browserDatabase.records.put(loan);
    await expect(exportBrowserSnapshot("0.1.0")).rejects.toThrow("finance_loan_vehicle_not_found");
  });
});
