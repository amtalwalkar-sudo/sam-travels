import { describe, expect, it } from "vitest";
import {
  analyzeComplianceCoverage,
  calculateDailyComplianceCost,
  inclusiveValidityDays,
  assertComplianceRecordV1,
  complianceRecordId,
  type ComplianceRecordV1,
  type ComplianceOverlapReviewV1,
} from "../packages/features/compliance";

const vehicleId = "feature:vehicle:MH01AB1234";
function record(id: string, overrides: Partial<ComplianceRecordV1> = {}) {
  const data: ComplianceRecordV1 = {
    schemaVersion: 1, vehicleId, complianceName: "Insurance",
    validFrom: "2024-01-01", validTo: "2024-12-31",
    totalCostPaise: 36500, ...overrides,
  };
  return { id, data };
}

describe("Compliance v1 record contract", () => {
  it("accepts valid historical records and optional missing documents", () => {
    expect(() => assertComplianceRecordV1(record("c1").data)).not.toThrow();
    expect(complianceRecordId("123e4567-e89b-42d3-a456-426614174000"))
      .toBe("feature:compliance:123e4567-e89b-42d3-a456-426614174000");
  });

  it("rejects invalid dates, negative money, and non-vehicle references", () => {
    expect(() => assertComplianceRecordV1(record("c1", { validTo: "2023-12-31" }).data))
      .toThrow("compliance_record_invalid");
    expect(() => assertComplianceRecordV1(record("c1", { totalCostPaise: -1 }).data))
      .toThrow("compliance_record_invalid");
    expect(() => assertComplianceRecordV1(record("c1", { vehicleId: "vehicle-1" }).data))
      .toThrow("compliance_record_invalid");
    expect(() => complianceRecordId("not-a-uuid")).toThrow("compliance_record_uuid_invalid");
  });
});

describe("Compliance inclusive date and coverage analysis", () => {
  it("counts both endpoints, including leap days, and rejects invalid dates", () => {
    expect(inclusiveValidityDays("2024-02-28", "2024-03-01")).toBe(3);
    expect(inclusiveValidityDays("2024-02-29", "2024-02-29")).toBe(1);
    expect(() => inclusiveValidityDays("2024-02-30", "2024-03-01")).toThrow("compliance_date_invalid");
  });

  it("reports uncovered days without filling them", () => {
    const result = analyzeComplianceCoverage([
      record("a", { validFrom: "2024-01-01", validTo: "2024-01-10" }),
      record("b", { validFrom: "2024-01-13", validTo: "2024-01-20" }),
    ], vehicleId, "Insurance");
    expect(result.gaps).toEqual([{ from: "2024-01-11", to: "2024-01-12", days: 2 }]);
    expect(result.overlaps).toEqual([]);
  });

  it("reports pairwise overlap and does not silently merge it", () => {
    const result = analyzeComplianceCoverage([
      record("a", { validFrom: "2024-01-01", validTo: "2024-01-15" }),
      record("b", { validFrom: "2024-01-10", validTo: "2024-01-20" }),
    ], vehicleId, "Insurance");
    expect(result.overlaps).toEqual([{
      firstRecordId: "a", secondRecordId: "b",
      from: "2024-01-10", to: "2024-01-15", days: 6,
    }]);
    expect(result.gaps).toEqual([]);
  });

  it("returns exact rational daily cost and source breakdown", () => {
    const result = calculateDailyComplianceCost([
      record("a", { validFrom: "2024-01-01", validTo: "2024-01-10", totalCostPaise: 1000 }),
      record("b", { complianceName: "Permit", validFrom: "2024-01-01", validTo: "2024-01-20", totalCostPaise: 2000 }),
    ], vehicleId, "2024-01-05");
    expect(result.status).toBe("available");
    expect(result.total).toEqual({ numeratorPaise: "200", denominator: "1" });
    expect(result.breakdown).toHaveLength(2);
  });

  it("rejects an invalid business date instead of returning a zero total", () => {
    expect(() => calculateDailyComplianceCost([], vehicleId, "2024-02-30"))
      .toThrow("compliance_date_invalid");
  });

  it("withholds aggregate cost when same-item coverage overlaps", () => {
    const result = calculateDailyComplianceCost([
      record("a", { validFrom: "2024-01-01", validTo: "2024-01-10", totalCostPaise: 1000 }),
      record("b", { validFrom: "2024-01-05", validTo: "2024-01-20", totalCostPaise: 2000 }),
    ], vehicleId, "2024-01-07");
    expect(result.status).toBe("overlap_review_required");
    expect(result.total).toBeNull();
    expect(result.breakdown).toHaveLength(2);
  });
});


