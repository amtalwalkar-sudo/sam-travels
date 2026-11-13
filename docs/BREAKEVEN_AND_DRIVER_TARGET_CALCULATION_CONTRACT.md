# Breakeven and Driver Target Calculation Contract

**Document ID:** ST-PERFORMANCE-BREAKEVEN-TARGET  
**Version:** 1.0  
**Status:** Frozen product baseline; additive amendments require explicit product-owner approval  
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

The exact day-count and month-length convention used when amortizing annual figures is an open calculation detail until approved in Section 10. Do not assume a 365-day, 360-day, fixed-30-day, or calendar-day divisor without approval and regression examples.

### 3.2 Timeline consistency

- Every reported period must use the same calculation version and source facts.
- Weekly and custom date ranges must reconcile to the daily results for the dates they contain.
- Monthly and annual summaries must reconcile to their corresponding lower-level results under the approved annual-first amortization convention.
- A period boundary uses Asia/Kolkata business dates.
- Missing, incomplete, stale, or unavailable source data must remain explicit; it must not silently become zero or a complete-looking result.

## 4. Platform / performance fee configuration

Admin must be able to configure the fee arrangement for each applicable earning platform. The supported fee types are:

1. **Commission** — percentage-based fee.
2. **Pass** — pass-based charge.
3. **No fee** — zero platform fee.

The applicable fee arrangement must be used when calculating net platform proceeds and breakeven. The model must support platforms with different fee types; it must not assume all platforms charge commission.

Fee configuration is business data and must use the shared form, persistence, correction, backup, and recovery foundations. Changes to fee arrangements must not silently rewrite historical calculations; effective-date and historical-restatement behaviour must be explicitly defined before production registration.

The exact commission base, pass amount and billing period, treatment of partial pass periods, and fee-change effective-date policy remain open until approved in Section 10. Do not infer that a pass is necessarily daily or monthly.

## 5. Maintenance cost

- Maintenance cost is calculated using business kilometres.
- Admin manually configures the maintenance rate in INR per kilometre.
- Maintenance cost is the configured rate multiplied by the applicable business kilometres.
- Do not introduce a separate complex maintenance allocation, prediction, or asset-life framework as part of this scope.
- Business kilometres exclude personal-use kilometres.
- The maintenance rate configuration must use the existing shared form architecture and must preserve the rate that was applicable to the calculation period once effective-date behaviour is approved.

## 6. Breakeven definitions

Two breakeven outputs are required.

### 6.1 Operating breakeven

The earnings required to cover the vehicle's operating costs. It includes:
- Fuel costs.
- KM-based maintenance cost.
- Applicable platform / performance fees.
- Other operating costs already represented by approved source records and calculation contracts.

It excludes:
- EMI.
- Traffic challans.

### 6.2 Full-cost breakeven

The earnings required to cover operating costs plus the broader vehicle costs included in this view. It includes:
- All operating breakeven costs.
- The full scheduled EMI amount; do not split EMI into principal and interest for this calculation.
- Traffic challans.

Use existing Finance and Business Start Date allocation outputs where applicable. Do not duplicate their source calculations or introduce a second EMI/compliance allocation implementation.

### 6.3 Explicit exclusion

This contract does not introduce a separate dated vehicle-expense allocation system or a new dated-expense calculation framework. Do not add a battery-specific, date-prorated expense subsystem under this workstream. Only costs explicitly included by the approved definitions and existing authoritative contracts may contribute.

## 7. Daily Driver Target

- Admin configures a **monthly Driver Target**.
- The target is always above the applicable breakeven.
- The amount above breakeven is the progress that counts toward the driver's target.
- The target is not a percentage of breakeven and is not a hardcoded uplift.
- Daily, weekly, monthly, annual, and custom-period target comparisons must be derived consistently from the configured monthly target and the same breakeven foundation.
- The target must not silently change actual breakeven calculations.

The target's precise basis (operating versus full-cost breakeven), its exact interpretation as a monthly surplus requirement, and the approved calendar proration for partial months are open details in Section 10. Until those are approved, implementation must not guess.

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

**Earnings eligibility:** Everything earned above the applicable breakeven counts toward the driver's target. Do not narrow this to a single income source without an approved rule. The passbook must use the same authoritative earning and breakeven definitions as the calculation engine and retain traceability to contributing source records.

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

It may use historical business kilometres and validated cost inputs to estimate future kilometres, fuel costs, maintenance costs, and future operating/full-cost breakeven. Predicted values must be visibly and semantically separate from actual approved calculations.

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

1. Commission percentage base and treatment of taxes, adjustments, refunds, and cancellation fees.
2. Pass amount, billing period, coverage dates, partial-period handling, and pass changes.
3. Effective-date and historical-recalculation behaviour for platform fee configuration and maintenance-rate changes.
4. Annual-to-monthly-to-daily amortization convention, including calendar-day treatment, leap years, and paise residual distribution.
5. The exact list of additional operating costs included beyond fuel, maintenance, and platform fees.
6. Whether the Driver Target is measured above operating or full-cost breakeven, and the precise monthly-target/surplus interpretation.
7. How a monthly target is prorated for a partial month and how the expected cumulative target is paced within a month.
8. Exact source/eligibility rules for earnings, including the treatment of refunds, reversals, adjustments, cancellation fees, and unsettled amounts, consistent with the approved principle that everything above breakeven counts.
9. The canonical business-kilometre source and handling of missing, corrected, or disputed distance records.
10. The initial advisory prediction method, forecast horizon, and minimum history/completeness requirements.

These are discussion items, not permission to make assumptions. The product owner may approve them individually and record them as dated addenda. Until then, affected calculations remain unregistered or explicitly unavailable rather than returning guessed figures.

## 14. Approval and amendment history

- **v1.0 — Frozen baseline:** Records the agreed annual-first breakeven architecture, platform fee types, KM-based manually configured maintenance rate, operating/full-cost breakeven distinction, monthly Driver Target, passbook, business-kilometre summary, advisory predictive direction, forms-only scope, and add-on architecture.
- Future changes must be recorded as explicit, dated, owner-approved addenda. Do not silently edit the meaning of this frozen baseline.
