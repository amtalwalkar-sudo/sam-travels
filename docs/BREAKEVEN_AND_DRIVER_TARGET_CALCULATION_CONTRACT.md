# Breakeven and Driver Target Calculation Contract

**Document ID:** ST-PERFORMANCE-BREAKEVEN-TARGET  
**Version:** 1.9  
**Status:** Frozen and approved product baseline with Addenda A through I; changes require an explicit, versioned product-owner amendment  
**Implementation authorization:** The prior calculation-baseline authorization remains subject to the product owner's current direction; this amendment authorizes documentation only and does not start implementation  
**Delivery:** Documentation-first foundation for PR 2  
**Timezone:** Asia/Kolkata business dates  
**Currency:** INR; persisted money uses integer paise

## 1. Purpose and authority

This contract freezes the product decisions agreed for the Breakeven and Daily Driver Target workstream. It is the product-level owner for the rules stated here. It supplements, and does not replace, the repository's existing data, feature-extension, form, persistence, transaction/recovery, calculation-approval, business-start-date allocation, and presentation contracts.

This document records approved scope, not proof of implementation. Runtime work must follow the existing technical contracts and pass the required regression and CI gates. Explicit exclusions and deferred add-ons in Section 13 must not be silently guessed or promoted into production behaviour.

The contract is deliberately extensible. New capabilities may be proposed as add-ons and incorporated through an explicitly approved, versioned addendum. An add-on must not silently alter the frozen baseline or change the result of an existing calculation.

## 2. Product and vehicle boundary

- The initial calculation scope is one selected car and its assigned single-driver business workflow.
- Calculations are scoped to the authoritative vehicle identity and the relevant business records for that vehicle.
- This work does not introduce fleet dispatch, multi-driver tenancy, or a parallel Work/Shift/trip state machine.
- Existing source records and their owning features remain authoritative. Breakeven consumes validated outputs through public contracts; it must not duplicate or reach into another feature's private persistence or implementation.

## 3. Calculation architecture

### 3.1 Annual-first foundation

- Begin with annual cost and breakeven calculations.
- Amortize the annual result into monthly equivalents.
- Derive daily equivalents from the same annual/monthly foundation.
- Weekly and arbitrary date-range results must reconcile with the same underlying daily results.
- Do not implement separate, competing formulas for daily, weekly, monthly, annual, or custom-range views.
- Use deterministic decimal-safe arithmetic and the shared INR/paise precision rules. Rounding and residual handling must not create or lose money.

Fixed annual costs are allocated to months using each calendar month's actual number of days, with leap years handled by the calendar. Daily allocation uses the actual calendar-day count for the applicable year/month basis. Variable/activity-based costs remain tied to their actual source activity or records. Weekly and custom ranges sum their included daily allocations. Use deterministic paise rounding and distribute residual paise deterministically so period totals reconcile exactly.

### 3.2 Timeline consistency

- Every reported period must use the same calculation version and source facts.
- Weekly and custom date ranges must reconcile to the daily results for the dates they contain.
- Monthly and annual summaries must reconcile to their corresponding lower-level results under the approved annual-first amortization convention.
- A period boundary uses Asia/Kolkata business dates.
- Missing, incomplete, stale, or unavailable source data must remain explicit; it must not silently become zero or a complete-looking result.

## 4. Gross trip earnings and separately paid platform costs

- The fare entered by the driver after a completed ride is the authoritative **gross fare** for that trip. Do not replace it with a reconstructed payout, a net payout, or an inferred amount.
- A cancellation fee entered by the driver after cancellation is the authoritative cancellation-fee source and is linked to the cancellation event/trip.
- Do not add a cash-versus-platform split, payout-received workflow, trip-to-payout matching, separate received-earnings record, or settlement reconciliation to this scope.
- A platform pass/commission is a separate cost only after it has actually been paid and the driver has entered the amount. The paid amount is recognized once on its actual paid business date.
- Keep gross fare as gross. Do not net a paid platform charge out of fare and then deduct the same amount again as an expense. Do not calculate an unentered fee or build a commission engine.
- Source entry timestamps, immutable trip context, paid business dates, and correction history remain traceable. The source feature owns those facts; breakeven consumes its public read model and does not create another earnings or expense ledger.
- These rules apply to actual full-cost breakeven. Target/passbook work remains deferred until the breakeven calculation foundation is reliable and separately sequenced.

## 5. Maintenance cost

- Maintenance cost is calculated using business kilometres.
- Admin manually configures the maintenance rate in INR per kilometre.
- Maintenance cost is the configured rate multiplied by the applicable business kilometres.
- Do not introduce a separate complex maintenance allocation, prediction, or asset-life framework as part of this scope.
- Business kilometres exclude personal-use kilometres.
- The maintenance rate configuration must use the existing shared form architecture and preserve the rate that was applicable to each historical calculation period. A rate change affects calculations from its effective date forward; it must not retroactively overwrite prior periods.

## 6. Breakeven definitions

Exactly one breakeven output is required: **Full-cost breakeven**. There is no operating-breakeven metric or UI concept in this workstream.

Full-cost breakeven is the total eligible cost burden that must be covered by earnings. It includes:
- Fuel costs.
- Maintenance accrual: business kilometres multiplied by the Admin-configured maintenance rate.
- Driver-entered platform pass and commission charges.
- Traffic challans.
- Miscellaneous expenses.
- The full scheduled EMI amount; do not split EMI into principal and interest for this calculation.

