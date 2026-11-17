# Sam Travels — Calculation Authority and Application Wiring Audit v1

**Audit status:** Baseline audit complete; owner policy decisions have been reconciled in the current owner contracts. Implementation and wiring findings remain open pending code changes and exact-SHA verification.  
**Repository:** `amtalwalkar-sudo/sam-travels`  
**Audited baseline:** `main` at `2148f244ac20f1ab503002763b7cea856c4c41ec` (2026-11-16; includes merged PRs #93, #94 and #95).  
**Audit date:** 2026-11-17  
**Scope:** Business calculation ownership, authoritative source records/read models, application orchestration, downstream consumers, provenance, contract alignment, UI/UX shell independence, screen/component boundaries, and presentation-to-application wiring.  
**Change policy:** Documentation only. No application source, tests, database schemas, migrations, records, or calculation framework were changed.

## 1. Executive summary

Sam Travels already has a meaningful modular architecture. It is not a repository that needs a wholesale architectural rewrite.

The existing design has the right broad separation:

- Feature modules own business records, validations, calculations and public capabilities.
- Application services coordinate use cases and adapt public source read models.
- Pure domain calculation modules implement deterministic, versioned formulas.
- Presentation collects inputs and displays projections; it is not the authority for business values.
- The existing persistence/lifecycle foundation owns the platform storage boundary, transaction/recovery, backup/restore and compatibility mechanics.

The calculation work already present includes Work/Shift daily business-kilometre allocation, Maintenance daily accruals and rate history, fuel interval/rate history, Business Start Date EMI/Compliance allocation, Finance loan schedule/prepayment/settlement, Full Cost Breakeven v1, and Performance Calculation v1.

**The primary issue is not absence of a calculation architecture. It is whether the existing owner outputs are consumed unchanged and coherently, whether calculation policies agree, and whether a complete calculation snapshot is traceable from source revisions through the final Performance result.**

The audit found concrete areas that need correction or explicit reconciliation before further architectural cleanup:

1. The Performance fixed-cost adapter reconstructs EMI/Compliance daily allocations from source amounts and dates instead of simply consuming the canonical daily amounts already published by the Business Start Date allocation owner.
2. The pre-business recovery policy is owner-approved: all full qualifying pre-business source amounts are combined into one downstream Breakeven pool, divided into 18 equal monthly instalments, then distributed across each recovery month's days. The fixed monthly Driver Target policy is also resolved in Breakeven/Driver Target Contract v2.0, Addendum J: only the first Business-Start-Date month is prorated; every later month carries the full target independent of operating days or selected partial date ranges.
3. Performance's operating-cost and fixed-cost adapters obtain their source projections independently. The operating-cost path reaches the allocation service through FullCostBreakevenService, while the fixed-cost path calls the allocation service separately. The current orchestration does not establish one shared cross-source snapshot boundary for those two reads.
4. Some repository documentation still describes Full Cost Breakeven runtime work as blocked, even though the source engine and Performance integration have since been merged. The newer Performance conformance audit correctly records remaining acceptance gaps, but the older status language has not been reconciled.\n5. The UI/UX architecture already defines replaceable shell and feature-screen contracts, but current composition still contains screen-specific wiring, and the available tests prove only selected replacement seams—not that every screen and its internal presentation components can be replaced independently end to end.

These are targeted ownership, policy and wiring problems. They do not justify creating a new central formula engine, replacing the persistence foundation, or moving every formula into one large module.

**Recommendation:** Keep the existing feature-owned calculation modules. Correct the Performance adapters and contract precedence, then prove a consistent, provenance-complete calculation snapshot and downstream result. Treat the outstanding Performance passbook, distance-summary, product-contract and device gates as separate acceptance work, not as reasons to redesign the whole application.

## 2. Audit method and evidence boundary

The audit used the current `main` baseline above and inspected the repository's architecture/authority documentation, calculation contracts, the Performance conformance audit, and representative implementation paths for Finance/Compliance allocation, fuel/business expenses, Maintenance, trip financials, Full Cost Breakeven and Performance. Work/Shift distance was assessed against its normative owner contract; a complete Work/Shift source/test path inventory remains outstanding.

Key documents inspected:

- `README.md`
- `ARCHITECTURE.md` and `DEVELOPMENT_PLAN.md`
- `docs/CONTRACT_INDEX.md`
- `docs/PERMANENT_APPLICATION_ARCHITECTURE.md`
- `docs/PERMANENT_APPLICATION_ARCHITECTURE_AUDIT.md`
- `docs/AUTHORITY_AND_RESPONSIBILITY_ALLOTMENT_MAP.md`
- `docs/FINANCE_PERFORMANCE_CALCULATION_APPROVAL.md`
- `docs/BREAKEVEN_AND_DRIVER_TARGET_CALCULATION_CONTRACT.md` v1.9
- `docs/BUSINESS_START_DATE_COST_ALLOCATION_CONTRACT.md`
- `docs/WORK_SHIFT_ODOMETER_AND_DAILY_DISTANCE_CONTRACT.md`
- `docs/WORK_DRIVER_TRIP_SNAPSHOT_INTEGRATION_CONTRACT.md`
- `docs/FUEL_ENTRY_AND_BUSINESS_EXPENSE_CALCULATION_CONTRACT.md`
- Finance loan calculation, prepayment and settlement/closure contracts
- `docs/PERFORMANCE_END_TO_END_IMPLEMENTATION_CONFORMANCE_AUDIT.md`

Representative implementation paths inspected:

- Work/Shift implementation status was assessed against its normative odometer/daily-distance contract; the exact source/test path inventory remains to be completed.
- `packages/features/maintenance/index.ts` and Maintenance application service/rate/accrual implementation
- `packages/features/business-expenses/index.ts`
- `packages/features/finance/index.ts`
- `packages/features/compliance/index.ts`
- `packages/domain/src/business-start-date-cost-allocation.ts`
- `packages/application/src/business-start-date-cost-allocation-service.ts`
- `packages/application/src/full-cost-breakeven-service.ts`
- `packages/domain/src/full-cost-breakeven.ts`
- `packages/application/src/performance-calculation-runtime.ts`
- `packages/application/src/performance-calculation-service.ts`
- `packages/application/src/performance-operating-cost-adapter.ts`
- `packages/application/src/performance-fixed-cost-allocation-adapter.ts`
- `packages/application/src/performance-trip-revenue-adapter.ts`
- `packages/domain/src/performance-calculation-v1.ts`
- `packages/application/src/trip-financial-service.ts`
- Finance loan prepayment and settlement application services

This is an architecture-authority and application-wiring audit, not a complete line-by-line audit of every source file, every test, every screen, or every backup participant. The UI/UX section adds targeted inspection of the shell contract, screen host, primary composition, and representative presentation tests; a full screen-by-screen source/test inventory remains outstanding. Where full implementation/test evidence was not directly inspected, the status is explicitly marked partial or requiring verification rather than assumed complete. The pre-existing Permanent Architecture Audit and Performance End-to-End Conformance Audit remain separate evidence records and are not rewritten by this document.

## 3. Governing architecture decisions

The following existing decisions remain correct and should be preserved:

1. **Feature ownership:** each business capability owns its records, domain rules and calculations.
2. **Source owns meaning; consumer owns use:** a consumer may aggregate an owner's published value but must not recreate the source feature's business rule.
3. **Application coordinates:** application services may orchestrate multiple public capabilities but must not become a catch-all business domain.
4. **Pure calculation domains:** formulas should be deterministic, versioned, platform-neutral and independently testable.
5. **Presentation is not authority:** UI components collect data and display results; they do not calculate financial or operational truth.
6. **One store per runtime:** browser-only PWA uses IndexedDB; installed Android uses Room through the existing native repository boundary.
7. **Historical provenance:** effective dates, source IDs/revisions, calculation versions and correction history must remain traceable.
8. **Reuse existing Stage 5 mechanisms:** do not create new registries, lifecycle, backup, migration, transaction or recovery systems.
9. **No speculative infrastructure:** no generic formula engine, universal event bus, microservices, or giant central calculation class.

The existing architecture is therefore a modular calculation system with domain-owned formulas and application-level composition—not a single central formula engine.

## 4. Calculation authority map

| Domain / capability | Authoritative owner | Canonical source facts or output | Primary consumers |
|---|---|---|---|
| Shift lifecycle and odometer | Work/Shift | Immutable shift transition events and confirmed start/end odometer readings | Daily distance projection; Maintenance; reporting |
| Daily business/personal distance | Work/Shift | Rebuildable `work:daily-business-km` projection; allocated and unallocated kilometres remain separate | Maintenance accrual; Full Cost Breakeven; Performance distance reporting |
| Trip context and operational date | Work/Shift snapshot at trip creation | Immutable shift, driver, assignment, vehicle and 04:00 operational-date context | Trip financial closeout; Timeline; reporting |
| Trip revenue and driver-paid toll/parking | Trips / Trip Financial | Submitted completed-ride financial and cancellation-fee obligations linked to immutable trip context | Performance revenue and cost adapters |
| Fuel purchase facts and interval/rate history | Business Expenses / Fuel | Immutable fuel purchases; full-to-full interval outputs and effective weighted cost/km history | Full Cost Breakeven; Performance |
| Platform fees, challans and miscellaneous expenses | Business Expenses, with Compliance owning challan policy/presentation grouping | Typed paid expense entries and daily expense outputs, with source IDs/revisions and reversal/correction treatment | Full Cost Breakeven; Performance |
| Maintenance visits, expenses and per-km rate history | Maintenance | Maintenance records, effective-dated rate history and immutable daily accruals | Full Cost Breakeven; Performance; Maintenance history |
| Compliance records and validity/overlap | Compliance | Immutable validity/renewal records and reviewed overlap state | Business Start Date allocation; Performance |
| Loan, EMI schedule, payments, prepayment and settlement | Finance | Loan schedule versions, payment ledger, prepayment revisions and closure state | Business Start Date allocation; Performance |
| Business Start Date carry-forward allocation | Shared reporting allocation capability using Finance and Compliance owner facts | Versioned daily/monthly/yearly EMI and Compliance allocation report, including source-level provenance/completeness | Breakeven and Performance |
| Full-cost operating-cost aggregation | Full Cost Breakeven v1 | Daily activity and dated operating-cost projection assembled from owner outputs | Performance operating-cost adapter and cost reporting |
| Performance result | Performance v1 | Period/lifetime revenue, costs, profit, target position, recovery and completeness/provenance | Performance presentation and future reports |
| Business settings / Driver Target | Business Settings / Performance Admin settings capability | Business Start Date and configured target values | Allocation and Performance |
| Persistence, backup, restore and recovery | Existing shared Stage 5/platform mechanisms plus feature-owned participants | Durable owner records, validated snapshots and restore/recovery outcomes | All persistent features |

Admin is a presentation/access surface, not a business-record or calculation owner. Maintenance history may present Maintenance-owned accruals, but it must not calculate a competing accrual. Performance may combine owner outputs, but it must not rewrite source facts or silently replace source policies.

## 5. Existing calculation and wiring path

The current intended data flow is:

```text
Work/Shift odometer events
        |
        v
Work daily business-km projection
        |
        +---------------------> Maintenance effective rate history
        |                               |
        v                               v
Maintenance immutable daily accruals <-+
        |
        +------------------------------+
                                       |
Fuel purchases -> Fuel interval/rate history
                                       |
Business expenses -> Daily paid expense outputs
                                       |
Trips -> Submitted trip financial facts|
                                       v
                           Full Cost Breakeven source projection
                                       |
Finance loan schedule/payment history  |
Compliance validity/overlap             |
Business Start Date allocation           |
        |                               |
        +-----------> Performance adapters
                         |
                         v
                Performance v1 calculation
                         |
                         v
             Performance presentation/read model
```

This is a logical dependency map, not a claim that every arrow has complete end-to-end acceptance. In particular, the current Performance implementation reads the fixed-cost allocation report through a separate adapter in addition to the Full Cost Breakeven source projection. That snapshot issue is detailed below.

## 6. Findings and status matrix

Status meanings:

- **Implemented:** an owner, contract and corresponding implementation mechanism were found.
- **Partially implemented:** a mechanism exists, but end-to-end wiring, proof or policy reconciliation is incomplete.
- **Needs correction:** the inspected implementation appears to cross an ownership boundary or conflict with an authoritative contract.
- **Not verified:** this audit did not inspect enough source/test evidence to make a reliable implementation claim.
- **Not necessary currently:** no additional framework or rewrite is justified.

| ID | Area | Status | Finding |
|---|---|---|---|
| CA-01 | Feature-owned calculations | Implemented | Existing feature/domain modules already own distance, fuel, maintenance, EMI/Compliance allocation and Performance formulas. Preserve them. |
| CA-02 | Work/Shift distance authority | Implemented by contract; runtime acceptance partially verified | Work/Shift contract makes confirmed odometer events authoritative and excludes pending 04:00 distance from allocated totals. Maintenance is required to consume only fully allocated daily km. Keep physical-device acceptance separate. |
| CA-03 | Maintenance accrual authority | Implemented by contract and service evidence | Maintenance stores immutable daily accruals with source daily-distance ID/revision, operational date, effective rate snapshot and deterministic identity. Personal km/amount are separate from business cost. Do not recalculate these in Performance. |
| CA-04 | Fuel cost authority | Partially verified | Fuel feature exports interval and weighted cost-rate calculations; Full Cost Breakeven consumes effective fuel cost/km with purchase provenance. A complete correction/replay/downstream test inventory remains to be checked. |
| CA-05 | Expense recognition | Partially verified | Typed expense records and daily outputs are consumed by Full Cost Breakeven. Toll/parking duplicate and reversal logic exists in the adapter; historical ambiguous records remain explicit review states. Complete source-to-report reversal parity still needs a focused inventory. |
| CA-06 | Finance and Compliance source ownership | Implemented by contracts/services | Finance owns loan schedule/payment/prepayment/settlement; Compliance owns validity/renewal/overlap; the shared allocation capability owns their reporting carry-forward policy. |
| CA-07 | Business Start Date allocation | Implemented as a versioned domain/service | The owner publishes daily source rows and validates that allocated source rows reconcile exactly to each source amount. Consumers should use these rows as canonical allocations. |
| CA-08 | Full Cost Breakeven | Implemented | A pure versioned calculation and application source-projection service exist. The service composes Maintenance accruals, fuel rate history, expense outputs, Finance/Compliance allocation and trip financial facts. |
| CA-09 | Performance calculation | Implemented, product acceptance partial | A pure versioned calculation and application orchestration exist, with separate source ports and provenance/completeness fields. PR #94 records outstanding passbook, distance-summary, policy, source-conformance, UX and device gates. |
| CA-10 | Fixed-cost adapter authority | Needs correction/review | Performance's fixed-cost adapter derives daily EMI/Compliance amounts from source amount and dates instead of consuming the canonical `source.daily[].amountPaise` rows unchanged. |
| CA-11 | Calculation snapshot consistency | Partially implemented; needs correction | Performance's operating-cost adapter snapshots Full Cost Breakeven's projection, while its fixed-cost adapter independently snapshots Business Start Date allocation. Both paths reach the allocation owner separately; there is no shared snapshot token/result guaranteeing the same source revisions across both reads. |
| CA-12 | Calculation policy agreement | Owner policy resolved; runtime conformance remains open | The owner approved the aggregate 18-month pre-business recovery pool and a fixed monthly Driver Target independent of business days, with proration only for the first calendar month from the Business Start Date. The Breakeven/Driver Target Contract v2.0 Addendum J records the target rule. Runtime display, passbook and lifetime totals still require regression proof. |
| CA-13 | Provenance completeness | Partially implemented | Source IDs/revisions and completeness are carried through the calculation types. A complete source-to-final-result trace across all owner outputs and corrections is not yet demonstrated by the inspected evidence. |
| CA-14 | Downstream consumer convergence | Not verified | Performance and Maintenance have identified consumers, but a repository-wide inventory of every report/history/dashboard consumer and proof that none independently recalculates the same figure remains outstanding. |
| CA-15 | Backup/restore and persistence parity | Partially verified | PR #93 records Performance browser/Room backup participants and shared parity fixtures. This audit did not independently inspect every participant/restore validator or the complete cross-feature recovery matrix. |
| CA-16 | UI ownership | Implemented by architecture contract; targeted verification outstanding | Existing architecture separates presentation from feature ownership. A full screen-by-screen audit of calculation logic in presentation files remains outstanding. |\n| CA-19 | Shell replacement boundary | Implemented by contract and selected tests; runtime coverage partial | Framework-neutral shell definition and renderer injection allow shell replacement in principle. Existing contract tests prove replacement shell definitions can preserve navigation capabilities, but do not yet prove all live runtime composition, lifecycle, overlays, back/focus handling and platform variants are replaceable together. |\n| CA-20 | Independent screen replacement | Partially implemented; needs stronger proof | Versioned feature presentation contexts and `FeatureScreenHost` isolate feature renderers and failures. `PrimaryScreenComposition.tsx` still centrally branches on Drive/Timeline/Performance/Admin and constructs screen-specific contexts. Tests prove a fixture screen can mount inside a replacement shell, not that every production screen can be swapped without editing unrelated composition or foundation code. |\n| CA-21 | Within-screen presentation independence | Not verified | The current audit has not established that each screen separates composition, presentation state, view model/projection, interaction adapter and visual components consistently. Performance is a priority inspection target because its host receives calculation service capabilities directly; verify that the screen consumes a presentation-ready model and approved application actions rather than owning calculation orchestration. |\n| CA-22 | Shared UI components and visual system | Contract intentionally permits independence; implementation inventory outstanding | `UI_UX_SHELL_FOUNDATION_CONTRACT.md` explicitly permits feature-specific visual systems and custom screens; shared components are optional. Verify there are no hidden global CSS/component assumptions that make a screen redesign cascade into unrelated screens. |\n| CA-23 | Web/Android presentation parity | Not verified | Existing platform contracts protect persistence/runtime authority, but this audit has not yet proven that shell and screen replacement boundaries behave consistently across browser PWA and installed Android/WebView/native surfaces. |
| CA-17 | New central calculation framework | Not necessary currently | Existing versioned domain calculations, adapters and composition are sufficient. No new generic engine or global calculation registry is justified by current evidence. |

## 7. Confirmed high-priority findings

### CA-10 — Performance fixed-cost adapter recalculates owner allocations

**Evidence:**

- `packages/domain/src/business-start-date-cost-allocation.ts` publishes canonical per-source `daily` rows containing `date`, `amountPaise`, `sourceId`, `sourceKind` and `sourceVersion`.
- `buildBusinessStartDateAllocationResultV1` verifies that each allocated source's daily rows sum exactly to `sourceAmountPaise`.
- `packages/application/src/performance-fixed-cost-allocation-adapter.ts` uses `source.daily` primarily to obtain dates, then `postBusinessDailyRows` derives new daily amounts by dividing a recomputed post-business amount across eligible days.
- The same adapter's `complianceSplit` recomputes pre-business portions from `sourceAmountPaise`, `sourcePeriod` and Business Start Date.

**Why this matters:**

The Business Start Date allocation capability is the owner of the daily allocation policy. A downstream Performance adapter should not independently reconstruct its daily amounts. Doing so creates a second implementation of the allocation formula and risks divergence in rounding, source-period boundaries, schedule transitions, historical corrections and future allocation-version changes.

**Required correction direction:**

Consume the owner-published daily source rows and their exact amounts/revisions. If Performance needs a distinct pre-business recovery treatment, that must be an explicitly approved, versioned transformation contract with separate source/output provenance—not an implicit reimplementation of the source allocation formula.

Do not change the allocation domain or source records during this audit.

### CA-11 — Performance does not establish one shared source snapshot

**Evidence:**

- `PerformanceOperatingCostAdapterV1.prepareSnapshot` captures `FullCostBreakevenService.getSourceProjection`.
- `FullCostBreakevenService.getSourceProjection` independently reads the Business Start Date allocation report along with Maintenance, expense, fuel and trip sources.
- `PerformanceFixedCostAllocationAdapterV1.prepareSnapshot` separately calls `BusinessStartDateCostAllocationService.getReport`.
- `PerformanceCalculationServiceV1` prepares its distinct read-model sources concurrently.

**Why this matters:**

The same allocation owner can be read twice during one Performance calculation. Since its report is rebuilt from current owner records, a source revision changing between the two reads could produce an internally inconsistent result: operating-cost completeness/projection may reflect one allocation snapshot while EMI/Compliance daily amounts reflect another.

**Required correction direction:**

Establish one calculation-scoped snapshot of shared source read models, or have the Performance composition pass the same immutable allocation report/projection into both adapters. Keep the owner service authoritative; do not introduce a global cache or persisted calculation ledger merely to solve this.

Add a regression that changes an allocation source between attempted reads and proves a single Performance result cannot mix revisions.

### CA-12 — Performance and existing contracts disagree on policy

**A. Pre-business cost recovery — owner decision approved and contract reconciled**

The owner has confirmed the following two-stage aggregate-pool rule, now normative in the [Business Start Date Cost Allocation Contract](BUSINESS_START_DATE_COST_ALLOCATION_CONTRACT.md):

- Use each source category's authoritative business/effective date, not record creation or edit time.
- First add the full amount of every eligible source amount dated before the Business Start Date to one aggregate pre-business cost pool. Do not prorate qualifying amounts by validity days or remaining schedule days.
- Divide that combined pool into **18 equal monthly instalments** beginning on the Business Start Date. For daily breakeven, spread each monthly instalment evenly across the days of its Business-Start-Date-anchored recovery month.
- Source validity/end dates and schedule end dates do not shorten or extend the 18-month recovery period. The 18-month plan is created once for the aggregate pool, not separately for each source amount or category.
- If the authoritative date is on or after the Business Start Date, use the source category's normal calculation rules.
- Preserve source records and recognize each amount exactly once.
- For Compliance, the classification date is `validFrom`; for each EMI, it is the scheduled due date; manual dated costs use their explicit business/effective date.

This is the governing policy, not an optional Performance-only adjustment. Runtime conformance is not yet complete: the current Performance domain distributes recovery evenly by day across the full 18-month interval rather than building one aggregate pool, dividing it into 18 equal monthly instalments, and distributing each instalment across its recovery-month days. Its Compliance adapter proportionally splits amounts by validity days instead of adding each full qualifying record amount to the aggregate pool. The EMI and manual-cost adapters must also contribute their complete qualifying amounts to that same pool. These are recorded implementation gaps for the consolidated implementation PR.

**B. Driver Target — owner policy decided; runtime conformance remains open**

The owner has approved a fixed monthly Driver Target, independent of business/operating days, with proration only for the first calendar month when the Business Start Date falls mid-month. The first-month fraction counts calendar days from and including the Business Start Date through month-end; every later month uses the full configured amount. The normative rule is in [Breakeven and Driver Target Calculation Contract v2.0, Addendum J](BREAKEVEN_AND_DRIVER_TARGET_CALCULATION_CONTRACT.md).

The current Performance implementation and passbook/lifetime calculations still need regression proof against that rule. In particular, verify that first-month target is prorated once, later months are full, and selected-period reporting does not accidentally prorate a later month or vary the target by operating-day count.

### CA-18 — Stale calculation status documentation

The current Contract Index and Finance/Performance Approval Gate still contain wording that the Full Cost Breakeven runtime engine is blocked pending upstream source fixes. This is historical wording that conflicts with merged PR #83 and PR #93 implementation evidence and the post-PR #93 audit.

The historical Breakeven Source Reconciliation Audit must retain its original baseline and findings. It should not be rewritten as if it were audited on the current commit. Instead, the current status should be linked to the post-PR #93 conformance audit and this new calculation-authority audit.

**Required correction direction:** reconcile only current status/authority wording in the relevant index/approval documentation after this audit is reviewed. Do not silently alter the frozen v1.9 business rules.

## 8. Performance status: implementation versus acceptance

The merged PR #93 provides a substantial calculation and dashboard implementation. The merged PR #94 explicitly concludes that Performance is not yet approved as end-to-end complete.

Outstanding gates recorded by PR #94 include:

- Full Driver Target passbook pacing, cumulative ahead/behind, remaining target and shortfall carry-forward/recovery.
- Historical daily/weekly/monthly business-distance summaries and active-driving-day definitions.
- Explicit reconciliation of partial-month target and lifetime target semantics.
- Exact pre-business recovery boundary/provenance cases.
- Post-PR #93 source conformance against current owner contracts and historical corrections.
- Final Performance presentation/product-owner acceptance.
- Cross-platform correction/retry/restore parity and physical-device acceptance.

These are Performance completion gates, not evidence that the entire application architecture is absent.

## 9. Risk assessment

| Risk | Severity | Reason |
|---|---|---|
| Conflicting EMI/Compliance allocation paths | High | The same source costs may be interpreted under two different policies or source snapshots. |
| Partial-month target policy conflict | High | Displayed target, passbook pacing and lifetime target can report different expected positions. |
| Historical source correction propagation | High | A corrected source must update all dependent projections without mutating immutable historical evidence or duplicating amounts. Full cross-consumer proof is incomplete. |
| Missing/incomplete source attribution | High | Legacy trip context, unresolved distance, overlap review and ambiguous expense links must remain visibly incomplete, never silently zero. |
| Duplicate downstream calculations | Medium–high | A full consumer inventory has not yet proved that every screen/report consumes owner outputs. |
| Physical-device and live external integration | Separate release risk | Automated CI cannot establish OEM/device lifecycle or live Dropbox acceptance. |

No evidence from this audit justifies a database migration or data rewrite.

## 10. Recommended correction sequence

No implementation is authorized by this audit document. After review and explicit approval, the smallest safe sequence is:

1. **Verify approved policy conformance.** The 18-month pre-business recovery policy and fixed monthly Driver Target/first-month-only proration are owner-approved and documented. Prove both in runtime and passbook/lifetime regression tests.
2. **Correct fixed-cost consumption.** Make Performance consume canonical Business Start Date allocation outputs, or implement only the separately approved transformation with explicit versioning and provenance.
3. **Unify calculation snapshots.** Ensure Full Cost Breakeven and Performance use one coherent set of source revisions for a single calculation request.
4. **Complete provenance/change propagation.** Verify correction/reversal/revision behaviour from source owner through the final result and each published consumer.
5. **Inventory downstream consumers.** Trace Performance, Maintenance, histories, reports, dashboards and backup/restore to their owners; remove only proven duplicate formulas.
6. **Close Performance-specific gates.** Complete passbook, distance summaries, target/recovery contract conformance and product acceptance as separately scoped work.
7. **Run the full verification matrix.** Domain arithmetic, source adapter tests, application orchestration, correction/retry/recovery, offline behaviour, Room/IndexedDB parity, backup/restore validation, Architecture/Web/Android/Integrated CI. Physical-device acceptance remains separate.

Implement the approved corrections as internal, reviewable stages and commits on one coherent implementation branch and one implementation PR, as agreed with the product owner. Keep changes narrow within that PR, with explicit acceptance tests for each boundary. Do not bundle unrelated visual redesign or database work unless the audit demonstrates it is required.

## 11. Explicit non-goals

- No new central calculation engine or generic formula framework.
- No giant calculation service/class that absorbs feature ownership.
- No replacement of Work/Shift, Fuel, Maintenance, Finance, Compliance or Trip domain calculations.
- No database schema change, Room/Dexie migration, record rewrite or historical backfill.
- No second expense ledger or reporting ledger.
- No generic event bus, microservices or distributed architecture.
- No multi-driver/multi-vehicle expansion.
- No visual redesign of Admin, Work, Timeline or Performance as part of this audit; this audit evaluates the replaceability architecture only.
- No claim of physical-device or live Dropbox acceptance from CI.

## 12. Audit conclusion

**The right next step is targeted correction, not architectural reconstruction.**

Sam Travels already has the core ingredients of a clean architecture: feature-owned calculations, pure versioned domain modules, application adapters, explicit source contracts and a shared persistence/recovery foundation.

The main work is to make the wiring honour those contracts consistently—especially around fixed-cost allocation, calculation snapshots, policy precedence, provenance and downstream consumers.

This audit should be reviewed and approved before any source-code changes begin.


## 13. UI/UX shell and screen independence audit

### 13.1 Desired product capability

The presentation system must be replaceable independently from the business foundation, and each production screen must be replaceable independently from the shell and from other screens. A complete visual redesign or replacement of an existing screen interaction should not require changes to calculation rules, domain contracts, durable records, persistence adapters, recovery semantics or unrelated feature implementations.

The product owner has explicitly requested the ability to ask for a complete shell, screen or presentation redesign as one coherent change. “One command” is an acceptance goal for the development workflow: a request to replace a screen or shell should be implementable within the presentation boundary, provided the replacement uses existing application capabilities. A genuinely new business capability remains an application/domain change and must not be disguised as presentation-only work.

### 13.2 Existing contracts and implementation evidence

The existing `docs/UI_UX_SHELL_FOUNDATION_CONTRACT.md` already establishes the correct high-level rules:

- Presentation is replaceable and does not own calculations, persistence, recovery or business invariants.
- Shell, navigation, screen composition, components, forms, design tokens and global feedback are distinct responsibilities.
- Screens receive state through explicit view models, selectors or typed presentation contracts and dispatch actions through approved application interfaces.
- Feature screens may be fully custom; no universal screen template or shared visual language is mandatory.
- Feature presentation contexts have explicit identity/version contracts and are validated by the host.
- Presentation architecture rules should be executable and verified through existing architecture gates and CI.

Targeted source/test inspection found:

- `packages/presentation/src/shell-contracts.ts` defines a framework-neutral shell contract.
- `apps/web/src/ui/FeatureScreenHost.tsx` mounts feature-owned renderers through versioned contexts and isolates renderer failures behind retryable boundaries.
- `tests/presentation-shell-contracts.test.ts` proves that replacement shell definitions can retain the same navigation capabilities.
- `tests/feature-screen-host.test.tsx` proves a fixture feature screen can mount inside a replacement shell and that a renderer failure is contained.
- `tests/presentation-accessibility-responsive.test.tsx` covers selected navigation accessibility and responsive/safe-area rules.
- `apps/web/src/ui/PrimaryScreenComposition.tsx` still contains explicit conditional branches for Drive, Timeline, Performance and Admin, and constructs their screen-specific contexts in the central composition.
- Performance receives calculation service capabilities through its presentation context. The current evidence does not establish that all calculation preparation is completed before entering the screen renderer or that the screen is entirely driven by a presentation-ready model plus application actions.

This is a useful foundation, but selected contract tests are not proof of complete product-level replaceability.

### 13.3 Required presentation dependency direction

The intended direction is:

```text
Application shell / navigation / global presentation
                    |
                    v
         Independently replaceable screen
                    |
                    v
       Screen presentation model / selectors
                    |
                    v
       Application use-case/action interfaces
                    |
                    v
       Domain owners and calculation services
                    |
                    v
       Authoritative persistence and recovery
```

The dependency direction must not reverse. A screen must not directly reach into database tables, Room/IndexedDB adapters, native plugins, feature-private implementation details or another screen's local state. The application composition may connect a screen to approved capabilities, but should not become a second owner of business rules.

Within a screen, inspect and separate these responsibilities where useful:

1. Screen composition and layout.
2. Visual components and styling.
3. Disposable presentation state (selection, filters, expanded panels, temporary input).
4. Presentation model/projection and formatting.
5. Interaction adapter that dispatches approved application actions.

Do not impose a universal component system or force custom screens into one template. Reuse shared components only where it reduces coupling rather than creating it.

### 13.4 Acceptance tests for replaceability

The implementation work must add or strengthen automated evidence, reusing the existing architecture gate and test conventions:

1. **Shell swap:** replace the active shell renderer while keeping all registered production screens, their application capabilities and authoritative runtime lifecycle behaviour unchanged.
2. **Single-screen swap:** replace each production screen renderer independently using the same presentation contract; unrelated screens, application services, calculations and stored data remain unchanged.
3. **Within-screen visual replacement:** replace a screen's layout/components/styles without changing its presentation contract or business/application implementation.
4. **No cross-screen imports/state:** static architecture checks reject production screen-to-screen imports and shared mutable screen state unless an explicitly approved public contract requires it.
5. **No foundation leakage:** presentation modules cannot import persistence adapters, database schemas, native storage implementations or feature-private calculation internals.
6. **Action boundary:** screen interactions invoke approved application capabilities; they do not write durable records or calculate authoritative financial/operational values themselves.
7. **Lifecycle and failure containment:** shell/screen replacement preserves startup, blocked/recovery states, pending/unknown outcomes, retry behaviour, focus/back handling and failure isolation.
8. **Platform parity:** verify the same screen contracts and authoritative state semantics on browser PWA and installed Android/WebView/native surfaces. Platform-specific presentation may differ where contracts permit it.
9. **Accessibility and responsive behaviour:** retain semantic navigation, focus, text scaling, safe areas, keyboard/IME and supported viewport behaviour after replacement.

Tests must distinguish static dependency checks, contract tests, integration/runtime tests, visual/accessibility automation and manual usability/device acceptance. Do not claim a static import test proves runtime replaceability or physical-device acceptance.

### 13.5 UI/UX implementation work to include in the single implementation PR

After audit findings and policy decisions are approved, include the necessary presentation corrections in the same coherent implementation PR as calculation authority and application wiring. Do not open a separate UI architecture PR.

The work should be staged internally:

1. Inventory shell, production screen registrations, presentation contexts, screen internals, shared styles/components and platform-specific surfaces.
2. Remove only proven screen-to-screen and screen-to-foundation coupling; preserve existing feature and lifecycle contracts.
3. Move any authoritative calculation orchestration found in presentation into the existing owning application service/adapters. Screens should receive presentation-ready projections and approved actions.
4. Make production screen registration/composition replaceable without a central screen-specific conditional becoming a required edit point for every screen change, using the smallest extension of existing contracts.
5. Add shell-swap and per-screen replacement integration tests, plus static boundary checks and required accessibility/responsive regressions.
6. Verify browser/Room parity and startup/recovery/failure states remain unchanged.

Do not add a second presentation framework, mandatory design system, global component library or speculative plugin architecture. Extend the current contracts only where a concrete production screen replacement test demonstrates a gap.

### 13.6 Combined product acceptance

The single implementation PR is complete only when both sides of the product can evolve independently:

- Calculation/domain owners produce authoritative, versioned results with coherent source snapshots and provenance.
- Application services expose stable use-case and presentation-ready capabilities.
- The shell can be replaced without changing screens or foundation.
- Any one screen can be replaced without changing the shell, other screens or foundation.
- A screen's visual presentation can be replaced without changing its application/domain behaviour.
- The full CI and architecture verification matrix passes; manual physical-device acceptance is reported separately.

The agreed delivery strategy is one audit/decision PR followed by one consolidated implementation PR. Internal stages and commits are encouraged; unnecessary dependent PRs are not.


## 14. Documentation navigation and authority

This audit is a baseline-specific findings and decision record. It does not replace the detailed calculation owners or approve any unresolved policy change.

- [Sam Travels System Blueprint](SAM_TRAVELS_SYSTEM_BLUEPRINT.md) provides the end-to-end architecture and calculation flow overview.
- [Documentation Catalog](DOCUMENTATION_CATALOG.md) provides the six-area navigation and document-role inventory.
- [Contract and Documentation Index](CONTRACT_INDEX.md) identifies normative owners and precedence.
- [Repository Markdown Documentation Audit](MARKDOWN_DOCUMENTATION_AUDIT.md) records documentation reconciliation and historical evidence.

When this audit and a normative owner contract appear to disagree, the owner contract remains authoritative until an explicit product decision and reviewed contract update resolve the discrepancy. CA-10 and CA-11 remain implementation/wiring findings; CA-12's pre-business recovery and Driver Target policies are resolved, while runtime conformance remains open. This navigation update does not change those statuses.


## 15. Owner decision reconciliation — 2026-11-17

This dated addendum records product-owner decisions made after the audited 2026-11-16 baseline. It updates policy status only; it does not rewrite the historical baseline or claim runtime conformance.

### 15.1 Pre-business cost recovery

The owner-approved rule is the aggregate-pool model in the [Business Start Date Cost Allocation Contract](BUSINESS_START_DATE_COST_ALLOCATION_CONTRACT.md): include the full qualifying pre-business amount from each supported source category, combine all contributions into one pool, divide the pool into 18 equal monthly instalments anchored to Business Start Date, and distribute each instalment over the days of its recovery month. This is downstream Full Cost Breakeven treatment only. It does not mutate source records, source-owned calculations or canonical source-allocation history.

### 15.2 Driver Target

The owner-approved rule is in [Breakeven and Driver Target Calculation Contract v2.0, Addendum J](BREAKEVEN_AND_DRIVER_TARGET_CALCULATION_CONTRACT.md): Driver Target is a fixed monthly surplus above Full Cost Breakeven, independent of business/operating days, trips and attendance. Only the first calendar month is prorated when Business Start Date is mid-month, counting calendar days from and including that date through month-end. Every subsequent calendar month carries the full configured target. Partial report filters do not create additional proration.

### 15.3 Remaining status

These policy questions are resolved. Runtime conformance is not. The Performance audit continues to own the implementation gaps for aggregate-pool recovery, target/passbook pacing, coherent calculation snapshots, distance summaries and end-to-end acceptance. UI shell/screen replacement remains an architecture implementation and test gate, not a reason to introduce a new presentation framework.
