import {
  assertComplianceRecordV1,
  isComplianceCalendarDate,
  type ComplianceRecordV1,
} from "./records";
import {
  resolveComplianceOverlapReview,
  type ComplianceOverlapReviewStatus,
  type ComplianceOverlapReviewV1,
} from "./overlap-review";

export type ComplianceRecordRef = Readonly<{ id: string; data: ComplianceRecordV1; revision?: number }>;
export type ComplianceGap = Readonly<{ from: string; to: string; days: number }>;
export type ComplianceOverlap = Readonly<{
  firstRecordId: string;
  secondRecordId: string;
  from: string;
  to: string;
  days: number;
}>;
export type PaiseFraction = Readonly<{ numeratorPaise: string; denominator: string }>;

function dayNumber(value: string): number {
  if (!isComplianceCalendarDate(value)) throw new Error("compliance_date_invalid");
  return Date.parse(value + "T00:00:00.000Z") / 86_400_000;
}

function dateFromDayNumber(value: number): string {
  return new Date(value * 86_400_000).toISOString().slice(0, 10);
}

export function inclusiveValidityDays(validFrom: string, validTo: string): number {
  const start = dayNumber(validFrom);
  const end = dayNumber(validTo);
  if (end < start) throw new Error("compliance_validity_period_invalid");
  return end - start + 1;
}

/** Reports gaps and pairwise overlaps without modifying or extending source records. */
export function analyzeComplianceCoverage(
  records: readonly ComplianceRecordRef[],
  vehicleId: string,
  complianceName: string,
): Readonly<{ gaps: readonly ComplianceGap[]; overlaps: readonly ComplianceOverlap[] }> {
  const selected = records.filter(record => {
    assertComplianceRecordV1(record.data);
    return record.data.vehicleId === vehicleId && record.data.complianceName === complianceName;
  }).sort((left, right) =>
    left.data.validFrom.localeCompare(right.data.validFrom) ||
    left.data.validTo.localeCompare(right.data.validTo) ||
    left.id.localeCompare(right.id),
  );

  const overlaps: ComplianceOverlap[] = [];
  for (let left = 0; left < selected.length; left++) {
    for (let right = left + 1; right < selected.length; right++) {
      const from = selected[left].data.validFrom > selected[right].data.validFrom
        ? selected[left].data.validFrom : selected[right].data.validFrom;
      const to = selected[left].data.validTo < selected[right].data.validTo
        ? selected[left].data.validTo : selected[right].data.validTo;
      if (from <= to) overlaps.push({
        firstRecordId: selected[left].id,
        secondRecordId: selected[right].id,
        from,
        to,
        days: inclusiveValidityDays(from, to),
      });
    }
  }

  const gaps: ComplianceGap[] = [];
  if (selected.length > 0) {
    let coveredThrough = dayNumber(selected[0].data.validTo);
    for (const record of selected.slice(1)) {
      const start = dayNumber(record.data.validFrom);
      const end = dayNumber(record.data.validTo);
      if (start > coveredThrough + 1) {
        const from = dateFromDayNumber(coveredThrough + 1);
        const to = dateFromDayNumber(start - 1);
        gaps.push({ from, to, days: start - coveredThrough - 1 });
      }
      coveredThrough = Math.max(coveredThrough, end);
    }
  }
  return Object.freeze({
    gaps: Object.freeze(gaps),
    overlaps: Object.freeze(overlaps),
  });
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a || 1n;
}

function addFractions(left: PaiseFraction, right: PaiseFraction): PaiseFraction {
  const a = BigInt(left.numeratorPaise);
  const b = BigInt(left.denominator);
  const c = BigInt(right.numeratorPaise);
  const d = BigInt(right.denominator);
  const numerator = a * d + c * b;
  const denominator = b * d;
  const divisor = gcd(numerator, denominator);
  return Object.freeze({
    numeratorPaise: (numerator / divisor).toString(),
    denominator: (denominator / divisor).toString(),
  });
}

/**
 * Calculates exact per-record daily costs. If same-name coverage overlaps on
 * this date, withholds the aggregate until that overlap is explicitly resolved.
 */
export function calculateDailyComplianceCost(
  records: readonly ComplianceRecordRef[],
  vehicleId: string,
  businessDate: string,
  overlapReviews: readonly ComplianceOverlapReviewV1[] = [],
): Readonly<{
  status: "available" | "overlap_review_required";
  total: PaiseFraction | null;
  breakdown: readonly Readonly<{ recordId: string; complianceName: string; cost: PaiseFraction }>[];
  overlaps: readonly (ComplianceOverlap & { reviewStatus: ComplianceOverlapReviewStatus })[];
}> {
  dayNumber(businessDate);
  const active = records.filter(record => {
    assertComplianceRecordV1(record.data);
    return record.data.vehicleId === vehicleId &&
      record.data.validFrom <= businessDate && businessDate <= record.data.validTo;
  });
  const breakdown = active.map(record => Object.freeze({
    recordId: record.id,
    complianceName: record.data.complianceName,
    cost: Object.freeze({
      numeratorPaise: String(record.data.totalCostPaise),
      denominator: String(inclusiveValidityDays(record.data.validFrom, record.data.validTo)),
    }),
  }));
  const overlaps: Array<ComplianceOverlap & { reviewStatus: ComplianceOverlapReviewStatus }> = [];
  for (let left = 0; left < active.length; left++) {
    for (let right = left + 1; right < active.length; right++) {
      const a = active[left];
      const b = active[right];
      if (a.data.complianceName !== b.data.complianceName) continue;
      const from = a.data.validFrom > b.data.validFrom ? a.data.validFrom : b.data.validFrom;
      const to = a.data.validTo < b.data.validTo ? a.data.validTo : b.data.validTo;
      const ordered = [
        { recordId: a.id, recordRevision: a.revision },
        { recordId: b.id, recordRevision: b.revision },
      ].sort((x, y) => x.recordId.localeCompare(y.recordId));
      const hasRevisions = ordered.every(item => Number.isSafeInteger(item.recordRevision) &&
        (item.recordRevision as number) > 0);
      const reviewStatus: ComplianceOverlapReviewStatus = hasRevisions
        ? resolveComplianceOverlapReview(
            ordered as [{ recordId: string; recordRevision: number }, { recordId: string; recordRevision: number }],
            from, to, overlapReviews,
          )
        : "unreviewed";
      overlaps.push({
        firstRecordId: ordered[0].recordId,
        secondRecordId: ordered[1].recordId,
        from,
        to,
        days: inclusiveValidityDays(from, to),
        reviewStatus,
      });
    }
  }
  if (overlaps.some(overlap => overlap.reviewStatus !== "confirmed")) return Object.freeze({
    status: "overlap_review_required",
    total: null,
    breakdown: Object.freeze(breakdown),
    overlaps: Object.freeze(overlaps),
  });

  const total = breakdown.reduce<PaiseFraction>(
    (sum, item) => addFractions(sum, item.cost),
    Object.freeze({ numeratorPaise: "0", denominator: "1" }),
  );
  return Object.freeze({
    status: "available",
    total,
    breakdown: Object.freeze(breakdown),
    overlaps: Object.freeze(overlaps),
  });
}
