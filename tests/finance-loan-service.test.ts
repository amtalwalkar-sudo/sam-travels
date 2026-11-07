import { describe, expect, it } from "vitest";
import type { AtomicRecordRepository } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import { FinanceLoanService } from "../packages/application/src/finance-loan-service";

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
    }, () => "2026-01-10T10:00:00.000Z");
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

  it("preserves previous schedule versions when a calculation input changes", async () => {
    const { service } = setup();
    const created = await service.create({ uuid: "123e4567-e89b-42d3-a456-426614174000", details, source: "web" });
    const oldSchedule = created.data.scheduleVersions[0];
    const updated = await service.update({
      id: created.id, expectedRevision: 1,
      details: { ...details, annualInterestRateBasisPoints: 1350 },
    });
    expect(updated.data.currentScheduleVersion).toBe(2);
    expect(updated.data.scheduleVersions).toHaveLength(2);
    expect(updated.data.scheduleVersions[0]).toEqual(oldSchedule);
    expect(updated.data.scheduleVersions[1].input.annualInterestRateBasisPoints).toBe(1350);
  });

  it("does not create a new schedule for non-calculation detail edits", async () => {
    const { service } = setup();
    const created = await service.create({ uuid: "123e4567-e89b-42d3-a456-426614174000", details, source: "web" });
    const updated = await service.update({
      id: created.id, expectedRevision: 1,
      details: { ...details, loanName: "Updated display name", loanAccountReference: "REF-001" },
    });
    expect(updated.data.currentScheduleVersion).toBe(1);
    expect(updated.data.scheduleVersions).toHaveLength(1);
    expect(updated.data.details.loanName).toBe("Updated display name");
  });

  it("rejects stale updates and prevents reassignment to another vehicle", async () => {
    const { service } = setup();
    const created = await service.create({ uuid: "123e4567-e89b-42d3-a456-426614174000", details, source: "web" });
    await expect(service.update({
      id: created.id, expectedRevision: 0, details,
    })).rejects.toThrow("feature_record_expected_revision_invalid");
    await expect(service.update({
      id: created.id, expectedRevision: 1, details: { ...details, vehicleId: "feature:vehicle:MH02CD5678" },
    })).rejects.toThrow("finance_loan_vehicle_identity_immutable");
  });

  it("retains historical loan dates independent of business start date", async () => {
    const { service } = setup();
    const created = await service.create({ uuid: "123e4567-e89b-42d3-a456-426614174000", details, source: "web" });
    expect(created.businessDate).toBe("2026-01-10");
  });
});
