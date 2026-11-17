# Performance End-to-End Implementation Conformance Audit

**Repository:** `amtalwalkar-sudo/sam-travels`  
**Audit baseline:** `main` after PR #93, merge commit `e755879cc24cef4ac254e1afc986bb0acb360616`  
**Audit date:** 2026-11-17  
**Purpose:** Record what is implemented, distinguish automated evidence from product completeness, identify contract conflicts and remaining acceptance work.  
**Disposition:** **Partially implemented; not approved as end-to-end complete.**

This is an implementation audit, not a new accounting-policy approval. The product rules remain owned by the existing versioned Performance/Breakeven and source-feature contracts, except where a later explicit product-owner decision is recorded. This document does not silently amend those rules.

## 1. Executive finding

PR #93 adds a substantial Performance calculation and presentation implementation. It includes a versioned pure calculation core, application read-model ports, source adapters, a Performance screen, Admin configuration, backup participation, shared browser/Room fixtures, and automated web/Android regression coverage.

The merge-time CI run reported Architecture, Web, Android, and Integrated regression checks successful. Production geocoder verification was skipped by workflow configuration. Those results establish that the checked automation passed on the PR head; they do not prove every product requirement, all production source-data states, final visual approval, or physical-device acceptance.

**The Performance screen must not be described as fully ready end to end yet.** The outstanding items below are material product-contract and acceptance gaps, not a claim that PR #93 failed to build.

## 2. Implemented in PR #93

The following implementation is present in the merged repository:

### 2.1 Calculation and orchestration

- Platform-neutral, versioned calculation core: `packages/domain/src/performance-calculation-v1.ts`.
- Application orchestration with independent read-model ports for business start date, target, revenue, operating costs, EMI, Compliance, manual pre-business costs, and completeness: `packages/application/src/performance-calculation-service.ts`.
- Separate EMI and Compliance inputs; the orchestration rejects cost-kind leakage between these ports.
- Source references/revisions and completeness states are carried into the calculation result.
- Integer-paise arithmetic, date validation, deterministic recovery allocation, period totals, lifetime totals, and target-position output are implemented in the domain calculation.
- Source adapters connect trip financial obligations, full-cost operating-cost projections, and the existing business-start-date allocation outputs.

### 2.2 Cost and revenue source categories

The PR wires the following source categories into the Performance calculation:

- Submitted completed-trip gross fares and submitted cancellation fees.
- Consumption-based fuel cost derived from the effective fuel cost/km history and confirmed business kilometres.
- Confirmed daily business-kilometre maintenance accruals.
- Paid platform fees, paid traffic challans, miscellaneous business expenses, and driver-paid trip toll/parking.
- Separately supplied EMI and Compliance daily allocations.
- Manual, EMI-origin and Compliance-origin pre-business recovery inputs.

The full-cost source adapter includes duplicate/ambiguous trip toll and parking handling and source completeness reporting. This audit records that the adapters exist; it does not replace the owning feature contracts or claim every historical record has been migrated or independently reconciled on a production dataset.

### 2.3 Settings, presentation and persistence

- Admin monthly Driver Target configuration.
- Multiple separately identified pre-business cost entries with amount and note.
- Performance dashboard with period presets/custom dates, revenue/cost/net KPIs, monthly target display, lifetime position, daily details, monthly roll-up, pre-business recovery detail, category breakdown, and source provenance/completeness.
- Browser and Android backup participants for Performance settings/records.
- Shared browser/Room parity fixture and automated tests.
- Rendered-PWA browser acceptance script for the Performance screen.

Relevant implementation paths include:

- `packages/features/performance/presentation/PerformanceScreen.tsx`
- `packages/features/performance/presentation/performance-screen-model.ts`
- `packages/features/performance/runtime.ts`
- `apps/web/src/ui/AdminPerformanceSettingsSection.tsx`
- `packages/application/src/performance-calculation-runtime.ts`
- `scripts/performance-screen-browser-acceptance.mjs`

## 3. Requirements not yet demonstrated as complete

### 3.1 Driver Target passbook completeness — outstanding

