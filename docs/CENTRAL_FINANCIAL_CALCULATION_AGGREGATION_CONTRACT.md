# Central Financial Calculation and Aggregation Contract

**Document ID:** ST-CALCULATION-AGGREGATION  
**Version:** 1.0  
**Status:** Proposed follow-on technical contract; implementation explicitly deferred  
**Authority:** Technical calculation composition, source-result contract, completeness and provenance. Existing product/domain contracts remain authoritative for business rules.  
**Prerequisite:** Complete and accept the active repository foundation/backup recovery contract work tracked by PR #99, including populated cross-platform lifecycle verification, reconciled documentation and green CI.  
**Scope:** One selected vehicle and its existing single-driver business workflow.  
**Timezone:** Asia/Kolkata business dates.  
**Currency:** INR; persisted money uses integer paise.

## 1. Purpose

Define the next, separately delivered phase for making Sam Travels' existing financial calculations consistently consumable by downstream features.

The objective is to make source-owned calculations reliable, traceable and composable—not to rebuild the application's architecture or move every formula into one central module.

The repository already has feature-owned calculation modules, application services, deterministic domain calculations, public read models, a Full Cost Breakeven calculation and Performance calculation/adapters. The next phase must inspect and reuse these mechanisms before changing them.

This contract is a technical composition contract. It does not approve new accounting policy, alter an existing source formula, or prove that any implementation is complete.

## 2. Non-negotiable architecture

1. **Source features own their meaning.** Compliance, Finance, Maintenance, Business Expenses/Fuel, Work/Shift and other source owners retain their records, validations, business rules, effective-date rules and canonical source calculations.
2. **Consumers use published outputs.** A consumer may combine a source's canonical output but must not reconstruct that source's formula from raw amounts, dates or private persistence.
3. **Application services orchestrate.** The application layer may coordinate public source queries, select a consistent calculation period/snapshot and aggregate typed results. It must not become a catch-all business domain.
4. **Pure calculations stay deterministic.** Domain calculations remain platform-neutral, versioned and independently testable.
5. **Presentation is not authority.** Screens, forms and UI state do not calculate financial truth.
6. **Existing architecture is reused.** Keep the existing feature registry, application composition, persistence, transaction/recovery, backup/restore and lifecycle mechanisms. Do not introduce duplicate infrastructure.
7. **No generic formula engine.** Do not create a universal formula/rules engine, giant central calculation class, universal event bus, new ledger, or a second competing breakeven implementation.
8. **No speculative rewrite.** Audit the current implementation and exact consumer wiring first. Change only demonstrated gaps.

## 3. Responsibility split

| Responsibility | Owner |
|---|---|
| Authoritative business records, source validations and source-specific formula | Existing source feature |
| Canonical effective-dated source projection or allocation | Existing source feature/application capability designated by its owner contract |
| Public typed query/read contract | Source feature |
| Multi-source query coordination and consistent calculation snapshot | Application orchestration |
| Aggregation of already-calculated, compatible contributions | Breakeven/Performance calculation capability under its approved contract |
| Display, period selection and interaction | Presentation |
| Browser IndexedDB / Android Room authority, atomicity, recovery and backup | Existing persistence and lifecycle foundation |

The implementation audit must identify the actual owner and consumer for each value. Do not infer ownership from a class name or move a calculation merely to make the diagram look uniform.

## 4. Source coverage and existing business-rule authority

The phase must audit and reconcile the following sources against their current normative owner contracts:

- **Compliance:** validity periods, renewals, reviewed overlaps, correction history, effective dates and the approved Business Start Date allocation behaviour.
- **Finance / EMI:** the complete scheduled EMI amount used by the approved breakeven rule; loan schedule, prepayment, settlement, cutoff and historical revision provenance remain with Finance.
- **Maintenance:** confirmed allocated business kilometres multiplied by the maintenance rate effective for the operational date; preserve immutable/idempotent daily accruals and rate history.
- **Fuel:** immutable purchase facts, full-to-full consumption intervals, effective weighted cost/km and the rule excluding partial-refill intervals from mileage/cost-per-km calculations while retaining their expense records.
- **Platform fees, traffic challans and miscellaneous business expenses:** source-owned paid-date recognition, typed expense classification, reversal/correction lineage and no-double-counting.
- **Work/Shift distance:** confirmed shift odometer facts, Asia/Kolkata 04:00 operational-day boundary, personal/business allocation and explicit unallocated/pending states.
- **Trip and revenue inputs:** consume only the approved trip/revenue read models and preserve immutable trip context and source provenance where required by the downstream calculation.