Use existing Finance and Business Start Date allocation outputs where applicable. Do not duplicate their source calculations or introduce a second EMI/compliance allocation implementation. Each cost must be recognized once. Do not create a separate operating-breakeven result, formula, registration, or presentation.

### 6.1 Explicit exclusion

This contract does not introduce a separate dated vehicle-expense allocation system or a new dated-expense calculation framework. Do not add a battery-specific, date-prorated expense subsystem under this workstream. Only costs explicitly included by the approved definitions and existing authoritative contracts may contribute.

## 7. Daily Driver Target

- Admin configures a **monthly Driver Target**.
- The target is evaluated against the single full-cost breakeven.
- The amount above breakeven is the progress that counts toward the driver's target.
- The target is not a percentage of breakeven and is not a hardcoded uplift.
- Daily, weekly, monthly, annual, and custom-period target comparisons must be derived consistently from the configured monthly target and the same breakeven foundation.
- The target must not silently change actual breakeven calculations.

The target basis is approved as the single full-cost breakeven. The Admin-entered monthly Driver Target is the **additional surplus desired above full-cost breakeven**, not total net earnings. For a partial month, prorate the monthly surplus target by the number of calendar days in the applicable partial period divided by the total calendar days in that month. Expected cumulative progress is paced by the same calendar-day proportion. Shortfalls remain cumulative and may be recovered later.

## 8. Driver Target Passbook

A passbook-style progress record is an approved product requirement.

It must allow the driver to understand:
- The target amount applicable to the period.
- The expected cumulative progress by the selected date.
- Actual eligible earnings above breakeven.
- Whether the driver is ahead of target or falling behind.
- The cumulative surplus or shortfall.
- The remaining amount required to reach the target.
- How progress changes over time.

A shortfall on an earlier day may be recovered on later days; progress is cumulative and must not be treated as independent daily pass/fail results.

**Earnings eligibility:** Gross fares entered for completed rides and cancellation fees entered after cancellation are the approved trip-earnings sources. Paid platform pass/commission amounts are separate full-cost expenses and are recognized once. Do not introduce payout-received gating, cash/platform splits, or trip-to-payout matching. Any later target/passbook calculation must consume the same gross-fare and separately-paid-cost source semantics as full-cost breakeven; it must not net or deduct the same platform charge twice.

The passbook is a derived, auditable projection. It must not create or mutate source income, expense, trip, or payment records.

## 9. Business-kilometre summary and predictive breakeven

### 9.1 Business-day definition and kilometre summary

**Business day definition:** For this breakeven workstream, a business day is an Asia/Kolkata operational date on which the driver has an Online shift and completes/records at least one ride assigned to that shift. Both conditions are required. An Online shift with no ride is not a business day; a ride without an Online shift is not a business day.

Use the authoritative Work/Shift and Trip records to determine Online-shift state, ride existence, and the ride's assigned operational date. The existing 04:00 Asia/Kolkata boundary and trip-to-creation-shift assignment rules remain authoritative: a ride crossing 04:00 remains assigned to the shift and operational date in which it was created. Do not infer a business day from odometer movement, fuel purchase, elapsed Online time alone, GPS displacement, or a manually entered expense.

This classification identifies active business days for breakeven reporting and active-driving-day averages. It does **not** redefine the operational date or change time-based cost allocation: compliance amortisation and scheduled EMI allocations continue on their applicable calendar dates, including dates that are not business days. Activity-based fuel and maintenance costs continue to depend on confirmed business kilometres; a non-business day with no business kilometres has zero fuel and maintenance accrual, not zero total breakeven cost.

Count **business kilometres only**; exclude personal-use kilometres.

Maintain a consistent historical summary of:
- Daily business kilometres.
- Weekly and monthly business-kilometre totals.
- Daily, weekly, and monthly average kilometres.
- Active driving-day counts.
- Historical kilometre trends.

Averages must use actual active driving days rather than blindly dividing by all calendar days. Totals and the denominator used for each average must be available for verification. Distance must come from the authoritative business-distance source; GPS endpoint displacement must not be represented as driven distance.

### 9.2 Predictive breakeven

The predictive capability is initially **advisory**.

It may use historical business kilometres and validated cost inputs to estimate future kilometres, fuel costs, maintenance costs, and future **full-cost breakeven**. The product may show actual and estimated full-cost breakeven as distinct values. Estimated values must be visibly and semantically separate from actual approved calculations. There is no operating-breakeven forecast.

The advisory engine must not automatically change:
- Actual breakeven results.
- Admin-configured monthly Driver Target.
- Source records or approved financial calculations.

### 9.3 Add-on-ready evolution

The prediction capability must be designed as a replaceable, decoupled calculation layer. A later approved phase may evolve advisory prediction into automatic calculation/forecasting without rebuilding the underlying business-distance history, approved cost foundation, configuration forms, or stable calculation contracts.

Automatic behaviour is not authorized by this version.

## 10. Forms and presentation boundary

