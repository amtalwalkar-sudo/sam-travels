import { describe, expect, it } from "vitest";
import { ComplianceAnalysisService } from "../packages/application/src/compliance-analysis-service";
import type { HistoricalCorrectionV1 } from "../packages/domain/src/historical-correction";

const record = {
  id: "feature:compliance:123e4567-e89b-42d3-a456-426614174000",
  schemaVersion: 1, revision: 1, createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z", source: "web",
  data: { schemaVersion: 1, vehicleId: "feature:vehicle:MH01AB1234",
    complianceName: "Insurance", validFrom: "2026-01-01", validTo: "2026-01-31",
    totalCostPaise: 10_000 },
};
const correction: HistoricalCorrectionV1 = {
  schemaVersion: 1, correctionId: "fix-valid-to", targetRecordId: record.id,
  targetRecordRevision: 1, featureId: "compliance", chainRevision: 1,
  fieldPath: "validTo", beforeValue: "2026-01-31", afterValue: "2026-02-28",
  reason: "Correct source validity end date",
  actor: { role: "admin", actorId: "admin-person", adminPinVerifiedAt: "2026-01-02T00:00:00.000Z" },
  recordedAt: "2026-01-02T00:00:00.000Z",
};

function service(corrections: HistoricalCorrectionV1[]) {
  return new ComplianceAnalysisService(
    { async list() { return [record]; } } as never,
    { async list() { return []; }, async recordDecision() { throw new Error("not_expected"); } } as never,
    { async currentActor() { return { role: "admin", actorId: "admin-person", adminPinVerifiedAt: "2026-01-02T00:00:00.000Z" }; } } as never,
    {
      analyzeCoverage() { return { gaps: [], overlaps: [] }; },
      resolveOverlap() { return "unreviewed"; },
      calculateDailyCost() { return { status: "available", total: null, breakdown: [], overlaps: [] }; },
      validateProjectedComplianceData(data) {
        if (!data || typeof data !== "object" || (data as { validTo?: unknown }).validTo === undefined) {
          throw new Error("compliance_record_invalid");
        }
      },
    },
    { async listForTarget(targetRecordId) { return targetRecordId === record.id ? corrections : []; } },
  );
}

describe("Compliance historical correction projection", () => {
  it("feeds corrected immutable source values into Compliance overview reads", async () => {
    const overview = await service([correction]).getOverview();
    expect(overview.records[0].data.validTo).toBe("2026-02-28");
    expect(record.data.validTo).toBe("2026-01-31");
  });

  it("fails closed when a correction chain cannot be projected", async () => {
    const stale = { ...correction, beforeValue: "wrong-before-value" };
    await expect(service([stale]).getOverview())
      .rejects.toThrow("compliance_historical_correction_projection_needs_attention");
  });
});
