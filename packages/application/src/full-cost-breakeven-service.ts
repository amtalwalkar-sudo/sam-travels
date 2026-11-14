import type { VehicleService } from "./vehicle-service";
import type { MaintenanceService } from "./maintenance-service";
import type { BusinessExpensesService } from "./business-expenses-service";
import type { BusinessStartDateCostAllocationService } from "./business-start-date-cost-allocation-service";
import type { TripFinancialService } from "./trip-financial-service";
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
    private readonly expenses: Pick<BusinessExpensesService, "listExpenseEntries" | "listDailyExpenseOutputs" | "listFuelPurchases" | "listFuelCostRateHistory">,
    private readonly allocation: Pick<BusinessStartDateCostAllocationService, "getReport">,
    private readonly tripFinancials: Pick<TripFinancialService, "submittedTripFinancialRecords">,
  ) {}

  async calculate(from: string, to: string): Promise<BreakevenPeriodResultV1> {
    const [vehicles, expenses, dailyExpenseOutputs, fuelPurchases, fuelRates, allocationReport, tripFinancialRecords] = await Promise.all([
      this.vehicles.list(), this.expenses.listExpenseEntries(), this.expenses.listDailyExpenseOutputs(),
      this.expenses.listFuelPurchases(), this.expenses.listFuelCostRateHistory(),
      this.allocation.getReport(), this.tripFinancials.submittedTripFinancialRecords(),
    ]);
    if (vehicles.length !== 1) throw new Error("breakeven_single_vehicle_scope_requires_exactly_one_vehicle");
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
      vehicle,
      records: await this.maintenance.listVehicleRecords(vehicle.id),
      rates: fuelRates.filter(rate => rate.sourcePurchaseIds.some(id => {
        const purchase = fuelPurchases.find(item => item.id === id);
        return purchase?.data.kind === "fuel_purchase" && purchase.data.vehicleId === vehicle.id;
      })),
    })));
    for (const { vehicle, records, rates } of histories) {
      for (const accrual of records.accruals) {
        const date = accrual.data.operationalDate;
        if (date < from || date > to) continue;
        const bucket = activityByDate.get(date) ?? {
          businessKm: 0, fuelCostPaise: 0, maintenanceCostPaise: 0, refs: [],
        };
        const km = accrual.data.businessKm;
        const rate = rates.filter(item => item.effectiveFrom <= date).slice(-1)[0];
        if (km > 0 && !rate) {
          completeness[2] = { source: "fuel-rate-history", status: "incomplete",
            detail: "No effective fuel cost rate for " + vehicle.id + " on " + date };
        } else if (km > 0 && rate) {
          bucket.fuelCostPaise += ratioAmount(km, rate.costPaisePerKm);
          rate.sourcePurchaseIds.forEach((sourceId, index) => bucket.refs.push({
            sourceId, revision: rate.sourceRevisions[index] ?? 1,
          }));
        }
        bucket.businessKm += km;
        bucket.maintenanceCostPaise += accrual.data.amountPaise;
        bucket.refs.push({ sourceId: accrual.id, revision: accrual.revision });
        if (records.rateHistoryRecord) {
          bucket.refs.push({ sourceId: records.rateHistoryRecord.id, revision: records.rateHistoryRecord.revision });
        } else {
          bucket.refs.push({ sourceId: vehicle.id, revision: vehicle.revision });
        }
        bucket.refs.push({ sourceId: accrual.data.dailyBusinessKmRecordId,
          revision: accrual.data.dailyBusinessKmRevision });
        if (![bucket.businessKm, bucket.fuelCostPaise, bucket.maintenanceCostPaise].every(Number.isSafeInteger)) {
          throw new Error("breakeven_activity_total_overflow");
        }
        activityByDate.set(date, bucket);
      }
    }

    if (![...activityByDate.keys()].some(date => date >= from && date <= to)) {
      completeness[3] = { source: "maintenance-accruals", status: "unavailable",
        detail: "No committed daily business-kilometre maintenance accruals exist in the selected period." };
    }

    const dailyActivity: BreakevenDailyActivityV1[] = [...activityByDate].map(([date, value]) => ({
      date, businessKm: value.businessKm, fuelCostPaise: value.fuelCostPaise,
      maintenanceCostPaise: value.maintenanceCostPaise,
      distanceSourceId: value.refs.map(ref => ref.sourceId).sort().join("|"),
      distanceSourceRevision: Math.max(1, ...value.refs.map(ref => ref.revision)),
      sourceRefs: value.refs,
    }));

    const datedCosts: BreakevenDailyCostV1[] = [];
    const expenseById = new Map(expenses.map(record => [record.id, record]));
    const expenseKinds = [
      { field: "platformFeesPaise", sourceKind: "platform_fee", kind: "platform-fee" },
      { field: "trafficChallansPaise", sourceKind: "traffic_challan", kind: "traffic-challan" },
      { field: "miscellaneousPaise", sourceKind: "miscellaneous", kind: "miscellaneous" },
    ] as const;
    for (const daily of dailyExpenseOutputs) {
      for (const category of expenseKinds) {
        const amountPaise = daily[category.field];
        const refs = daily.sourceIds.flatMap((sourceId, index) => {
          const source = expenseById.get(sourceId);
          return source?.data.sourceKind === category.sourceKind
            ? [{ sourceId, revision: daily.sourceRevisions[index] ?? source.revision }]
            : [];
        });
        if (!Number.isSafeInteger(amountPaise)) throw new Error("breakeven_expense_amount_invalid");
        if (amountPaise !== 0 && !refs.length) {
          completeness.push({ source: "business-expenses", status: "incomplete",
            detail: "Daily expense output has no matching source records for " + daily.businessDate + " (" + category.sourceKind + ")." });
          continue;
        }
        if (amountPaise !== 0 || refs.length) datedCosts.push({
          date: daily.businessDate, amountPaise, kind: category.kind,
          sourceId: refs.map(ref => ref.sourceId).sort().join("|") || "expense-output:" + daily.businessDate,
          sourceRevision: Math.max(1, ...refs.map(ref => ref.revision)),
          sourceRefs: refs,
        });
      }
    }

    for (const record of tripFinancialRecords) {
      if (record.data.kind !== "completed_ride_financials") continue;
      const context = record.data.tripContext;
      const driverExpenses = (record.data.tollPayer === "driver" ? record.data.tollPaise ?? 0 : 0) +
        (record.data.parkingPayer === "driver" ? record.data.parkingPaise ?? 0 : 0);
      if (!context) {
        if (driverExpenses > 0) completeness.push({ source: "trip-financials", status: "incomplete",
          detail: "Driver-paid parking/toll has no recoverable immutable trip context: " + record.id });
        continue;
      }
      if (driverExpenses > 0) datedCosts.push({
        date: context.operationalDate, amountPaise: driverExpenses, kind: "miscellaneous",
        sourceId: record.id, sourceRevision: record.revision,
      });
    }

    for (const source of allocationReport.result.sources) {
      if (source.disposition === "overlap_review_required" &&
          (source.eligibleFrom === undefined || source.eligibleFrom <= to) &&
          (source.eligibleTo === undefined || source.eligibleTo >= from)) {
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