- Implement only the configuration forms already agreed for this workstream and consistent with the existing Admin/UI product decisions.
- Forms use the shared Form Architecture and Behaviour Contract, including versioned definitions, shared working-copy/lifecycle semantics, validation, durable persistence, recovery, correction, backup/restore, and PWA/Android parity.
- Form definitions and presentation remain separate from business calculations and persistence.
- The final Performance screen shell, UX, dashboard composition, navigation presentation, and wider visual redesign remain deferred until the approved calculation and source wiring is complete, reliable, and validated.
- A narrowly scoped **temporary sanity-check presentation** is authorized in the existing Performance space during calculation validation. It is for both driver and admin use and exposes only the information needed to inspect calculation outcomes, completeness, provenance, and source-level audit detail. It is a validation aid, not approval of the final Performance UX or metric presentation.
- Keep this temporary presentation isolated behind a replaceable presentation/module boundary. It must consume stable calculation/readout contracts and must not own, duplicate, or alter calculation logic, source records, persistence, calculation provenance, audit data, or regression fixtures.
- The temporary presentation must be removable or replaceable with one documented command. A single invocation must disable/remove the temporary surface and restore the Performance entry point for the intended redesign without deleting or changing calculation services, wiring, persisted records, provenance, source audit detail, or automated tests.
- The exact command and its safe execution procedure must be documented with the implementation. It must be deterministic, safe to repeat, and limited to the temporary presentation/registration boundary; it must not be a data reset, migration, or destructive cleanup.
- After the calculation foundation and wiring pass the agreed validation, remove/replace the temporary presentation through that command. Only then proceed with the intended Performance screen design under separate product direction.

## 11. Add-on architecture and change control

The frozen baseline must support additive extension without disturbing existing stable behaviour.

- Breakeven, target, passbook, kilometre summaries, and prediction calculations must have explicit stable identities, versions, owners, input/output contracts, units, precision, period semantics, missing-data behaviour, and regression fixtures.
- Calculations remain deterministic and independent of React, forms, storage adapters, network, and Android-specific code.
- New metrics or prediction methods are additive extensions owned by the appropriate feature and published through the existing feature-extension architecture.
- Existing calculation IDs, versions, outputs, source facts, and historical results must not change merely because an add-on is introduced.
- A change to an approved formula requires explicit owner approval, a versioned contract change, historical recalculation/preservation policy, and regression fixtures.
- Presentation can be replaced independently without rewriting calculations, persistence, or source integrations. The temporary Performance sanity-check presentation is a disposable presentation add-on; its documented one-command removal/replacement must leave all calculation and audit capabilities intact.
- Reuse existing registries, form runtime, repositories, backup/restore, recovery, lifecycle, and architecture enforcement. Do not create duplicate frameworks.

## 12. Delivery and verification requirements

Implementation must include:
- The approved calculation foundation and the configuration forms authorized by the product owner.
- Regression fixtures for every registered calculation, including normal, boundary, missing/incomplete-data, and historical-correction cases.
- Reconciliation tests proving daily, weekly, monthly, annual, and arbitrary date-range consistency under the approved period convention.
- Passbook tests for ahead-of-target, behind-target, cumulative recovery, and period boundaries.
- Business-kilometre summary tests for active-day denominators and exclusion of personal-use distance.
- Advisory prediction tests proving predictions remain separate from actual calculations and cannot mutate configured targets or source data.
- A temporary driver/admin sanity-check readout in the existing Performance space, isolated from the calculation layer and removable/replaceable through one documented, non-destructive command after validation.
- Documentation updates and green required web, architecture, Android, and integrated CI gates.

A green CI run is automated evidence only. Physical-device acceptance remains a separate release gate and is intentionally deferred until the agreed end-of-work testing stage.

## 13. Frozen boundaries and deferred add-ons

The product owner has confirmed that the current business workflow has no refund, reversal, or other earning-adjustment process to support. These are not part of this implementation. Do not add speculative refund/adjustment UI, records, calculations, or workflows. If the business later introduces such a process, its treatment must be proposed and approved through a dated contract addendum before implementation.

The following rules are resolved by this contract and its approved addenda or are delegated to existing authoritative contracts:

1. Annual fixed-cost allocation uses actual calendar days/months, including leap years, with deterministic paise residual allocation.
2. Monthly Driver Target means additional surplus above full-cost breakeven; partial months and cumulative pacing use calendar-day proration.
3. Gross fares entered after completed rides and cancellation fees entered after cancellation are the authoritative trip-earnings sources. No payout-received gate, cash/platform split, separate received-earnings record, or trip-to-payout matching is used. Paid platform pass/commission amounts are separate costs recognized once on their actual paid business date. Addendum H.1 supersedes the older net-payout and payout-received wording in Addenda A, C and D.
4. Business kilometres are odometer-derived only; personal kilometres are excluded and GPS displacement is not a substitute. Missing, corrected, or disputed source records follow the existing Driver Workflow, data-quality, and Forgiving Data Entry and Historical Correction contracts. Incomplete or disputed distance must not be silently treated as zero or complete.
5. Maintenance-rate changes apply prospectively from their effective date; historical periods retain the applicable rate unless an explicit correction is made under the existing historical-correction contract.
6. Other source-record corrections, restatements, and audit history follow the existing authoritative source and historical-correction contracts. This product contract does not create a parallel correction framework.

### 13.1 Prediction boundary

