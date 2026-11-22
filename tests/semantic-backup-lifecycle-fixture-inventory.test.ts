import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveComplianceOverlapReview } from "../packages/features/compliance";
import { projectHistoricalCorrectionsV1 } from "../packages/domain/src/historical-correction";

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
      .toEqual(["malformed_record", "dangling_reference", "wrong_owner", "invalid_correction_head", "dangling_reference", "malformed_revision", "duplicate_identity"]);
    expect(fixture.expectedBusinessResults.fuelIntervals).toHaveLength(4);
    expect(fixture.expectedBusinessResults.fuelCostRateHistory).toHaveLength(4);
  });

  it("validates the populated source envelopes and every domain's cross-record lineage", () => {
    const records = fixture.populatedGraph.records as Array<{ id: string; schemaVersion: number; revision: number; createdAt: string; updatedAt: string; data: any }>;
    const byId = new Map(records.map(record => [record.id, record]));
    const ids = records.map(record => record.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const record of records) {
      expect(record.schemaVersion).toBe(1);
      expect(Number.isSafeInteger(record.revision) && record.revision >= 1).toBe(true);
      expect(Date.parse(record.createdAt)).not.toBeNaN();
      expect(Date.parse(record.updatedAt)).not.toBeNaN();
      expect(record.updatedAt >= record.createdAt).toBe(true);
      expect(record.data.schemaVersion).toBe(1);
    }

    const vehicleId = fixture.operatingConfiguration.vehicle.recordId;
    const drivers = records.filter(record => record.id.startsWith("feature:driver-records:driver:"));
    expect(drivers).toHaveLength(1);
    expect(drivers[0].data.selectedForWork).toBe(true);
    const assignment = byId.get(fixture.operatingConfiguration.currentPairing.assignmentHistoryRecordId)!;
    expect(assignment.data.assignments).toHaveLength(1);
    expect(assignment.data.assignments[0]).toMatchObject({ vehicleId, assignmentId: "assignment-001" });

    const loan = byId.get(fixture.populatedGraph.lineage.finance.loanId)!;
    const ledger = byId.get(fixture.populatedGraph.lineage.finance.paymentLedgerId)!;
    const prepayment = byId.get(fixture.populatedGraph.lineage.finance.prepaymentRecordId)!;
    expect(ledger.data.loanId).toBe(loan.id);
    expect(prepayment.data.loanId).toBe(loan.id);
    expect(prepayment.data.baseScheduleVersion).toBe(1);
    expect(prepayment.data.currentScheduleVersion).toBe(2);
    const revisedSchedule = prepayment.data.revisions.find((item: any) => item.version === 2);
    expect(revisedSchedule).toMatchObject({ previousScheduleVersion: 1, mode: "reduce_tenure", commandId: fixture.populatedGraph.lineage.finance.prepaymentCommandId });
    expect(revisedSchedule.output.regularEmiPaise).toBe(loan.data.scheduleVersions[0].output.regularEmiPaise);
    expect(ledger.data.entries.map((item: any) => item.kind)).toEqual(["payment", "reversal", "payment", "payment", "settlement"]);
    const reversal = ledger.data.entries.find((item: any) => item.kind === "reversal");
    expect(ledger.data.entries.find((item: any) => item.id === reversal.paymentId)?.kind).toBe("payment");
    const settlement = ledger.data.entries.find((item: any) => item.kind === "settlement");
    const settlementScheduleRow = revisedSchedule.output.rows.find((item: any) => item.installmentNumber === settlement.paidThroughInstallment);
    expect(settlement).toMatchObject({ scheduleVersion: revisedSchedule.version, businessDate: settlementScheduleRow.dueDate, amountPaise: settlementScheduleRow.closingPrincipalPaise });
    expect(loan.data.lifecycleState).toBe("closed");

    const compliance = records.filter(record => record.id.startsWith("feature:compliance:"));
    expect(compliance).toHaveLength(3);
    expect(compliance[1].data.renewedFromRecordId).toBe(compliance[0].id);
    expect(compliance[2].data.renewedFromRecordId).toBe(compliance[1].id);
    const reviews = records.filter(record => record.id.startsWith("compliance-overlap-review:"))
      .map(record => record.data).sort((a, b) => a.decisionRevision - b.decisionRevision);
    expect(reviews[1].supersedesEventId).toBe(reviews[0].eventId);

    const rate = records.find(record => record.id.startsWith("feature:maintenance:rate:"))!;
    expect(rate.data.entries.map((entry: any) => entry.effectiveFrom)).toEqual(["2026-11-01", "2026-11-02"]);
    for (const accrual of records.filter(record => record.id.startsWith("feature:maintenance:daily-accrual:"))) {
      const source = byId.get(accrual.data.dailyBusinessKmRecordId)!;
      expect(source.revision).toBe(accrual.data.dailyBusinessKmRevision);
      expect(source.data.unallocatedBusinessKm).toBe(0);
      expect(source.data.entries.every((entry: any) => entry.allocationStatus === "allocated")).toBe(true);
      expect(source.data.totalBusinessKm).toBe(accrual.data.businessKm);
      expect(accrual.data.rateEffectiveFrom).toBe(accrual.data.operationalDate);
    }

    const expenses = records.filter(record => record.id.startsWith("feature:business-expenses:entry:"));
    expect(new Set(expenses.map(record => record.data.sourceKind))).toEqual(new Set(["platform_fee", "traffic_challan", "miscellaneous"]));
    const linkedExpenses = expenses.filter(record => record.data.tripFinancialSourceId);
    expect(linkedExpenses.map(record => record.data.tripFinancialComponent).sort()).toEqual(["parking", "toll"]);
    expect(linkedExpenses.every(record => record.data.tripFinancialSourceId === fixture.populatedGraph.work.tripFinancial.recordId &&
      record.data.tripExpenseTreatment === "already-in-trip-closeout")).toBe(true);

    const fuel = records.filter(record => record.id.startsWith("feature:business-expenses:fuel:"));
    expect(fuel.filter(record => record.data.partialRefill === false)).toHaveLength(5);
    expect(fuel.filter(record => record.data.partialRefill === true)).toHaveLength(2);
    expect(byId.has("feature:performance:settings")).toBe(true);
    expect(records.some(record => record.id.startsWith("feature:performance:pre-business-cost:"))).toBe(true);

    for (const chain of fixture.populatedGraph.lineage.correctionChainHeads) {
      const target = byId.get(chain.targetRecordId)!;
      const corrections = records.filter(record => record.id.startsWith("historical-correction:") &&
        record.data.targetRecordId === chain.targetRecordId).map(record => record.data)
        .sort((a, b) => a.chainRevision - b.chainRevision);
      const projection = projectHistoricalCorrectionsV1(target.data, corrections as never);
      expect(projection.status).toBe("valid");
      expect(projection.chainRevision).toBe(chain.chainRevision);
      expect(projection.headCorrectionId).toBe(chain.headCorrectionId);
      const head = byId.get("historical-correction-chain:" + encodeURIComponent(chain.targetRecordId))!;
      expect(head.data).toMatchObject({ targetRecordId: chain.targetRecordId, chainRevision: chain.chainRevision, headCorrectionId: chain.headCorrectionId });
    }
  });

});
