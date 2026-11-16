# Sam Travels — Calculation Authority and Application Wiring Audit v1

**Audit status:** Initial repository-backed audit complete; findings require owner review before implementation.  
**Repository:** `amtalwalkar-sudo/sam-travels`  
**Audited baseline:** `main` at `2148f244ac20f1ab503002763b7cea856c4c41ec` (2026-11-16; includes merged PRs #93, #94 and #95).  
**Audit date:** 2026-11-17  
**Scope:** Business calculation ownership, authoritative source records/read models, application orchestration, downstream consumers, provenance, and contract alignment.  
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
2. Performance v1.0 introduces an 18-month pre-business recovery policy that does not match the existing Business Start Date allocation contract's source-period carry-forward policy. The older Breakeven/Driver Target v1.9 contract also specifies partial-month target proration, while the merged Performance implementation displays the full monthly target for a selected partial month.
3. Performance's operating-cost and fixed-cost adapters obtain their source projections independently. The operating-cost path reaches the allocation service through FullCostBreakevenService, while the fixed-cost path calls the allocation service separately. The current orchestration does not establish one shared cross-source snapshot boundary for those two reads.
4. Some repository documentation still describes Full Cost Breakeven runtime work as blocked, even though the source engine and Performance integration have since been merged. The newer Performance conformance audit correctly records remaining acceptance gaps, but the older status language has not been reconciled.

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

This is a calculation-authority audit, not a complete line-by-line audit of every source file, every test, every screen, or every backup participant. Where full implementation/test evidence was not directly inspected, the status is explicitly marked partial or requiring verification rather than assumed complete. The pre-existing Permanent Architecture Audit and Performance End-to-End Conformance Audit remain separate evidence records and are not rewritten by this document.

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
| CA-12 | Calculation policy agreement | Needs explicit owner reconciliation | Performance v1.0's 18-month pre-business recovery and full-month target display differ from existing source/product contract wording. |
| CA-13 | Provenance completeness | Partially implemented | Source IDs/revisions and completeness are carried through the calculation types. A complete source-to-final-result trace across all owner outputs and corrections is not yet demonstrated by the inspected evidence. |
| CA-14 | Downstream consumer convergence | Not verified | Performance and Maintenance have identified consumers, but a repository-wide inventory of every report/history/dashboard consumer and proof that none independently recalculates the same figure remains outstanding. |
| CA-15 | Backup/restore and persistence parity | Partially verified | PR #93 records Performance browser/Room backup participants and shared parity fixtures. This audit did not independently inspect every participant/restore validator or the complete cross-feature recovery matrix. |
| CA-16 | UI ownership | Implemented by architecture contract; targeted verification outstanding | Existing architecture and Admin replacement work separate presentation from feature ownership. A full screen-by-screen audit of calculation logic in presentation files remains outstanding. |
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

Two material policy differences are recorded:

**A. Pre-business EMI/Compliance treatment**

- The Business Start Date Cost Allocation Contract defines carry-forward over the remaining eligible source/schedule period, ending at the source validity or applicable final EMI allocation-period end.
- Performance v1.0 defines an 18-month recovery window beginning on the actual Business Start Date.
- The Performance fixed-cost adapter additionally reconstructs source-period portions before sending them into the 18-month recovery calculation.

These are different allocation policies. The implementation cannot make them equivalent by adapter naming. The owner must explicitly decide whether Performance's 18-month recovery is a separate reporting adjustment, whether the existing Business Start Date policy remains the only allocation policy, or whether the product contract is to be amended. Until then, do not silently change either calculation.

**B. Partial-month Driver Target**

- Breakeven and Driver Target Contract v1.9 states that the monthly surplus target and expected cumulative progress are prorated by calendar days for partial months.
- Performance v1.0 states that the configured monthly target is never prorated by a selected date filter, and the merged implementation reports the full monthly target for a selected partial month.
- PR #94 already identifies the target display/pacing/lifetime semantics as a contract-reconciliation gate.

The owner must separately define (1) selected-period display, (2) passbook achievement/pacing, and (3) lifetime target accumulation for partial first/last months. Do not treat the displayed full monthly target as proof that partial-month passbook pacing is complete.

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

1. **Resolve policy authority first.** Reconcile the 18-month recovery and partial-month target decisions with the owning product contracts. Preserve source-owner rules unless explicitly amended.
2. **Correct fixed-cost consumption.** Make Performance consume canonical Business Start Date allocation outputs, or implement only the separately approved transformation with explicit versioning and provenance.
3. **Unify calculation snapshots.** Ensure Full Cost Breakeven and Performance use one coherent set of source revisions for a single calculation request.
4. **Complete provenance/change propagation.** Verify correction/reversal/revision behaviour from source owner through the final result and each published consumer.
5. **Inventory downstream consumers.** Trace Performance, Maintenance, histories, reports, dashboards and backup/restore to their owners; remove only proven duplicate formulas.
6. **Close Performance-specific gates.** Complete passbook, distance summaries, target/recovery contract conformance and product acceptance as separately scoped work.
7. **Run the full verification matrix.** Domain arithmetic, source adapter tests, application orchestration, correction/retry/recovery, offline behaviour, Room/IndexedDB parity, backup/restore validation, Architecture/Web/Android/Integrated CI. Physical-device acceptance remains separate.

Each correction should be a narrow PR with explicit acceptance tests. Do not bundle unrelated Admin, UI shell, database or feature redesign into this work.

## 11. Explicit non-goals

- No new central calculation engine or generic formula framework.
- No giant calculation service/class that absorbs feature ownership.
- No replacement of Work/Shift, Fuel, Maintenance, Finance, Compliance or Trip domain calculations.
- No database schema change, Room/Dexie migration, record rewrite or historical backfill.
- No second expense ledger or reporting ledger.
- No generic event bus, microservices or distributed architecture.
- No multi-driver/multi-vehicle expansion.
- No unrelated Admin, Work, Timeline or Performance visual redesign as part of this audit.
- No claim of physical-device or live Dropbox acceptance from CI.

## 12. Audit conclusion

**The right next step is targeted correction, not architectural reconstruction.**

Sam Travels already has the core ingredients of a clean architecture: feature-owned calculations, pure versioned domain modules, application adapters, explicit source contracts and a shared persistence/recovery foundation.

The main work is to make the wiring honour those contracts consistently—especially around fixed-cost allocation, calculation snapshots, policy precedence, provenance and downstream consumers.

This audit should be reviewed and approved before any source-code changes begin.
