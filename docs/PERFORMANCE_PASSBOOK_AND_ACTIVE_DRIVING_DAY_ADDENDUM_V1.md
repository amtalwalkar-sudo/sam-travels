# Performance Passbook and Active Driving Day — Product Owner Addendum v1

**Approved:** 2026-11-17  
**Applies to:** Performance / Breakeven and Driver Target Calculation Contract v1.9  
**Authority:** Explicit product-owner confirmations in the implementation discussion. This addendum supplements the frozen contract; it does not rewrite it.

## 1. Driver Target Passbook

The Driver Target Passbook is cumulative from the actual Business Start Date through the selected reporting date.

- Expected cumulative progress is the configured monthly surplus target prorated by the actual calendar days elapsed in each month, using the existing target rounding convention.
- Actual eligible surplus is cumulative verified gross completed-ride fares and cancellation fees less the same verified, allocated full-cost expenses used by Performance.
- Paid platform pass/commission, paid challans, EMI, Compliance, fuel, Maintenance accrual and other eligible full-cost categories are treated exactly once according to their existing source contracts.
- Cumulative position is actual eligible surplus minus expected cumulative target. Positive means ahead; negative means behind.
- Remaining target is max(0, expected cumulative target minus actual eligible surplus).
- Earlier shortfalls remain cumulative and can be recovered by later surplus. Daily results are not independent pass/fail outcomes.
- The Passbook is read-only and derived. It does not create or mutate source income, expense, trip or payment records.
- Daily history must expose expected cumulative progress, daily eligible surplus, actual cumulative surplus, ahead/behind position and remaining target, with source provenance inherited from the underlying Performance calculation.

## 2. Active driving day

For historical active-driving-day counts and distance averages, a date qualifies only when both conditions are true on the same Asia/Kolkata operational date:

1. The driver has an authoritative Online/Work shift for that operational date.
2. At least one ride is recorded against that exact shift and operational date.

The shift identity and ride-to-shift assignment must come from immutable Work/Trip source facts. Use the existing 04:00 operational-day boundary and immutable trip-creation shift context. Do not infer activity from positive odometer movement, fuel purchase, elapsed Online time alone, GPS displacement, or a manually entered expense.

Distance averages use only confirmed allocated business kilometres, exclude personal kilometres, and divide by qualifying active-driving days. A qualifying active day with zero confirmed business kilometres remains a zero-kilometre active day; an incomplete/unallocated distance source remains review-required and must not be silently represented as a complete zero.

## 3. Maintenance correction boundary

Maintenance expense corrections remain append-only historical corrections. A corrected source must be reprojected from its original record plus the complete correction chain, with correction IDs/revisions included in provenance. Restore must preserve and validate both original Maintenance expense records and their correction chains; recalculation after restore must reproduce the same projected values and provenance.

A Maintenance expense correction must not rewrite immutable Work odometer facts, daily business-kilometre projections, or immutable daily Maintenance accrual snapshots.

**Cost-inclusion boundary requiring product-owner resolution:** the frozen Performance contract currently defines Performance Maintenance cost as confirmed business kilometres multiplied by the effective Admin Maintenance rate. It does not explicitly include Maintenance visit/repair expense records as a second cost category. Therefore this addendum does not silently add those visit/repair amounts on top of the per-kilometre accrual. The correction chain can be preserved and its owner read model restated, but whether those expense amounts themselves enter Full-cost breakeven requires a separate explicit accounting decision.

## 4. Acceptance evidence

- Passbook cumulative totals reconcile exactly to Performance lifetime profit and target for the same end date.
- Passbook daily cumulative rows reconcile to the preceding row plus the current day's eligible surplus and target increment.
- A later surplus can recover a prior shortfall; remaining target never falls below zero.
- Active-driving-day tests cover Online shift with no ride (not active), ride without Online shift (not active), matching shift+ride (active), wrong-shift ride (not active), 04:00 crossing, cancellation/completed ride, and incomplete legacy context.
- PWA and Android Room must consume the same deterministic source facts and assert identical active-day counts and business-kilometre averages.
- Maintenance correction restore tests preserve correction chain IDs/revisions and reproduce the same corrected projection after restore; daily accrual snapshots remain immutable.
- Full Web, Android and Integrated CI must pass on the exact PR head. Physical-device acceptance remains separate.
