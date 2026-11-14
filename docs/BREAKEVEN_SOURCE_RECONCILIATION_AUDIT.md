# Breakeven Upstream Source Reconciliation Audit

**Audit date:** 2026-11-14  
**Repository:** `amtalwalkar-sudo/sam-travels`  
**Audited implementation baseline:** `4854863fcc632bd3953b169324ae1831b0aa4cbd` on `feat/breakeven-driver-target`  
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

**Decision status: recovered and documented. Core source rules conform; one allocation-granularity mismatch remains.**

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

**Mismatch to correct:** `BusinessStartDateCostAllocationService.getReport()` in `packages/application/src/business-start-date-cost-allocation-service.ts` reduces all overlaps touching a Compliance record to one record-level status. If any overlap is unresolved, `allocateComplianceCostV1` withholds that entire record's allocation, including non-overlapping dates. The Compliance owner contract describes withholding the combined amount for the overlapping item/date range, not discarding valid daily allocations outside that overlap. Allocation must become date/range-aware: preserve eligible non-overlap days, withhold only the affected overlap dates until review, and then include each distinct source record once after confirmation.

**Disposition:** Compliance product decisions are closed. The range-specific withholding mismatch is a blocking upstream implementation fix.

## 3. EMI — schedule, prepayment and closure

**Decision status: recovered and documented. The Finance-owned prepayment and settlement commands implement the approved transition rules, but the reporting allocation projection does not yet conform.**

Approved rules:
- Original EMI schedule is anchored to the loan's actual first EMI date. Due dates are monthly, on the first of each calendar month.
- Each EMI allocation period starts on that instalment's due date and ends the day before the next due date; the final scheduled period ends on the last day of that calendar month.
- Use the complete scheduled EMI amount; do not split principal and interest for business-cost allocation.
- The only approved prepayment mode is **Reduce Tenure**. The regular EMI amount and due dates remain unchanged. Prepayment reduces principal, the final adjusted instalment may be smaller, and the final due date moves earlier.
- A prepayment between EMI dates is effective after all instalments due through the prepayment business date have been fully paid and allocated, and before the next unpaid instalment. The already-open allocation period remains attributed to the prior schedule through the day before that next due date; the revised schedule supplies future instalments from the next unpaid due date.
- Settlement/closure is permitted only on a scheduled EMI due date after all instalments due through that date are fully paid and allocated. Settlement is the closing principal after that date's EMI. The settlement entry and Loan closed state commit atomically. No future EMI allocation is emitted after the closure date.

Evidence:
- `packages/application/src/finance-loan-prepayment-service.ts`: rejects any mode other than `reduce_tenure`; checks all EMIs due through the prepayment business date are fully allocated; computes principal after those instalments; records the effective date and remaining due dates; creates a new schedule revision.
- `packages/features/finance/loan-prepayment-calculation.ts`: fixed-EMI schedule generation and earlier final due date.
- `packages/application/src/finance-loan-settlement-service.ts`: restricts settlement to a scheduled EMI due date, verifies all due EMIs are fully paid, takes closing principal after the settlement-date EMI, and atomically writes the settlement ledger entry plus Loan closed state.
- `packages/domain/src/business-start-date-cost-allocation.ts`: implements due-date-to-next-due-date-minus-one periods and final-month-end period semantics.

**Blocking mismatch A — mid-cycle prepayment gap:** `BusinessStartDateCostAllocationService.getReport()` selects only the current revised schedule version after prepayment. The revised schedule begins at the next unpaid due date, and `allocateScheduledEmisV1` begins each row's allocation on its due date. Consequently, the already-open period from the previous paid EMI due date through the day before the next unpaid due date is absent from the new report. The allocation projection must retain that open period from the prior schedule version exactly once, then use the revised schedule from the next unpaid due date. It must not restart the period at the prepayment date or count both schedule versions for the same days.

**Blocking mismatch B — closure does not stop later allocations:** `packages/application/src/business-start-date-cost-allocation-service.ts` currently selects the settlement's schedule version and passes every row in that immutable schedule to `allocateScheduledEmisV1`. It does not cap the allocation horizon at the settlement/closure date. The existing test `tests/business-start-date-cost-allocation-service.test.ts` explicitly expects later EMI rows to remain allocated after settlement (test title: “does not truncate scheduled EMI allocation from settlement paid-through payment facts”). This expectation conflicts with the approved closure rule and must be replaced. Keep the closure-date instalment as the final scheduled obligation and emit no daily EMI allocation after closure.

**Disposition:** Finance schedule and transaction rules are closed. The two reporting-allocation mismatches are blocking upstream fixes. Update tests to cover mid-cycle prepayment, schedule transition, closure date, and absence of post-closure allocations.