The current screen has a monthly roll-up labelled “Monthly Driver Passbook”, showing monthly revenue, costs, net, the configured target, and target position.

That is useful progress reporting, but it does not demonstrate the full passbook behaviour specified in the product contract. The contract requires the driver to see:

- Expected cumulative progress by the selected date.
- Actual eligible earnings above full-cost breakeven.
- Cumulative ahead/behind position and how an earlier shortfall is recovered later.
- Remaining amount required to reach the target.
- Progress over time, with the correct partial-period pacing.

The current UI's monthly net-minus-target comparison is not, by itself, proof of cumulative pacing, remaining-to-target, or carry-forward shortfall/recovery behaviour. Add calculation fixtures and visible presentation for those outcomes before calling the passbook complete.

### 3.2 Business-kilometre reporting — outstanding

The screen displays confirmed business kilometres and selected-period fuel cost per business kilometre. The approved contract also calls for historical daily/weekly/monthly distance summaries, active-driving-day counts, averages using actual active driving days, and historical kilometre trends.

Those additional reporting outputs are not demonstrated by the current screen implementation. Do not derive active days from distance alone: the approved business-day rule requires an Online shift and at least one ride assigned to that shift. Personal kilometres remain excluded.

### 3.3 Target rule and documentation conflict — must be reconciled

The current implementation displays the full configured monthly Driver Target for selected date filters and calculates lifetime target using inclusive calendar-month counting from the business-start month through the selected period-to month.

The existing `docs/BREAKEVEN_AND_DRIVER_TARGET_CALCULATION_CONTRACT.md` v1.9 says partial-month surplus targets and cumulative pacing are prorated by calendar days. Its older wording therefore conflicts with the later implementation/owner direction that period filters display the full monthly target.

Do not silently treat these as equivalent. The contract owner must keep one explicit rule for:
1. The target value displayed for a selected partial-month report.
2. The target amount used for a partial-month passbook achievement calculation.
3. Lifetime target accumulation when the business starts mid-month or the selected period ends mid-month.

Until the governing contract/addendum is reconciled with the approved latest owner decision, this is a documentation and acceptance ambiguity. The implementation's full-month display must not be presented as proof that partial-month passbook pacing is complete.

### 3.4 Pre-business recovery — targeted reconciliation required

The domain implementation allocates eligible manual, EMI and Compliance pre-business source amounts over the exact 18-month date interval beginning at the actual business start date, with the anniversary as an exclusive end. It distributes paise deterministically and reconciles allocated amounts to their source totals.

Add/retain explicit regression cases for:
- A mid-month business start.
- The partial first calendar month.
- Leap-year dates and a month-end anniversary clamp.
- The final eligible date and the first excluded anniversary date.
- Separate source provenance and no duplicate recovery of the same source.
- EMI and Compliance pre-start portions reconciled to their authoritative source allocations.

### 3.5 Final Performance UX status — not yet approved

The v1.9 product contract's Addendum F describes the temporary sanity-check surface and explicitly defers the intended final Performance redesign until calculation and wiring validation is complete. PR #93 adds a substantial dashboard surface, but CI/browser acceptance does not itself amend that product presentation decision or constitute owner sign-off of the final screen composition.

Record whether the current screen remains the temporary validation surface or is now the approved final Performance UX before declaring UI completion. No unrelated Admin redesign is implied.

### 3.6 Source conformance and real-device acceptance — outstanding gates

The older `docs/BREAKEVEN_SOURCE_RECONCILIATION_AUDIT.md` records a pre-PR #93 baseline and says Performance runtime implementation was blocked pending source read-model re-audit. PR #93 subsequently added the Performance adapters and tests, but the old audit is not rewritten by that merge. A post-PR #93 conformance pass must verify that each adapter consumes current authoritative owner outputs, including historical corrections, effective dates, unresolved distance, overlap withholding, loan schedule changes/closure, and toll/parking reversals.

The repository's physical phone acceptance is also a separate release gate and was not established by the merge-time CI result. Keep it deferred to the agreed end-of-work device-testing stage; do not report it as passed.

## 4. Required completion gates

The Performance workstream may be called end-to-end complete only when all applicable gates below are closed with evidence:

