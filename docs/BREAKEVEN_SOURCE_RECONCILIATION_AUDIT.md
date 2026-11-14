# Breakeven Upstream Source Reconciliation Audit

**Audit date:** 2026-11-14  
**Repository:** `amtalwalkar-sudo/sam-travels`  
**Audited implementation baseline:** `18b63e88c7fc9b0988a2a0938994c1a7d4485cc4` on `fix/breakeven-upstream-source-conformance` (implementation changes are present in draft PR #82; CI verification is still pending)  
**Purpose:** Compare the five previously discussed and approved upstream source areas against their normative contracts and actual implementation.  
**Result:** Product decisions recovered and documented. Several upstream implementation mismatches remain. **Breakeven runtime implementation must not start until the blocking findings below are corrected and re-audited.**

This is an evidence snapshot, not a runtime change. It does not authorize or claim implementation of the breakeven engine, Driver Target, Target Passbook, predictive breakeven, or Performance presentation.

## 1. Audit method and authority

The audit compared the source contracts and implementation present at the named baseline. The normative ownership map is:

| Source area | Normative owner |
|---|---|
| Compliance records, validity, renewals, gaps and overlap review | `docs/ADMIN_CAPABILITY_CONTRACTS.md`, Compliance section |
| Compliance and whole-EMI daily/monthly/yearly allocation | `docs/BUSINESS_START_DATE_COST_ALLOCATION_CONTRACT.md` |
| EMI mathematics and original schedule | `docs/FINANCE_LOAN_CALCULATION_CONTRACT.md` |
| Fixed-EMI/shorter-tenure prepayment | `docs/FINANCE_LOAN_PREPAYMENT_CONTRACT.md` |
| Settlement and loan closure | `docs/FINANCE_LOAN_SETTLEMENT_AND_CLOSURE_CONTRACT.md` |
| Trip, vehicle, driver and operational-date snapshots | `docs/WORK_DRIVER_TRIP_SNAPSHOT_INTEGRATION_CONTRACT.md` |
| Fuel purchases, expense source entries and interval measurements | `docs/FUEL_ENTRY_AND_BUSINESS_EXPENSE_CALCULATION_CONTRACT.md` |
| Confirmed odometer distance and daily business-kilometre projection | `docs/WORK_SHIFT_ODOMETER_AND_DAILY_DISTANCE_CONTRACT.md` |
| Final cost/earnings aggregation and exclusions | `docs/BREAKEVEN_AND_DRIVER_TARGET_CALCULATION_CONTRACT.md` |

The source-owner contracts take precedence over legacy summary fields, old calculation outputs, and historical PR descriptions. The current audit does not reinterpret those approved decisions.

## 2. Compliance — decision recovery and implementation result

**Decision status: recovered, documented and implementation-adjusted. Date-range overlap withholding is implemented; final CI verification remains pending.**

Approved rules:
- `validFrom` and `validTo` are actual inclusive Asia/Kolkata calendar dates. The total record cost is fixed across that record's validity period.
- A renewal creates a new linked Compliance record with its own actual dates and amount. The prior record and its history remain unchanged.
- Early renewal overlap is allowed and reported as an exact intersection. Late renewal leaves an actual uncovered gap; gap analysis never fabricates coverage.
- An overlap requires an append-only decision tied to the exact source IDs and revisions. A stale or unresolved decision does not count as confirmation.
- The source cost is allocated over inclusive validity days. Business Start Date carry-forward redistributes the same complete source amount over remaining eligible dates without changing source dates or extending expiry.

Evidence:
- `packages/features/compliance/analysis.ts`: inclusive validity-day calculation, gap detection, pairwise overlap detection, and exact per-record daily fractions.
- `packages/features/compliance/overlap-review.ts`: append-only review chain, exact source pair/date/revision matching, and stale/fork fail-closed behaviour.
- `packages/application/src/compliance-analysis-service.ts`: owner-service read model and correction projection.
- `packages/domain/src/business-start-date-cost-allocation.ts`: inclusive-day allocation, Business Start Date carry-forward, deterministic paise distribution, and withholding for unresolved overlap state.
- `tests/business-start-date-cost-allocation-service.test.ts`: renewal period/cost preservation and unresolved-overlap coverage.

**Implementation correction:** `BusinessStartDateCostAllocationService.getReport()` now creates the full per-record daily allocation, then partitions it by exact unresolved/rejected/stale overlap dates. Only those date portions are withheld; eligible non-overlap dates remain allocated. A confirmed review allows every distinct source record's actual daily contribution. Regression coverage checks that non-overlap dates survive an unresolved partial overlap.

**Disposition:** Compliance product decisions are closed. The date-range correction is implemented in PR #82; final CI verification remains pending.

## 3. EMI — schedule, prepayment and closure

**Decision status: recovered, documented and implementation-adjusted. The reporting projection now composes schedule history and applies the settlement cutoff; final CI verification remains pending.**

Approved rules:
- Original EMI schedule is anchored to the loan's actual first EMI date. Due dates are monthly, on the first of each calendar month.
- Each EMI allocation period starts on that instalment's due date and ends the day before the next due date; the final scheduled period ends on the last day of that calendar month.
- Use the complete scheduled EMI amount; do not split principal and interest for business-cost allocation.
- The only approved prepayment mode is **Reduce Tenure**. The regular EMI amount and due dates remain unchanged. Prepayment reduces principal, the final adjusted instalment may be smaller, and the final due date moves earlier.
- A prepayment between EMI dates is effective after all instalments due through the prepayment business date have been fully paid and allocated, and before the next unpaid instalment. The already-open allocation period remains attributed to the prior schedule through the day before that next due date; the revised schedule supplies future instalments from the next unpaid due date.
- Settlement/closure is permitted only on a scheduled EMI due date after all instalments due through that date are fully paid and allocated. Settlement is the closing principal after that date's EMI. The settlement entry and Loan closed state commit atomically. The closure-date EMI allocation period is truncated to that date inclusive; no later-date EMI allocation is emitted.

Evidence:
- `packages/application/src/finance-loan-prepayment-service.ts`: rejects any mode other than `reduce_tenure`; checks all EMIs due through the prepayment business date are fully allocated; computes principal after those instalments; records the effective date and remaining due dates; creates a new schedule revision.
- `packages/features/finance/loan-prepayment-calculation.ts`: fixed-EMI schedule generation and earlier final due date.
- `packages/application/src/finance-loan-settlement-service.ts`: restricts settlement to a scheduled EMI due date, verifies all due EMIs are fully paid, takes closing principal after the settlement-date EMI, and atomically writes the settlement ledger entry plus Loan closed state.
- `packages/domain/src/business-start-date-cost-allocation.ts`: implements due-date-to-next-due-date-minus-one periods and final-month-end period semantics.

**Implementation correction A — schedule history:** `BusinessStartDateCostAllocationService.getReport()` now composes immutable schedule versions into one timeline. Each outgoing version contributes only rows before the next version's first unpaid due date; the revised schedule contributes from that due date onward. `allocateScheduledEmisV1` accepts row-level schedule-version provenance, preserving the outgoing open period and one complete pre-business carry-forward across the composite horizon.

**Implementation correction B — settlement cutoff:** the allocation input now accepts an inclusive `allocationEndDate`. The service excludes later scheduled rows and caps the final period at the settlement business date. The former test that expected post-closure allocations has been replaced with a regression asserting no future EMI source allocation and retention of the pre-business historical EMI amount.

**Disposition:** Finance schedule and transaction rules are closed. Both reporting-allocation corrections are implemented in PR #82; final CI verification remains pending.

## 4. Earnings and expenses — authoritative date and attribution

**Decision status: recovered, documented and implementation-adjusted. Paid-only expense recognition, vehicle attribution and cancellation trip snapshots are implemented; final CI verification remains pending.**

Approved date/attribution rules:
- Completed-ride fare is gross and entered by the driver after the ride. It inherits the immutable trip context captured at trip creation: trip ID, vehicle, driver/assignment, shift and Asia/Kolkata operational date. Submission time is audit metadata, not a replacement business date.
- Cancellation fee is linked to its cancellation event/trip and inherits that same immutable trip context. No separate cash/platform or payout-received workflow exists.
- Parking/toll inherits the trip's immutable context and date. The existing form's inclusion/payer control decides whether it is already part of the fare/customer charge or is a separate driver expense. No double recognition.
- Platform pass/commission is a separate expense only after actual payment and driver entry, on its paid business date. No commission engine, settlement matching or payout reconciliation.
- Challans are recognized only when paid and entered, on the actual paid business date. If an unpaid challan source is retained, its businessDate must be corrected to the actual paid date before recognition; issue date/reference remains descriptive metadata and never accrues an unpaid charge.
- Miscellaneous business expenses use the explicit business date on the source entry. Creation/submission timestamps are audit metadata.
- Initial operating scope is one car and one driver.

Evidence:
- `docs/WORK_DRIVER_TRIP_SNAPSHOT_INTEGRATION_CONTRACT.md` defines immutable trip context with `vehicleId`, `driverId`, `assignmentId`, `shiftId` and `operationalDate`.
- Completed-ride financial obligations already receive `tripContext` at the event boundary: `packages/storage-browser/src/driver-workflow.ts` writes it on completed-ride closeout, and Android `DriverWorkflowStore.kt` passes it to `DriverTripFinancialStore` / `DriverCancellationFeeStore.createPendingCompletedRideObligation`. The current TypeScript `CompletedTripFinancialObligation` type does not declare that stored snapshot, so the typed public model must be brought into line.
- Cancellation-fee obligations do **not** currently capture the same context: browser `driver-workflow.ts` creates the obligation with tripId, cancellationEventId and createdAt only; Android `DriverWorkflowStore.kt` calls `DriverCancellationFeeStore.createPendingObligation` without tripContext, and that store writes no context. Because the active trip context is cleared on cancellation, this is a real missing-snapshot path.
- `packages/application/src/trip-financial-service.ts` exposes cancellation submission and completed-ride submission operations but no stable public query returning both submitted financial record types with their immutable trip context. The new query must preserve source IDs/revisions and reject legacy cancellation records whose context cannot be recovered from an authoritative immutable trip-create event.
- `packages/features/business-expenses/calculations.ts` and `packages/application/src/business-expenses-service.ts`: expense entries have an explicit `businessDate`; challans require a vehicle and paymentStatus, while platform-fee entries are defined as already-paid events with businessDate as the actual paid date. The source model does not need a separate `paidAt` field for platform fees.
- The current trip form/domain uses `tollPayer` and `parkingPayer` values. The domain summary adds customer-paid amounts to customer charge and driver-paid amounts to driver expenses; retain the existing payer semantics and ensure the breakeven adapter consumes only the separate driver expense once.

**Implementation correction A — paid-only challans:** `calculateDailyBusinessExpenses()` now leaves unpaid challans visible in source records but skips them in recognized daily totals. Paid challans are recognized on their paid business date. Regression tests cover unpaid and paid entries separately.

**Implementation correction B — gross fare and separate platform charges:** the source validator rejects `alreadyNettedFromIncome: true`; `BusinessExpensesService` requires vehicle attribution and rejects legacy netted treatment; the daily aggregator always recognizes the paid platform fee separately. Tests cover the paid source and fail-closed legacy state.

**Paid platform fee event semantics:** the source model intentionally has no unpaid platform-fee state. A platform-fee row represents an already-paid transaction and its `businessDate` is the actual payment date; no separate pending/unpaid accrual state should be introduced. The source-entry command/form must preserve this event-only meaning and must not substitute `createdAt`/`submittedAt` for the paid business date. The absence of a `paymentStatus` field is therefore not a defect by itself.

**Implementation correction C — platform vehicle attribution:** paid platform charges now require a vehicle ID and validate it against the Vehicle owner.

**Implementation correction D — cancellation attribution and public query:** browser and Android cancellation closeout now copy the immutable tripContext captured at trip creation into the cancellation-fee obligation. The Android store requires the context rather than silently omitting it. `TripFinancialService.submittedTripFinancialRecords()` exposes both submitted cancellation-fee and completed-ride financial records; legacy records without context remain explicitly unresolved rather than being attributed from current selection. Browser, Android and service tests cover snapshot preservation and the shared read model.

**Additional boundary:** `calculateDailyBusinessExpenses()` still exposes `normalOperatingExpensePaise` and `fullCostExpensePaise`. These are legacy source-summary outputs, not two breakeven metrics. The breakeven product contract permits exactly one full-cost breakeven. No consumer may register, label, or present the legacy normal/operating subtotal as an operating-breakeven calculation.

**Disposition:** Expense and trip source adapters require upstream fixes before breakeven implementation.

## 5. Fuel — completed intervals and prospective rates

**Decision status: recovered, documented and implementation-adjusted. Weighted prospective rate history is now derived by the fuel owner and exposed to application consumers; final CI verification remains pending.**

Approved rules:
- Fuel purchase date is the actual Asia/Kolkata calendar date derived from the purchase timestamp.
- A full refill is a checkpoint. The first accepted full refill establishes the baseline; the next accepted full refill closes the interval.
- The interval distance is closing odometer minus opening odometer and must be positive and confirmed.
- Partial refills are not checkpoints, but all partial refills after the baseline and before/including the closing full refill contribute their actual quantity and spend. Include the closing full refill; exclude the opening baseline full refill from consumption in that interval.
- Invalid, ambiguous, out-of-order or non-increasing sequences are not guessed. An interval without a closing full refill remains incomplete and produces no rate.
- Weighted fuel cost/km is total included spend divided by total confirmed kilometres across all valid completed intervals.
- A new effective rate begins the calendar day after the interval completion date. Earlier dates retain the prior rate.
- Daily breakeven fuel cost is confirmed business kilometres multiplied by the effective weighted-average rate. Fuel purchase spend must not be added again as a separate daily breakeven expense.

Evidence:
- `packages/features/business-expenses/calculations.ts` pairs consecutive full-tank checkpoints per vehicle, orders by purchase timestamp, requires positive odometer distance, flags ambiguous timestamps and invalid sequences, and includes all purchases after the opening checkpoint through and including the closing checkpoint.
- `FuelIntervalV1` exposes per-interval spend, confirmed distance and cost-per-km ratio with source IDs/revisions.
- `FuelPurchaseV1` validates `businessDate` against `occurredAt` in Asia/Kolkata (UTC+05:30).
- `packages/features/business-expenses/fuel-cost-rate-history.ts` now derives a cumulative weighted rate after each completion date, retains exact source IDs/revisions, and sets `effectiveFrom` to the day after interval completion. `BusinessExpensesService.listFuelCostRateHistory()` exposes that deterministic read model.
- `calculateDailyBusinessExpenses()` adds each fuel purchase's spend to the purchase-date `fuelPaise`, `normalOperatingExpensePaise` and `fullCostExpensePaise`. This is valid as a purchase-source summary only; those direct purchase totals must not be consumed as the breakeven fuel consumption cost.

**Implementation correction:** The weighted history is available as a source-owned read model. Legacy daily purchase summaries still represent actual purchase spend for source/accounting views; breakeven must consume confirmed business kilometres multiplied by the effective rate and must never add purchase spend again.

**Disposition:** Full-tank interval eligibility and prospective weighted-rate history are implemented in PR #82. Final CI verification and downstream consumer contract checks remain pending.

## 6. Daily business-kilometre projection and unresolved legacy distance

**Decision status: recovered and documented. The Work/Shift contract is consistent with the approved distance rules.**

Evidence and rules:
- `docs/WORK_SHIFT_ODOMETER_AND_DAILY_DISTANCE_CONTRACT.md` makes Work/Shift the sole authority for confirmed shift odometer readings and business kilometres.
- `packages/storage-browser/src/driver-workflow.ts` and `android/app/src/main/java/in/samtravels/app/WorkDailyBusinessKilometreStore.kt` both append one immutable shift contribution to the vehicle/operational-date projection. They derive the operational date from the outgoing shift start, calculate the odometer delta, retain personal kilometres separately, and expose `totalBusinessKm` plus `unallocatedBusinessKm`.
- Both implementations mark a shift contribution `awaiting_operational_boundary` when a normal shift end crosses 04:00 without rotation. A confirmed `shift_rotate` resolves the outgoing contribution to `allocated`; rotation is rejected during an active trip and uses the same confirmed odometer reading as outgoing end and incoming start.
- `packages/application/src/maintenance-daily-accrual-integration.ts` consumes the authoritative daily projection and fails closed unless the exact rotation contribution is allocated and the day's unallocated total is zero. This demonstrates the existing downstream completeness guard.
- New v2 shift starts/ends require confirmed odometer readings. Business kilometres are end reading minus start reading; personal kilometres between shifts are separately recorded and excluded.
- A 04:00 boundary does not interrupt an active trip. Once the trip reaches a terminal state, the driver confirms one odometer reading; the outgoing shift's complete confirmed distance is assigned to its original operational date and the new shift begins at the same reading.
- Legacy v1 shifts remain readable but are not backfilled with invented odometer readings or kilometres. Fuel must use the same confirmed Work daily-distance authority.
- Regression evidence exists in `tests/driver-workflow-v2.test.ts`, `android/app/src/androidTest/java/in/samtravels/app/DriverWorkflowV2Test.kt`, and `android/app/src/androidTest/java/in/samtravels/app/WorkDailyBusinessKilometreStoreTest.kt` for v2 odometer projection, boundary rotation, personal/business separation and active-trip rotation rejection. A focused Android regression now asserts that a pre-rotation `awaiting_operational_boundary` contribution appears in `unallocatedBusinessKm` and is excluded from `totalBusinessKm`.

No additional product decision is required. The breakeven consumer must use the complete authoritative daily projection and must not substitute GPS endpoint displacement, fare/trip distance, elapsed time, or a manually estimated total.

## 7. Blocking work before breakeven implementation

The following work belongs to the upstream owners and must be completed before breakeven code starts:

1. **Compliance:** date-range overlap withholding is implemented and has service-level regression coverage.
2. **Finance allocation:** composite schedule history and inclusive settlement-date cutoff are implemented with service/domain regression coverage.
3. **Trip financial attribution:** browser and Android cancellation snapshots and a shared submitted-source read model are implemented with PWA, Android and service regression coverage.
4. **Business expenses:** paid-only challan recognition, gross-fare/separate platform-charge handling and mandatory vehicle attribution are implemented with expense-service/calculation tests. Existing trip-financial tests cover independent toll/parking payer selection and customer-charge versus driver-expense semantics.
5. **Fuel:** prospective weighted rate history is implemented in the fuel-owning feature and exposed by the application service, with interval and service tests.
6. **Distance:** the pending/unallocated boundary state now has a focused Android regression; PWA/Android daily projections retain the same allocated/pending model.

**Remaining gate:** run and pass the full architecture, web, Android, integrated regression and required CI checks on the exact final commit; review any failures and update this audit with verified run evidence before authorizing breakeven implementation.

## 8. Explicitly out of scope

This audit does not authorize:
- Breakeven calculation implementation before the blocking upstream work is complete.
- Driver Target or Target Passbook design/implementation before breakeven is reliable.
- Predictive breakeven, a second expense ledger, operating breakeven, payout/settlement reconciliation, refunds/reversals/adjustments, multi-vehicle or multi-driver allocation, or Performance redesign.
- Physical-phone acceptance during this documentation pass; it remains at the end of the overall work.

## 9. Audit disposition

**Product decisions:** recovered and documented in normative source contracts.  
**Documentation reconciliation:** completed by the v1.9 source-contract references and amendments.  
**Upstream implementation corrections:** present in draft PR #82; awaiting final architecture, web, Android and integrated regression CI on the final head.  
**Breakeven runtime implementation:** **blocked** until final CI is green and the source read models are re-audited.  
**Runtime code changed:** yes, only in upstream source owners and their regression tests. No breakeven engine, target calculation or presentation has been implemented.