## 4. Earnings and expenses — authoritative date and attribution

**Decision status: recovered and documented. The current source models and daily aggregator contain blocking mismatches.**

Approved date/attribution rules:
- Completed-ride fare is gross and entered by the driver after the ride. It inherits the immutable trip context captured at trip creation: trip ID, vehicle, driver/assignment, shift and Asia/Kolkata operational date. Submission time is audit metadata, not a replacement business date.
- Cancellation fee is linked to its cancellation event/trip and inherits that same immutable trip context. No separate cash/platform or payout-received workflow exists.
- Parking/toll inherits the trip's immutable context and date. The existing form's inclusion/payer control decides whether it is already part of the fare/customer charge or is a separate driver expense. No double recognition.
- Platform pass/commission is a separate expense only after actual payment and driver entry, on its paid business date. No commission engine, settlement matching or payout reconciliation.
- Challans are recognized only when paid and entered, on the actual paid business date. Issue date is retained as reference, not used to accrue an unpaid charge.
- Miscellaneous business expenses use the explicit business date on the source entry. Creation/submission timestamps are audit metadata.
- Initial operating scope is one car and one driver.

Evidence:
- `docs/WORK_DRIVER_TRIP_SNAPSHOT_INTEGRATION_CONTRACT.md` stores immutable trip context with `vehicleId`, `driverId`, `assignmentId`, `shiftId` and `operationalDate`; the reconciliation amendment now makes trip financial entries inherit it.
- `packages/application/src/trip-financial-service.ts`: completed financial and cancellation fee records link to trip/event identities and store submission timestamps, but do not themselves carry the trip operational date or vehicle/driver context. Consumers must resolve these through the immutable trip snapshot; this join must be explicit and tested.
- `packages/features/business-expenses/calculations.ts` and `packages/application/src/business-expenses-service.ts`: expense entries have a businessDate and optional vehicle/driver IDs. Challans require a vehicle and paymentStatus, but the model has no distinct paidAt field; the approved paid business date must be represented explicitly by businessDate at the payment entry.
- The current trip form/domain uses `tollPayer` and `parkingPayer` values. Verify the UI checkbox/presentation mapping against these payer values; the domain summary adds customer-paid amounts to customer charge and driver-paid amounts to driver expenses.

**Blocking mismatch A — unpaid challans are included:** `calculateDailyBusinessExpenses()` adds every challan to `fullCostExpensePaise` without checking `paymentStatus`. `tests/business-expenses-service.test.ts` creates a challan with `paymentStatus: "unpaid"` and expects it to contribute to the full-cost total. This directly contradicts the approved paid-only rule. Unpaid challans must remain visible as source obligations but must not enter recognized expense or breakeven cost until paid.

**Blocking mismatch B — platform fee can be suppressed as already netted:** the legacy `alreadyNettedFromIncome` field suppresses platform fees from daily normal/full expense totals. That is incompatible with the approved gross-fare input and separately paid platform charge. The approved breakeven path must consume gross fare and include each paid platform charge exactly once; it must not net the same charge out of fare or suppress the cost through this legacy flag. Contradictory legacy states must fail closed or be excluded with explicit needs-attention status.

**Blocking mismatch C — paid platform fee semantics are not enforced:** platform fee records have no paymentStatus/paid-date validation in the current model; they are only required to have a reference. The source contract requires actual paid amount and paid business date. The write boundary/read model must make the paid-only rule enforceable, not infer payment from record creation.

**Blocking mismatch D — trip context is not embedded in financial source rows:** the trip financial service stores tripId and event IDs, but not vehicle/date snapshots. The downstream read model must resolve the immutable tripContext and reject missing/ambiguous legacy attribution rather than use the currently selected vehicle/driver.

**Additional boundary:** `calculateDailyBusinessExpenses()` still exposes `normalOperatingExpensePaise` and `fullCostExpensePaise`. These are legacy source-summary outputs, not two breakeven metrics. The breakeven product contract permits exactly one full-cost breakeven. No consumer may register, label, or present the legacy normal/operating subtotal as an operating-breakeven calculation.

**Disposition:** Expense and trip source adapters require upstream fixes before breakeven implementation.

## 5. Fuel — completed intervals and prospective rates

**Decision status: recovered and documented. Checkpoint pairing conforms at interval level; the weighted aggregate and separation from daily purchase totals remain to be enforced.**

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
- The current module exposes per-interval cost/km, but the audited source does not yet provide the required weighted aggregation across all valid completed intervals or a date-effective rate history for breakeven consumption.
- `calculateDailyBusinessExpenses()` adds each fuel purchase's spend to the purchase-date `fuelPaise`, `normalOperatingExpensePaise` and `fullCostExpensePaise`. This is valid as a purchase-source summary only; those direct purchase totals must not be consumed as the breakeven fuel consumption cost.