This list is an audit boundary, not permission to create new source records or duplicate source calculations.

### 4.1 Existing product-policy precedence

The current approved Breakeven and Driver Target Calculation Contract v2.0 remains authoritative. In particular, it currently specifies one Full-Cost Breakeven output and explicitly excludes a separate operating-breakeven metric. This technical contract does not silently add or revive a second breakeven variant. Any product-policy change requires an explicit, versioned amendment to the owning product contract before implementation.

The same precedence applies to EMI, Compliance, Business Start Date recovery, fuel, Maintenance, distance allocation, Driver Target and Performance metric definitions. This document standardises composition; it does not redefine those rules.

## 5. Standard source-result envelope

Each source publishes a typed, versioned result using the shared data/value semantics already defined by the repository. The concrete TypeScript shape and location must be selected during the implementation audit; this contract does not prescribe a new persistence schema.

Every result must carry, where applicable:

- source capability/domain and stable source-result identity;
- selected vehicle and relevant operational date or inclusive reporting period;
- value and currency/precision, or a typed rate/quantity;
- **basis/unit**, such as period total, per calendar day, per confirmed business kilometre, per completed transaction, one-off paid expense, or consumption interval;
- effective-from/effective-to dates and the business date on which the contribution is recognised;
- source record IDs and revisions, correction/reversal lineage and relevant source snapshot/revision;
- calculation/rule version and the version of any canonical allocation used;
- explicit applicability and eligibility for the approved downstream calculation;
- completeness/freshness state and structured missing, pending, stale, unavailable or invalid reasons.

Do not coerce different bases into a common daily amount merely to make aggregation convenient. A conversion is allowed only where an existing approved source allocation/calculation contract defines it and the conversion preserves period totals and source provenance.

## 6. Completeness and partial calculation semantics

Missing information must never be silently treated as zero, not-applicable, paid, confirmed or complete.

Use the repository's existing value-state vocabulary where possible. The observable behaviour must distinguish at least:

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
4. A partial aggregate must be visibly and programmatically marked partial; it must not be presented as a complete final breakeven or target.
5. If a required source is unresolved, downstream consumers must receive the known subtotal plus completeness metadata, not a complete-looking total.
6. Re-running after missing data is supplied must deterministically produce the newly complete result without duplicating records or accruals.
7. Optional and not-applicable sources must be distinguished from missing required sources according to the owning product/source contracts.

## 7. Consistent multi-source snapshot and provenance

A published aggregate must be traceable from its result back through each included source contribution to the exact source records/revisions and calculation versions used.

The application orchestration must:

- establish one coherent as-of/period boundary for all participating public source queries;
- prevent a result from mixing incompatible source revisions or calculation versions without explicitly marking the snapshot inconsistent/incomplete;
- preserve effective-date semantics and the Asia/Kolkata operational calendar;
- retain source IDs, revisions, correction heads, reversal links and canonical allocation references;
- make the calculation reproducible from the same source snapshot and rule versions;
- distinguish a recalculated/restated result from the original result and retain why it changed;
- use existing transaction, idempotency, outbox and recovery mechanisms where writes or durable projections are involved.

Do not introduce a second event history, calculation ledger or recovery mechanism for this purpose.

## 8. Downstream consumption

The implementation audit must identify current consumers and preserve their public integration points wherever possible.

- **Full Cost Breakeven:** consumes eligible canonical source contributions and performs only the aggregation/product calculation assigned by the approved Breakeven contract.
- **Performance:** consumes the same canonical source outputs and a consistent aggregate/snapshot; it must not reconstruct EMI, Compliance, Maintenance, Fuel or expense formulas already owned elsewhere.
- **Passbook, Admin and Reports:** consume published, versioned results or approved read models; they must not create their own competing financial formulas.
- **Other existing features:** retain their current behaviour unless a demonstrated contract violation requires a separately tested correction.

