# Central Financial Calculation and Aggregation Contract

**Document ID:** ST-CALCULATION-AGGREGATION  
**Version:** 1.1  
**Status:** Proposed follow-on technical contract; implementation explicitly deferred  
**Authority:** Technical composition, source-result completeness, provenance and consumer wiring. Existing approved product/domain contracts remain authoritative for business rules.  
**Prerequisite evidence:** PR #99 was merged at `ef1f3671d5aafbb4ad064092da18700df61536cd`. Its required automated CI gates passed on the final PR head. The owner explicitly deferred the remaining physical-phone/OEM, live Dropbox account and large-snapshot physical benchmark gates; those are not represented as CI-passed or physically accepted. This documentation PR does not reopen those decisions. Any implementation phase must carry forward the exact external acceptance disposition and identify which gates are relevant to its release.  
**Scope:** One selected vehicle and the existing single-driver business workflow.  
**Timezone:** Asia/Kolkata business dates and operational dates.  
**Currency:** INR; persisted money uses integer paise.

## 1. Purpose and authority

Define the separately delivered technical phase for making Sam Travels' existing financial calculations consistently consumable by downstream features.

The objective is to make source-owned calculations reliable, traceable and composable—not to rebuild the application's architecture or move every formula into one central module.

The repository already has feature-owned calculation modules, application services, deterministic domain calculations, public read models, a Full-Cost Breakeven calculation and Performance calculation/adapters. The next phase must inspect and reuse these mechanisms before changing them.

This is a technical composition contract. It does not approve new accounting policy, alter an existing source formula, certify current implementation conformance, or claim that any acceptance gate has passed.

### 1.1 Normative precedence

Resolve conflicts using the repository's [Authority and Responsibility Allotment Map](AUTHORITY_AND_RESPONSIBILITY_ALLOTMENT_MAP.md) and [Contract Index](CONTRACT_INDEX.md). In particular:

1. Approved product decisions and their current owner contracts determine business meaning, inclusion, effective dates and formulas.
2. Source feature contracts own their source records, validations and source calculations.
3. The [Business Start Date Cost Allocation Contract](BUSINESS_START_DATE_COST_ALLOCATION_CONTRACT.md) owns the downstream pre-business recovery pool and its allocation; it is not replaced by a generic daily-allocation rule in this document.
4. The [Breakeven and Driver Target Calculation Contract v2.0](BREAKEVEN_AND_DRIVER_TARGET_CALCULATION_CONTRACT.md) owns Full-Cost Breakeven and monthly Driver Target product semantics.
5. Shared architecture, data, persistence, transaction, lifecycle and platform contracts govern implementation safeguards.
6. Code and tests are evidence, not permission to redefine an approved rule.

If this document's shorthand conflicts with a linked owner contract, the owner contract prevails and this document must be corrected before implementation proceeds.

## 2. Non-negotiable architecture

1. **Source features own their meaning.** Compliance, Finance, Maintenance, Business Expenses/Fuel, Work/Shift, Log Book and other source owners retain their records, validations, business rules, effective-date rules and canonical source calculations.
2. **Consumers use published outputs.** A consumer may combine a source's canonical output but must not reconstruct that source's formula from raw amounts, dates or private persistence.
3. **Application services orchestrate.** The application layer may coordinate public source queries, select a consistent calculation period/snapshot and aggregate typed results. It must not become a catch-all business domain.
4. **Pure calculations stay deterministic.** Domain calculations remain platform-neutral, versioned and independently testable.
5. **Presentation is not authority.** Screens, forms and UI state do not calculate financial truth.
6. **Existing architecture is reused.** Keep the existing feature registry, application composition, persistence, transaction/recovery, backup/restore and lifecycle mechanisms. Do not introduce duplicate infrastructure.
7. **No generic formula engine.** Do not create a universal formula/rules engine, giant central calculation class, universal event bus, duplicate ledger, or a second competing breakeven implementation.
8. **No speculative rewrite.** Audit the current implementation and exact consumer wiring first. Change only demonstrated gaps.

## 3. Responsibility split

