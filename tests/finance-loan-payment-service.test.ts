import { describe, expect, it } from "vitest";
import type { AtomicRecordBatchRepository, AtomicRecordMutation } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import { FinanceLoanPaymentService, proposeFinancePaymentAllocationV1 } from "../packages/application/src/finance-loan-payment-service";
import type { FinanceLoanRecordV1 } from "../packages/application/src/finance-loan-service";

class MemoryRepository implements AtomicRecordBatchRepository {
  private rows = new Map<string, RecordEnvelope<unknown>>();
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
    if (!mutations.length || new Set(mutations.map(item => item.id)).size !== mutations.length) throw new Error("atomic_record_batch_invalid");
    for (const item of mutations) {
      const current = this.rows.get(item.id);
      if (item.expectedRevision === null ? current !== undefined : current?.revision !== item.expectedRevision) return false;
      if (item.next.id !== item.id || item.next.revision !== (item.expectedRevision ?? 0) + 1) throw new Error("atomic_record_batch_invalid");
    }
    for (const item of mutations) this.rows.set(item.id, item.next as RecordEnvelope<unknown>);
    return true;
  }
}
const loanId = "feature:finance:loan:123e4567-e89b-42d3-a456-426614174000";
const rows = [
  { installmentNumber: 1, dueDate: "2026-11-01", installmentAmountPaise: 10000 },
  { installmentNumber: 2, dueDate: "2026-12-01", installmentAmountPaise: 10000 },
  { installmentNumber: 3, dueDate: "2027-01-01", installmentAmountPaise: 10000 },
];
const loanData = {
  schemaVersion: 1 as const, kind: "loan" as const,
  details: { loanName: "Test", lenderName: "Test lender", vehicleId: "feature:vehicle:MH01AB1234",
    principalPaise: 30000, annualInterestRateBasisPoints: 0, loanStartDate: "2026-10-01",
    tenureMonths: 3, firstEmiDate: "2026-11-01" },
  currentScheduleVersion: 1,
  scheduleVersions: [{ version: 1, createdAt: "2026-10-01T00:00:00.000Z", effectiveDate: "2026-10-01",
    calculationId: "finance.loan-monthly-reducing-balance.v1" as const, calculationVersion: 1 as const,
    inputSchemaVersion: 1 as const, outputSchemaVersion: 1 as const,
    input: { principalPaise: 30000, annualInterestRateBasisPoints: 0, tenureMonths: 3, loanStartDate: "2026-10-01", firstEmiDate: "2026-11-01" },
    output: { rows } }],
} as unknown as FinanceLoanRecordV1;
const loanEnvelope: RecordEnvelope<FinanceLoanRecordV1> = { id: loanId, schemaVersion: 1,
  createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
  source: "web", revision: 1, data: loanData };
function setup() {
  const repo = new MemoryRepository(); let clock = 0;
  void repo.put(loanEnvelope);
  const service = new FinanceLoanPaymentService(repo, { async get(id) { return id === loanId ? await repo.get<FinanceLoanRecordV1>(id) : undefined; } },
    () => "2026-11-08T04:00:0" + (clock++ % 10) + ".000Z");
  return { repo, service };
}
const base = { loanId, businessDate: "2026-11-08", amountPaise: 15000, method: "upi" as const,
  scheduleVersion: 1, source: "web" as const };
