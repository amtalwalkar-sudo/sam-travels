import { expect } from "vitest";
import { calculateFuelIntervals, calculateDailyBusinessExpenses, calculateFuelCostRateHistory } from "../../packages/features/business-expenses";
import { projectHistoricalCorrectionsV1 } from "../../packages/domain/src/historical-correction";

/** Recomputes business-domain outputs using only records read back from Browser storage after restore/reopen. */
export function assertRestoredDomainCalculationParity(restoredRows: readonly any[], fixture: any): void {
  // Re-run the owning domain projections from the records read back after
  // production restore, verification, database close/reopen and re-export.
  // This prevents the fixture's precomputed input objects from acting as
  // an accidental calculation oracle.
  const restoredById = new Map(restoredRows.map(record => [record.id, record]));
  const projectRestoredTarget = (targetRecordId: string, featureId: string) => {
    const original = restoredById.get(targetRecordId);
    expect(original, "restored correction target " + targetRecordId).toBeDefined();
    const corrections = restoredRows
      .filter(record => record.id.startsWith("historical-correction:") &&
        (record as any).data.featureId === featureId &&
        (record as any).data.targetRecordId === targetRecordId)
      .map(record => (record as any).data)
      .sort((left, right) => left.chainRevision - right.chainRevision);
    const projection = projectHistoricalCorrectionsV1((original as any).data, corrections as never);
    expect(projection.status).toBe("valid");
    const head = restoredById.get("historical-correction-chain:" + encodeURIComponent(targetRecordId));
    expect((head as any)?.data).toMatchObject({
      chainRevision: projection.chainRevision,
      headCorrectionId: projection.headCorrectionId,
    });
    return projection;
  };
  
  const maintenanceTarget = "feature:maintenance:expense:123e4567-e89b-42d3-a456-426614174050";
  const maintenanceProjection = projectRestoredTarget(maintenanceTarget, "maintenance");
  expect(maintenanceProjection).toMatchObject({
    status: "valid", chainRevision: 2, headCorrectionId: "maintenance-fix-2",
    data: { amountPaise: 13000 },
  });
  const complianceTarget = "feature:compliance:123e4567-e89b-42d3-a456-426614174010";
  const complianceProjection = projectRestoredTarget(complianceTarget, "compliance");
  expect(complianceProjection).toMatchObject({
    status: "valid", chainRevision: 1, headCorrectionId: "compliance-fix-1",
    data: { totalCostPaise: 366000 },
  });
  
  const restoredFuel = restoredRows
    .filter(record => record.id.startsWith("feature:business-expenses:fuel:"))
    .map(record => {
      const corrections = restoredRows
        .filter(item => item.id.startsWith("historical-correction:") &&
          (item as any).data.featureId === "business-expenses" &&
          (item as any).data.targetRecordId === record.id)
        .map(item => (item as any).data)
        .sort((left, right) => left.chainRevision - right.chainRevision);
      if (corrections.length === 0) return (record as any).data;
      const projection = projectHistoricalCorrectionsV1((record as any).data, corrections as never);
      expect(projection.status).toBe("valid");
      const head = restoredById.get("historical-correction-chain:" + encodeURIComponent(record.id));
      expect((head as any)?.data).toMatchObject({
        chainRevision: projection.chainRevision,
        headCorrectionId: projection.headCorrectionId,
      });
      return projection.data;
    });
  const restoredExpenses = restoredRows
    .filter(record => record.id.startsWith("feature:business-expenses:entry:"))
    .map(record => (record as any).data);
  const restoredIntervals = calculateFuelIntervals(restoredFuel as never);
  expect(restoredIntervals.filter(interval => interval.status === "available")).toHaveLength(4);
  for (const expected of fixture.expectedBusinessResults.fuelIntervals) {
    expect(restoredIntervals.find(interval =>
      interval.startCheckpointId === expected.startCheckpointId)).toMatchObject(expected);
  }
  expect(calculateFuelCostRateHistory(restoredFuel as never, restoredIntervals))
    .toEqual(fixture.expectedBusinessResults.fuelCostRateHistory);
  const restoredDailyExpenses = calculateDailyBusinessExpenses(
    restoredFuel as never, restoredExpenses as never,
  );
  const expenseTotals = restoredDailyExpenses.reduce((total, row) => ({
    fuelPaise: total.fuelPaise + row.fuelPaise,
    platformFeesPaise: total.platformFeesPaise + row.platformFeesPaise,
    trafficChallansPaise: total.trafficChallansPaise + row.trafficChallansPaise,
    miscellaneousPaise: total.miscellaneousPaise + row.miscellaneousPaise,
    reportedSourceExpensePaise: total.reportedSourceExpensePaise + row.reportedSourceExpensePaise,
    normalOperatingExpensePaise: total.normalOperatingExpensePaise + row.normalOperatingExpensePaise,
    fullCostExpensePaise: total.fullCostExpensePaise + row.fullCostExpensePaise,
  }), { fuelPaise: 0, platformFeesPaise: 0, trafficChallansPaise: 0, miscellaneousPaise: 0,
    reportedSourceExpensePaise: 0, normalOperatingExpensePaise: 0, fullCostExpensePaise: 0 });
  expect(expenseTotals).toEqual(fixture.expectedBusinessResults.dailyExpenses);
  
  const restoredAccruals = restoredRows
    .filter(record => record.id.startsWith("feature:maintenance:daily-accrual:"))
    .map(record => (record as any).data);
  expect(restoredAccruals).toHaveLength(fixture.expectedBusinessResults.maintenanceAccruals.length);
  for (const expected of fixture.expectedBusinessResults.maintenanceAccruals) {
    const accrual = restoredAccruals.find(row => row.operationalDate === expected.operationalDate);
    expect(accrual).toMatchObject(expected);
    const dailyKm = restoredById.get(accrual.dailyBusinessKmRecordId);
    expect(dailyKm).toBeDefined();
    expect(dailyKm?.revision).toBe(accrual.dailyBusinessKmRevision);
    expect(dailyKm?.data).toMatchObject({
      operationalDate: accrual.operationalDate,
      totalBusinessKm: accrual.businessKm,
      unallocatedBusinessKm: 0,
    });
  }
  
  const restoredLoan = restoredRows.find(record => record.id.startsWith("feature:finance:loan:")) as any;
  const restoredLedger = restoredRows.find(record => record.id.startsWith("feature:finance:payments:")) as any;
  const restoredPrepayment = restoredRows.find(record => record.id.startsWith("feature:finance:prepayments:")) as any;
  expect(restoredLoan?.revision).toBe(3);
  expect(restoredLoan?.data.scheduleVersions[0]?.output.regularEmiPaise)
    .toBe(fixture.expectedBusinessResults.finance.regularEmiPaise);
  expect(restoredLoan?.data.lifecycleState).toBe("closed");
  expect(restoredLedger?.revision).toBe(6);
  expect(restoredLedger?.data.entries.find((row: any) => row.id === fixture.populatedGraph.lineage.finance.settlementEntryId))
    .toMatchObject({ kind: "settlement", scheduleVersion: 2, amountPaise: fixture.expectedBusinessResults.finance.settlementPaise });
  expect(restoredPrepayment?.data.revisions[0]).toMatchObject({
    mode: "reduce_tenure",
    prepaymentAmountPaise: fixture.expectedBusinessResults.finance.prepaymentPaise,
    version: fixture.expectedBusinessResults.finance.prepaymentScheduleVersion,
  });
  expect(restoredPrepayment?.data.revisions[0]?.output).toMatchObject({
    regularEmiPaise: fixture.expectedBusinessResults.finance.regularEmiPaise,
    remainingInstallmentCount: fixture.expectedBusinessResults.finance.prepaymentRemainingInstallments,
    finalDueDate: fixture.expectedBusinessResults.finance.prepaymentFinalDueDate,
  });
}
