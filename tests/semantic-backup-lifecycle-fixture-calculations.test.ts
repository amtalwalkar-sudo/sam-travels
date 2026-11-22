import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calculateFuelIntervals, calculateDailyBusinessExpenses } from "../packages/features/business-expenses";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/semantic-backup-lifecycle-v1.json", import.meta.url), "utf8")) as any;

describe("Shared semantic fixture calculation expectations", () => {
  it("pins expected business calculations to the shared synthetic source graph", () => {
    const rows = fixture.populatedGraph.records as Array<{ id: string; data: any }>;
    const fuel = rows.filter(row => row.id.startsWith("feature:business-expenses:fuel:")).map(row => row.data);
    const expenses = rows.filter(row => row.id.startsWith("feature:business-expenses:entry:")).map(row => row.data);
    const interval = calculateFuelIntervals(fuel as never).find(item =>
      item.startCheckpointId === fixture.expectedBusinessResults.fuelIntervals[0].startCheckpointId);
    expect(interval).toMatchObject(fixture.expectedBusinessResults.fuelIntervals[0]);
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