Prediction is an optional, advisory add-on, not a prerequisite for the initial approved breakeven and Driver Target implementation. The initial implementation must establish reliable historical business-kilometre and validated cost inputs, but must not invent a forecast horizon, minimum-history threshold, confidence level, or fallback rule. Until those prediction parameters are separately approved, do not register or present a predictive result. Any future prediction proposal must be additive, separately labelled, and must not alter actual calculations, source records, or configured targets.

Product formula decisions for the approved baseline are recorded in Addenda A through H. Before implementation, complete the source-contract/runtime verification gates in Addendum H.8. If an existing authoritative contract fully resolves a gate, no new product decision is required; if it does not, pause only the affected behaviour for product-owner clarification. Any change to the approved baseline requires an explicit, dated, versioned product-owner approval.

## 14. Approval and amendment history

- **v1.9 / Addendum I — Upstream source-contract reconciliation:** Recovers the five previously discussed owner decisions into their normative source contracts, replaces the unresolved-check framing in Addendum H.8 with authoritative contract references, and records implementation conformance findings. Documentation only; breakeven runtime implementation remains blocked until upstream mismatches are fixed.
- **v1.7 / Addendum G — Business-day definition:** Defines a business day for breakeven as an Asia/Kolkata operational date with an Online shift and at least one ride assigned to that shift; preserves the existing 04:00 trip assignment rules and keeps time-based compliance/EMI allocations on calendar dates. This amendment documents the business-day classification only and does not start implementation.

- **v1.6 / Addendum F — Temporary Performance sanity-check surface:** Authorizes a temporary, isolated driver/admin sanity-check presentation in the existing Performance space while calculations and wiring are validated; requires one documented, repeatable, non-destructive command to remove/replace it and restore the Performance entry point without affecting calculation logic, source data, provenance, audit detail, or tests; defers the intended Performance redesign until validation is complete. This amendment documents the presentation boundary only and does not start implementation.

- **v1.0 — Frozen baseline:** Records the agreed annual-first breakeven architecture, platform fee types, KM-based manually configured maintenance rate, operating/full-cost breakeven distinction, monthly Driver Target, passbook, business-kilometre summary, advisory predictive direction, forms-only scope, and add-on architecture.
- **v1.1 / Addendum A — Approved canonical earnings rule:** Establishes canonical net earnings for every downstream calculation and requires each platform fee to be recognized exactly once.
- **v1.2 / Addendum B — Simplified full-cost model:** Replaces two breakeven outputs with one full-cost breakeven; makes driver-entered pass/commission payments the authoritative platform-charge expense entries; confirms the included cost categories; approves full-cost breakeven as the Driver Target basis; and permits separate actual and estimated full-cost breakeven values.
- **v1.3 / Addendum C — Target, period, earnings and historical rules:** Approves the monthly target as additional surplus above full-cost breakeven, calendar-day partial-month proration, received cancellation fees as earnings, calendar-day annual fixed-cost allocation, historical maintenance-rate preservation, odometer-only business kilometres, and advisory estimates based on historical kilometres/fuel efficiency. Platform commission/pass charges are recorded when actually paid.
- **v1.4 / Addendum D — Platform payout recognition timing:** Platform earnings count only when payout is actually received by the driver, matching the paid-entry timing for commission/pass expenses.
- **v1.5 / Addendum E — Final freeze and scope closure:** Confirms there is no current refund/reversal/earning-adjustment workflow and excludes speculative support; delegates source corrections to existing contracts; defers prediction registration/display until its horizon and minimum-history rules are explicitly approved; confirms no remaining product decision blocks implementation.
- Future changes must be recorded as explicit, dated, owner-approved addenda. Do not silently edit the meaning of this frozen baseline.


## Addendum A — Canonical earnings basis and platform-fee single recognition

**Approval:** Approved by the product owner in the discussion preceding this amendment.  
**Effective contract version:** 1.1  
**Scope:** All actual and derived breakeven, Driver Target, passbook, period-summary, and advisory-prediction calculations.

The canonical earnings input is **net earnings after any transaction-level platform fee already withheld from the earning**. Source gross values and fee details remain available for audit, but downstream calculations consume the normalized canonical net amount.

The same platform fee must never be represented both as a reduction from gross earnings and as a separately deducted expense. If a platform payout is already net, that payout is used without another commission deduction. If a gross earning is supplied, the applicable transaction-level fee is deducted once during normalization and marked as already accounted for. Fixed pass charges are separately included as operating costs only when they have not already reduced the canonical net proceeds.

An explicit fee-accounting state is required for every applicable source. Unknown state means incomplete accounting data, not permission to assume that a fee is either included or absent. This rule is invariant across every downstream calculation and future add-on.

This addendum freezes the accounting basis and duplicate-prevention rule. It does not yet approve the open commission base, pass billing period, refund/adjustment eligibility, or historical fee-change policy listed in Section 13.


## Addendum B — Single full-cost breakeven and simplified expense inputs

**Approval:** Approved by the product owner in the discussion preceding this amendment.  
**Effective contract version:** 1.2  
**Scope:** Breakeven, Driver Target basis, platform-charge inputs, and predictive breakeven.

