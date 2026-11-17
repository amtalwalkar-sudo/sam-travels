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

## 5. Implementation evidence record — 2026-11-17

The approved behaviours were implemented by PR #97, which has since merged as `a15acb791a2e452a3bb84e271ab7b0e27c73500c`, and have the following automated evidence:

- Passbook arithmetic, source provenance, cumulative shortfall recovery, leap-day/month-end recovery boundaries: `tests/performance-calculation-v1.test.ts`.
- Active-day qualification, wrong-shift/legacy context handling, 04:00 operational-date retention, zero-kilometre active days and unallocated distance review: `tests/full-cost-breakeven-contract-boundaries.test.ts` and `tests/full-cost-breakeven-service.test.ts`.
- Rendered Performance Passbook and daily/weekly/monthly distance presentation: `scripts/performance-screen-browser-acceptance.mjs`.
- Room-backed shared-fixture parity: `android/app/src/androidTest/java/in/samtravels/app/PerformanceActiveDrivingDayRoomParityTest.kt`.
- Maintenance correction-chain restore and immutable Work/accrual boundary: `tests/maintenance-correction-indexeddb.test.ts` and `android/app/src/androidTest/java/in/samtravels/app/NativeMaintenanceBackupRoomTest.kt`.

These tests establish automated implementation evidence, not physical-device acceptance or final visual sign-off.

## 6. Exact-head CI and acceptance status — 2026-11-17

- Exact PR #97 head: `0f198be0d796a67521ea5d6763bac3d949f33718`.
- [Workflow run #44095766482](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/44095766482): Architecture, Web, Android and Integrated regression all passed.
- Android emulator-backed Room/workflow/backup reliability and debug-signed phone-test APK publication passed. Physical phone acceptance is not claimed and remains deferred to the agreed final testing stage.
- Production geocoder verification was skipped by workflow configuration; no live geocoder claim is made.
- At the time of this pre-merge evidence record, PR #97 remained draft and unmerged. It was subsequently merged; this line is retained as historical status.


## 7. Post-merge verification status — 2026-11-17

- PR #97 is merged as `a15acb791a2e452a3bb84e271ab7b0e27c73500c`; PR #96's documentation merge leaves `main` at `b54181330e4e89d1f25b2e1e56a40b8264f19014` at the start of the final software-quality pass.
- The preceding main push on `a15acb7` passed Architecture, Web, Android, Production geocoder and Integrated regression in [run #44107617073](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/44107617073).
- The later `b541813` main run [#44110381218](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/44110381218) passed Architecture and Web but failed Android in the Maintenance correction driver-form acceptance. Integrated regression failed downstream; geocoder was skipped because Android failed. The Android test synchronization and architecture-size issues are being corrected in draft [PR #98](https://github.com/amtalwalkar-sudo/sam-travels/pull/98); do not mark the final-main gate green until its exact-head and post-merge runs pass.
- A deployed production-data reconciliation and final visual-composition approval remain separate. Physical-phone acceptance remains explicitly deferred.