| Responsibility | Owner |
|---|---|
| Authoritative business records, source validations and source-specific formula | Existing source feature |
| Canonical effective-dated source projection or allocation | Existing source feature or the application capability explicitly designated by its owner contract |
| Public typed query/read contract | Source feature |
| Multi-source query coordination and consistent calculation snapshot | Application orchestration |
| Full-Cost Breakeven composition | Existing Full-Cost Breakeven calculation capability under its approved product contract |
| Performance derived metrics and period composition | Existing Performance calculation capability under its approved contract |
| Display, period selection and interaction | Presentation |
| Browser IndexedDB / Android Room authority, atomicity, recovery and backup | Existing persistence and lifecycle foundation |

The implementation audit must identify the actual owner and consumer for each value. Do not infer ownership from a class name or move a calculation merely to make the diagram look uniform.

## 4. Source coverage and exact business-rule authority

The following is an audit boundary, not permission to create new source records or duplicate source calculations.

### 4.1 Compliance and Business Start Date recovery

- Compliance owns immutable compliance records, actual inclusive validity dates, renewals, overlap/gap review, corrections and its canonical source calculation.
- The [Business Start Date Cost Allocation Contract](BUSINESS_START_DATE_COST_ALLOCATION_CONTRACT.md) owns downstream Breakeven treatment. For each Compliance record, classify by its authoritative `validFrom` business date. If it is before the Business Start Date, the **full recorded amount** enters the single aggregate pre-business cost pool. Do not prorate by pre-start validity days, stop at expiry, or give each record a separate 18-month clock.
- The aggregate pre-business pool across all eligible categories is recovered in **18 equal monthly instalments** beginning on the Business Start Date, with deterministic integer-paise residual distribution and daily distribution within each recovery month. Preserve the original source validity dates and records.
- A record whose `validFrom` is on or after the Business Start Date follows the normal Compliance allocation over its actual inclusive validity period.
- Renewal amounts are independently classified using each renewal record's own effective date. Existing overlap review remains mandatory; unresolved/rejected overlap portions must not be silently included or treated as zero.
- Never count a qualifying pre-business amount both through the recovery pool and through normal post-start allocation.

### 4.2 Finance and complete EMI

- Finance owns the EMI quote/amortization mathematics, original schedule, payments, prepayment, settlement, closure and schedule revision history.
- For Breakeven/reporting, use the **complete scheduled EMI amount** as one cost; do not split principal and interest.
- The [Business Start Date Cost Allocation Contract](BUSINESS_START_DATE_COST_ALLOCATION_CONTRACT.md) classifies each complete EMI by its scheduled due date. Each pre-start due-date EMI contributes its whole scheduled amount to the same aggregate 18-month pre-business pool. Due-date EMIs on or after the Business Start Date use the normal EMI-period allocation. Do not substitute actual payment amounts/status for scheduled cost.
- The approved prepayment mode is Reduce Tenure: regular EMI amount and due dates remain unchanged; the final instalment/final due date moves earlier. The revised schedule retains the next unpaid due date. Preserve the already-open allocation period under the prior schedule through the day before that due date; revised future rows begin on the next unpaid due date. Never overlap or omit the period.
- Settlement/closure follows the Finance owner contract: only its approved due-date cutoff is eligible; the closure-date EMI is allocated through that date inclusive, and no later EMI allocation is emitted. Preserve schedule version and settlement provenance.
- Do not create a second EMI allocation engine or derive EMI from a downstream total.

### 4.3 Maintenance and personal/business distance

- Maintenance owns its rate history and immutable daily accrual records. Business Maintenance accrual is confirmed, fully allocated business kilometres multiplied by the rate effective on that operational date. Historical rate snapshots remain unchanged after a rate change.
- Work/Shift is the sole authority for confirmed shift odometer facts and the daily business-kilometre projection. The operational-day boundary is 04:00 Asia/Kolkata. A confirmed rotation assigns the outgoing shift's entire confirmed distance once to its original operational date; it does not split kilometres at 04:00.
- A boundary crossing during an active trip does not interrupt the trip or rotate the shift. Until the trip is terminal and the required boundary odometer confirmation/rotation commits, the distance remains explicitly pending/unallocated and is excluded from a complete daily business total and Maintenance accrual.
- The odometer gap from the prior confirmed shift end to the next shift start is wholly personal distance, not business distance. It remains separate from business kilometres. Maintenance personal amount is calculated separately from personal kilometres and must not enter business Maintenance accrual or business expense totals.
- Fuel and other activity-based business cost calculations must consume confirmed business kilometres only. Personal kilometres and their cost share must not be silently reassigned to business. Do not derive business distance from GPS displacement, trips, elapsed time or fuel purchases.

