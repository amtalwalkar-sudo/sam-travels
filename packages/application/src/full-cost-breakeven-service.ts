import type { VehicleService } from "./vehicle-service";
import type { MaintenanceService } from "./maintenance-service";
import type { BusinessExpensesService } from "./business-expenses-service";
import type { BusinessStartDateCostAllocationService } from "./business-start-date-cost-allocation-service";
import {
  calculateFullCostBreakevenV1,
  type BreakevenDailyActivityV1,
  type BreakevenDailyCostV1,
  type BreakevenCompletenessV1,
  type BreakevenPeriodResultV1,
} from "../../domain/src/full-cost-breakeven";

function ratioAmount(km: number, ratio: { numerator: string; denominator: string }): number {
  const numerator = BigInt(ratio.numerator), denominator = BigInt(ratio.denominator);
  if (denominator <= 0n || numerator < 0n) throw new Error("breakeven_source_rate_invalid");
  const amount = (BigInt(km) * numerator * 2n + denominator) / (2n * denominator);
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("breakeven_source_amount_overflow");
  return Number(amount);
}

/**
 * Read-only adapter over owning application services. Annual-first fixed-cost
 * allocation remains owned by BusinessStartDateCostAllocationService; every
 * requested view is a projection of its canonical daily allocation rows.
 */
export class FullCostBreakevenService {
  constructor(
    private readonly vehicles: Pick<VehicleService, "list">,
    private readonly maintenance: Pick<MaintenanceService, "listVehicleRecords">,
    private readonly expenses: Pick<BusinessExpensesService, "listExpenseEntries" | "listFuelPurchases" | "listFuelCostRateHistory">,
    private readonly allocation: Pick<BusinessStartDateCostAllocationService, "getReport">,
  ) {}

  async calculate(from: string, to: string): Promise<BreakevenPeriodResultV1> {
    const [vehicles, expenses, fuelPurchases, fuelRates, allocationReport] = await Promise.all([
      this.vehicles.list(), this.expenses.listExpenseEntries(), this.expenses.listFuelPurchases(), this.expenses.listFuelCostRateHistory(),
      this.allocation.getReport(),
    ]);
    const activityByDate = new Map<string, {
      businessKm: number; fuelCostPaise: number; maintenanceCostPaise: number;
      refs: { sourceId: string; revision: number }[];
    }>();
    const completeness: BreakevenCompletenessV1[] = [
      { source: "finance-and-compliance-allocation", status: "complete" },
      { source: "business-expenses", status: "complete" },
      { source: "fuel-rate-history", status: "complete" },
      { source: "maintenance-accruals", status: "complete" },
    ];

    const histories = await Promise.all(vehicles.map(async vehicle => ({
      vehicleId: vehicle.id,
      records: await this.maintenance.listVehicleRecords(vehicle.id),
      rates: fuelRates.filter(rate => rate.sourcePurchaseIds.some(id => {
        const purchase = fuelPurchases.find(item => item.id === id);
        return purchase?.data.kind === "fuel_purchase" && purchase.data.vehicleId === vehicle.id;
      })),
    })));
    for (const { vehicleId, records, rates } of histories) {
      for (const accrual of records.accruals) {
        const date = accrual.data.operationalDate;
        const bucket = activityByDate.get(date) ?? {
          businessKm: 0, fuelCostPaise: 0, maintenanceCostPaise: 0, refs: [],
        };
        const km = accrual.data.businessKm;
        const rate = rates.filter(item => item.effectiveFrom <= date).slice(-1)[0];
        if (km > 0 && !rate) {
          completeness[2] = { source: "fuel-rate-history", status: "incomplete",
            detail: "No effective fuel cost rate for " + vehicleId + " on " + date };
        } else if (km > 0 && rate) {
          bucket.fuelCostPaise += ratioAmount(km, rate.costPaisePerKm);
          for (const source of rate.sourceRevisions) bucket.refs.push({ sourceId: source.sourceId, revision: source.revision });
        }
        bucket.businessKm += km;
        bucket.maintenanceCostPaise += accrual.data.amountPaise;
        bucket.refs.push({ sourceId: accrual.id, revision: accrual.revision });
        bucket.refs.push({ sourceId: accrual.data.dailyBusinessKmRecordId,
          revision: accrual.data.dailyBusinessKmRevision });
        if (![bucket.businessKm, bucket.fuelCostPaise, bucket.maintenanceCostPaise].every(Number.isSafeInteger)) {
          throw new Error("breakeven_activity_total_overflow");
        }
        activityByDate.set(date, bucket);
      }
    }

    const dailyActivity: BreakevenDailyActivityV1[] = [...activityByDate].map(([date, value]) => ({
      date, businessKm: value.businessKm, fuelCostPaise: value.fuelCostPaise,
      maintenanceCostPaise: value.maintenanceCostPaise,
      distanceSourceId: value.refs.map(ref => ref.sourceId).sort().join("|"),
      distanceSourceRevision: Math.max(1, ...value.refs.map(ref => ref.revision)),
      sourceRefs: value.refs,
    }));

    const expenseByDate = new Map<string, Map<string, {
      amountPaise: number; ids: string[]; revision: number;
    }>>();
    const expenseRecords = expenses;
    const expenseById = new Map(expenseRecords.map(record => [record.id, record]));
    for (const envelope of expenseRecords) {
      const entry = envelope.data;
      const original = entry.effect === "reversal" ? expenseById.get(entry.reversesSourceId ?? "") : undefined;
      const effectiveDate = original?.data.businessDate ?? entry.businessDate;
      const kind = entry.sourceKind === "platform_fee" ? "platform-fee"
        : entry.sourceKind === "traffic_challan" ? "traffic-challan" : "miscellaneous";
      const dateMap = expenseByDate.get(effectiveDate) ?? new Map();
      const bucket = dateMap.get(kind) ?? { amountPaise: 0, ids: [], revision: 1 };
      bucket.amountPaise += entry.effect === "reversal" ? -entry.amountPaise : entry.amountPaise;
      bucket.ids.push(envelope.id); bucket.revision = Math.max(bucket.revision, envelope.revision);
      dateMap.set(kind, bucket); expenseByDate.set(effectiveDate, dateMap);
    }
    const datedCosts: BreakevenDailyCostV1[] = [];
    for (const [date, kinds] of expenseByDate) for (const [kind, bucket] of kinds) {
      if (bucket.amountPaise < 0 || !Number.isSafeInteger(bucket.amountPaise)) {
        throw new Error("breakeven_expense_reversal_reconciliation_failed");
      }
      if (bucket.amountPaise > 0) datedCosts.push({
        date, amountPaise: bucket.amountPaise, kind: kind as BreakevenDailyCostV1["kind"],
        sourceId: bucket.ids.sort().join("|"), sourceRevision: bucket.revision,
      });
    }

    for (const source of allocationReport.result.sources) {
      if (source.disposition === "overlap_review_required") {
        completeness[0] = { source: "finance-and-compliance-allocation", status: "review-required",
          detail: "Compliance overlap requires review: " + source.sourceId };
      }
      for (const row of source.daily) {
        datedCosts.push({
          date: row.date, amountPaise: row.amountPaise,
          kind: row.sourceKind === "compliance" ? "compliance" : "emi",
          sourceId: row.sourceId, sourceRevision: row.sourceVersion,
          ...(row.scheduleVersion !== undefined ? { scheduleVersion: row.scheduleVersion } : {}),
        });
      }
    }

    return calculateFullCostBreakevenV1({
      from, to, dailyActivity, datedCosts, completeness,
    });
  }
}
