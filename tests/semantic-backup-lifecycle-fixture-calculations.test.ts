import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calculateFuelIntervals, calculateDailyBusinessExpenses, calculateFuelCostRateHistory } from "../packages/features/business-expenses";
import { projectHistoricalCorrectionsV1 } from "../packages/domain/src/historical-correction";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/semantic-backup-lifecycle-v1.json", import.meta.url), "utf8")) as any;

describe("Shared semantic fixture calculation expectations", () => {
  it("pins expected business calculations to the shared synthetic source graph", () => {
    const rows = fixture.populatedGraph.records as Array<{ id: string; data: any }>;
    const projectTarget = (targetRecordId: string, featureId: string) => {
      const original = rows.find(row => row.id === targetRecordId);
      expect(original).toBeDefined();
      const corrections = rows.filter(item => item.id.startsWith("historical-correction:") &&
        item.data.featureId === featureId && item.data.targetRecordId === targetRecordId)
        .map(item => item.data).sort((a, b) => a.chainRevision - b.chainRevision);
      const projection = projectHistoricalCorrectionsV1(original!.data, corrections as never);
      expect(projection.status).toBe("valid");
      const persistedHead = rows.find(item =>
        item.id === "historical-correction-chain:" + encodeURIComponent(targetRecordId))?.data;
      expect(persistedHead).toMatchObject({
        chainRevision: projection.chainRevision,
        headCorrectionId: projection.headCorrectionId,
      });
      return { original: original!.data, projection };
    };
    const maintenanceCorrection = projectTarget(
      "feature:maintenance:expense:123e4567-e89b-42d3-a456-426614174050", "maintenance",
    );
    expect(maintenanceCorrection.original.amountPaise).toBe(10000);
    expect(maintenanceCorrection.projection).toMatchObject({
      status: "valid", chainRevision: 2, headCorrectionId: "maintenance-fix-2",
      data: { amountPaise: 13000 },
    });
    const complianceCorrection = projectTarget(
      "feature:compliance:123e4567-e89b-42d3-a456-426614174010", "compliance",
    );
    expect(complianceCorrection.original.totalCostPaise).toBe(365000);
    expect(complianceCorrection.projection).toMatchObject({
      status: "valid", chainRevision: 1, headCorrectionId: "compliance-fix-1",
      data: { totalCostPaise: 366000 },
    });
    const rawFuel = rows.filter(row => row.id.startsWith("feature:business-expenses:fuel:"));
    const fuel = rawFuel.map(row => {
      const corrections = rows.filter(item => item.id.startsWith("historical-correction:") &&
        item.data.featureId === "business-expenses" && item.data.targetRecordId === row.id)
        .map(item => item.data).sort((a, b) => a.chainRevision - b.chainRevision);
      if (corrections.length === 0) return row.data;
      const projection = projectHistoricalCorrectionsV1(row.data, corrections as never);
      expect(projection.status).toBe("valid");
      return projection.data;
    });
    const expenses = rows.filter(row => row.id.startsWith("feature:business-expenses:entry:")).map(row => row.data);
    const intervals = calculateFuelIntervals(fuel as never);
    expect(intervals.filter(item => item.status === "available")).toHaveLength(4);
    for (const expected of fixture.expectedBusinessResults.fuelIntervals) {
      expect(intervals.find(item => item.startCheckpointId === expected.startCheckpointId))
        .toMatchObject(expected);
    }
    expect(calculateFuelCostRateHistory(fuel as never, intervals))
      .toEqual(fixture.expectedBusinessResults.fuelCostRateHistory);
    const correctedPartial = fuel.find((item: any) => item.id.endsWith("123e4567-e89b-42d3-a456-426614174071"));
    expect(correctedPartial).toMatchObject({ amountPaise: 10000, pricePaisePerKg: 9000 });
    expect(correctedPartial).not.toHaveProperty("quantityMilliKg");
    const dailyTotals = calculateDailyBusinessExpenses(fuel as never, expenses as never).reduce((total, row) => ({
      fuelPaise: total.fuelPaise + row.fuelPaise,
      platformFeesPaise: total.platformFeesPaise + row.platformFeesPaise,
      trafficChallansPaise: total.trafficChallansPaise + row.trafficChallansPaise,
      miscellaneousPaise: total.miscellaneousPaise + row.miscellaneousPaise,
      reportedSourceExpensePaise: total.reportedSourceExpensePaise + row.reportedSourceExpensePaise,
      normalOperatingExpensePaise: total.normalOperatingExpensePaise + row.normalOperatingExpensePaise,
      fullCostExpensePaise: total.fullCostExpensePaise + row.fullCostExpensePaise,
    }), { fuelPaise: 0, platformFeesPaise: 0, trafficChallansPaise: 0, miscellaneousPaise: 0,
      reportedSourceExpensePaise: 0, normalOperatingExpensePaise: 0, fullCostExpensePaise: 0 });
    expect(dailyTotals).toEqual(fixture.expectedBusinessResults.dailyExpenses);
    const accruals = rows.filter(row => row.id.startsWith("feature:maintenance:daily-accrual:")).map(row => row.data);
    expect(accruals).toHaveLength(fixture.expectedBusinessResults.maintenanceAccruals.length);
    for (const expected of fixture.expectedBusinessResults.maintenanceAccruals) expect(accruals.find((row: any) => row.operationalDate === expected.operationalDate)).toMatchObject(expected);
    const boundarySource = rows.find(row => row.id === fixture.populatedGraph.lineage.pendingBoundaryDailyKmRecordId)?.data;
    expect(boundarySource).toMatchObject({ totalBusinessKm: 0, unallocatedBusinessKm: 5 });
    expect(accruals.some((row: any) => row.operationalDate === "2026-11-03")).toBe(false);
    const loan = rows.find(row => row.id.startsWith("feature:finance:loan:"))?.data;
    expect(loan?.details.principalPaise).toBe(fixture.expectedBusinessResults.finance.loanPrincipalPaise);
    expect(loan?.scheduleVersions[0].output.regularEmiPaise).toBe(fixture.expectedBusinessResults.finance.regularEmiPaise);
    expect(loan?.scheduleVersions[0].output.rows).toHaveLength(fixture.expectedBusinessResults.finance.scheduledInstallments);
    expect(loan?.lifecycleState).toBe("closed");
    const ledger = rows.find(row => row.id.startsWith("feature:finance:payments:"))?.data;
    const reversed = new Set(ledger.entries.filter((item: any) => item.kind === "reversal").map((item: any) => item.paymentId));
    const activePayments = ledger.entries.filter((item: any) => item.kind === "payment" && !reversed.has(item.id));
    expect(activePayments.reduce((sum: number, item: any) => sum + item.amountPaise, 0)).toBe(fixture.expectedBusinessResults.finance.committedPaymentPaise);
    expect(ledger.entries.filter((item: any) => item.kind === "reversal").reduce((sum: number, item: any) => sum + item.amountPaise, 0)).toBe(fixture.expectedBusinessResults.finance.paymentReversalPaise);
    expect(activePayments.reduce((sum: number, item: any) => sum + item.unallocatedCreditPaise, 0)).toBe(fixture.expectedBusinessResults.finance.unallocatedCreditPaise);
    const prepayment = rows.find(row => row.id.startsWith("feature:finance:prepayments:"))?.data;
    expect(prepayment.revisions[0]).toMatchObject({ mode: "reduce_tenure", prepaymentAmountPaise: fixture.expectedBusinessResults.finance.prepaymentPaise, principalAfterPaise: fixture.expectedBusinessResults.finance.prepaymentPrincipalAfterPaise, version: fixture.expectedBusinessResults.finance.prepaymentScheduleVersion });
    expect(prepayment.revisions[0].output).toMatchObject({ remainingInstallmentCount: fixture.expectedBusinessResults.finance.prepaymentRemainingInstallments, finalDueDate: fixture.expectedBusinessResults.finance.prepaymentFinalDueDate, regularEmiPaise: 100000 });
    const settlement = ledger.entries.find((item: any) => item.kind === "settlement");
    expect(settlement).toMatchObject({ id: "fixture-settlement-001", amountPaise: fixture.expectedBusinessResults.finance.settlementPaise, scheduleVersion: fixture.expectedBusinessResults.finance.settlementScheduleVersion, paidThroughInstallment: fixture.expectedBusinessResults.finance.settlementPaidThroughInstallment });
  });

});
