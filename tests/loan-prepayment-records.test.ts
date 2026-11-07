import { describe, expect, it } from "vitest";
import {
  assertFinanceLoanPrepaymentRecordIdentity, assertFinanceLoanPrepaymentStateV1,
  createLoanPrepaymentRevisionV1, createLoanScheduleVersion, financeLoanPrepaymentRecordId,
  type FinanceLoanRecordV1, type FinanceLoanPrepaymentStateV1,
} from "../packages/features/finance";

const details = {
  loanName: "Vehicle loan", lenderName: "Example Bank", vehicleId: "feature:vehicle:MH01AB1234",
  principalPaise: 10_000_000, annualInterestRateBasisPoints: 1200,
  loanStartDate: "2026-01-10", tenureMonths: 12, firstEmiDate: "2026-02-01",
};
const loan: FinanceLoanRecordV1 = {
  schemaVersion: 1, kind: "loan", details, currentScheduleVersion: 1,
  scheduleVersions: [createLoanScheduleVersion(1, details, "2026-01-10T10:00:00.000Z")],
};
function state(): FinanceLoanPrepaymentStateV1 {
  const revision = createLoanPrepaymentRevisionV1({
    version: 2, commandId: "prepay-command-001", effectiveDate: "2026-03-15",
    createdAt: "2026-03-15T10:00:00.000Z", mode: "reduce_tenure",
    principalBeforePaise: 10_000_000, prepaymentAmountPaise: 2_000_000,
    annualInterestRateBasisPoints: details.annualInterestRateBasisPoints,
    regularEmiPaise: loan.scheduleVersions[0].output.regularEmiPaise,
    remainingDueDates: loan.scheduleVersions[0].output.rows.slice(2).map(row => row.dueDate),
  });
  return { schemaVersion: 1, kind: "loan-prepayment-state", loanId: "feature:finance:loan:123e4567-e89b-42d3-a456-426614174000",
    baseScheduleVersion: 1, currentScheduleVersion: 2, revisions: [revision] };
}
describe("Finance loan prepayment history model", () => {
  it("uses a separate identity namespace and validates canonical UUIDs", () => {
    const id = financeLoanPrepaymentRecordId("123e4567-e89b-42d3-a456-426614174000");
    expect(id).toBe("feature:finance:prepayments:123e4567-e89b-42d3-a456-426614174000");
    expect(() => assertFinanceLoanPrepaymentRecordIdentity(id)).not.toThrow();
    expect(() => financeLoanPrepaymentRecordId("not-a-uuid")).toThrow("finance_loan_prepayment_uuid_invalid");
  });
  it("validates immutable schedule revisions without changing the original loan schedule", () => {
    const value = state();
    expect(() => assertFinanceLoanPrepaymentStateV1(value, loan, value.loanId)).not.toThrow();
    expect(value.currentScheduleVersion).toBe(2);
    expect(loan.scheduleVersions).toHaveLength(1);
    expect(loan.currentScheduleVersion).toBe(1);
  });
  it("rejects altered calculation output and inconsistent principal history", () => {
    const value = state();
    const altered = { ...value, revisions: [{ ...value.revisions[0], output: { ...value.revisions[0].output, interestSavedPaise: 1 } }] };
    expect(() => assertFinanceLoanPrepaymentStateV1(altered, loan, value.loanId))
      .toThrow("finance_loan_prepayment_output_provenance_invalid");
    const inconsistent = { ...value, revisions: [{ ...value.revisions[0], principalAfterPaise: 7_000_000 }] };
    expect(() => assertFinanceLoanPrepaymentStateV1(inconsistent, loan, value.loanId))
      .toThrow("finance_loan_prepayment_revision_invalid");
  });
  it("rejects an unrelated loan identity", () => {
    const value = state();
    expect(() => assertFinanceLoanPrepaymentStateV1(value, loan, "feature:finance:loan:other"))
      .toThrow("finance_loan_prepayment_state_invalid");
  });
});
