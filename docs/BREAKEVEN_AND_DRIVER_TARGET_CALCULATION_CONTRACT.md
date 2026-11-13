# Breakeven and Driver Target Calculation Contract

**Document ID:** ST-PERFORMANCE-BREAKEVEN-TARGET  
**Version:** 1.4  
**Status:** Approved product baseline with Addenda A through D; further additive amendments require explicit product-owner approval  
**Implementation authorization:** Not granted by this document alone  
**Delivery:** Documentation-first foundation for PR 2  
**Timezone:** Asia/Kolkata business dates  
**Currency:** INR; persisted money uses integer paise

## 1. Purpose and authority

This contract freezes the product decisions agreed for the Breakeven and Daily Driver Target workstream. It is the product-level owner for the rules stated here. It supplements, and does not replace, the repository's existing data, feature-extension, form, persistence, transaction/recovery, calculation-approval, business-start-date allocation, and presentation contracts.

This document records approved scope, not proof of implementation. Runtime work must follow the existing technical contracts and pass the required regression and CI gates. An unresolved item in Section 10 must not be silently guessed or promoted into production behaviour.

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

## 4. Platform charges and earnings

Platform charges are recorded as actual expense entries by the driver. Whenever the driver buys a platform pass or pays a commission amount, the driver enters the amount actually paid. A commission/pass charge is recognized on its actual payment/entry date, not accrued before the driver pays and records it. That recorded amount is included once in the single full-cost breakeven calculation and reduces the earnings available to cover costs and target progress.

Do not build a platform commission engine for this scope: do not infer a commission percentage base, calculate a commission from trip fares, reconstruct pass coverage, or require platform fee-type configuration to calculate breakeven. The amount entered by the driver is the authoritative platform-charge expense record.

The platform-charge entry must use the existing shared form, persistence, correction, backup, and recovery foundations. Preserve the source entry and its audit history. A recorded platform charge must be recognized exactly once; it must not also be subtracted from earnings through a second normalization path. If an upstream earning source is already net of that same recorded charge, the calculation must identify the overlap and prevent duplicate deduction rather than charge it twice.

Historical correction and restatement behaviour follows the repository's existing source-record correction and calculation-version contracts; do not silently rewrite historical source entries.

### 4.1 Canonical earnings and one-time platform-charge recognition

- All downstream calculations use one canonical earnings value and one expense ledger representation for each recorded platform charge.
- The driver's pass/commission entry is deducted exactly once in the full-cost breakeven and target accounting.
- Where an upstream payout or earning record is already net of a particular charge, do not subtract that same charge again. Preserve enough source detail to detect and prevent duplicate recognition.
- Do not invent or calculate an unentered platform fee. The driver-entered amount is authoritative for this scope.
- This rule applies to actual breakeven, target progress, passbook, period summaries, and estimated breakeven inputs.

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

### 6.3 Explicit exclusion

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

**Earnings eligibility:** Everything earned above full-cost breakeven counts toward the driver's target. Cancellation fees received count as earnings. Do not narrow this to a single income source without an approved rule. The passbook must use the same canonical net-earnings amount and breakeven definitions as the calculation engine and retain traceability to contributing source records. Platform fees already deducted in canonical earnings must never be deducted again in passbook progress.

The passbook is a derived, auditable projection. It must not create or mutate source income, expense, trip, or payment records.

## 9. Business-kilometre summary and predictive breakeven

### 9.1 Kilometre summary

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
- Do not redesign the Breakeven screen, Performance screen, dashboards, navigation, or the wider UI as part of this contract.
- The remaining presentation and screen design will be discussed and authorized separately.

## 11. Add-on architecture and change control

The frozen baseline must support additive extension without disturbing existing stable behaviour.