describe("FinanceLoanPaymentService", () => {
  it("suggests oldest due EMI first and does not allocate future installments", () => {
    expect(proposeFinancePaymentAllocationV1(loanData, [], 1, "2026-11-08", 25000))
      .toEqual([{ installmentNumber: 1, amountPaise: 10000 }]);
  });
  it("rejects allocations against a schedule that is no longer effective on the payment date", async () => {
    const repo = new MemoryRepository();
    void repo.put(loanEnvelope);
    const service = new FinanceLoanPaymentService(repo,
      { async get(id) { return id === loanId ? await repo.get<FinanceLoanRecordV1>(id) : undefined; } },
      () => "2026-12-20T10:00:00.000Z",
      {
        async getScheduleRows() { return [{ installmentNumber: 1, dueDate: "2027-01-01", installmentAmountPaise: 9000 }]; },
        async getScheduleVersionForDate(_id, businessDate) { return businessDate >= "2026-12-15" ? 2 : 1; },
      });
    await expect(service.record({ ...base, id: "payment-old-schedule", commandId: "old-schedule-command",
      businessDate: "2026-12-20", scheduleVersion: 1, amountPaise: 1000, allocations: [] }))
      .rejects.toThrow("finance_payment_schedule_version_not_effective_for_date");
  });
  it("supports partial EMI coverage and retains excess as explicit unallocated credit", async () => {
    const { repo, service } = setup();
    const first = await service.record({ ...base, id: "payment-1", commandId: "command-1",
      allocations: [{ installmentNumber: 1, amountPaise: 7000 }] });
    expect(first).toMatchObject({ unallocatedCreditPaise: 8000, amountPaise: 15000 });
    const second = await service.record({ ...base, businessDate: "2026-12-08", id: "payment-2", commandId: "command-2", amountPaise: 5000,
      allocations: [{ installmentNumber: 1, amountPaise: 3000 }, { installmentNumber: 2, amountPaise: 2000 }] });
    expect(second.unallocatedCreditPaise).toBe(0);
    expect(await service.list(loanId)).toHaveLength(2);
    expect((await repo.get(loanId))?.revision).toBe(3);
  });
  it("replays a command idempotently and rejects conflicting command reuse", async () => {
    const { service } = setup();
    const input = { ...base, id: "payment-1", commandId: "same-command", allocations: [{ installmentNumber: 1, amountPaise: 10000 }] };
    const original = await service.record(input);
    expect(await service.record(input)).toEqual(original);
    await expect(service.record({ ...input, amountPaise: 11000 })).rejects.toThrow("finance_payment_idempotency_conflict");
    await expect(service.record({ ...input, method: "cash" })).rejects.toThrow("finance_payment_idempotency_conflict");
    await expect(service.record({ ...input, note: "different intent" })).rejects.toThrow("finance_payment_idempotency_conflict");
    await expect(service.record({ ...input, allocations: [{ installmentNumber: 1, amountPaise: 9000 }] }))
      .rejects.toThrow("finance_payment_idempotency_conflict");
    expect(await service.list(loanId)).toHaveLength(1);
  });
  it("rejects over-allocation and invalid historical amount", async () => {
    const { service } = setup();
    await service.record({ ...base, id: "payment-1", commandId: "command-1", amountPaise: 10000,
      allocations: [{ installmentNumber: 1, amountPaise: 10000 }] });
    await expect(service.record({ ...base, id: "payment-2", commandId: "command-2", amountPaise: 1000,
      allocations: [{ installmentNumber: 1, amountPaise: 1000 }] })).rejects.toThrow("finance_payment_installment_overallocated");
    await expect(service.record({ ...base, id: "payment-3", commandId: "command-3", amountPaise: 0, allocations: [] })).rejects.toThrow("finance_payment_input_invalid");
  });
  it("serializes concurrent payments so an EMI cannot be over-allocated", async () => {
    const { repo, service } = setup();
    const results = await Promise.allSettled([
      service.record({ ...base, id: "payment-a", commandId: "command-a", amountPaise: 10000,
        allocations: [{ installmentNumber: 1, amountPaise: 10000 }] }),
      service.record({ ...base, id: "payment-b", commandId: "command-b", amountPaise: 10000,
        allocations: [{ installmentNumber: 1, amountPaise: 10000 }] }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await service.list(loanId)).toHaveLength(1);
    expect((await repo.get(loanId))?.revision).toBe(2);
  });
  it("records a full reversal append-only and restores the installment allocation capacity", async () => {
    const { service } = setup();
    await service.record({ ...base, id: "payment-1", commandId: "command-1", amountPaise: 10000,
      allocations: [{ installmentNumber: 1, amountPaise: 10000 }] });
    const reversal = await service.reverse({ id: "reversal-1", commandId: "reversal-command-1", loanId,
      paymentId: "payment-1", businessDate: "2026-11-08", reason: "Entered twice", source: "web" });
    expect(reversal.kind).toBe("reversal");
    await expect(service.reverse({ id: "reversal-1", commandId: "reversal-command-1", loanId,
      paymentId: "payment-1", businessDate: "2026-11-08", reason: "Different reason", source: "web" }))
      .rejects.toThrow("finance_payment_idempotency_conflict");
    await expect(service.reverse({ id: "reversal-1", commandId: "reversal-command-1", loanId,
      paymentId: "payment-1", businessDate: "2026-11-09", reason: "Entered twice", source: "web" }))
      .rejects.toThrow("finance_payment_idempotency_conflict");
    expect(await service.propose({ loanId, scheduleVersion: 1, businessDate: "2026-11-08", amountPaise: 10000 }))
      .toEqual([{ installmentNumber: 1, amountPaise: 10000 }]);
    await expect(service.reverse({ id: "reversal-2", commandId: "reversal-command-2", loanId,
      paymentId: "payment-1", businessDate: "2026-11-08", reason: "Again", source: "web" })).rejects.toThrow("finance_payment_already_reversed");
    expect(await service.list(loanId)).toHaveLength(2);
  });
});
