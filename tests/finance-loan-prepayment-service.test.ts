import { describe, expect, it } from "vitest";
import type { AtomicRecordBatchRepository, AtomicRecordMutation } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import {
  createLoanScheduleVersion, assertFinanceLoanPrepaymentStateV1, createLoanPrepaymentRevisionV1,
} from "../packages/features/finance";
import type { FinanceLoanRecordV1 } from "../packages/application/src/finance-loan-service";
import {
  FinanceLoanPrepaymentService, FINANCE_LOAN_PREPAYMENT_RECORD_PREFIX,
} from "../packages/application/src/finance-loan-prepayment-service";
import type { FinancePaymentLedgerV1 } from "../packages/application/src/finance-loan-payment-service";

const loanId = "feature:finance:loan:123e4567-e89b-42d3-a456-426614174000";
const details = { loanName: "Vehicle loan", lenderName: "Example lender",
  vehicleId: "feature:vehicle:MH01AB1234", principalPaise: 10_000_000,
  annualInterestRateBasisPoints: 1200, loanStartDate: "2026-01-10",
  tenureMonths: 12, firstEmiDate: "2026-02-01" };
const schedule = createLoanScheduleVersion(1, details, "2026-01-10T10:00:00.000Z");
const loanData = { schemaVersion: 1 as const, kind: "loan" as const, details,
  currentScheduleVersion: 1, scheduleVersions: [schedule] as unknown as FinanceLoanRecordV1["scheduleVersions"] };
const loanEnvelope: RecordEnvelope<FinanceLoanRecordV1> = {
  id: loanId, schemaVersion: 1, createdAt: "2026-01-10T10:00:00.000Z",
  updatedAt: "2026-01-10T10:00:00.000Z", businessDate: details.loanStartDate,
  source: "web", revision: 1, data: loanData,
};
class MemoryRepository implements AtomicRecordBatchRepository {
  rows = new Map<string, RecordEnvelope<unknown>>();
  async get<T>(id: string) { return this.rows.get(id) as RecordEnvelope<T> | undefined; }
  async put<T>(record: RecordEnvelope<T>) { this.rows.set(record.id, record as RecordEnvelope<unknown>); }
  async list<T>() { return [...this.rows.values()] as Array<RecordEnvelope<T>>; }
  async remove(id: string) { this.rows.delete(id); }
  async compareAndSet<T>(id: string, expectedRevision: number | null, next: RecordEnvelope<T>) {
    const current = this.rows.get(id);
    if (expectedRevision === null ? current !== undefined : current?.revision !== expectedRevision) return false;
    this.rows.set(id, next as RecordEnvelope<unknown>); return true;
  }
  async compareAndSetMany(mutations: readonly AtomicRecordMutation[]) {
    for (const item of mutations) {
      const current = this.rows.get(item.id);
      if (item.expectedRevision === null ? current !== undefined : current?.revision !== item.expectedRevision) return false;
      if (item.next.id !== item.id || item.next.revision !== (item.expectedRevision ?? 0) + 1) throw new Error("atomic_record_batch_invalid");
    }
    for (const item of mutations) this.rows.set(item.id, item.next as RecordEnvelope<unknown>);
    return true;
  }
}
function setup() {
  const repository = new MemoryRepository();
  void repository.put(loanEnvelope);
  let tick = 0;
  const service = new FinanceLoanPrepaymentService(repository,
    { async get(id) { return repository.get<FinanceLoanRecordV1>(id); } },
    (value, loan, id) => assertFinanceLoanPrepaymentStateV1(value, loan, id),
    createLoanPrepaymentRevisionV1,
    () => "2026-01-15T10:00:0" + tick++ + ".000Z");
  return { repository, service };
}
describe("FinanceLoanPrepaymentService", () => {
  it("previews and atomically commits prepayment with loan and payment-ledger revisions", async () => {
    const { repository, service } = setup();
    const preview = await service.preview({ loanId, commandId: "prepay-command-1",
      businessDate: "2026-01-15", amountPaise: 1_000_000, mode: "reduce_tenure" });
    expect(preview.principalAfterPaise).toBe(9_000_000);
    const committed = await service.commit({ preview, source: "web" });
    expect(committed.version).toBe(2);
    expect((await repository.get<FinanceLoanRecordV1>(loanId))?.revision).toBe(2);
    const state = await repository.get<{ currentScheduleVersion: number }>(FINANCE_LOAN_PREPAYMENT_RECORD_PREFIX + loanId.slice("feature:finance:loan:".length));
    expect(state?.revision).toBe(1);
    expect(state?.data.currentScheduleVersion).toBe(2);
    expect(await service.getScheduleVersionForDate(loanId, "2026-01-14")).toBe(1);
    expect(await service.getScheduleVersionForDate(loanId, "2026-01-15")).toBe(2);
    const ledger = await repository.get<FinancePaymentLedgerV1>("feature:finance:payments:" + loanId.slice("feature:finance:loan:".length));
    expect(ledger?.revision).toBe(1);
    expect(ledger?.data.entries).toHaveLength(0);
    expect(await service.commit({ preview, source: "web" })).toEqual(committed);
  });
  it("rejects a second prepayment dated before the prior prepayment", async () => {
    const { service } = setup();
    const firstPreview = await service.preview({ loanId, commandId: "prepay-first",
      businessDate: "2026-01-15", amountPaise: 1_000_000, mode: "reduce_tenure" });
    await service.commit({ preview: firstPreview, source: "web" });
    await expect(service.preview({ loanId, commandId: "prepay-backdated",
      businessDate: "2026-01-14", amountPaise: 500_000, mode: "reduce_emi" }))
      .rejects.toThrow("finance_loan_prepayment_date_precedes_history");
  });
  it("rejects a principal prepayment dated before the loan starts", async () => {
    const { service } = setup();
    await expect(service.preview({ loanId, commandId: "prepay-before-start",
      businessDate: "2026-01-01", amountPaise: 1_000_000, mode: "reduce_tenure" }))
      .rejects.toThrow("finance_loan_prepayment_before_loan_start");
  });
  it("rejects prepayment when any EMI due on the business date is not fully allocated", async () => {
    const { service } = setup();
    await expect(service.preview({ loanId, commandId: "prepay-command-2",
      businessDate: "2026-02-01", amountPaise: 1_000_000, mode: "reduce_emi" }))
      .rejects.toThrow("finance_loan_prepayment_due_emi_not_fully_paid");
  });
  it("rejects a preview after the loan revision changes", async () => {
    const { repository, service } = setup();
    const preview = await service.preview({ loanId, commandId: "prepay-command-3",
      businessDate: "2026-01-15", amountPaise: 1_000_000, mode: "reduce_emi" });
    const current = await repository.get<FinanceLoanRecordV1>(loanId);
    await repository.compareAndSet(loanId, current!.revision, { ...current!, revision: current!.revision + 1 });
    await expect(service.commit({ preview, source: "web" }))
      .rejects.toThrow("finance_loan_prepayment_preview_stale");
  });
});
