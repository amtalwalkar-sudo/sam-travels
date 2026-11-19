import { describe, expect, it } from "vitest";
import type { AtomicRecordRepository } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import { assertComplianceRecordV1 } from "../packages/features/compliance";
import { ComplianceService } from "../packages/application/src/compliance-service";

class MemoryRepository implements AtomicRecordRepository {
  private rows = new Map<string, RecordEnvelope<unknown>>();
  seed(records: Array<RecordEnvelope<unknown>>) { for (const record of records) this.rows.set(record.id, record); }
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

const first = {
  schemaVersion: 1 as const, vehicleId: "feature:vehicle:MH01AB1234",
  complianceName: "Insurance", validFrom: "2024-01-01", validTo: "2024-12-31",
  totalCostPaise: 36500,
};
const previousId = "feature:compliance:123e4567-e89b-42d3-a456-426614174000";
const second = {
  ...first, validFrom: "2025-01-01", validTo: "2025-12-31",
  renewedFromRecordId: previousId,
};

function setup(repository = new MemoryRepository()) {
  const at = "2026-11-19T08:00:00.000Z";
  const row = (id: string, data: unknown): RecordEnvelope<unknown> => ({
    id, schemaVersion: 1, createdAt: at, updatedAt: at, source: "web", revision: 1, data,
  });
  repository.seed([
    row("work:selected-driver", { schemaVersion: 1, driverId: "driver-1" }),
    row("feature:driver-records:driver:driver-1", {
      schemaVersion: 1, driverId: "driver-1", name: "Driver", lifecycleState: "active",
    }),
    row(first.vehicleId, {
      schemaVersion: 1, registrationNumber: "MH01AB1234", make: "Make", model: "Model",
      vehicleType: "Sedan", fuelType: "CNG", yearOfManufacture: 2024, ownership: "Owned",
      lifecycleState: "active",
    }),
    row("feature:driver-records:assignment:driver-1", {
      schemaVersion: 1, driverId: "driver-1", assignments: [{
        assignmentId: "assignment-1", vehicleId: first.vehicleId, assignedAt: at,
      }],
    }),
  ]);
  const vehicles = {
    async getById(id: string) {
      return [first.vehicleId, "feature:vehicle:MH02CD5678"].includes(id) ? {
        id, schemaVersion: 1, createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z", source: "web" as const,
        revision: 1, data: { lifecycleState: "active" },
      } : undefined;
    },
  };
  return { repository, service: new ComplianceService(repository, assertComplianceRecordV1, vehicles, () => at) };
}

describe("ComplianceService", () => {
  it("creates immutable historical records and links renewal as a new record", async () => {
    const { service } = setup();
    const previous = await service.create({
      uuid: "123e4567-e89b-42d3-a456-426614174000",
      data: first, source: "web", businessDate: "2024-01-01",
    });
    const renewal = await service.create({
      uuid: "123e4567-e89b-42d3-a456-426614174001",
      data: second, source: "android", businessDate: "2025-01-01",
    });
    expect(previous.revision).toBe(1);
    expect(renewal).toMatchObject({ revision: 1, data: { renewedFromRecordId: previous.id } });
    expect(await service.list()).toHaveLength(2);
    expect((await service.get(previous.id))?.data.validTo).toBe("2024-12-31");
  });

  it("rejects a non-operating vehicle before persistence", async () => {
    const { service } = setup();
    await expect(service.create({
      uuid: "123e4567-e89b-42d3-a456-426614174010",
      data: { ...first, vehicleId: "feature:vehicle:UNKNOWN" }, source: "web",
    })).rejects.toThrow("compliance_operating_vehicle_mismatch");
  });

  it("rejects a caller-supplied vehicle that differs from the configured operating vehicle", async () => {
    const { service } = setup();
    await expect(service.create({
      uuid: "123e4567-e89b-42d3-a456-426614174011",
      data: { ...first, vehicleId: "feature:vehicle:MH02CD5678" }, source: "web",
    })).rejects.toThrow("compliance_operating_vehicle_mismatch");
  });

  it("fails closed when operating configuration is missing", async () => {
    const repository = new MemoryRepository();
    const vehicles = { async getById() { return undefined; } };
    const service = new ComplianceService(repository, assertComplianceRecordV1, vehicles);
    await expect(service.create({
      uuid: "123e4567-e89b-42d3-a456-426614174012", data: first, source: "web",
    })).rejects.toThrow("work_driver_not_selected");
  });

  it("allows an early linked renewal with actual overlapping dates", async () => {
    const { service } = setup();
    const previous = await service.create({
      uuid: "123e4567-e89b-42d3-a456-426614174000", data: first, source: "web",
    });
    const renewal = await service.create({
      uuid: "123e4567-e89b-42d3-a456-426614174002",
      data: { ...second, validFrom: "2024-12-01", validTo: "2025-11-30" },
      source: "web",
    });
    expect(renewal.data.validFrom).toBe("2024-12-01");
    expect(renewal.data.renewedFromRecordId).toBe(previous.id);
    await expect(service.list()).resolves.toHaveLength(2);
  });

  it("rejects renewals without a matching predecessor", async () => {
    const { service } = setup();
    await expect(service.create({
      uuid: "123e4567-e89b-42d3-a456-426614174001", data: second, source: "web",
    })).rejects.toThrow("compliance_renewal_source_not_found");
    await service.create({
      uuid: "123e4567-e89b-42d3-a456-426614174000", data: first, source: "web",
    });
    await expect(service.create({
      uuid: "123e4567-e89b-42d3-a456-426614174003",
      data: { ...second, complianceName: "Permit" }, source: "web",
    })).rejects.toThrow("compliance_renewal_source_mismatch");
  });

  it("rejects a corrupt stored renewal link during listing", async () => {
    const { repository, service } = setup();
    await service.create({
      uuid: "123e4567-e89b-42d3-a456-426614174000", data: first, source: "web",
    });
    await repository.put({
      id: "feature:compliance:123e4567-e89b-42d3-a456-426614174001",
      schemaVersion: 1, createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z", source: "web", revision: 1,
      data: { ...second, renewedFromRecordId: "feature:compliance:123e4567-e89b-42d3-a456-426614174099" },
    });
    await expect(service.list()).rejects.toThrow("compliance_renewal_source_not_found");
  });
});
