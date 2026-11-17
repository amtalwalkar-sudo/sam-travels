import type { VehicleService } from "./vehicle-service";
import type { RecordRepository } from "../../core/src/repositories";
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

export type FullCostBreakevenSourceActivityV1 = Readonly<BreakevenDailyActivityV1 & {
  fuelSourceRefs: readonly Readonly<{ sourceId: string; revision: number }>[];
  maintenanceSourceRefs: readonly Readonly<{ sourceId: string; revision: number }>[];
}>;
export type FullCostBreakevenSourceProjectionV1 = Readonly<{
  /** Identity of the fixed-cost allocation snapshot used by this projection. */
  businessStartDate?: string;
  businessSettingsRevision?: number;
  dailyActivity: readonly FullCostBreakevenSourceActivityV1[];
  datedCosts: readonly BreakevenDailyCostV1[];
  completeness: readonly BreakevenCompletenessV1[];
}>;

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
    private readonly expenses: Pick<BusinessExpensesService, "listExpenseEntries" | "listDailyExpenseOutputs" | "listFuelPurchases" | "listFuelCostRateHistory"> & Partial<Pick<BusinessExpensesService, "listCorrectionReferences">>,
    private readonly allocation: Pick<BusinessStartDateCostAllocationService, "getReport">,
    private readonly tripFinancials: Pick<TripFinancialService, "submittedTripFinancialRecords">,
    /** Shared authoritative records repository used to verify Work daily shift projections. */
    private readonly recordRepository?: Pick<RecordRepository, "list">,
  ) {}

  async getSourceProjection(from: string, to: string): Promise<FullCostBreakevenSourceProjectionV1> {
    const [vehicles, expenses, dailyExpenseOutputs, fuelPurchases, fuelRates, allocationReport, tripFinancialRecords, authoritativeRecords] = await Promise.all([
      this.vehicles.list(), this.expenses.listExpenseEntries(), this.expenses.listDailyExpenseOutputs(),
      this.expenses.listFuelPurchases(), this.expenses.listFuelCostRateHistory(),
      this.allocation.getReport(), this.tripFinancials.submittedTripFinancialRecords(),
      this.recordRepository ? this.recordRepository.list<unknown>() : Promise.resolve(undefined),
    ]);
    const correctionRefsBySourceId = new Map<string, readonly Readonly<{ sourceId: string; revision: number }>[]>();
    if (this.expenses.listCorrectionReferences) {
      const correctionTargets = [...new Set([
        ...expenses.map(record => record.id),
        ...fuelPurchases.map(record => record.id),
      ])];
      const correctionEntries = await Promise.all(correctionTargets.map(async sourceId => [
        sourceId, await this.expenses.listCorrectionReferences!(sourceId),
      ] as const));
      correctionEntries.forEach(([sourceId, refs]) => correctionRefsBySourceId.set(sourceId, refs));
    }
    if (vehicles.length !== 1) throw new Error("breakeven_single_vehicle_scope_requires_exactly_one_vehicle");
    const activityByDate = new Map<string, {
      businessKm: number; fuelCostPaise: number; maintenanceCostPaise: number; activeDrivingDay: boolean;
      refs: { sourceId: string; revision: number }[];
      fuelRefs: { sourceId: string; revision: number }[];
      maintenanceRefs: { sourceId: string; revision: number }[];
    }>();
    const completeness: BreakevenCompletenessV1[] = [
      { source: "finance-and-compliance-allocation", status: "complete" },
      { source: "business-expenses", status: "complete" },
      { source: "fuel-rate-history", status: "complete" },
      { source: "maintenance-accruals", status: "complete" },
    ];

    const vehicleId = vehicles[0].id;
    const dailyDistanceRecords = authoritativeRecords?.filter(record =>
      record.id.startsWith("work:daily-business-km:")) ?? [];
    const distanceByDate = new Map<string, {
      record: { id: string; revision: number };
      businessKm: number;
      entries: Array<{ shiftId?: string; businessKm: number; personalKm?: number; allocationStatus: string }>;
      complete: boolean;
    }>();
    const activeDaySourceIssues: string[] = [];
    for (const daily of dailyDistanceRecords) {
      const data = daily.data as {
        schemaVersion?: number; kind?: string; vehicleId?: string; operationalDate?: string;
        entries?: Array<{ shiftId?: string; businessKm?: number; personalKm?: number; allocationStatus?: string }>;
        totalBusinessKm?: number; unallocatedBusinessKm?: number;
      };
      if (data.vehicleId !== vehicleId) continue;
      const date = data.operationalDate;
      if (typeof date !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(date) ||
          !Number.isFinite(Date.parse(date + "T00:00:00Z")) ||
          new Date(Date.parse(date + "T00:00:00Z")).toISOString().slice(0, 10) !== date) {
        activeDaySourceIssues.push(daily.id + " has no valid operational date");
        continue;
      }
      if (date < from || date > to) continue;
      const entries = Array.isArray(data.entries) ? data.entries : [];
      const shiftIds = new Set<string>();
      let totalBusinessKm = 0;
      let unallocatedBusinessKm = 0;
      let validEntries = Array.isArray(data.entries);
      for (const entry of entries) {
        if (typeof entry.shiftId !== "string" || !entry.shiftId.trim() || shiftIds.has(entry.shiftId) ||
            !Number.isSafeInteger(entry.businessKm) || (entry.businessKm ?? -1) < 0 ||
            (entry.personalKm !== undefined && (!Number.isSafeInteger(entry.personalKm) || entry.personalKm < 0))) {
          validEntries = false;
          continue;
        }
        shiftIds.add(entry.shiftId);
        totalBusinessKm += entry.businessKm!;
        if (!Number.isSafeInteger(totalBusinessKm)) validEntries = false;
        if (entry.allocationStatus === "awaiting_operational_boundary") {
          unallocatedBusinessKm += entry.businessKm!;
        } else if (entry.allocationStatus !== "allocated") {
          validEntries = false;
        }
        if (!Number.isSafeInteger(unallocatedBusinessKm)) validEntries = false;
      }
      const canonicalId = "work:daily-business-km:" + encodeURIComponent(vehicleId) + ":" + date;
      const duplicateDate = distanceByDate.has(date);
      const complete = !duplicateDate && data.schemaVersion === 1 &&
        data.kind === "daily_business_kilometres" && daily.id === canonicalId &&
        validEntries && entries.every(entry => entry.allocationStatus === "allocated") &&
        data.unallocatedBusinessKm === 0 && unallocatedBusinessKm === 0 &&
        data.totalBusinessKm === totalBusinessKm;
      const businessKm = complete ? totalBusinessKm : 0;
      const distance = { record: daily, businessKm, entries: entries as Array<{
        shiftId?: string; businessKm: number; personalKm?: number; allocationStatus: string;
      }>, complete };
      distanceByDate.set(date, distance);
      const bucket = activityByDate.get(date) ?? {
        businessKm: 0, fuelCostPaise: 0, maintenanceCostPaise: 0, activeDrivingDay: false,
        refs: [], fuelRefs: [], maintenanceRefs: [],
      };
      bucket.businessKm = businessKm;
      bucket.refs.push({ sourceId: daily.id, revision: daily.revision });
      if (!complete) activeDaySourceIssues.push(daily.id + " has unallocated, duplicate or invalid distance contributions");
      activityByDate.set(date, bucket);
    }

    for (const trip of tripFinancialRecords) {
      if ((trip.data.kind !== "completed_ride_financials" && trip.data.kind !== "cancellation_fee") ||
          trip.data.status !== "submitted") continue;
      const context = trip.data.tripContext;
      if (!context || typeof context.shiftId !== "string" || !context.shiftId.trim() ||
          typeof context.vehicleId !== "string" || !context.vehicleId.trim() ||
          typeof context.operationalDate !== "string" ||
          !/^\\d{4}-\\d{2}-\\d{2}$/.test(context.operationalDate) ||
          !Number.isFinite(Date.parse(context.operationalDate + "T00:00:00Z")) ||
          new Date(Date.parse(context.operationalDate + "T00:00:00Z")).toISOString().slice(0, 10) !== context.operationalDate ||
          context.operationalDate < from || context.operationalDate > to) {
        if (context || trip.data.status === "submitted") activeDaySourceIssues.push(trip.id);
        continue;
      }
      if (context.vehicleId !== vehicleId) {
        activeDaySourceIssues.push(trip.id + " belongs to a different vehicle");
        continue;
      }
      // Work captures immutable tripContext only while an Online shift is active.
      // If a finalized, fully allocated daily projection exists, its exact shift
      // entry must agree; a different shift is not a qualifying active day.
      const distance = distanceByDate.get(context.operationalDate);
      const matchingShift = distance?.entries.find(entry => entry.shiftId === context.shiftId);
      const bucket = activityByDate.get(context.operationalDate) ?? {
        businessKm: 0, fuelCostPaise: 0, maintenanceCostPaise: 0, activeDrivingDay: false,
        refs: [], fuelRefs: [], maintenanceRefs: [],
      };
      if (distance?.complete && !matchingShift) {
        activeDaySourceIssues.push(trip.id + " does not match a shift in the finalized daily-distance record");
      } else {
        bucket.activeDrivingDay = true;
        if (!distance?.complete || !matchingShift) {
          activeDaySourceIssues.push(trip.id + " has immutable shift context but no matching finalized distance contribution");
        }
      }
      bucket.refs.push({ sourceId: trip.id, revision: trip.revision });
      activityByDate.set(context.operationalDate, bucket);
    }
    if (activeDaySourceIssues.length) {
      completeness.push({
        source: "active-driving-day-distance", status: "incomplete",
        detail: activeDaySourceIssues.length +
          " Work/Trip source record(s) need review. Active-day classification uses immutable trip context; unconfirmed distance is withheld.",
      });
    }
    if (!authoritativeRecords) {
      completeness.push({ source: "active-driving-day-distance", status: "unavailable",
        detail: "The shared Work record repository was not supplied to verify finalized daily-distance provenance." });
    }

    const accruedOperationalDates = new Set<string>();
    const histories = await Promise.all(vehicles.map(async vehicle => ({
      vehicle,
      records: await this.maintenance.listVehicleRecords(vehicle.id),
      rates: fuelRates.filter(rate => rate.sourcePurchaseIds.some(id => {
        const purchase = fuelPurchases.find(item => item.id === id);
        return purchase?.data.kind === "fuel_purchase" && purchase.data.vehicleId === vehicle.id;
      })),
    })));
    for (const { vehicle, records, rates } of histories) {
      for (const [date, distance] of distanceByDate) {
        if (!distance.complete || distance.businessKm === 0) continue;
        const bucket = activityByDate.get(date)!;
        const rate = rates.filter(item => item.effectiveFrom <= date).slice(-1)[0];
        if (!rate) {
          completeness[2] = { source: "fuel-rate-history", status: "incomplete",
            detail: "No effective fuel cost rate for " + vehicle.id + " on " + date };
          continue;
        }
        bucket.fuelCostPaise += ratioAmount(distance.businessKm, rate.costPaisePerKm);
        const distanceRef = { sourceId: distance.record.id, revision: distance.record.revision };
        bucket.fuelRefs.push(distanceRef);
        rate.sourcePurchaseIds.forEach((sourceId, index) => {
          const ref = { sourceId, revision: rate.sourceRevisions[index] ?? 1 };
          bucket.refs.push(ref);
          bucket.fuelRefs.push(ref);
          for (const correctionRef of correctionRefsBySourceId.get(sourceId) ?? []) {
            bucket.refs.push(correctionRef);
            bucket.fuelRefs.push(correctionRef);
          }
        });
      }

      for (const accrual of records.accruals) {
        const date = accrual.data.operationalDate;
        if (date < from || date > to) continue;
        const distance = distanceByDate.get(date);
        const bucket = activityByDate.get(date) ?? {
          businessKm: 0, fuelCostPaise: 0, maintenanceCostPaise: 0, activeDrivingDay: false,
          refs: [], fuelRefs: [], maintenanceRefs: [],
        };
        const personalKm = distance?.entries.reduce((sum, entry) => sum + (entry.personalKm ?? 0), 0) ?? 0;
        const effectiveRate = records.rateHistory.filter(item => item.effectiveFrom <= date).slice(-1)[0];
        const expectedAmount = distance && distance.complete
          ? distance.businessKm * accrual.data.ratePaisePerKm : -1;
        const sourceMatches = !!distance && distance.complete &&
          accrual.data.dailyBusinessKmRecordId === distance.record.id &&
          accrual.data.dailyBusinessKmRevision === distance.record.revision &&
          accrual.data.businessKm === distance.businessKm;
        const rateMatches = !!effectiveRate &&
          accrual.data.rateEffectiveFrom === effectiveRate.effectiveFrom &&
          accrual.data.ratePaisePerKm === effectiveRate.ratePaisePerKm;
        const amountMatches = Number.isSafeInteger(expectedAmount) &&
          accrual.data.amountPaise === expectedAmount &&
          (accrual.data.personalKm ?? 0) === personalKm &&
          (accrual.data.personalAmountPaise ?? 0) === personalKm * accrual.data.ratePaisePerKm;
        if (!sourceMatches || !rateMatches || !amountMatches) {
          completeness.push({ source: "maintenance-accruals", status: "incomplete",
            detail: "Maintenance accrual " + accrual.id +
              " does not reconcile to the finalized Work distance and effective operational-date rate." });
          continue;
        }
        accruedOperationalDates.add(date);
        bucket.maintenanceCostPaise += accrual.data.amountPaise;
        const accrualRef = { sourceId: accrual.id, revision: accrual.revision };
        bucket.refs.push(accrualRef);
        bucket.maintenanceRefs.push(accrualRef);
        if (records.rateHistoryRecord) {
          const rateRef = { sourceId: records.rateHistoryRecord.id, revision: records.rateHistoryRecord.revision };
          bucket.refs.push(rateRef);
          bucket.maintenanceRefs.push(rateRef);
        } else {
          const vehicleRef = { sourceId: vehicle.id, revision: vehicle.revision };
          bucket.refs.push(vehicleRef);
          bucket.maintenanceRefs.push(vehicleRef);
        }
        const distanceRef = { sourceId: distance!.record.id, revision: distance!.record.revision };
        bucket.maintenanceRefs.push(distanceRef);
        if (![bucket.businessKm, bucket.fuelCostPaise, bucket.maintenanceCostPaise].every(Number.isSafeInteger)) {
          throw new Error("breakeven_activity_total_overflow");
        }
        activityByDate.set(date, bucket);
      }
    }

    for (const [date, distance] of distanceByDate) {
      if (distance.complete && distance.businessKm > 0 && !accruedOperationalDates.has(date)) {
        completeness.push({ source: "maintenance-accruals", status: "incomplete",
          detail: "Confirmed business distance on " + date + " has no matching immutable Maintenance accrual." });
      }
    }

    if (![...accruedOperationalDates].some(date => date >= from && date <= to) &&
        ![...distanceByDate.values()].some(distance => distance.complete && distance.businessKm > 0) &&
        ![...activityByDate.values()].some(activity => activity.activeDrivingDay)) {
      completeness[3] = { source: "maintenance-accruals", status: "unavailable",
        detail: "No committed daily business-kilometre maintenance accruals exist in the selected period." };
    }

    const dailyActivity: FullCostBreakevenSourceActivityV1[] = [...activityByDate].map(([date, value]) => ({
      date, businessKm: value.businessKm, activeDrivingDay: value.activeDrivingDay,
      fuelCostPaise: value.fuelCostPaise, maintenanceCostPaise: value.maintenanceCostPaise,
      distanceSourceId: value.refs.map(ref => ref.sourceId).sort().join("|"),
      distanceSourceRevision: Math.max(1, ...value.refs.map(ref => ref.revision)),
      sourceRefs: value.refs,
      fuelSourceRefs: value.fuelRefs,
      maintenanceSourceRefs: value.maintenanceRefs,
    }));

    const datedCosts: BreakevenDailyCostV1[] = [];
    const expenseById = new Map(expenses.map(record => [record.id, record]));
    const tripFinancialById = new Map(tripFinancialRecords.map(record => [record.id, record]));
    const shadowedTripDuplicateExpenseIds = new Set<string>();
    const withheldTripLinkedExpenseIds = new Set<string>();
    const withheldLegacyTollParkingExpenseIds = new Set<string>();
    for (const expense of expenses) {
      if (expense.data.sourceKind === "miscellaneous" &&
          /\b(tolls?|parking)\b/i.test(expense.data.category ?? "") &&
          !expense.data.tripExpenseTreatment) {
        withheldLegacyTollParkingExpenseIds.add(expense.id);
        completeness.push({
          source: "business-expenses", status: "review-required",
          detail: "Legacy toll/parking expense " + expense.id +
            " has no explicit standalone or trip-closeout treatment and was withheld.",
        });
      }
    }
    for (const expense of expenses) {
      const linkedTripId = expense.data.tripFinancialSourceId;
      if (!linkedTripId) continue;
      const linkedTrip = tripFinancialById.get(linkedTripId);
      const tripData = linkedTrip?.data;
      const expectedLinkedAmount = tripData?.kind === "completed_ride_financials"
        ? expense.data.tripFinancialComponent === "toll"
          ? (tripData.tollPayer === "driver" ? tripData.tollPaise ?? 0 : 0)
          : expense.data.tripFinancialComponent === "parking"
            ? (tripData.parkingPayer === "driver" ? tripData.parkingPaise ?? 0 : 0)
            : expense.data.tripFinancialComponent === "combined"
              ? (tripData.tollPayer === "driver" ? tripData.tollPaise ?? 0 : 0) +
                (tripData.parkingPayer === "driver" ? tripData.parkingPaise ?? 0 : 0)
              : 0
        : 0;
      const original = expense.data.effect === "reversal"
        ? expenseById.get(expense.data.reversesSourceId ?? "") : undefined;
      const linkedDate = tripData?.kind === "completed_ride_financials"
        ? tripData.tripContext?.operationalDate : undefined;
      const originalMatches = expense.data.effect === "charge" ||
        (original?.data.kind === "business_expense" && original.data.effect === "charge" &&
          original.data.tripExpenseTreatment === "already-in-trip-closeout" &&
          original.data.tripFinancialSourceId === linkedTripId &&
          original.data.tripFinancialComponent === expense.data.tripFinancialComponent &&
          original.data.amountPaise === expense.data.amountPaise &&
          original.data.businessDate === linkedDate);
      const validLink = expense.data.sourceKind === "miscellaneous" &&
        expense.data.tripExpenseTreatment === "already-in-trip-closeout" &&
        tripData?.kind === "completed_ride_financials" && tripData.status === "submitted" &&
        Number.isSafeInteger(expectedLinkedAmount) && expectedLinkedAmount > 0 &&
        expense.data.amountPaise === expectedLinkedAmount && originalMatches &&
        (expense.data.effect === "reversal" || expense.data.businessDate === linkedDate);
      if (validLink) shadowedTripDuplicateExpenseIds.add(expense.id);
      else {
        withheldTripLinkedExpenseIds.add(expense.id);
        completeness.push({
        source: "business-expenses", status: "review-required",
        detail: "Miscellaneous expense " + expense.id +
          " has an invalid trip-financial duplicate link and was withheld.",
        });
      }
    }
    const expenseKinds = [
      { field: "platformFeesPaise", sourceKind: "platform_fee", kind: "platform-fee" },
      { field: "trafficChallansPaise", sourceKind: "traffic_challan", kind: "traffic-challan" },
      { field: "miscellaneousPaise", sourceKind: "miscellaneous", kind: "miscellaneous" },
    ] as const;
    for (const daily of dailyExpenseOutputs) {
      for (const category of expenseKinds) {
        let amountPaise = daily[category.field];
        const refs = daily.sourceIds.flatMap((sourceId, index) => {
          const source = expenseById.get(sourceId);
          return source?.data.sourceKind === category.sourceKind &&
            !shadowedTripDuplicateExpenseIds.has(sourceId) &&
            !withheldTripLinkedExpenseIds.has(sourceId) &&
            !withheldLegacyTollParkingExpenseIds.has(sourceId)
            ? [
                { sourceId, revision: daily.sourceRevisions[index] ?? source.revision },
                ...(correctionRefsBySourceId.get(sourceId) ?? []),
              ]
            : [];
        });
        if (category.sourceKind === "miscellaneous") {
          amountPaise = refs.reduce((sum, ref) => {
            const source = expenseById.get(ref.sourceId)!;
            const sign = source.data.effect === "reversal" ? -1 : 1;
            return sum + sign * source.data.amountPaise;
          }, 0);
        }
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
        sourceRefs: [{ sourceId: record.id, revision: record.revision }],
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

    return Object.freeze({
      businessStartDate: allocationReport.businessStartDate,
      businessSettingsRevision: allocationReport.businessSettingsRevision,
      dailyActivity: Object.freeze(dailyActivity),
      datedCosts: Object.freeze(datedCosts),
      completeness: Object.freeze(completeness),
    });
  }

  async calculate(from: string, to: string): Promise<BreakevenPeriodResultV1> {
    const projection = await this.getSourceProjection(from, to);
    return calculateFullCostBreakevenV1({
      from, to, dailyActivity: projection.dailyActivity,
      datedCosts: projection.datedCosts, completeness: projection.completeness,
    });
  }
}