If an existing service already performs a responsibility correctly, keep it. The phase may adapt or extend the existing Full Cost Breakeven/Performance orchestration rather than creating a new service solely to match the terminology in this document.

## 9. Delivery sequence

Implementation is explicitly gated until the prerequisite in the document header is complete and accepted.

After that gate, deliver in these controlled stages:

1. **Repository and wiring audit:** inspect each source owner, canonical calculation, public output, application adapter, consumer, platform implementation and test. Record what is already correct, partially correct, missing or contradictory. No broad implementation before the gap map is reviewed.
2. **Rule and contract reconciliation:** map every source output to its current normative owner contract; resolve any genuine conflict through the owner contract, not by inventing a new formula.
3. **Typed result contract:** reuse shared data/value states and define the smallest compatible source-result envelope, including basis, completeness, effective dates and provenance.
4. **Source adapter corrections:** fix only consumers that reconstruct source formulas, drop provenance, mis-handle missing data or use inconsistent revisions. Keep formulas with their source owners.
5. **Aggregate snapshot:** make the existing breakeven/performance composition consume canonical outputs under one coherent snapshot and return explicit completeness/provenance.
6. **Downstream integration:** verify existing Performance, Passbook, Admin and Reports wiring; do not redesign screens or duplicate calculation logic.
7. **Regression and release verification:** run domain, application, integration, browser, Android Room, backup/restore, recovery, offline and exact-SHA CI checks.

Each stage must leave the application working and tested. Stop and reconcile a policy conflict rather than choosing an unapproved interpretation.

## 10. Required acceptance evidence

The phase is complete only when all of the following are demonstrated:

- Every in-scope financial source has a documented authoritative owner, canonical calculation/output, consumer list and rule-contract reference.
- Consumers use canonical source outputs; no downstream duplicate source formulas remain in the audited paths.
- Source results preserve typed basis/units, currency precision, effective dates, source IDs/revisions and calculation versions.
- Missing, invalid, stale, pending, unavailable and not-applicable states are distinguishable; no silent zero/default coercion exists.
- A blocked source does not unnecessarily block unrelated source calculations.
- Partial aggregates are explicitly marked and cannot be mistaken for complete financial totals.
- Complete results reconcile to independently calculated expected values and to the approved product contracts.
- Same source snapshot and rule versions reproduce the same result; changed source revisions produce traceable restatements.
- Corrections, reversals, effective-date changes, prepayments/settlements, rate changes, 04:00 boundary handling and recovery preserve historical correctness and idempotency.
- Browser and Android produce equivalent normalized results from equivalent source facts and calculation versions.
- Backup/restore, database reopen and startup recovery preserve the source lineage and aggregate reproducibility.
- Existing downstream screens and workflows continue to work without a presentation redesign.
- Required web, Android and integrated CI checks are green on the exact final commit SHA.
- Documentation indexes, owner contracts and evidence records agree with the implemented behaviour.

## 11. Explicit exclusions

This phase does not authorize:

- a wholesale architecture rewrite or replacement of existing source features;
- a generic formula/rules engine, universal event bus, microservices, new plugin/feature registry or giant central calculation class;
- duplicate source records, financial ledgers, formulas, persistence stores, backup/restore or recovery systems;
- new accounting/product policy or unapproved breakeven variants;
- changing EMI, Compliance, Maintenance, Fuel, distance, expense, Driver Target or Performance semantics without an approved owner-contract amendment;
- a Performance screen redesign, unrelated Admin restructuring or new user-entry forms;
- fleet/multi-driver expansion;
- production-data reconciliation or physical-device acceptance being silently declared complete by CI.

## 12. Completion and status discipline

This document is a future-phase contract only. Its presence in the repository does not mean the prerequisite contract is complete, implementation has started, the current wiring is correct, or any acceptance gate has passed.

Before implementation begins, record the exact prerequisite PR/commit and its accepted completion evidence. During implementation, record each stage's changed paths, tests, unresolved gaps and exact commit SHA. Do not call the phase complete until every acceptance item above is evidenced and CI is green.