### 4.4 Fuel purchase facts and consumption rate

- Business Expenses/Fuel owns immutable purchase facts, correction history, full-tank checkpoint eligibility, full-to-full interval calculations and effective weighted-rate history.
- A full refill is a measurement checkpoint. Two consecutive valid full-tank checkpoints and a positive confirmed odometer delta are required to complete a measurement interval. A partial refill is retained as a purchase record but is not itself a checkpoint and cannot open or close an interval.
- **Partial-refill nuance:** every partial purchase after the opening baseline full refill and through (including) the closing full refill contributes its actual quantity and spend to that completed full-to-full interval. The opening baseline purchase is excluded from consumption in the interval it opens. Therefore, do not exclude intervening partial purchases from interval mileage/cost calculations merely because they are partial; exclude them only as checkpoints.
- The weighted fuel cost/km is total included spend divided by total confirmed kilometres across valid completed intervals. A newly completed interval's revised weighted rate becomes effective on the Asia/Kolkata calendar day **after** the interval-completion date. Earlier dates retain their previous effective rate.
- Daily Breakeven fuel cost is confirmed business kilometres multiplied by the effective weighted-average fuel cost/km. Fuel purchase spend is upstream measurement data and must not be added again as a separate daily Breakeven expense.
- If no valid completed interval supplies an effective rate for positive confirmed business kilometres, fuel contribution is pending/incomplete, not zero or a guessed rate.

### 4.5 Platform fees, challans and miscellaneous expenses

- Platform commission/pass and traffic challans are recognized only when actually paid and entered, on their authoritative paid business date. Unpaid amounts or issue dates do not create a cost.
- Miscellaneous business expenses use their explicit authoritative business date and source classification.
- Preserve vehicle/driver attribution, correction/reversal lineage and paid status from the source owner. Do not infer a percentage, accrue an unpaid amount, or count a paid source twice.
- Follow the Fuel Entry and Business Expense owner contract and Breakeven v2.0 for the exact inclusion/no-double-counting boundaries.

### 4.6 Trip revenue and trip-linked costs

- Consume approved Log Book/Trip financial read models, not UI state or reconstructed payouts.
- Gross fare and cancellation fee use the approved submitted trip financial facts. Trip-linked toll/parking uses immutable trip context and the existing inclusion/payer rules; an amount already included in fare/customer charge must not also be added as a separate driver expense.
- The trip's captured vehicle, driver/assignment, shift and operational date remain authoritative. A later entry/submission timestamp does not replace the trip's captured business date.
- Legacy records missing required context remain unresolved/incomplete; do not infer context from the currently selected driver or vehicle.

### 4.7 Full-Cost Breakeven and Driver Target

- The approved Breakeven contract currently defines one **Full-Cost Breakeven** output. This technical contract does not authorize a separate operating-breakeven metric, formula, registration or presentation.
- Full-Cost Breakeven consumes eligible canonical source contributions under its approved rules, including whole-EMI and Compliance time-based allocations, confirmed-business-kilometre fuel consumption and Maintenance accrual, and paid eligible expenses. Challans follow the approved paid-only full-cost treatment. Fuel purchases and Maintenance visit/repair records must not be duplicated on top of their approved accrual/consumption treatment.
- Driver Target is a downstream target, not another source expense. Admin configures a fixed monthly rupee amount representing additional surplus above Full-Cost Breakeven. Only the first calendar month is prorated when the Business Start Date is after day one; every later month uses the full configured monthly target, regardless of attendance, operating days, trips or days off. The Breakeven v2.0 Addendum J is authoritative.
- Performance, Passbook, Admin and Reports consume the approved calculation/read models. They must not create their own competing EMI, Compliance, fuel, Maintenance or expense formulas.

## 5. Standard source-result envelope

Each source publishes a typed, versioned result using the shared data/value semantics already defined by the repository. The concrete TypeScript shape and location must be selected during the implementation audit; this contract does not prescribe a new persistence schema.

Every result must carry, where applicable:

- source capability/domain and stable source-result identity;
- selected vehicle and relevant operational date or inclusive reporting period;
- value and currency/precision, or a typed rate/quantity;
- **basis/unit**, such as period total, per recovery month, per calendar day, per confirmed business kilometre, per completed transaction, one-off paid expense, or full-to-full consumption interval;
- effective-from/effective-to dates and the business date on which the contribution is recognised;
- source record IDs and revisions, correction/reversal lineage and relevant source snapshot/revision;
- calculation/rule version and the version of any canonical allocation used;
- explicit applicability and eligibility for the approved downstream calculation;
- completeness/freshness state and structured missing, pending, stale, unavailable or invalid reasons.

Do not coerce different bases into a common daily amount merely to make aggregation convenient. A conversion is allowed only where an existing approved source allocation/calculation contract defines it and the conversion preserves period totals and source provenance.

## 6. Completeness and partial calculation semantics

Missing information must never be silently treated as zero, not-applicable, paid, confirmed or complete.

Reuse the repository's existing value-state vocabulary where possible. The observable behaviour must distinguish at least:

- **Complete:** all required inputs for this source result are present and valid.
- **Partial:** a valid subset can be reported, but one or more relevant inputs/contributions remain unresolved.
- **Blocked:** this source's own essential input is absent or invalid, so its contribution cannot be calculated.
- **Pending / stale / unavailable:** the source cannot currently provide a sufficiently current result.
- **Not applicable:** the source is explicitly inapplicable for the selected subject/period under its own rules.
- **Invalid:** validation or integrity checks failed.

Rules:

1. A source blocked by missing essential data does not block unrelated source calculations.
2. The aggregator includes valid, eligible contributions and identifies every omitted, blocked, stale or unresolved contribution and its reason.
3. A missing contribution is not a zero contribution. An explicit, source-authoritative zero is valid only when the source can prove that zero applies.
4. A partial aggregate must be visibly and programmatically marked partial; it must not be presented as a complete final Breakeven or target.
5. If a required source is unresolved, downstream consumers must receive the known subtotal plus completeness metadata, not a complete-looking total.
6. Re-running after missing data is supplied must deterministically produce the newly complete result without duplicating records or accruals.
7. Optional and not-applicable sources must be distinguished from missing required sources according to the owning product/source contracts.

## 7. Consistent multi-source snapshot and provenance

A published aggregate must be traceable from its result back through each included source contribution to the exact source records/revisions and calculation versions used.

The application orchestration must:

- establish one coherent as-of/period boundary for all participating public source queries;
- use the existing snapshot/revision-vector fence and source identities; do not describe an optimistic revision-vector fence as a serializable database transaction or MVCC snapshot;
- prevent a result from mixing incompatible source revisions or calculation versions without explicitly marking the snapshot inconsistent/incomplete; detect observed source drift and retry or expose a stale/partial result;
- preserve effective-date semantics and the Asia/Kolkata operational calendar;
- retain source IDs, revisions, correction heads, reversal links and canonical allocation references;
- make the calculation reproducible from the same source snapshot and rule versions;
- distinguish a recalculated/restated result from the original result and retain why it changed;
- use existing transaction, idempotency, outbox and recovery mechanisms where writes or durable projections are involved.

The existing Business Start Date allocation projection's source-level provenance is authoritative for the recovery pool. Reuse it; do not add a competing recovery ledger. Do not introduce a second event history, calculation ledger or recovery mechanism for the aggregation layer.

## 8. Downstream consumption

The implementation audit must identify current consumers and preserve their public integration points wherever possible.

- **Full-Cost Breakeven:** consumes eligible canonical source contributions and performs only the aggregation/product calculation assigned by the approved Breakeven contract.
- **Performance:** consumes the same canonical source outputs and the existing consistent aggregate/snapshot; it must not reconstruct EMI, Compliance, Maintenance, Fuel or expense formulas already owned elsewhere.
- **Passbook, Admin and Reports:** consume published, versioned results or approved read models; they must not create their own competing financial formulas.
- **Other existing features:** retain their current behaviour unless a demonstrated contract violation requires a separately tested correction.

If an existing service already performs a responsibility correctly, keep it. Adapt or extend existing Full-Cost Breakeven/Performance orchestration rather than creating a new service solely to match this document's terminology.

## 9. Delivery sequence

Implementation is explicitly gated until the prerequisite evidence in the document header is recorded and the implementation PR states which external acceptance gates remain deferred or are required for its scope.

Deliver in these controlled stages:

