import type { AtomicRecordRepository } from "../../packages/core/src/repositories";
import type { RecordEnvelope } from "../../packages/core/src/types";
import { calculateFuelIntervals, calculateDailyBusinessExpenses, calculateFuelCostRateHistory } from "../../packages/features/business-expenses";
import { projectHistoricalCorrectionsV1 } from "../../packages/domain/src/historical-correction";
import { buildLoanAmortizationSchedule, calculateLoanPrepaymentReamortizationV1 } from "../../packages/features/finance";
import { calculateDailyComplianceCost } from "../../packages/features/compliance";
import { MaintenanceService } from "../../packages/application/src/maintenance-service";
import { assertMaintenanceRecordV1, calculateMaintenanceVisitTotal, maintenanceBusinessDateFromInstant } from "../../packages/features/maintenance";

type Row = RecordEnvelope<any>;
function required(rows: readonly Row[], id: string): Row {
  const row = rows.find(item => item.id === id);
  if (!row) throw new Error("semantic_parity_source_missing:" + id);
  return row;
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return "{" + Object.keys(object).sort().map(key => JSON.stringify(key) + ":" + stable(object[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}
function project(rows: readonly Row[], targetId: string, featureId: string) {
  const target = required(rows, targetId);
  const corrections = rows.filter(row => row.id.startsWith("historical-correction:") &&
    row.data.featureId === featureId && row.data.targetRecordId === targetId)
    .map(row => row.data).sort((a, b) => a.chainRevision - b.chainRevision);
  const projection = projectHistoricalCorrectionsV1(target.data, corrections as never);
  if (projection.status !== "valid") throw new Error("semantic_parity_correction_invalid:" + targetId);
  const head = required(rows, "historical-correction-chain:" + encodeURIComponent(targetId));
  if (head.data.chainRevision !== projection.chainRevision ||
      head.data.headCorrectionId !== projection.headCorrectionId) {
    throw new Error("semantic_parity_correction_head_mismatch:" + targetId);
  }
  return { targetRecordId: targetId, targetRevision: target.revision,
    chainRevision: projection.chainRevision, headCorrectionId: projection.headCorrectionId ?? null,
    data: projection.data };
}
function makeRepository(rows: readonly Row[]): AtomicRecordRepository {
  const records = new Map(rows.map(row => [row.id, row]));
  return {
    get: async <T>(id: string) => records.get(id) as RecordEnvelope<T> | undefined,
    put: async <T>(row: RecordEnvelope<T>) => { records.set(row.id, row as RecordEnvelope<unknown>); },
    list: async <T>() => [...records.values()] as RecordEnvelope<T>[],
    remove: async (id: string) => { records.delete(id); },
    compareAndSet: async <T>(id: string, expectedRevision: number | null, next: RecordEnvelope<T>) => {
      const current = records.get(id);
      if ((current?.revision ?? null) !== expectedRevision) return false;
      records.set(id, next as RecordEnvelope<unknown>);
      return true;
    },
  };
}

/** Run owning production calculators over platform-read records, never fixture calculation inputs. */
export async function runSemanticFixtureProductionCalculations(inputRows: readonly Row[]) {
  const mark = (value: string) => { if (typeof window !== "undefined") window.__semanticParityProgress = value; };
  mark("started");
  const rows = [...inputRows];
  const byId = new Map(rows.map(row => [row.id, row]));
  const corrections = [
    project(rows, "feature:maintenance:expense:123e4567-e89b-42d3-a456-426614174050", "maintenance"),
    project(rows, "feature:compliance:123e4567-e89b-42d3-a456-426614174010", "compliance"),
    project(rows, "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174030", "business-expenses"),
    project(rows, "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174071", "business-expenses"),
  ];
  mark("corrections");
  const correctedFuel = rows.filter(row => row.id.startsWith("feature:business-expenses:fuel:"))
    .map(row => corrections.find(item => item.targetRecordId === row.id)?.data ?? row.data);
  const expenses = rows.filter(row => row.id.startsWith("feature:business-expenses:entry:")).map(row => row.data);
  const fuelIntervals = calculateFuelIntervals(correctedFuel as never);
  const fuelCostRateHistory = calculateFuelCostRateHistory(correctedFuel as never, fuelIntervals);
  mark("fuel");
  const dailyExpenseRows = calculateDailyBusinessExpenses(correctedFuel as never, expenses as never);
  mark("expenses");
  const dailyExpenses = dailyExpenseRows.reduce((total, row) => ({
    fuelPaise: total.fuelPaise + row.fuelPaise,
    platformFeesPaise: total.platformFeesPaise + row.platformFeesPaise,
    trafficChallansPaise: total.trafficChallansPaise + row.trafficChallansPaise,
    miscellaneousPaise: total.miscellaneousPaise + row.miscellaneousPaise,
    reportedSourceExpensePaise: total.reportedSourceExpensePaise + row.reportedSourceExpensePaise,
    normalOperatingExpensePaise: total.normalOperatingExpensePaise + row.normalOperatingExpensePaise,
    fullCostExpensePaise: total.fullCostExpensePaise + row.fullCostExpensePaise,
  }), { fuelPaise: 0, platformFeesPaise: 0, trafficChallansPaise: 0, miscellaneousPaise: 0,
    reportedSourceExpensePaise: 0, normalOperatingExpensePaise: 0, fullCostExpensePaise: 0 });

  const vehicle = rows.find(row => row.id.startsWith("feature:vehicle:"));
  if (!vehicle) throw new Error("semantic_parity_vehicle_missing");
  const repository = makeRepository(rows.filter(row => !row.id.startsWith("feature:maintenance:daily-accrual:")));
  const maintenance = new MaintenanceService(repository, assertMaintenanceRecordV1,
    { getById: async (id: string) => id === vehicle.id ? vehicle : undefined },
    calculateMaintenanceVisitTotal, maintenanceBusinessDateFromInstant);
  const dailyKmRows = rows.filter(row => row.id.startsWith("work:daily-business-km:"))
    .sort((a, b) => a.data.operationalDate.localeCompare(b.data.operationalDate));
  mark("maintenance-start");
  const calculatedAccruals = [];
  for (const daily of dailyKmRows) {
    if (daily.data.unallocatedBusinessKm !== 0 || daily.data.totalBusinessKm <= 0) continue;
    const accrual = await maintenance.accrueDailyBusinessKilometres({
      vehicleId: vehicle.id, operationalDate: daily.data.operationalDate, source: "integration",
    });
    calculatedAccruals.push({ id: accrual.id, revision: accrual.revision, data: accrual.data });
    mark("maintenance-" + calculatedAccruals.length);
  }
  mark("maintenance");
  const storedAccruals = rows.filter(row => row.id.startsWith("feature:maintenance:daily-accrual:"));
  for (const calculated of calculatedAccruals) {
    const stored = required(storedAccruals, calculated.id);
    if (stable(stored.data) !== stable(calculated.data)) {
      throw new Error("semantic_parity_maintenance_accrual_mismatch:" + calculated.id);
    }
  }

  const loan = rows.find(row => row.id.startsWith("feature:finance:loan:"));
  const prepayment = rows.find(row => row.id.startsWith("feature:finance:prepayments:"));
  if (!loan || !prepayment) throw new Error("semantic_parity_finance_sources_missing");
  const originalSchedule = buildLoanAmortizationSchedule(loan.data.details);
  const storedSchedule = loan.data.scheduleVersions.find((item: any) => item.version === 1);
  if (!storedSchedule || stable(originalSchedule) !== stable(storedSchedule.output)) {
    throw new Error("semantic_parity_finance_original_schedule_mismatch");
  }
  const prepaymentRevision = prepayment.data.revisions[0];
  const recalculatedPrepayment = calculateLoanPrepaymentReamortizationV1(prepaymentRevision.input);
  if (stable(recalculatedPrepayment) !== stable(prepaymentRevision.output)) {
    throw new Error("semantic_parity_finance_prepayment_schedule_mismatch");
  }

  mark("finance");
  const complianceRows = rows.filter(row => row.id.startsWith("feature:compliance:") && row.data.vehicleId)
    .map(row => ({
      id: row.id,
      revision: row.revision,
      data: corrections.find(item => item.targetRecordId === row.id)?.data ?? row.data,
    }));
  const complianceDaily = calculateDailyComplianceCost(complianceRows as never, vehicle.id, "2026-11-01");
  if (complianceDaily.status !== "available" || !complianceDaily.total) {
    throw new Error("semantic_parity_compliance_calculation_unavailable");
  }

  mark("compliance");
  const workAllocations = dailyKmRows.map(row => ({
    sourceId: row.id, revision: row.revision, operationalDate: row.data.operationalDate,
    totalBusinessKm: row.data.totalBusinessKm, unallocatedBusinessKm: row.data.unallocatedBusinessKm,
    entries: row.data.entries,
  }));
  const rateHistory = required(rows, "feature:maintenance:rate:" + encodeURIComponent(vehicle.id));
  const provenance: Array<{ sourceId: string; revision: number; scheduleVersion?: number }> = [
    ...fuelIntervals.flatMap(interval => interval.sourcePurchaseIds.map((sourceId, index) => ({
      sourceId, revision: interval.sourceRevisions[index],
    }))),
    ...rows.filter(row => row.id.startsWith("feature:business-expenses:entry:") ||
      row.id.startsWith("feature:business-expenses:fuel:")).map(row => ({ sourceId: row.id, revision: row.revision })),
    ...calculatedAccruals.flatMap(accrual => [
      { sourceId: accrual.id, revision: accrual.revision },
      { sourceId: accrual.data.dailyBusinessKmRecordId, revision: accrual.data.dailyBusinessKmRevision },
      { sourceId: rateHistory.id, revision: rateHistory.revision },
    ]),
    { sourceId: loan.id, revision: loan.revision, scheduleVersion: 1 },
    { sourceId: prepayment.id, revision: prepayment.revision, scheduleVersion: prepaymentRevision.version },
    ...complianceDaily.breakdown.map(item => ({
      sourceId: item.recordId, revision: required(rows, item.recordId).revision,
    })),
    ...workAllocations.map(item => ({ sourceId: item.sourceId, revision: item.revision })),
    ...corrections.map(item => ({ sourceId: item.targetRecordId, revision: item.targetRevision })),
  ];
  const uniqueProvenance = [...new Map(provenance.map(item =>
    [item.sourceId + "@" + item.revision + (item.scheduleVersion ? "#" + item.scheduleVersion : ""), item],
  )).values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId) ||
    a.revision - b.revision || (a.scheduleVersion ?? 0) - (b.scheduleVersion ?? 0));
  for (const ref of uniqueProvenance) {
    const source = byId.get(ref.sourceId);
    if (!source || source.revision !== ref.revision) throw new Error("semantic_parity_provenance_source_mismatch:" + ref.sourceId);
  }
  mark("complete");
  return {
    corrections, fuelIntervals, fuelCostRateHistory, dailyExpenses, maintenanceAccruals: calculatedAccruals,
    finance: { loanSourceId: loan.id, loanRevision: loan.revision, originalScheduleVersion: storedSchedule.version,
      originalSchedule, prepaymentSourceId: prepayment.id, prepaymentRevision: prepayment.revision,
      prepaymentScheduleVersion: prepaymentRevision.version, prepayment: recalculatedPrepayment },
    compliance: { date: "2026-11-01", status: complianceDaily.status, total: complianceDaily.total,
      breakdown: complianceDaily.breakdown.map(item => ({
        sourceId: item.recordId, revision: required(rows, item.recordId).revision, cost: item.cost,
      })) },
    workAllocations, provenance: uniqueProvenance,
  };
}

declare global {
  interface Window {
    __semanticParityProgress?: string;
    SemanticFixtureCalculationParity?: {
      run: typeof runSemanticFixtureProductionCalculations;
    };
  }
}
if (typeof window !== "undefined") {
  window.SemanticFixtureCalculationParity = { run: runSemanticFixtureProductionCalculations };
}