1. The product has exactly one breakeven metric: **Full-cost breakeven**. Operating breakeven is removed from the product and must not be implemented, registered, or displayed.
2. Full-cost breakeven includes fuel, business-kilometre-based maintenance, driver-entered platform pass/commission charges, traffic challans, miscellaneous expenses, and the full scheduled EMI amount.
3. The driver enters the amount actually paid whenever buying a platform pass or paying commission. That entry is the authoritative platform-charge expense. Do not infer commission bases, calculate unentered fees, or introduce a platform fee configuration engine for this calculation. Recognize each entered charge once and prevent duplicate deduction if an upstream earning/payout value already reflects that same charge.
4. Existing maintenance rate, traffic challan, commission/platform-charge, and miscellaneous inputs remain the relevant Admin/driver-entered cost sources, alongside fuel and the existing EMI source. No new generic additional-expense category or separate dated vehicle-expense allocation framework is authorized by this addendum.
5. Driver Target uses full-cost breakeven as its basis. The exact meaning of the monthly target amount and partial-month pacing remain open decisions.
6. Actual and estimated full-cost breakeven may be shown as separate values when the predictive engine is used. Estimates are advisory, clearly labelled, and must not modify actual calculations or source records.

This addendum supersedes the v1.0 wording that required both operating and full-cost breakeven and any open-decision wording that treated the target basis or additional expense categories as undecided. Addendum A's no-double-recognition principle remains in force, simplified by the driver-entered platform-charge rule above.


## Addendum C — Target, period, earnings and historical rules

**Approval:** Approved by the product owner in the discussion preceding this amendment.  
**Effective contract version:** 1.3

1. **Monthly Driver Target:** The Admin-entered monthly amount is the additional surplus desired above full-cost breakeven. It is not total earnings and is not an uplift automatically added to the breakeven formula. Target progress is eligible net earnings above full-cost breakeven, accumulated over the period.
2. **Partial months:** Prorate the monthly surplus target by calendar days. Pace expected cumulative progress proportionally by elapsed calendar days. A shortfall remains cumulative and may be recovered on later days.
3. **Cancellation fees:** Cancellation fees actually received count as earnings, subject to the canonical no-double-recognition rule.
4. **Platform charges:** The driver records a pass/commission amount when it is actually paid. Do not accrue an unpaid commission/pass expense before payment and entry. Recognize the entered payment once.
5. **Annual fixed-cost periods:** Allocate fixed annual costs across actual calendar months/days, respecting leap years. Variable costs remain activity/record based. Weekly and arbitrary ranges sum their daily allocations; deterministic paise residual handling must reconcile exactly.
6. **Maintenance history:** A maintenance-rate change applies from its effective date forward. Past periods retain the rate that applied at that time unless an explicit historical correction is made under the repository's correction contract.
7. **Distance:** Business kilometres are odometer-derived. Exclude personal kilometres; GPS displacement is not an alternative distance source for this calculation.
8. **Predictions:** Estimates may use historical business kilometres and fuel-efficiency history. Show estimated full-cost breakeven separately from actual full-cost breakeven. Estimates are advisory and cannot mutate actuals, source records, or the configured target.

Platform earnings are recognized on a received-cash basis: count them when the payout is actually received by the driver, not while still unsettled. This mirrors the approved paid-entry timing for commission/pass expenses. Refunds, reversals, and other earning adjustments remain governed by explicit source-record rules and must not be guessed.


## Addendum D — Platform payout recognition timing

**Approval:** Approved by the product owner in the discussion preceding this amendment.  
**Effective contract version:** 1.4

Platform earnings are recognized only when the payout is actually received by the driver. A validated platform earning that remains unsettled is not yet included in actual earnings, full-cost breakeven coverage, or Driver Target progress. This uses the same cash-received timing principle as platform pass/commission expenses, which are entered when actually paid by the driver.

This timing rule does not change the treatment of direct cash fares or cancellation fees already received. It also does not authorize speculative estimates of unsettled payouts in actual calculations; any forecast must remain separately labelled as an estimate.


## Addendum E — Final product freeze and scope closure

**Approval:** Approved by the product owner in the discussion preceding this amendment.  
**Effective contract version:** 1.5

The product owner confirms that the current business workflow has no refund, reversal, or other earning-adjustment process. No such feature or calculation is to be introduced in this workstream. If the business process changes, the new requirement must be proposed and approved through a separate dated addendum.

Existing authoritative contracts govern missing, corrected, or disputed source records and historical corrections. This workstream must reuse those safeguards and must not create duplicate correction or recovery mechanisms.

Predictive breakeven is deferred as an optional advisory add-on. Until its forecast horizon and minimum-history/completeness requirements are separately approved, it must not be registered or presented. This does not block implementation of actual full-cost breakeven, the Driver Target, passbook, business-kilometre summaries, or their approved configuration forms.

The product decisions in this contract are now frozen for implementation. The product owner has previously directed that implementation begin once documentation is complete; that direction applies to this v1.5 baseline. Any change to the frozen rules or scope requires explicit, versioned product-owner approval.


## Addendum G — Business-day definition for breakeven

**Approval:** Approved by the product owner in the discussion preceding this amendment.  
**Effective contract version:** 1.7

