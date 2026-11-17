import type { PerformanceCalculationResultV1, PerformanceCostKindV1 } from "../../../domain/src/performance-calculation-v1";
import type { PerformanceScreenLoadResultV1 } from "../application/performance-screen-controller";

export type PerformanceScreenContextV1 = Readonly<{
  loadPeriod: (from: string, to: string) => Promise<PerformanceScreenLoadResultV1>;
}>;

export const CATEGORY_LABELS: Readonly<Record<PerformanceCostKindV1, string>> = {
  fuel: "Fuel", maintenance: "Maintenance", emi: "Loan EMI", compliance: "Compliance",
  "platform-fee": "Platform fees", "traffic-challan": "Traffic challans", "toll-parking": "Tolls & parking",
  miscellaneous: "Miscellaneous", "pre-business-manual-recovery": "Pre-business cost recovery",
};

export type PerformanceInsightDefinition = Readonly<{ label: string; formula: string }>;
export const INSIGHT_DEFINITIONS: Readonly<Record<string, PerformanceInsightDefinition>> = {
  "period-revenue": { label: "Period revenue", formula: "Verified gross completed fares + verified cancellation fees, summed over the selected operational dates. Unverified revenue is excluded." },
  "period-cost": { label: "Eligible period costs", formula: "Sum of verified operating costs, separately allocated EMI and Compliance, and manual pre-business recovery. Costs are not duplicated across source modules." },
  "period-net": { label: "Period net position", formula: "Selected-period revenue − selected-period full eligible costs." },
  "monthly-target": { label: "Driver Target for selected period", formula: "The fixed monthly rupee surplus configured in Admin, prorated by the selected calendar days in each month. Month-to-date achievement = selected-period net profit ÷ the prorated target for those dates." },
  "business-distance": { label: "Business distance", formula: "Sum of confirmed allocated daily business kilometres in the selected period. Unallocated distance is not included." },
  "fuel-per-km": { label: "Fuel cost per business km", formula: "Verified fuel cost in the selected period ÷ confirmed allocated business kilometres. It is unavailable when distance is zero or not confirmed." },
  "active-driving-days": { label: "Active driving days", formula: "Count only operational dates with an authoritative Work/Online shift and at least one submitted completed-ride record whose immutable trip context names that exact shift and operational date. A shift without a ride and a ride without its matching shift do not qualify." },
  "average-km-active-day": { label: "Average business kilometres per active driving day", formula: "Confirmed allocated business kilometres in the selected period ÷ qualifying active driving-day count. Personal kilometres are excluded; incomplete Work distance remains flagged for review." },
  "lifetime-revenue": { label: "Lifetime revenue", formula: "Verified revenue summed from the actual business start date through the selected period end." },
  "lifetime-cost": { label: "Lifetime eligible costs", formula: "Verified eligible costs and recovery allocations summed from actual business start date through selected period end." },
  "lifetime-net": { label: "Lifetime net", formula: "Lifetime verified revenue − lifetime eligible costs." },
  "lifetime-target": { label: "Accumulated target", formula: "Configured monthly Driver Target prorated by calendar days from the Business Start Date through the selected period end, summing each calendar month independently." },
  "lifetime-target-position": { label: "Lifetime target position", formula: "Lifetime net profit − accumulated target. Positive means ahead of the accumulated target; negative means shortfall." },
  "target-month-count": { label: "Target months counted", formula: "Calendar month count from business start month through selected period-to month, inclusive." },
  "daily-revenue": { label: "Daily revenue", formula: "Verified completed-ride gross fare + verified cancellation fees for this operational date." },
  "daily-cost": { label: "Daily eligible costs", formula: "All verified eligible costs and allocated recoveries recorded for this operational date; EMI and Compliance remain separate categories." },
  "daily-net": { label: "Daily net position", formula: "Daily verified revenue − daily eligible costs." },
  "daily-completeness": { label: "Daily record completeness", formula: "A review status derived from the calculation's source completeness checks. Provisional or incomplete source records are not treated as verified totals." },
  "monthly-revenue": { label: "Monthly revenue", formula: "Verified revenue aggregated for the dates included in the selected period for this calendar month." },
  "monthly-cost": { label: "Monthly eligible costs", formula: "Eligible costs aggregated for the dates included in the selected period for this calendar month." },
  "monthly-net": { label: "Monthly net position", formula: "Monthly aggregate revenue − monthly aggregate eligible costs." },
  "monthly-target-position": { label: "Monthly target position", formula: "Net position for the included dates in the month − the configured monthly Driver Target prorated by the included calendar days in that month." },
  "recovery-allocation": { label: "Pre-business recovery allocation", formula: "Manual pre-business cost entries are allocated over the documented 18-month recovery schedule. EMI and Compliance carry-forward is included once in canonical daily allocations from the Business Start Date allocation service." },
  "recovery-source-revision": { label: "Recovery source revision", formula: "The immutable revision identifier for the manual pre-business cost record used in this recovery allocation." },
};

export function localDateOffset(days: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()).split("-");
  const [year, month, day] = parts.map(Number);
  return new Date(Date.UTC(year, month - 1, day - days)).toISOString().slice(0, 10);
}
export function operationalToday(): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", hour: "2-digit", hourCycle: "h23",
  }).format(new Date()));
  return hour < 4 ? localDateOffset(-1) : localDateOffset(0);
}
export function offsetDate(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
export function money(paise: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR",
    minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(paise / 100);
}
export function signedMoney(paise: number): string {
  return (paise > 0 ? "+" : paise < 0 ? "−" : "") + money(Math.abs(paise));
}
export function aggregateCosts(result: PerformanceCalculationResultV1) {
  const totals = Object.keys(CATEGORY_LABELS).reduce((map, key) => {
    map[key as PerformanceCostKindV1] = 0; return map;
  }, {} as Record<PerformanceCostKindV1, number>);
  for (const row of result.daily) {
    for (const key of Object.keys(CATEGORY_LABELS) as PerformanceCostKindV1[]) totals[key] += row.costs[key];
  }
  return (Object.keys(CATEGORY_LABELS) as PerformanceCostKindV1[])
    .map(key => ({ key, label: CATEGORY_LABELS[key], amount: totals[key] }))
    .filter(row => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}
export function monthlyTotals(result: PerformanceCalculationResultV1) {
  const totals = new Map<string, { revenue: number; cost: number; profit: number }>();
  for (const row of result.daily) {
    const month = row.date.slice(0, 7);
    const item = totals.get(month) ?? { revenue: 0, cost: 0, profit: 0 };
    item.revenue += row.grossRevenuePaise; item.cost += row.totalCostPaise; item.profit += row.profitPaise;
    totals.set(month, item);
  }
  return [...totals].map(([month, item]) => {
    const [year, monthNumber] = month.split("-").map(Number);
    const monthDays = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const includedDays = result.daily.filter(row => row.date.startsWith(month + "-")).length;
    const target = Number(
      (BigInt(result.period.monthlyDriverTargetPaise) * BigInt(includedDays) * 2n + BigInt(monthDays)) /
      (2n * BigInt(monthDays)),
    );
    return { month, ...item, target, targetPosition: item.profit - target };
  });
}
