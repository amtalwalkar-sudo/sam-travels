import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveComplianceOverlapReview } from "../packages/features/compliance";

const fixture = JSON.parse(readFileSync(
  new URL("../fixtures/semantic-backup-lifecycle-v1.json", import.meta.url), "utf8",
)) as any;

describe("shared semantic backup fixture inventory", () => {
  it("contains the contract-required linked records and correction lineage", () => {
    expect(fixture.status).toBe("populated_fixture_ready_for_all_domain_validation");
    expect(fixture.populatedGraph.status).toBe("populated_fixture_ready_for_all_domain_validation");
    expect(fixture.populatedGraph.recordCount).toBe(fixture.populatedGraph.records.length);
    expect(fixture.populatedGraph.records).toHaveLength(46);
    const ids = fixture.populatedGraph.records.map((record: any) => record.id);
    for (const prefix of ["feature:finance:", "feature:compliance:", "feature:maintenance:",
      "feature:business-expenses:", "feature:performance:"]) {
      expect(ids.some((id: string) => id.startsWith(prefix))).toBe(true);
    }
    expect(fixture.populatedGraph.lineage.reversalSourceIds)
      .toContain("feature:business-expenses:entry:123e4567-e89b-42d3-a456-426614174031");
    const paymentLedger = fixture.populatedGraph.records.find((record: any) =>
      record.id === "feature:finance:payments:123e4567-e89b-42d3-a456-426614174000");
    expect(paymentLedger.data.entries).toHaveLength(5);
    expect(paymentLedger.data.entries.map((entry: any) => entry.kind))
      .toEqual(["payment", "reversal", "payment", "payment", "settlement"]);
    expect(paymentLedger.data.entries.find((entry: any) => entry.kind === "settlement"))
      .toMatchObject({ id: "fixture-settlement-001", scheduleVersion: 2, amountPaise: 50000 });
    expect(ids).toContain("feature:finance:prepayments:123e4567-e89b-42d3-a456-426614174000");

    const compliance = fixture.populatedGraph.records.filter((record: any) => record.id.startsWith("feature:compliance:"));
    expect(compliance).toHaveLength(3);
    expect(compliance.find((record: any) => record.id.endsWith("174012"))?.data.renewedFromRecordId)
      .toBe("feature:compliance:123e4567-e89b-42d3-a456-426614174011");
    const reviews = fixture.populatedGraph.records.filter((record: any) => record.id.startsWith("compliance-overlap-review:"));
    expect(reviews.map((record: any) => record.data.decisionRevision).sort()).toEqual([1, 2]);
    expect(resolveComplianceOverlapReview(
      [{ recordId: "feature:compliance:123e4567-e89b-42d3-a456-426614174010", recordRevision: 1 },
       { recordId: "feature:compliance:123e4567-e89b-42d3-a456-426614174011", recordRevision: 1 }],
      "2026-12-01", "2026-12-31", reviews.map((record: any) => record.data),
    )).toBe("rejected");

    expect(ids).toEqual(expect.arrayContaining([
      "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174070",
      "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174071",
      "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174072",
      "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174074",
      "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174075",
      "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174076",
      "feature:business-expenses:entry:123e4567-e89b-42d3-a456-426614174084",
      "feature:business-expenses:entry:123e4567-e89b-42d3-a456-426614174085",
      "historical-correction:fixture-fuel-amount-fix",
      "historical-correction:fixture-fuel-interval-partial-amount-fix",
    ]));
    expect(fixture.populatedGraph.work.eventIds).toHaveLength(6);
    expect(fixture.populatedGraph.work.intentIds).toHaveLength(8);
    expect(fixture.populatedGraph.work.pendingIntentIds).toHaveLength(2);
    expect(fixture.populatedGraph.work.deliveredOutboxIds).toHaveLength(5);
    expect(fixture.populatedGraph.work.pendingOutboxIds).toHaveLength(1);
    expect(fixture.populatedGraph.work.boundaryState).toMatchObject({
      rotationStatus: "deferred_during_active_trip", unallocatedBusinessKm: 5,
      allocationStatus: "awaiting_operational_boundary",
    });
    expect(fixture.populatedGraph.logBook.events).toHaveLength(5);
    expect(fixture.populatedGraph.work.tripFinancial.values).toMatchObject({
      farePaise: 252000, tollPaise: 32000, tollPayer: "driver",
      parkingPaise: 25000, parkingPayer: "driver",
    });
    expect(fixture.populatedGraph.work.generatedRecordIds)
      .toContain(fixture.populatedGraph.work.tripFinancial.recordId);
  });

  it("declares the valid fixture and shared negative validator matrix", () => {
    expect(fixture.validatorMatrix.validScenario.expected).toBe("accept");
    expect(fixture.validatorMatrix.negativeCases.map((item: any) => item.category))
      .toEqual(["malformed_record", "dangling_reference", "wrong_owner", "invalid_correction_head", "dangling_reference"]);
    expect(fixture.expectedBusinessResults.fuelIntervals).toHaveLength(4);
    expect(fixture.expectedBusinessResults.fuelCostRateHistory).toHaveLength(4);
  });
});