1. For breakeven calculations and reporting, a **business day** is an Asia/Kolkata operational date on which the driver has an Online shift and at least one ride assigned to that shift. Both conditions are mandatory.
2. An Online shift without a ride is not a business day. A ride without an Online shift is not a business day.
3. Determine both conditions from authoritative Work/Shift and Trip records. The existing 04:00 operational-day boundary and trip assignment rules remain in force. A ride crossing 04:00 remains assigned wholly to the logical shift and operational date in which it was created.
4. Do not infer a business day from odometer movement, fuel purchases, Online duration alone, GPS displacement, or expense entries.
5. This definition governs business-day classification and active-driving-day denominators in breakeven reporting. It does not change calendar-based allocation of time-based costs: compliance amortisation and scheduled EMI allocations continue on applicable calendar dates, including non-business days. Activity-based fuel and maintenance costs continue to be calculated from confirmed business kilometres.
6. This amendment defines a breakeven reporting concept; it does not change Work/Shift state transitions, trip lifecycle, odometer allocation, or the authoritative source contracts.

This addendum records the business-day rule as a normative input to breakeven calculation. It does not authorize calculation implementation or change any other approved cost formula.



## Addendum F — Temporary Performance sanity-check surface

**Approval:** Approved by the product owner in the discussion preceding this amendment.  
**Effective contract version:** 1.6

1. The existing Performance space may be used temporarily as a shared sanity-check area for both the driver and admin while the approved calculation services and source wiring are being completed and validated.
2. The temporary surface is limited to the information needed to sanity-check actual calculation outcomes, missing/incomplete source data, calculation provenance, and source-level audit detail. It is not the final Performance screen design and must not expand into a general dashboard or speculative metric presentation.
3. The temporary UI is a replaceable presentation add-on. It consumes the approved calculation/readout contracts and remains decoupled from calculation formulas, source integrations, persistence, provenance generation, audit storage, and regression tests. Driver/admin access may show role-appropriate details, but both use the same temporary sanity-check capability and authoritative outputs.
4. Once the calculation foundation and wiring are reliable and the agreed validation is complete, the temporary presentation must be removable or replaceable with one documented command. The command must affect only the temporary presentation and its registration/entry-point wiring; it must not delete, reset, migrate, or rewrite business data, calculation services, source integrations, provenance, audit records, or tests. It must be safe to repeat and restore the Performance entry point for the intended redesign.
5. The exact command is an implementation detail and must be documented before it is used. No destructive command or data-clearing operation is implied by the phrase “one command.”
6. The intended Performance screen UX, shell, navigation presentation, and final visual composition are designed only after the calculation and wiring foundations have passed validation, under the product owner's separate direction. Removing the temporary surface does not itself authorize or implement that redesign.
7. This addendum changes no approved calculation formula, earnings recognition rule, cost inclusion rule, Driver Target rule, prediction boundary, source-record policy, or data-retention policy. It does not authorize calculation implementation or UI implementation by itself; it records the temporary presentation sequence and its safety boundary.


## Addendum H — Consolidated breakeven source, cost and earnings decisions

**Approval:** Approved product-owner decisions recorded in the discussion preceding this amendment.  
**Effective contract version:** 1.8  
**Scope:** Actual full-cost breakeven inputs and their upstream source semantics.  
**Implementation effect:** Documentation only. This amendment does not itself authorize or claim runtime implementation.

### H.1 Canonical trip earnings and paid platform charges

1. A driver's entered fare after a completed ride is the authoritative **gross fare** for that ride. Do not replace it with a reconstructed payout amount or require a separate received-earnings record.
2. A cancellation fee entered by the driver after cancellation is authoritative and is included as earnings under the approved earnings treatment.
3. Do not add a cash-versus-platform split, payout-received workflow, trip-to-payout matching, or separate received-earnings record to this scope.
4. A platform commission/pass amount is a separate cost only when it has actually been paid and the driver has entered the amount. Do not accrue unpaid charges, infer a percentage, or build a commission engine.
5. Recognize the driver-entered paid platform charge once as a cost. Do not also normalize gross fare by subtracting that same charge through a payout/net-earnings path. The older payout-received-only and net-payout normalization wording in Addenda A, C and D and Section 13 is superseded for this workflow by this Addendum H.1.
6. Traffic challans are included only when paid and entered by the driver. No unpaid-challan accrual is introduced.
7. These rules do not create speculative refund, reversal, payout matching, or earning-adjustment workflows.

### H.2 Fuel cost and fuel-purchase treatment

1. Fuel cost in daily breakeven is consumption-based: confirmed business kilometres multiplied by the effective weighted-average fuel cost per kilometre.
2. The fuel cost-per-kilometre rate is derived from actual fuel purchase records and completed full-tank measurement intervals; it is not a manually configured fixed rate.
3. Use the weighted average across completed valid full-tank intervals:
   `fuel cost/km = total included fuel expenditure across completed intervals ÷ total confirmed kilometres across those intervals`.
4. Partial refills contribute their actual quantity and spend to the interval between consecutive full-tank checkpoints. The closing full-tank refill is included in that interval; the initial baseline full-tank purchase is not treated as consumption in the interval it opens.
5. When no valid completed interval exists, fuel cost/km is pending. Do not invent a rate, silently use zero, or present an actual complete breakeven value that depends on that missing rate.
6. When a newly completed interval changes the weighted-average rate, the new rate becomes effective on the **calendar day after** the interval-completion date. The prior rate remains applicable on the completion date and to all earlier dates. Never retroactively apply the new rate.
7. Fuel purchase spend is upstream measurement/source data for deriving the consumption rate. Do not add those same purchases again as a separate daily breakeven expense on top of kilometre-based fuel consumption cost. This supersedes any wording in the Fuel Entry/Business Expense contract that would count fuel purchase spend directly in the same breakeven total.

