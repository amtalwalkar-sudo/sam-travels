import type { ExactRatioV1, FuelIntervalV1, FuelPurchaseV1 } from "./calculations";
import { calculateFuelIntervals } from "./calculations";

function safeAdd(left:number,right:number):number {
  const value=left+right;
  if(!Number.isSafeInteger(value)) throw new Error("business_expense_total_overflow");
  return value;
}
function ratio(numerator:bigint,denominator:bigint):ExactRatioV1 {
  if(numerator<0n||denominator<=0n) throw new Error("business_expense_ratio_invalid");
  return Object.freeze({numerator:numerator.toString(),denominator:denominator.toString()});
}

export type FuelCostRateHistoryEntryV1 = Readonly<{
  calculationVersion: "business-expenses.fuel-cost-rate-history.v1";
  effectiveFrom: string;
  completionBusinessDate: string;
  costPaisePerKm: ExactRatioV1;
  cumulativeSpendPaise: number;
  cumulativeDistanceKm: number;
  intervalEndCheckpointIds: readonly string[];
  sourcePurchaseIds: readonly string[];
  sourceRevisions: readonly number[];
}>;

/** Rebuilds prospective weighted-average fuel cost rates from completed full-tank intervals. */
export function calculateFuelCostRateHistory(
  purchases: readonly FuelPurchaseV1[],
  intervals: readonly FuelIntervalV1[] = calculateFuelIntervals(purchases),
): readonly FuelCostRateHistoryEntryV1[] {
  const byId = new Map(purchases.map(item => [item.id, item]));
  const completed = intervals.filter(item => item.status === "available" && item.endCheckpointId &&
    Number.isSafeInteger(item.distanceKm) && item.distanceKm! > 0 &&
    Number.isSafeInteger(item.spendPaise) && item.spendPaise! > 0)
    .map(item => {
      const closing = byId.get(item.endCheckpointId!);
      if (!closing) throw new Error("fuel_interval_closing_checkpoint_missing");
      return { interval: item, closing };
    }).sort((a,b) => a.closing.occurredAt.localeCompare(b.closing.occurredAt) ||
      a.closing.id.localeCompare(b.closing.id));
  let spend = 0, distance = 0;
  const history: FuelCostRateHistoryEntryV1[] = [];
  for (let index = 0; index < completed.length;) {
    const completionDate = completed[index].closing.businessDate;
    const sameDate = completed.filter(item => item.closing.businessDate === completionDate);
    const endIds: string[] = [], sourceIds = new Set<string>(), revisions = new Map<string, number>();
    for (const item of sameDate) {
      spend = safeAdd(spend, item.interval.spendPaise!);
      distance = safeAdd(distance, item.interval.distanceKm!);
      endIds.push(item.closing.id);
      item.interval.sourcePurchaseIds.forEach((id, i) => {
        sourceIds.add(id);
        revisions.set(id, item.interval.sourceRevisions[i]);
      });
    }
    const effective = new Date(Date.parse(completionDate + "T00:00:00.000Z") + 86_400_000)
      .toISOString().slice(0,10);
    history.push(Object.freeze({
      calculationVersion: "business-expenses.fuel-cost-rate-history.v1",
      effectiveFrom: effective,
      completionBusinessDate: completionDate,
      costPaisePerKm: ratio(BigInt(spend), BigInt(distance)),
      cumulativeSpendPaise: spend,
      cumulativeDistanceKm: distance,
      intervalEndCheckpointIds: Object.freeze(endIds.sort()),
      sourcePurchaseIds: Object.freeze([...sourceIds].sort()),
      sourceRevisions: Object.freeze([...sourceIds].sort().map(id => revisions.get(id)!)),
    }));
    while (index < completed.length && completed[index].closing.businessDate === completionDate) index++;
  }
  return Object.freeze(history);
}

