/** Pure cumulative Driver Target Passbook projection. */
export type PerformancePassbookV1 = Readonly<{
  from: string;
  to: string;
  expectedCumulativeTargetPaise: number;
  actualEligibleSurplusPaise: number;
  positionPaise: number;
  remainingTargetPaise: number;
  daily: readonly Readonly<{
    date: string;
    expectedCumulativeTargetPaise: number;
    actualDailySurplusPaise: number;
    actualCumulativeSurplusPaise: number;
    positionPaise: number;
    remainingTargetPaise: number;
  }>[];
}>;

const DAY_MS = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function dayNumber(value: string): number {
  if (!DATE.test(value)) throw new Error("performance_date_invalid");
  const time = Date.parse(value + "T00:00:00.000Z");
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) {
    throw new Error("performance_date_invalid");
  }
  return time / DAY_MS;
}

function dateAt(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function add(a: number, b: number): number {
  const value = a + b;
  if (!Number.isSafeInteger(value)) throw new Error("performance_amount_overflow");
  return value;
}

/** Calendar-day proration shared by selected-period, lifetime and Passbook targets. */
export function proratedDriverTargetForRangeV1(monthlyTargetPaise: number, from: string, to: string): number {
  if (!Number.isSafeInteger(monthlyTargetPaise) || monthlyTargetPaise < 0) {
    throw new Error("performance_monthly_target_invalid");
  }
  if (to < from) return 0;
  let total = 0;
  let cursor = from;
  while (cursor <= to) {
    const [year, month] = cursor.split("-").map(Number);
    const monthDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const segmentEnd = monthEnd < to ? monthEnd : to;
    const segmentDays = dayNumber(segmentEnd) - dayNumber(cursor) + 1;
    const amount = Number(
      (BigInt(monthlyTargetPaise) * BigInt(segmentDays) * 2n + BigInt(monthDays)) /
      (2n * BigInt(monthDays)),
    );
    total = add(total, amount);
    cursor = dateAt(dayNumber(segmentEnd) + 1);
  }
  return total;
}

/** Builds a cumulative ledger; later surplus naturally recovers earlier shortfall. */
export function buildPerformancePassbookV1(input: {
  businessStartDate: string;
  periodTo: string;
  monthlyDriverTargetPaise: number;
  daily: readonly Readonly<{ date: string; profitPaise: number }>[];
}): PerformancePassbookV1 {
  dayNumber(input.businessStartDate);
  dayNumber(input.periodTo);
  let actualCumulativeSurplusPaise = 0;
  const daily = input.daily.map(row => {
    dayNumber(row.date);
    if (!Number.isSafeInteger(row.profitPaise)) throw new Error("performance_passbook_surplus_invalid");
    actualCumulativeSurplusPaise = add(actualCumulativeSurplusPaise, row.profitPaise);
    const expectedCumulativeTargetPaise = proratedDriverTargetForRangeV1(
      input.monthlyDriverTargetPaise, input.businessStartDate, row.date,
    );
    const positionPaise = actualCumulativeSurplusPaise - expectedCumulativeTargetPaise;
    return Object.freeze({
      date: row.date,
      expectedCumulativeTargetPaise,
      actualDailySurplusPaise: row.profitPaise,
      actualCumulativeSurplusPaise,
      positionPaise,
      remainingTargetPaise: Math.max(0, -positionPaise),
    });
  });
  const expectedCumulativeTargetPaise = proratedDriverTargetForRangeV1(
    input.monthlyDriverTargetPaise, input.businessStartDate, input.periodTo,
  );
  const positionPaise = actualCumulativeSurplusPaise - expectedCumulativeTargetPaise;
  return Object.freeze({
    from: input.businessStartDate,
    to: input.periodTo,
    expectedCumulativeTargetPaise,
    actualEligibleSurplusPaise: actualCumulativeSurplusPaise,
    positionPaise,
    remainingTargetPaise: Math.max(0, -positionPaise),
    daily: Object.freeze(daily),
  });
}