1. **Repository and wiring audit:** inspect each source owner, canonical calculation, public output, application adapter, consumer, platform implementation and test. Record what is already correct, partially correct, missing or contradictory. No broad implementation before the gap map is reviewed.
2. **Rule and contract reconciliation:** map every source output to its current normative owner contract; resolve any genuine conflict through the owner contract, not by inventing a new formula.
3. **Typed result contract:** reuse shared data/value states and define the smallest compatible source-result envelope, including basis, completeness, effective dates and provenance.
4. **Source adapter corrections:** fix only consumers that reconstruct source formulas, drop provenance, mis-handle missing data or use inconsistent revisions. Keep formulas with their source owners.
5. **Aggregate snapshot:** make the existing Breakeven/Performance composition consume canonical outputs under the existing snapshot fence and return explicit completeness/provenance.
6. **Downstream integration:** verify existing Performance, Passbook, Admin and Reports wiring; do not redesign screens or duplicate calculation logic.
7. **Regression and release verification:** run domain, application, integration, browser, Android Room, backup/restore, recovery, offline and exact-SHA CI checks. Record physical-device, live-account and production-data gates separately from automated CI.

Each stage must leave the application working and tested. Stop and reconcile a policy conflict rather than choosing an unapproved interpretation.

## 10. Required acceptance evidence

The implementation phase is complete only when all applicable items below are demonstrated and the evidence is tied to the exact final commit SHA:

- Every in-scope financial source has a documented authoritative owner, canonical calculation/output, consumer list and rule-contract reference.
- Consumers use canonical source outputs; no downstream duplicate source formulas remain in the audited paths.
- Source results preserve typed basis/units, currency precision, effective dates, source IDs/revisions and calculation versions.
- The 18-month aggregate pre-business pool, date classification, EMI schedule transitions and Compliance overlap rules reconcile to their owner contracts.
- Fuel interval eligibility, partial-purchase inclusion, prospective weighted-rate effective date and no-double-counting reconcile to the Fuel owner contract.
- Business kilometres exclude personal kilometres and unconfirmed/unallocated 04:00 boundary distance; Maintenance business accrual uses only fully allocated confirmed business kilometres and the effective operational-date rate.
- Missing, invalid, stale, pending, unavailable and not-applicable states are distinguishable; no silent zero/default coercion exists.
- A blocked source does not unnecessarily block unrelated source calculations.
- Partial aggregates are explicitly marked and cannot be mistaken for complete financial totals.
- Complete results reconcile to independently calculated expected values and approved product contracts.
- Same source snapshot and rule versions reproduce the same result; changed source revisions produce traceable restatements.
- Corrections, reversals, effective-date changes, prepayments/settlements, rate changes, 04:00 boundary handling and recovery preserve historical correctness and idempotency.
- Browser and Android produce equivalent normalized results from equivalent source facts and calculation versions.
- Backup/restore, database reopen and startup recovery preserve source lineage and aggregate reproducibility.
- Existing downstream screens and workflows continue to work without a presentation redesign.
- Required web, Android and integrated CI checks are green on the exact final commit SHA.
- Physical-device/OEM, live Dropbox, production-data and owner visual acceptance are reported separately; CI must not be presented as proof of those external gates.
- Documentation indexes, owner contracts and evidence records agree with implemented behaviour.

## 11. Explicit exclusions

This phase does not authorize:

- a wholesale architecture rewrite or replacement of existing source features;
- a generic formula/rules engine, universal event bus, microservices, new plugin/feature registry or giant central calculation class;
- duplicate source records, recovery ledgers, financial ledgers, formulas, persistence stores, backup/restore or recovery systems;
- new accounting/product policy or unapproved Breakeven variants;
- changing EMI, Compliance, Maintenance, Fuel, distance, expense, Driver Target or Performance semantics without an approved owner-contract amendment;
- a Performance screen redesign, unrelated Admin restructuring or new user-entry forms;
- fleet/multi-driver expansion;
- production-data reconciliation or physical-device acceptance being silently declared complete by CI.

## 12. Completion and status discipline

This document is a future-phase technical contract only. Its presence in the repository does not mean the current wiring is correct, implementation has started, or any acceptance gate has passed.

Before implementation begins, record the exact prerequisite PR/commit and its CI/owner disposition. During implementation, record each stage's changed paths, tests, unresolved gaps and exact commit SHA. Do not call the phase complete until every applicable acceptance item is evidenced and required CI is green.