### H.3 Maintenance and activity-based costs

1. Maintenance accrual is confirmed business kilometres multiplied by the maintenance rate effective on the applicable operational date.
2. Preserve historical effective rates; a rate change applies prospectively. Do not infer or hardcode a default rate in this contract.
3. Do not add actual maintenance visit/repair expense entries on top of the per-kilometre maintenance accrual for this breakeven model.
4. Fuel and maintenance accrue only against confirmed business kilometres. A day with no business kilometres has zero fuel and maintenance accrual; this does not make the day's total breakeven cost zero.

### H.4 Time-based costs and non-business days

1. The full scheduled monthly EMI is included, without splitting principal and interest, and is allocated across the applicable calendar days/month using the existing Finance / Business Start Date allocation service. Do not create a second EMI allocation engine.
2. Prepayment uses the revised repayment schedule from its effective date. Loan closure stops future EMI allocations from the applicable closure date. Do not count the old and revised schedules for the same obligation.
3. Compliance costs are included in full-cost breakeven through amortisation over each compliance item's applicable validity period. Use the item's actual amount, validity dates and applicable calendar days; do not count the same paid amount again as a lump-sum expense on its payment date when it is already represented by amortisation.
4. EMI and compliance are time-based costs and continue to allocate on calendar days, including days with no Online shift, no ride, or no business kilometres.
5. The existing Business Start Date allocation service is the authoritative shared allocation foundation. Reuse its outputs and rules; do not duplicate the allocation system.

### H.5 Business-day and distance rules reaffirmed

1. A business day is an Asia/Kolkata operational date with an Online shift and at least one ride assigned to that shift. Both conditions are mandatory.
2. The existing 04:00 operational-day boundary and trip-to-creation-shift assignment remain authoritative. A trip crossing 04:00 stays assigned wholly to its creation shift and operational date.
3. Use the existing confirmed business-distance allocation mechanism. Do not manufacture an unallocated distance state when the authoritative mechanism resolves the cross-boundary distance. Only genuinely unresolved or legacy distance remains incomplete; never invent kilometres.
4. Business kilometres exclude personal kilometres and come from authoritative odometer/Work distance records, never GPS endpoint displacement.
5. Fuel and maintenance use confirmed business kilometres, not the business-day count. The business-day definition controls active-day reporting and averages; it does not gate calendar-based EMI or compliance allocations.

### H.6 Parking, toll and other costs

1. Use the existing trip-form checkbox to determine whether parking/toll is included in the fare. If included, do not add it separately. If excluded, include the separately entered amount once.
2. Miscellaneous business expenses are included when the driver/admin records them as business expenses, using their authoritative source entry and existing correction/audit behaviour.
3. Use only the existing approved cost categories and source forms. Do not introduce duplicate expense categories or parallel ledgers.

### H.7 No-operation day treatment

For a date with no business kilometres:
- Fuel accrual is zero.
- Maintenance accrual is zero.
- EMI allocation continues.
- Compliance amortisation continues.
- Any paid platform charges, paid challans or recorded miscellaneous business expenses remain recognized according to their actual source/payment dates.

A non-business day is therefore not a zero-total-cost day.

### H.8 Recovered decisions and authoritative upstream contracts

The five topics below are **previously discussed and approved owner decisions**. They are not open product questions. Their normative rules are recorded in the owning contracts listed here; this document consumes those contracts and must not duplicate or redefine their detailed source behaviour.