1. **Contract reconciliation:** publish an explicit versioned addendum resolving the monthly target/partial-period/lifetime target semantics and the status of the final Performance UX. Do not change approved calculations implicitly.
2. **Passbook:** implement and test expected cumulative pacing, ahead/behind, remaining target, shortfall carry-forward and later recovery, including mid-month start and partial selected periods.
3. **Distance summary:** implement and test active-driving-day counts and daily/weekly/monthly averages and trends, excluding personal distance and using the authoritative business-day definition.
4. **Recovery:** prove exact 18-month allocation and all boundary/provenance cases listed above.
5. **Source conformance:** update the pre-PR #93 source reconciliation audit with post-merge evidence and close every blocking finding against current source contracts.
6. **Cross-platform:** keep the same calculation fixtures and outcomes across browser and Android Room; include correction, retry, restore and incomplete-source cases.
7. **Presentation acceptance:** verify every displayed figure and explanation against the governing formula and obtain product-owner acceptance of the intended screen.
8. **CI and device acceptance:** rerun required Architecture, Web, Android and Integrated regression checks on the final implementation head. Complete the separately deferred physical-phone acceptance before release sign-off.

## 5. Explicit non-goals

- No multi-driver or multi-vehicle expansion.
- No operating-breakeven metric; the approved breakeven output is full-cost breakeven only.
- No speculative refunds, payout reconciliation, or new expense ledger.
- Predictive breakeven remains deferred until its forecast horizon and minimum-history/completeness rules are separately approved. Do not present estimates as actual results.
- No unrelated Admin restructuring.

## 6. Evidence and authority

- PR #93: [fix: align Performance calculations with contract v1.0](https://github.com/amtalwalkar-sudo/sam-travels/pull/93).
- Merge commit: `e755879cc24cef4ac254e1afc986bb0acb360616`.
- Product rules: `docs/BREAKEVEN_AND_DRIVER_TARGET_CALCULATION_CONTRACT.md` and its approved addenda.
- Source ownership: the Compliance, Business Start Date Cost Allocation, Finance Loan, Fuel/Business Expense, Work/Shift Odometer and Trip Snapshot contracts linked from the product contract.
- This audit supersedes the *implementation-status conclusion only* of the pre-PR #93 `docs/BREAKEVEN_SOURCE_RECONCILIATION_AUDIT.md`. It does not erase that historical evidence or assert that every old finding has been closed.

**Final status: calculation foundation and substantial dashboard implementation merged; Performance end-to-end product acceptance remains open.**


## PR #97 architecture-wiring addendum — 2026-11-17

This addendum updates the implementation evidence without changing the product-policy authority or claiming that the Performance workstream is fully accepted.

### Cross-source snapshot coherence status

PR #97 adds `PerformanceCalculationSnapshotBoundaryV1`, wired to the same application `RecordRepository` used by the Performance source adapters. The service captures the shared record revision vector before source preparation and after all read-model consumption, rejects detected drift, and includes the repository fingerprint plus source revision provenance in the result. A regression mutates a shared record during calculation and asserts rejection.

**Finding status: materially addressed with a bounded optimistic fence; strict transactional snapshot isolation is not implemented.** This is stronger than the earlier per-adapter/source-identity checks, but it is not an MVCC or serializable transaction. The guarantee and limitation are recorded in `docs/PR_97_ARCHITECTURE_CONFORMANCE.md`. The remaining source-conformance audit still needs to verify every authoritative owner output and correction/effective-date path; this addendum does not close that broader gate.

### Canonical fixed-cost recovery correction

The current Performance service now consumes canonical daily EMI and Compliance allocations, including their pre-business carry-forward rows, and only manual pre-business entries enter the generic recovery schedule. The former separate EMI/Compliance pre-business recovery inputs were removed to avoid counting the same carry-forward twice. Focused adapter/service tests and the shared Android Performance fixture were updated for this ownership rule.

### Driver Target implementation evidence

