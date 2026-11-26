import { describe, expect, it } from "vitest";
import type { AtomicRecordBatchRepository, AtomicRecordMutation } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import { assertComplianceRecordV1 } from "../packages/features/compliance";
import { ComplianceService } from "../packages/application/src/compliance-service";
import { ComplianceAnalysisService } from "../packages/application/src/compliance-analysis-service";
import { analyzeComplianceCoverage, calculateDailyComplianceCost } from "../packages/features/compliance";

class MemoryRepository implements AtomicRecordBatchRepository {
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
  async compareAndSetMany(mutations: readonly AtomicRecordMutation[]) {
    for (const mutation of mutations) {
      const current = this.rows.get(mutation.id);
      if (mutation.expectedRevision === null ? current !== undefined : current?.revision !== mutation.expectedRevision) return false;
    }
    for (const mutation of mutations) this.rows.set(mutation.id, mutation.next as RecordEnvelope<unknown>);
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
  // Compliance is Vehicle-owned; deliberately omit Work Driver selection,
  // Driver profiles and Driver–Vehicle assignments from this fixture.
  repository.seed([
    row(first.vehicleId, {
      schemaVersion: 1, registrationNumber: "MH01AB1234", make: "Make", model: "Model",
      vehicleType: "Sedan", fuelType: "CNG", yearOfManufacture: 2024, ownership: "Owned",
      lifecycleState: "active",
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
  it("creates immutable Vehicle-owned records without requiring Work Driver context", async () => {
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

  it("uses vehicle-only operating context when Work Driver assignment is unavailable", async () => {
    const { repository } = setup();
    const expected = { schemaVersion: 1 as const, vehicleId: first.vehicleId, vehicleRevision: 1 };
    let asserted = false;
    const operatingConfiguration = {
      async get() { throw new Error("compliance_must_not_require_work_driver"); },
      async assertCurrent() { throw new Error("compliance_must_not_require_work_driver"); },
      async getVehicleForReadOnly() { return expected; },
      async assertVehicleCurrentForReadOnly(actual: typeof expected) {
        expect(actual).toEqual(expected);
        asserted = true;
        return expected;
      },
    };
    const vehicles = {
      async getById(id: string) {
        return id === first.vehicleId ? {
          id, schemaVersion: 1, createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z", source: "web" as const,
          revision: 1, data: { lifecycleState: "active" },
        } : undefined;
      },
    };
    const service = new ComplianceService(repository, assertComplianceRecordV1, vehicles,
      () => "2026-11-19T08:00:00.000Z", operatingConfiguration);
    const created = await service.create({
      uuid: "123e4567-e89b-42d3-a456-426614174099", data: first, source: "web",
    });
    expect(created.data.vehicleId).toBe(first.vehicleId);
    expect(asserted).toBe(true);
  });

  it("replays the same Compliance create receipt after interruption and rejects changed payload reuse", async () => {
    const { repository, service } = setup();
    const operation = { operationId: "compliance-create-operation", payloadFingerprint: "compliance-payload-v1" };
    const input = {
      uuid: "123e4567-e89b-42d3-a456-426614174020",
      data: first, source: "web" as const, businessDate: "2024-01-01",
      operation, now: "2026-11-19T08:15:00.000Z",
    };
    const committed = await service.create(input);
    const replayed = await service.create({ ...input, now: "2026-11-19T09:15:00.000Z" });
    expect(replayed).toEqual(committed);
    expect((await repository.list()).filter(row =>
      row.id.startsWith("__sam_travels_feature_operation__:"),
    )).toHaveLength(1);
    await expect(service.create({ ...input, data: { ...first, totalCostPaise: 99999 } }))
      .rejects.toThrow("feature_record_operation_payload_conflict");
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

  it("fails closed when the active operating Vehicle is missing", async () => {
    const repository = new MemoryRepository();
    const vehicles = { async getById() { return undefined; } };
    const service = new ComplianceService(repository, assertComplianceRecordV1, vehicles);
    await expect(service.create({
      uuid: "123e4567-e89b-42d3-a456-426614174012", data: first, source: "web",
    })).rejects.toThrow("operating_vehicle_missing");
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

  it("preserves a late-renewal coverage gap and applies the renewed amount only within its new validity", async () => {
    const { repository, service } = setup();
    const previous = await service.create({
      uuid: "123e4567-e89b-42d3-a456-426614174030",
      data: { ...first, validFrom: "2025-01-01", validTo: "2025-12-31", totalCostPaise: 36500 },
      source: "web", businessDate: "2025-01-01",
    });
    const renewal = await service.create({
      uuid: "123e4567-e89b-42d3-a456-426614174031",
      data: {
        ...second, validFrom: "2026-02-01", validTo: "2027-01-31",
        totalCostPaise: 73000, renewedFromRecordId: previous.id,
      },
      source: "android", businessDate: "2026-02-01",
    });
    const analysis = new ComplianceAnalysisService(
      service,
      { async list() { return []; }, async recordDecision() { throw new Error("not_used"); } },
      { async currentActor() {
        return { role: "admin" as const, actorId: "admin-1", adminPinVerifiedAt: "2026-11-19T08:00:00.000Z" };
      } },
      {
        analyzeCoverage: analyzeComplianceCoverage,
        resolveOverlap: () => "unreviewed" as const,
        calculateDailyCost: calculateDailyComplianceCost,
      },
    );

    const beforeRenewal = await analysis.getDailyCost(first.vehicleId, "2025-12-31");
    expect(beforeRenewal).toMatchObject({
      status: "available",
      total: { numeratorPaise: "100", denominator: "1" },
      breakdown: [{ recordId: previous.id, complianceName: "Insurance" }],
    });

    const uncovered = await analysis.getDailyCost(first.vehicleId, "2026-01-15");
    expect(uncovered).toMatchObject({
      status: "available",
      total: { numeratorPaise: "0", denominator: "1" },
      breakdown: [],
    });

    const afterRenewal = await analysis.getDailyCost(first.vehicleId, "2026-02-01");
    expect(afterRenewal).toMatchObject({
      status: "available",
      total: { numeratorPaise: "200", denominator: "1" },
      breakdown: [{ recordId: renewal.id, complianceName: "Insurance" }],
    });
    const overview = await analysis.getOverview();
    expect(overview.gaps).toContainEqual(expect.objectContaining({
      vehicleId: first.vehicleId, complianceName: "Insurance",
      from: "2026-01-01", to: "2026-01-31", days: 31,
    }));
    expect((await service.get(previous.id))?.data.totalCostPaise).toBe(36500);
    expect((await service.get(renewal.id))?.data).toMatchObject({
      totalCostPaise: 73000, validFrom: "2026-02-01", validTo: "2027-01-31",
      renewedFromRecordId: previous.id,
    });
    expect((await repository.list()).filter(row => row.id.startsWith("feature:compliance:"))).toHaveLength(2);
  });

});
