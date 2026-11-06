import { describe, expect, it } from "vitest";
import {
  type CalculationContract,
  type FeatureDataQueryContract,
  type FeatureDataSourceSnapshot,
  initializeRuntimeRegistry,
} from "../packages/core/src";
import { CrossFeatureDataCoordinator } from "../packages/application/src/cross-feature-data-coordinator";

type AmountRecord = { amount: number; nested?: { revision: number } };
type CalculationInput = { businessDate: string; total: number };

const calculation: CalculationContract<CalculationInput, number> = {
  id: "fixture.combined-total.v1",
  ownerFeatureId: "performance",
  version: 1,
  inputSchemaVersion: 1,
  outputSchemaVersion: 1,
  unit: "fixture-units",
  effectiveDateField: "businessDate",
  rounding: { mode: "half-up", decimalPlaces: 2 },
  calculate: input => input.total * 2,
  regressionCases: [{
    name: "baseline",
    input: { businessDate: "2026-11-06", total: 1 },
    expected: 2,
  }],
};

function query(
  id: string,
  ownerFeatureId: string,
  result: () => Promise<FeatureDataSourceSnapshot<AmountRecord>>,
): FeatureDataQueryContract<AmountRecord> {
  return {
    id,
    ownerFeatureId,
    version: 1,
    outputSchemaVersion: 1,
    query: result,
    validateRecord: (value): value is AmountRecord =>
      !!value && typeof value === "object" &&
      typeof (value as AmountRecord).amount === "number" &&
      Number.isFinite((value as AmountRecord).amount),
  };
}

function available(amount: number, overrides: Partial<Extract<FeatureDataSourceSnapshot<AmountRecord>, { status: "available" }>> = {}): FeatureDataSourceSnapshot<AmountRecord> {
  return {
    status: "available",
    records: [{ amount }],
    observedAt: "2026-11-06T10:00:00.000Z",
    complete: true,
    freshness: "fresh",
    snapshotToken: "snapshot-42",
    ...overrides,
  };
}

function coordinator(queries: FeatureDataQueryContract<AmountRecord>[]) {
  const runtime = initializeRuntimeRegistry({
    dataQueries: queries,
    calculations: [calculation],
  });
  return new CrossFeatureDataCoordinator(runtime);
}

const context = {
  period: { from: "2026-11-01", to: "2026-11-06" },
  effectiveDate: "2026-11-06",
  asOf: "2026-11-06T10:00:00.000Z",
  snapshotToken: "snapshot-42",
};