describe("Compliance overlap-confirmed daily allocation", () => {
  it("includes both actual source allocations only after a current explicit confirmation", () => {
    const firstId = "feature:compliance:123e4567-e89b-42d3-a456-426614174000";
    const secondId = "feature:compliance:123e4567-e89b-42d3-a456-426614174001";
    const records = [
      { ...record(firstId, { validFrom: "2024-01-01", validTo: "2024-01-10", totalCostPaise: 1000 }), revision: 1 },
      { ...record(secondId, { validFrom: "2024-01-05", validTo: "2024-01-20", totalCostPaise: 2000 }), revision: 1 },
    ];
    const review: ComplianceOverlapReviewV1 = {
      schemaVersion: 1,
      eventId: "compliance-overlap-review:123e4567-e89b-42d3-a456-426614174010",
      sourceRecords: [
        { recordId: firstId, recordRevision: 1 },
        { recordId: secondId, recordRevision: 1 },
      ],
      from: "2024-01-05",
      to: "2024-01-10",
      decision: "confirmed",
      decisionRevision: 1,
      actor: { actorId: "admin-1", role: "admin" },
      rationale: "Separate valid policies were verified.",
      recordedAt: "2024-01-21T12:00:00.000Z",
    };
    const pending = calculateDailyComplianceCost(records, vehicleId, "2024-01-07");
    expect(pending.status).toBe("overlap_review_required");
    expect(pending.total).toBeNull();
    const confirmed = calculateDailyComplianceCost(records, vehicleId, "2024-01-07", [review]);
    expect(confirmed.status).toBe("available");
    expect(confirmed.total).toEqual({ numeratorPaise: "225", denominator: "1" });
    expect(confirmed.overlaps[0].reviewStatus).toBe("confirmed");
  });

  it("treats a decision tied to an older source revision as stale", () => {
    const firstId = "feature:compliance:123e4567-e89b-42d3-a456-426614174000";
    const secondId = "feature:compliance:123e4567-e89b-42d3-a456-426614174001";
    const records = [
      { ...record(firstId, { validFrom: "2024-01-01", validTo: "2024-01-10" }), revision: 2 },
      { ...record(secondId, { validFrom: "2024-01-05", validTo: "2024-01-20" }), revision: 1 },
    ];
    const stale: ComplianceOverlapReviewV1 = {
      schemaVersion: 1,
      eventId: "compliance-overlap-review:123e4567-e89b-42d3-a456-426614174010",
      sourceRecords: [
        { recordId: firstId, recordRevision: 1 },
        { recordId: secondId, recordRevision: 1 },
      ],
      from: "2024-01-05",
      to: "2024-01-10",
      decision: "confirmed",
      decisionRevision: 1,
      actor: { actorId: "admin-1", role: "admin" },
      rationale: "Earlier review.",
      recordedAt: "2024-01-21T12:00:00.000Z",
    };
    const result = calculateDailyComplianceCost(records, vehicleId, "2024-01-07", [stale]);
    expect(result.status).toBe("overlap_review_required");
    expect(result.total).toBeNull();
    expect(result.overlaps[0].reviewStatus).toBe("stale");
  });
});
