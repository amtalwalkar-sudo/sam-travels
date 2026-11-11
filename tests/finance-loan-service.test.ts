import { describe, expect, it } from "vitest";
import type { AtomicRecordRepository } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import { FinanceLoanService } from "../packages/application/src/finance-loan-service";
import { assertFinanceLoanRecordV1, createLoanScheduleVersion, loanCalculationInputsChanged } from "../packages/features/finance";

class MemoryRepository implements AtomicRecordRepository {
  private rows = new Map<string, RecordEnvelope<unknown>>();
  async get<T>(id: string) { return this.rows.get(id) as RecordEnvelope<T> | undefined; }
  async put<T>(record: RecordEnvelope<T>) { this.rows.set(record.id, record as RecordEnvelope<unknown>); }
  async list<T>() { return [...this.rows.values()] as Array<RecordEnvelope<T>>; }
  async remove(id: string) { this.rows.delete(id); }
  async compareAndSet<T>(id: string, expectedRevision: number | null, next: RecordEnvelope<T>) {
    const current = this.rows.get(id);
    if (expectedRevision === null ? current !== undefined : current?.revision !== expectedRevision) return false;
    this.rows.set(id, next as RecordEnvelope<unknown>);
    return true;
  }
}

const vehicle = {
  id: "feature:vehicle:MH01AB1234",
  schemaVersion: 1 as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  source: "web" as const,
  revision: 1,
  data: { lifecycleState: "active" },
};

const details = {
  loanName: "Vehicle loan",
  lenderName: "Example Bank",
  vehicleId: vehicle.id,
  principalPaise: 10_000_000,
  annualInterestRateBasisPoints: 1200,
  loanStartDate: "2026-01-10",
  tenureMonths: 12,
  firstEmiDate: "2026-02-01",
};

describe("FinanceLoanService", () => {
  const setup = () => {
    const repository = new MemoryRepository();
    const service = new FinanceLoanService(repository, {
      async getById(id) { return id === vehicle.id ? vehicle as RecordEnvelope<{ lifecycleState: string }> : undefined; },
    }, assertFinanceLoanRecordV1, createLoanScheduleVersion, loanCalculationInputsChanged, () => "2026-01-10T10:00:00.000Z");
    return { repository, service };
  };

  it("creates an immutable original schedule with calculation provenance", async () => {
    const { service } = setup();
    const loan = await service.create({ uuid: "123e4567-e89b-42d3-a456-426614174000", details, source: "web" });
    expect(loan.id).toBe("feature:finance:loan:123e4567-e89b-42d3-a456-426614174000");
    expect(loan.data.currentScheduleVersion).toBe(1);
    expect(loan.data.scheduleVersions[0].calculationId).toBe("finance.loan-monthly-reducing-balance.v1");
    expect(loan.data.scheduleVersions[0].output.rows).toHaveLength(12);
  });

  it("rejects edits to saved loan details so the historical loan record remains immutable", async () => {
    const { service } = setup();
    const created = await service.create({ uuid: "123e4567-e89b-42d3-a456-426614174000", details, source: "web" });
    await expect(service.update({
      id: created.id, expectedRevision: 1,
      details: { ...details, annualInterestRateBasisPoints: 1350 },
    })).rejects.toThrow("finance_loan_details_immutable");
    const current = await service.get(created.id);
    expect(current).toEqual(created);
  });






  it("locks calculation inputs after immutable prepayment history exists", async () => {
    const { repository, service } = setup();
    const created = await service.create({ uuid: "123e4567-e89b-42d3-a456-426614174000", details, source: "web" });
    await repository.put({
      id: "feature:finance:prepayments:123e4567-e89b-42d3-a456-426614174000",
      schemaVersion: 1, createdAt: "2026-01-10T10:00:00.000Z",
      updatedAt: "2026-01-10T10:00:00.000Z", businessDate: "2026-01-10",
      source: "web", revision: 1,
      data: { schemaVersion: 1, kind: "loan-prepayment-state", loanId: created.id,
        baseScheduleVersion: 1, currentScheduleVersion: 2, revisions: [{}] },
    });
    await expect(service.update({
      id: created.id, expectedRevision: 1,
      details: { ...details, annualInterestRateBasisPoints: 1350 },
    })).rejects.toThrow("finance_loan_prepayment_schedule_locked");
  });

  it("retains historical loan dates independent of business start date", async () => {
    const { service } = setup();
    const created = await service.create({ uuid: "123e4567-e89b-42d3-a456-426614174000", details, source: "web" });
    expect(created.businessDate).toBe("2026-01-10");
  });
});