The current calculation implementation uses calendar-day proration for the selected date range and carries the target settings revision into provenance. Unit fixtures and rendered-PWA Performance acceptance cover the current implementation. The governing product contract and the earlier target-semantics ambiguity remain the policy authority; this architecture addendum does not approve a new target rule or close the separate passbook/lifetime acceptance requirements.

### Evidence boundary

Exact-head CI for PR #97 head `7a11dd7221381d058b991346bb8d40cd1a625061` passed Architecture, Web, Android and Integrated regression (run #44052752021). Subsequent documentation-only changes require their own exact-head CI confirmation. Physical-device acceptance remains deferred. The outstanding passbook, distance-summary, product-owner UX and production-data source-reconciliation gates in this audit remain open.

## 9. Product-owner addendum implementation follow-up — 2026-11-17

The product owner confirmed:
- Driver Target Passbook must compare cumulative actual surplus against cumulative calendar-day-prorated target, carry earlier shortfalls forward, and show ahead/behind plus remaining target.
- An active driving day requires an Online Work shift and at least one ride recorded against that exact shift and operational date.
- Historical Maintenance expense corrections must preserve history and be reflected in any Performance projection that consumes the corrected source.

Implementation added on PR #97:
- PerformanceCalculationResultV1.passbook now contains a daily cumulative projection from Business Start Date through the selected end date: expected cumulative target, actual daily surplus, actual cumulative surplus, ahead/behind position and remaining target.
- The Passbook aggregate reconciles to the same calculation's lifetime profit and lifetime target; remaining target is never negative.
- Performance screen now has a dedicated Driver Passbook view, separate from the monthly roll-up. Rendered-PWA acceptance asserts the cumulative target and remaining-balance presentation.
- Full-cost daily activity now exposes active-driving-day qualification, count and average confirmed business kilometres per active driving day.
- Qualification uses submitted completed-ride or cancellation-fee closeout records carrying immutable Work trip context (shiftId, vehicleId, operationalDate). Work only captures that context when a shift is active, so the context proves the Online-shift side without waiting for the shift to end. Where the matching finalized Work daily-distance projection is not yet available, the day remains counted but the distance source is marked incomplete; the average must be treated as provisional.
- The Performance screen exposes active-day count and average business kilometres per active day. Browser acceptance checks both metrics.
- Business Expenses backup validation now validates historical correction records, contiguous chain revisions, target revisions, projected source values and correction-chain heads. A browser backup/restore regression corrects a fuel amount, exports/restores the records and verifies the original remains immutable while the corrected projection is reproducible.
- Maintenance backup validation now validates its append-only expense correction chains and chain heads. An IndexedDB records round-trip regression verifies the corrected projection and original source survive restoration.

### Boundaries still requiring closure

- The new code and regressions are awaiting exact-head CI. Do not mark these implementation slices CI-verified until Architecture, Web, Android and Integrated gates pass on the latest PR head.
- The Maintenance expense correction UI targets visit/repair expense records, while the frozen Performance cost contract currently includes Maintenance accrual as confirmed business kilometres × effective per-km rate. It does not explicitly include visit/repair amounts as a second Performance cost. The correction chain is now backup-validated and reprojectable, but whether those visit/repair amounts themselves enter Full-cost breakeven remains a separate accounting decision; no second maintenance cost has been silently added.
- Physical Android device acceptance remains separate from automated Room/emulator verification.


### Effective-date and correction provenance refinement — 2026-11-17

- ComplianceAnalysisService now exposes immutable correction-chain references separately from the original Compliance record revision. Business Start Date allocation reports carry those references, and allocation provenance fingerprints them. Performance fixed-cost daily rows include the Compliance correction references, so a corrected validity date or premium is visible in downstream provenance after the owner service recalculates the canonical daily rows.
- EMI daily source references now preserve scheduleVersion in addition to the source record revision. The Performance source-revision fingerprint includes scheduleVersion and rejects conflicting versions for the same source identity.
- Existing owner-path regressions continue to cover Compliance renewal date/amount restatement, EMI prepayment schedule history, settlement cutoff and competing stale-prepayment preview rejection. The new provenance assertions verify Compliance correction IDs and EMI schedule version survive into Performance.
- Exact-head CI is still pending; these changes are not yet verified.