**Blocking mismatch A — weighted rate output absent:** the audited business-expense module returns individual interval rates but no authoritative weighted rate across all completed intervals with an effective-from date and immutable historical rate history. Implement this in the fuel-owning calculation layer before breakeven consumes fuel cost/km.

**Blocking mismatch B — direct purchase totals remain in legacy daily summary:** the current daily source summary counts purchase spend on purchase dates. Keep that source view if needed, but make the breakeven read contract explicitly consume only confirmed business kilometres multiplied by the weighted rate; never add both purchase spend and consumption cost.

**Disposition:** Full-tank interval eligibility is substantially aligned; weighted-rate history and consumer separation are blocking.

## 6. Daily business-kilometre projection and unresolved legacy distance

**Decision status: recovered and documented. The Work/Shift contract is consistent with the approved distance rules.**

Evidence and rules:
- `docs/WORK_SHIFT_ODOMETER_AND_DAILY_DISTANCE_CONTRACT.md` makes Work/Shift the sole authority for confirmed shift odometer readings and business kilometres.
- New v2 shift starts/ends require confirmed odometer readings. Business kilometres are end reading minus start reading; personal kilometres between shifts are separately recorded and excluded.
- A shift-end/04:00 rotation contributes to the vehicle/day projection with immutable shift/event IDs and exact odometer facts. Multiple shifts for a date aggregate without replacing prior contributions.
- A 04:00 boundary does not interrupt an active trip. Once the trip reaches a terminal state, the driver confirms one odometer reading; the outgoing shift's complete confirmed distance is assigned to its original operational date and the new shift begins at the same reading.
- Until the boundary confirmation commits, the contribution is explicitly awaiting operational-boundary confirmation and is not included in a complete published total.
- Legacy v1 shifts remain readable but are not backfilled with invented odometer readings or kilometres. Maintenance consumes only fully allocated daily totals; fuel must use the same confirmed Work daily-distance authority.

No additional product decision is required. The breakeven consumer must use the complete authoritative daily projection and must not substitute GPS endpoint displacement, fare/trip distance, elapsed time, or a manually estimated total.

## 7. Blocking work before breakeven implementation

The following work belongs to the upstream owners and must be completed before breakeven code starts:

1. **Compliance:** change overlap withholding to date-range granularity so non-overlapping eligible days remain allocated while unresolved overlapping dates are withheld.
2. **Finance allocation:** preserve the prior schedule's already-open EMI allocation period across mid-cycle prepayment; use the revised schedule from the next unpaid due date; stop all daily EMI allocation after settlement/closure date. Replace the current settlement test that expects post-closure rows to remain allocated.
3. **Trip financial attribution:** expose a stable public trip-financial read model that joins fare/cancellation/parking/toll entries to immutable tripContext, including operational date and vehicle/driver/assignment identity; fail closed for unresolvable legacy links.
4. **Business expenses:** enforce paid-only recognition for challans; enforce paid-only platform fees and their paid business date; remove or neutralize the legacy netted-fee suppression for the gross-fare workflow; verify parking/toll inclusion control maps to the approved payer semantics.
5. **Fuel:** add a weighted aggregate over valid completed intervals and an immutable prospective effective-date history; expose a read model that breakeven can consume without direct-purchase double counting.
6. **Distance:** preserve the current Work/Shift authority and confirm the public daily projection query exposes allocated totals plus explicit pending/unresolved state to downstream consumers.

For each fix, add regression tests at the owning feature boundary and PWA/Android shared domain/application boundary where relevant. Re-run the full architecture, web, Android, integrated regression and required CI gates on the exact commit. Update this audit with the exact tested commit and evidence before authorizing breakeven implementation.

## 8. Explicitly out of scope

This audit does not authorize:
- Breakeven calculation implementation before the blocking upstream work is complete.
- Driver Target or Target Passbook design/implementation before breakeven is reliable.
- Predictive breakeven, a second expense ledger, operating breakeven, payout/settlement reconciliation, refunds/reversals/adjustments, multi-vehicle or multi-driver allocation, or Performance redesign.
- Physical-phone acceptance during this documentation pass; it remains at the end of the overall work.

## 9. Audit disposition

**Product decisions:** recovered and documented in normative source contracts.  
**Documentation reconciliation:** completed by the v1.9 source-contract references and amendments.  
**Upstream implementation conformance:** not complete; blockers listed in Section 7.  
**Breakeven runtime implementation:** **blocked** until those blockers are fixed, tested and this audit is updated against the exact new implementation baseline.  
**Runtime code changed in this audit:** none.