1. **Compliance validity, partial periods, renewal, overlap and expiry gaps** — [Admin Capability Contracts, Compliance section](ADMIN_CAPABILITY_CONTRACTS.md#34-compliance-compliance). Validity dates are actual inclusive calendar dates. A compliance record's amount is fixed for that record's validity period; a renewal is a new linked record with its own amount and actual dates, while the prior record remains unchanged. Early renewals may overlap and late renewals may leave a real uncovered gap. Gaps are reported, never filled. Overlaps are reported as exact source intersections and withheld from combined allocation until an explicit review decision is recorded against the exact source IDs/revisions. The [Business Start Date Cost Allocation Contract](BUSINESS_START_DATE_COST_ALLOCATION_CONTRACT.md) allocates the record's complete amount over its inclusive validity days, carrying pre-business accrual forward only across the remaining eligible days; it never changes validity dates or extends expiry.
2. **EMI schedule start/end, mid-cycle prepayment and closure** — [Finance Loan Calculation](FINANCE_LOAN_CALCULATION_CONTRACT.md), [Finance Loan Prepayment](FINANCE_LOAN_PREPAYMENT_CONTRACT.md), [Finance Loan Settlement and Closure](FINANCE_LOAN_SETTLEMENT_AND_CLOSURE_CONTRACT.md), and [Business Start Date Cost Allocation](BUSINESS_START_DATE_COST_ALLOCATION_CONTRACT.md). The original schedule is anchored to the first EMI date; each due date is the first of its calendar month. Each allocation period starts on its due date and ends the day before the next due date; the final scheduled period ends at that calendar month's end. The approved prepayment mode is Reduce Tenure: regular EMI and due dates remain unchanged, principal and remaining schedule are recalculated, and the final instalment/final due date moves earlier. Prepayment is effective after all EMIs due through its business date have been fully paid and before the next unpaid instalment. The already-open EMI allocation period remains attributed to the schedule in force before prepayment; the revised schedule supplies future instalments from the next unpaid due date. Settlement/closure is allowed only on an EMI due date after every EMI due through that date is fully paid and allocated; the settlement pays the closing principal after that date's EMI and closes the existing Loan atomically. No EMI allocations may extend beyond the closure date.
3. **Fare, cancellation fee, platform charge, challan, parking/toll and miscellaneous expense dates and attribution** — [Work Driver Trip Snapshot Integration](WORK_DRIVER_TRIP_SNAPSHOT_INTEGRATION_CONTRACT.md), [Fuel Entry and Business Expense Calculation](FUEL_ENTRY_AND_BUSINESS_EXPENSE_CALCULATION_CONTRACT.md), and [Admin Capability Contracts](ADMIN_CAPABILITY_CONTRACTS.md). Completed-ride fare, cancellation fee and trip-linked parking/toll inherit the immutable trip context captured at trip creation, including its vehicle, driver/assignment and Asia/Kolkata operational date; later entry timestamps are audit/submission facts, not a replacement trip date. The existing trip form's parking/toll inclusion/payer control determines whether an amount is already included in the fare/customer charge or is a separate driver expense; never count it twice. Platform pass/commission and challans are recognized only when actually paid and entered, on their actual paid business date; an issue date or an unpaid status does not create a cost. Miscellaneous business expenses use the explicit business date on the source entry. Creation/submission timestamps are audit timestamps, not substitutes for the authoritative business date. The initial scope remains one car and one driver.
4. **Fuel interval eligibility, included purchases, confirmed distance and prospective rate** — [Fuel Entry and Business Expense Calculation](FUEL_ENTRY_AND_BUSINESS_EXPENSE_CALCULATION_CONTRACT.md). A valid rate requires two consecutive accepted full-tank checkpoints with a positive confirmed odometer delta and an unambiguous, valid sequence. The opening baseline full refill is excluded from the interval's consumption; every purchase after it through and including the closing full refill contributes its actual quantity and spend, including partial refills. An incomplete or invalid interval yields no rate. The weighted rate is total spend divided by total confirmed kilometres across all valid completed intervals. A new rate applies from the Asia/Kolkata calendar day after the interval completion date; it never restates earlier dates. Daily fuel cost is business kilometres multiplied by that effective rate; purchase spend is not a second breakeven expense.
5. **Daily business-kilometre projection and legacy distance** — [Work/Shift Odometer and Daily Business-Kilometre Contract](WORK_SHIFT_ODOMETER_AND_DAILY_DISTANCE_CONTRACT.md) and [Work Driver Trip Snapshot Integration](WORK_DRIVER_TRIP_SNAPSHOT_INTEGRATION_CONTRACT.md). The authoritative projection is built from confirmed odometer shift contributions and immutable shift/trip context. A confirmed 04:00 rotation closes the outgoing logical shift and allocates its entire confirmed distance once to its original operational date; it does not split the kilometres at 04:00. Until the required boundary reading is confirmed, the contribution remains explicitly awaiting operational-boundary confirmation and is not included in a published complete total. Legacy v1 shifts without confirmed odometer facts remain unresolved; no missing kilometres are invented. Fuel and maintenance consume only fully allocated confirmed business kilometres, excluding personal kilometres.

These owner decisions are documented. The remaining work is an **implementation conformance audit**, not product clarification. The audit is recorded in [Breakeven Source Reconciliation Audit](BREAKEVEN_SOURCE_RECONCILIATION_AUDIT.md). Known mismatches must be corrected in the owning upstream implementation before breakeven consumes those outputs. Breakeven implementation remains blocked until the audit's blocking findings are closed and verified by regression tests.

### H.9 Scope order

Reliable actual full-cost breakeven is the priority. Driver Target, Target Passbook, predictive breakeven and final Performance presentation must not expand this clarification into new formula or UI work. Driver Target design remains last, as directed by the product owner. This amendment does not authorize those deferred tasks or any runtime implementation.



## Addendum I — Upstream source-contract reconciliation

**Approval:** Documentation reconciliation of previously discussed owner decisions.  
**Effective contract version:** 1.9  
**Implementation effect:** Documentation and audit record only. No breakeven runtime implementation is authorized or claimed by this addendum.

Addendum H.8 now identifies the authoritative contracts for all five upstream areas and records the conformance audit. Where an older statement in this contract conflicts with the later approved source rules, Addendum H and the linked owner contracts prevail. In particular, Addenda A, C and D's net-payout and payout-received recognition rules are superseded for this workflow by H.1; the v1.0 operating-breakeven output is superseded by Addendum B; and old direct-fuel-purchase daily expense language is superseded by H.2.

The source-contract reconciliation is a prerequisite to breakeven implementation. A green documentation commit does not close the runtime gaps identified in the audit. Do not start the breakeven calculation implementation until each blocking upstream mismatch has a fix in its owning feature, exact-SHA regression evidence, and updated audit status.