describe("cross-feature data coordination", () => {
  it("collects multiple feature-owned sources under one reporting context", async () => {
    const service = coordinator([
      query("finance.amounts.v1", "finance", async () => available(12)),
      query("vehicle.amounts.v1", "vehicle", async () => available(8)),
    ]);
    const result = await service.collect(["finance.amounts.v1", "vehicle.amounts.v1"], context);
    expect(result.map(item => item.status)).toEqual(["available", "available"]);
    expect(result.every(item => item.status === "available" && item.consistency === "shared_snapshot")).toBe(true);
  });

  it("executes a registered calculation and records source provenance", async () => {
    const service = coordinator([
      query("finance.amounts.v1", "finance", async () => available(12)),
      query("vehicle.amounts.v1", "vehicle", async () => available(8)),
    ]);
    const result = await service.calculate({
      queryIds: ["finance.amounts.v1", "vehicle.amounts.v1"],
      context,
      calculationId: calculation.id,
      expected: { version: 1, inputSchemaVersion: 1, outputSchemaVersion: 1 },
      buildInput: sources => ({
        businessDate: context.effectiveDate,
        total: sources.reduce((sum, source) => sum + source.records.reduce((n, record) => n + record.amount, 0), 0),
      }),
    });
    expect(result.status).toBe("calculated");
    if (result.status !== "calculated") return;
    expect(result.calculation.value).toBe(40);
    expect(result.calculation.effectiveDate).toBe(context.effectiveDate);
    expect(result.sources.map(source => source.ownerFeatureId)).toEqual(["finance", "vehicle"]);
    expect(result.consistency).toBe("shared_snapshot");
  });

  it("does not calculate from incomplete or stale sources by default", async () => {
    const service = coordinator([
      query("finance.amounts.v1", "finance", async () => available(12, { complete: false })),
    ]);
    const result = await service.calculate({
      queryIds: ["finance.amounts.v1"],
      context,
      calculationId: calculation.id,
      expected: { version: 1, inputSchemaVersion: 1, outputSchemaVersion: 1 },
      buildInput: () => ({ businessDate: context.effectiveDate, total: 12 }),
    });
    expect(result).toMatchObject({ status: "blocked", reason: "source_incomplete" });
  });

  it("preserves pending, unavailable and invalid source states", async () => {
    const service = coordinator([
      query("pending.v1", "finance", async () => ({ status: "pending", reason: "sync_in_progress" })),
      query("unavailable.v1", "vehicle", async () => ({ status: "unavailable", reason: "offline" })),
    ]);
    const result = await service.collect(["pending.v1", "unavailable.v1"], context);
    expect(result).toMatchObject([
      { status: "pending", reason: "sync_in_progress" },
      { status: "unavailable", reason: "offline" },
    ]);
  });

  it("rejects invalid records, mismatched snapshots and invalid periods", async () => {
    const badRecord = query("bad-record.v1", "finance", async () => available(1, {
      records: [{ amount: Number.NaN }],
    }));
    const service = coordinator([badRecord]);
    await expect(service.collect(["bad-record.v1"], context)).resolves.toMatchObject([
      { status: "invalid", reason: "source_record_validation_failed" },
    ]);
    const mismatch = coordinator([
      query("a.v1", "finance", async () => available(1)),
      query("b.v1", "vehicle", async () => available(2, { snapshotToken: "other-snapshot" })),
    ]);
    await expect(mismatch.collect(["a.v1", "b.v1"], context)).resolves.toMatchObject([
      { status: "available" },
      { status: "invalid", reason: "source_snapshot_token_mismatch" },
    ]);
    await expect(service.collect(["bad-record.v1"], {
      period: { from: "2026-11-07", to: "2026-11-01" },
    })).rejects.toThrow("Invalid feature data query period");
  });

  it("isolates provider exceptions and reports missing query declarations explicitly", async () => {
    const service = coordinator([
      query("throws.v1", "finance", async () => { throw new Error("private adapter detail"); }),
    ]);
    await expect(service.collect(["throws.v1", "missing.v1"], context)).resolves.toMatchObject([
      { status: "unavailable", reason: "source_query_failed" },
      { status: "unavailable", reason: "query_not_registered" },
    ]);
  });

  it("rejects duplicate query requests and blocks calculations when sources are unavailable", async () => {
    const service = coordinator([]);
    await expect(service.collect(["missing.v1", "missing.v1"], context))
      .rejects.toThrow("Duplicate feature data query requested");
    const result = await service.calculate({
      queryIds: ["missing.v1"],
      context,
      calculationId: calculation.id,
      expected: { version: 1, inputSchemaVersion: 1, outputSchemaVersion: 1 },
      buildInput: () => ({ businessDate: context.effectiveDate, total: 0 }),
    });
    expect(result).toMatchObject({ status: "blocked", reason: "query_not_registered" });
  });
  it("blocks stale sources unless explicitly allowed", async () => {
    const service = coordinator([
      query("finance.amounts.v1", "finance", async () => available(12, { freshness: "stale" })),
    ]);
    const request = {
      queryIds: ["finance.amounts.v1"],
      context,
      calculationId: calculation.id,
      expected: { version: 1, inputSchemaVersion: 1, outputSchemaVersion: 1 },
      buildInput: () => ({ businessDate: context.effectiveDate, total: 12 }),
    };
    await expect(service.calculate(request)).resolves.toMatchObject({
      status: "blocked",
      reason: "source_not_fresh",
    });
    await expect(service.calculate({ ...request, allowStale: true })).resolves.toMatchObject({
      status: "calculated",
    });
  });

  it("deeply isolates collected source records from adapter mutation", async () => {
    const sourceRecord = { amount: 7, nested: { revision: 1 } };
    const service = coordinator([
      query("finance.amounts.v1", "finance", async () => available(7, { records: [sourceRecord] })),
    ]);
    const result = await service.collect(["finance.amounts.v1"], context);
    if (result[0].status !== "available") throw new Error("Expected available source");
    sourceRecord.nested.revision = 9;
    expect(result[0].records[0].nested?.revision).toBe(1);
    expect(Object.isFrozen(result[0].records[0].nested)).toBe(true);
    expect(Object.isFrozen(sourceRecord.nested)).toBe(false);
  });

});