- Breakeven, target, passbook, kilometre summaries, and prediction calculations must have explicit stable identities, versions, owners, input/output contracts, units, precision, period semantics, missing-data behaviour, and regression fixtures.
- Calculations remain deterministic and independent of React, forms, storage adapters, network, and Android-specific code.
- New metrics or prediction methods are additive extensions owned by the appropriate feature and published through the existing feature-extension architecture.
- Existing calculation IDs, versions, outputs, source facts, and historical results must not change merely because an add-on is introduced.
- A change to an approved formula requires explicit owner approval, a versioned contract change, historical recalculation/preservation policy, and regression fixtures.
- Presentation can be replaced independently without rewriting calculations, persistence, or source integrations.
- Reuse existing registries, form runtime, repositories, backup/restore, recovery, lifecycle, and architecture enforcement. Do not create duplicate frameworks.

## 12. Delivery and verification requirements

Implementation must include:
- The approved calculation foundation and the configuration forms authorized by the product owner.
- Regression fixtures for every registered calculation, including normal, boundary, missing/incomplete-data, and historical-correction cases.
- Reconciliation tests proving daily, weekly, monthly, annual, and arbitrary date-range consistency under the approved period convention.
- Passbook tests for ahead-of-target, behind-target, cumulative recovery, and period boundaries.
- Business-kilometre summary tests for active-day denominators and exclusion of personal-use distance.
- Advisory prediction tests proving predictions remain separate from actual calculations and cannot mutate configured targets or source data.
- Documentation updates and green required web, architecture, Android, and integrated CI gates.

A green CI run is automated evidence only. Physical-device acceptance remains a separate release gate and is intentionally deferred until the agreed end-of-work testing stage.

## 13. Open decisions — approval required before affected production calculations

The following details are intentionally not invented by this contract:

1. Annual-to-monthly-to-daily amortization convention, including calendar-day treatment, leap years, and paise residual distribution.
2. The precise monthly Driver Target meaning: total desired net earnings or desired surplus above full-cost breakeven.
3. How a monthly target is prorated for a partial month and how expected cumulative target progress is paced within a month.
4. Exact source/eligibility rules for earnings, including refunds, reversals, adjustments, cancellation fees, and unsettled amounts, consistent with the approved canonical earnings and single-recognition principles.
5. Handling of missing, corrected, or disputed odometer-derived business-kilometre records. Business kilometres are confirmed as odometer-derived only; personal kilometres are excluded and GPS displacement is not a substitute.
6. The detailed advisory prediction horizon and minimum history/completeness requirements. The approved estimate inputs include historical business kilometres and fuel-efficiency history; estimated results remain separate from actual results and never change actuals.
7. Effective-date and historical-recalculation behaviour for maintenance-rate changes and other source-record corrections.

These are discussion items, not permission to make assumptions. The product owner may approve them individually and record them as dated addenda. Until then, affected calculations remain unregistered or explicitly unavailable rather than returning guessed figures.

## 14. Approval and amendment history

- **v1.0 — Frozen baseline:** Records the agreed annual-first breakeven architecture, platform fee types, KM-based manually configured maintenance rate, operating/full-cost breakeven distinction, monthly Driver Target, passbook, business-kilometre summary, advisory predictive direction, forms-only scope, and add-on architecture.
- **v1.1 / Addendum A — Approved canonical earnings rule:** Establishes canonical net earnings for every downstream calculation and requires each platform fee to be recognized exactly once.
- **v1.2 / Addendum B — Simplified full-cost model:** Replaces two breakeven outputs with one full-cost breakeven; makes driver-entered pass/commission payments the authoritative platform-charge expense entries; confirms the included cost categories; approves full-cost breakeven as the Driver Target basis; and permits separate actual and estimated full-cost breakeven values.
- **v1.3 / Addendum C — Target, period, earnings and historical rules:** Approves the monthly target as additional surplus above full-cost breakeven, calendar-day partial-month proration, received cancellation fees as earnings, calendar-day annual fixed-cost allocation, historical maintenance-rate preservation, odometer-only business kilometres, and advisory estimates based on historical kilometres/fuel efficiency. Platform commission/pass charges are recorded when actually paid.
- **v1.4 / Addendum D — Platform payout recognition timing:** Platform earnings count only when payout is actually received by the driver, matching the paid-entry timing for commission/pass expenses.
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
