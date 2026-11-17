# Consolidated Product Foundation — Implementation Control Contract

**Status:** Owner-aligned execution contract for the single consolidated implementation workstream.  
**Created:** 2026-11-17  
**Delivery vehicle:** PR #97, after the documentation/decision baseline in PR #96 is approved and merged.  
**Authority:** This is an execution and scope-control document. It does not create or override product rules, calculation semantics, data contracts, platform contracts or security requirements. Named owner contracts remain authoritative.

## 1. Purpose

Deliver the agreed Sam Travels product foundation as one coherent, maintainable product: authoritative business calculations, traceable application wiring, reliable persistence/recovery integration, replaceable UI shell and screens, and equivalent business behaviour across browser/PWA and Android.

This is consolidation and gap-closing over the existing implementation, **not a greenfield rewrite**. The audit is the baseline. Close proven gaps without rebuilding working foundations.

This document is the execution guardrail for the assistant/implementation agent. Before each stage, inspect the current repository state and this contract. After each stage, update the evidence ledger and remaining-gap status. Do not silently change the sequence, scope or acceptance definition.

## 2. Agreed delivery structure

1. **PR #96 — documentation and decisions only.** Complete the architecture audit, policy reconciliation, owner map, system blueprint and documentation navigation. No application implementation in this PR.
2. **PR #97 — one consolidated implementation PR.** Complete the product foundation using internal stages and coherent commits. Do not create a chain of dependent implementation PRs.
3. Keep both PRs draft and unmerged until the owner explicitly approves the relevant merge.
4. Reconcile PR #97 with the approved PR #96 baseline before implementation proceeds against the final merged documentation.
5. Keep physical-device acceptance distinct from CI and emulator evidence.

## 3. Non-negotiable principles

- **Preserve before changing.** Inventory existing implementation, tests, contracts and platform paths before editing.
- **Prove the gap.** Every code change maps to a specific audit finding, demonstrated contract violation, missing acceptance test, or explicit owner-approved requirement.
- **One authority per business fact/calculation.** Consumers use the owning capability's published result; do not silently reproduce formulas downstream.
- **One coherent calculation snapshot.** Inputs, source revisions, effective dates, completeness and provenance for one reported result must be mutually consistent and traceable.
- **Clear dependency direction.** Screens consume presentation-ready projections and approved application actions. Screens do not own business rules, authoritative calculations, durable writes, persistence adapters or recovery.
- **Replaceability is demonstrated, not asserted.** Production shell and each production screen must be replaceable through existing contracts without editing unrelated screens or calculation/persistence foundations.
- **Shared business semantics across platforms.** Browser/PWA and Android may have platform-specific adapters and presentation, but preserve the same owner contracts, authoritative outcomes and recovery semantics.
- **Preserve data and operations.** Do not break records, migrations, backup/restore, offline workflows, Room/IndexedDB authority, transaction atomicity, idempotency, outbox replay, lifecycle or native overlay behaviour.
- **Small, reversible, behaviour-preserving slices.** Relocate code only when ownership is demonstrably wrong; remove old paths only after dependency proof.
- **No speculative architecture.** No second calculation engine, registry, event bus, persistence layer, form framework, UI framework, generic formula engine or mandatory design system.
- **No unrelated redesign.** Visual redesign and unrelated Admin/product restructuring are out of scope unless required to prove an agreed presentation boundary.
- **No false completion claims.** Distinguish implemented, unit-tested, integration-tested, CI-green, emulator-tested and physically accepted.

## 4. Scope and acceptance workstreams

### A. Calculation authority and financial correctness

- Preserve existing source owners for Work/Shift distance, Fuel/Business Expenses, Maintenance, Compliance, Finance/EMI, Trip Financials and other expense categories.
- Build a verified source-to-consumer map for every Performance/Breakeven input.
- Make downstream calculations consume canonical owner outputs and exact allocated amounts, rather than independently recreating source allocation rules.
- Implement the approved Business Start Date recovery policy in downstream Full Cost Breakeven:
  - classify each eligible amount using its owner-defined authoritative business/effective date;
  - aggregate the full qualifying pre-business amounts from all supported categories into one pool;
  - do not prorate qualifying source amounts by validity or remaining schedule duration;
  - divide the pool into 18 equal monthly instalments anchored to Business Start Date, using the approved month-end clamping rule;
  - distribute each monthly instalment across the days in its recovery month;
  - exclude the same pre-business amount from normal Breakeven inclusion to prevent double counting;
  - preserve source-level provenance and do not mutate source records or source-owned allocation history.
- Implement the approved fixed monthly Driver Target policy: only the first calendar month is prorated from Business Start Date through month-end; every later calendar month uses the full configured monthly target; partial report filters must not create additional proration.
- Preserve established Work/Shift odometer allocation, 04:00 active-trip deferral, personal-distance treatment, Maintenance effective-rate accrual, Compliance validity, EMI/prepayment, and fuel purchase/partial-refill rules while solving unrelated architecture gaps.
- Do not change financial policy for implementation convenience. If normative owner contracts conflict or are ambiguous, stop that specific change and request an explicit product decision.

**Acceptance evidence:** deterministic fixtures for effective dates, full source amounts, month boundaries, rounding/remainders, first-month target proration, later full targets, partial report windows, no double recognition, source corrections/revisions and provenance.

### B. Snapshot, provenance and correction propagation

- Establish one calculation-scoped source snapshot or equivalent explicit revision boundary for all inputs to a Performance result, including operating costs, fixed costs, distance summaries and recovery.
- Do not allow separately fetched owner reports to produce a mixed-revision result without detection.
- Preserve source IDs, revisions, effective dates, completeness/unknown states and correction lineage through the final result and downstream views.
- Verify corrections, reversals, retries and restored data propagate deterministically without mutating immutable historical evidence or duplicating amounts.
- Missing, ambiguous, pending or unallocated data remains visibly incomplete; never silently turn it into zero or confirmed business distance.

**Acceptance evidence:** controlled revision-change tests, correction/reversal/replay tests, completeness tests, source-to-final-result trace assertions and browser–Room parity fixtures.

### C. Application ownership and upstream/downstream wiring

- Keep business decisions and calculations in their existing owning domain/application capability.
- Move feature-owned application services into their existing feature package only where the audit/source map proves current placement creates real coupling or duplicated ownership.
- Move cross-feature workflow coordination and service construction out of React presentation hooks into the existing application composition/workflow boundary.
- Keep hooks and screen components as presentation state/action adapters.
- Preserve platform-specific repositories, Room/IndexedDB adapters, native plugins, lifecycle, transaction and recovery mechanisms as platform/shared responsibilities.
- Consolidate duplicate service/form-runtime construction only where the same capability is demonstrably composed more than once.
- Use typed, narrow feature contexts and public entry points. Avoid central barrel imports that expose unrelated private implementation.
- Keep one production composition root. It wires capabilities; it does not become another business-rule owner or screen-specific business orchestrator.

**Acceptance evidence:** source-to-owner-to-consumer inventory, architecture import checks, typed contract tests, integration tests for event flow and failure/retry behaviour, and proof that presentation no longer constructs authoritative services or writes durable records directly.

### D. UI/UX shell, screens, components and interactions

- Preserve existing visual design and interactions unless a specific agreed boundary requires change.
- Keep shell/navigation/global overlays independent from individual screens and from calculation/persistence foundations.
- Make every production screen independently replaceable using its typed presentation contract and approved application capabilities.
- Within each screen, keep layout, reusable visual components/styles, disposable presentation state, presentation models/selectors and interaction/action adapters independently changeable where practical.
- Do not impose a universal component template. Reuse existing components/contracts when they reduce coupling.
- Preserve navigation, focus/back handling, overlays, startup/readiness, loading, blocked, error, retry, pending/unknown states, accessibility, responsive behaviour, safe areas, text scaling and keyboard/IME behaviour.
- Retain the Android native overlay as its own platform presentation surface over the same Work/Shift and Room authority.

**Acceptance evidence:**
1. Replace the production shell while retaining real registered screens, application capabilities and lifecycle.
2. Replace each production screen independently while other screens and foundation remain unchanged.
3. Replace a screen's layout/components/styles without changing its business/application contracts.
4. Static checks reject prohibited screen-to-screen, presentation-to-persistence and presentation-to-private-calculation imports.
5. Runtime tests verify lifecycle, navigation, overlays, failure isolation and action boundaries.
6. Browser and Android presentation surfaces preserve equivalent contract behaviour.

A fixture renderer or static import check alone does not prove production replaceability.

### E. Persistence, recovery and platform parity

- Preserve the existing single authoritative store per runtime: browser storage for PWA and Room for Android, with shared business semantics.
- Preserve schema compatibility, migrations, backup/restore, transaction boundaries, idempotency, outbox delivery, recovery and offline-first entry.
- Verify Work/Shift, Maintenance accrual, expenses, trip financials, Timeline enrichment and Performance data through their real cross-feature paths.
- Verify browser/Room outcomes against shared deterministic fixtures and exact source projections.
- Do not claim physical-device acceptance from emulator or CI.

**Acceptance evidence:** existing recovery/backup tests plus targeted restore, retry, duplicate prevention, correction, offline and browser–Room parity regressions; Android build/unit/instrumentation/emulator checks; final physical-phone acceptance reported separately.

## 5. Controlled internal implementation stages

Stages are execution checkpoints within PR #97, not separate PRs. They may overlap only when dependencies are understood and acceptance requirements remain intact.

| Stage | Work | Exit condition |
|---|---|---|
| 0 — Baseline and inventory | Reconcile PR #96 decisions, inspect current PR #97 head, map findings to current source/tests, record passing gates and baseline SHAs. | No work starts from stale assumptions; every planned change has a finding and owner. |
| 1 — Calculation authority | Canonical allocation consumption, aggregate recovery, Driver Target conformance, coherent calculation snapshot and distance/provenance outputs. | Fixtures and source-to-result tests prove correct values, dates, revisions, completeness and no double counting. |
| 2 — Application wiring | Correct feature service ownership and cross-feature coordination; thin presentation hooks; typed capability contexts. | End-to-end event/data-flow tests prove ownership and recovery; architecture checks reject prohibited dependencies. |
| 3 — Replaceable presentation | Complete shell/global overlay seam, production screen registration/context and within-screen layout/component/interaction separation. | Real shell and each production screen can be independently replaced without unrelated foundation edits. |
| 4 — Platform/reliability | Browser–Room parity, restore/correction/retry/offline regressions, Android/native integration and lifecycle. | Full cross-platform automated acceptance passes; remaining manual/device checks are listed. |
| 5 — Final verification | Re-run full architecture, web, Android, integration and release checks on final PR head; inspect changed files and obsolete-path proof. | Required CI checks green on exact final SHA; no unreviewed scope drift; manual acceptance accurately reported. |

### Stage discipline

At the start of every stage:
1. Read this contract and the current audit/gap register.
2. Fetch current PR #97 head and compare it with the last verified SHA.
3. Inspect relevant production code, owner contracts and existing tests before editing.
4. Confirm the finding is still real; close it without code changes if existing work already satisfies it.
5. State the stage's bounded change set and acceptance tests.

At the end of every stage:
1. Run focused tests first, then relevant full suites.
2. Review the actual diff for accidental policy, schema, UI or unrelated changes.
3. Record changed paths, commit SHA, tests run and results.
4. Update each finding as **Complete**, **Partially complete**, **Missing** or **Not applicable**, with evidence.
5. Record residual risks and the next stage's entry conditions.
6. Do not advance past a failed correctness or data-integrity gate.

## 6. Gap register and evidence discipline

The [Calculation Authority and Application Wiring Audit](CALCULATION_AUTHORITY_AND_APPLICATION_WIRING_AUDIT_V1.md) is the baseline findings register. The [Performance End-to-End Conformance Audit](PERFORMANCE_END_TO_END_IMPLEMENTATION_CONFORMANCE_AUDIT.md), named owner contracts and platform/recovery contracts remain detailed authorities for their respective scope.

Use these statuses consistently:

- **Complete:** production path conforms and required automated evidence passes on a recorded SHA.
- **Partially complete:** implementation exists, but required wiring, correction, platform or acceptance proof remains.
- **Missing:** required behaviour or boundary is not implemented.
- **Not applicable:** explicitly justified against agreed product scope; never use to hide unfinished work.

A file, class, interface, test fixture or green CI job is not by itself proof of end-to-end completion. Every closure identifies the actual production path and test/evidence that demonstrates it.

Maintain a stage evidence ledger in the PR description or implementation progress section with:
- finding/acceptance ID and current status;
- production source paths and owner;
- implementation commit/SHA;
- focused and integration tests;
- CI run URL and conclusion;
- platform/device evidence;
- remaining limitation or reason for not-applicable status.

Never rewrite an old audit baseline as though it were inspected later. Add a dated update or a new exact-SHA evidence record.

## 7. Scope-change and stop rules

Stop and ask the owner before:
- changing an approved business, accounting, distance, fuel, EMI, Maintenance or Driver Target rule;
- changing persisted schema/backup formats or migration behaviour beyond a demonstrated compatibility fix;
- deleting a path whose production consumers have not been disproven;
- introducing a new shared framework, registry, event bus, persistence abstraction or calculation engine;
- redesigning a screen or changing user-visible workflows beyond the agreed replaceability requirement;
- weakening an existing test, acceptance gate, privacy boundary or platform safeguard to obtain green CI.

If evidence shows existing implementation already satisfies a finding, preserve it and close the finding with evidence. Do not make cosmetic refactors to create the appearance of progress.

If a stage exposes a genuine dependency not represented in the audit, add it to the gap register with evidence and explain whether it is in scope. Do not silently expand the work.

## 8. Definition of done for the consolidated implementation PR

PR #97 is ready for owner review only when:
- all in-scope audit findings are Complete or explicitly Not applicable with owner-aligned rationale;
- every calculation consumes authoritative owner outputs and Performance uses a coherent, provenance-complete snapshot;
- approved pre-business recovery and Driver Target policies conform in runtime and regression tests;
- cross-feature coordination and service construction sit at appropriate application boundaries; screens do not own calculations or persistence;
- production shell and each production screen are independently replaceable; within-screen layout/components/interactions do not leak into business ownership;
- browser/PWA and Android preserve shared business semantics and authoritative state/recovery behaviour;
- corrections, reversals, retries, backup/restore, offline workflows and historical data remain safe;
- obsolete paths are removed only with static dependency proof and replacement coverage;
- architecture checks, complete web tests/build, Android build/tests and integrated CI pass on the exact final head SHA;
- outstanding physical-device, live-account or other manual acceptance is explicitly identified and not misreported as complete;
- documentation, contract index, catalog, PR description and evidence ledger agree on what is done and what remains.

**Owner approval is still required before merging. Green CI does not authorize merge.**

## 9. Historical starting point before PR merges (2026-11-17)

This is a dated pre-merge starting snapshot, not a permanent claim about later branch heads. Section 10 records the subsequent merge state and final-quality-pass evidence.

- At this historical checkpoint, PR #96 was open, draft and unmerged. Its inspected head was `f284d4e45eb36e15cbb84d96d180fff3312e691b`; CI run #2797 (`43999217115`) completed successfully. It was later merged as part of the documentation baseline.
- At this historical checkpoint, PR #97 was open, draft and unmerged. Its inspected head was `1fede0691d42ac787ad31345af615e13120493cf`; CI run #2857 (`44008022959`) completed successfully. It was later merged as the consolidated implementation.
- PR #97 already contains architecture enforcement improvements, Performance screen controller/service adaptation, Timeline service relocation and Work screen registration/composition improvements.
- The audit still identifies Performance canonical allocation consumption, shared snapshot consistency, aggregate pre-business recovery and Driver Target runtime conformance, production shell/screen replacement proof, remaining application orchestration/feature ownership and cross-platform acceptance as work to verify/close.
- These successful CI runs do not prove those findings are closed and do not establish physical-device acceptance.

At that historical checkpoint, the next implementation step was to refresh the PR head and update the ledger. That pre-merge instruction is retained as stage history; section 10 is the post-merge status record.


## 10. Post-merge status and final software-quality pass — 2026-11-17

### Merge reconciliation

- PR #97 (consolidated architecture and product-foundation implementation) is merged as `a15acb791a2e452a3bb84e271ab7b0e27c73500c`.
- PR #96 (documentation and decision baseline) is merged as `b54181330e4e89d1f25b2e1e56a40b8264f19014`; this is the `main` SHA at the start of the final-quality pass.
- There are no remaining open PRs from that delivery sequence. The PR #96/#97 draft/unmerged wording above is retained only as historical stage evidence and must not be read as current status.

### Post-merge CI reconciliation

- Main commit `a15acb7` passed Architecture, Web, Android, Production geocoder verification and Integrated regression in [workflow run #44107617073](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/44107617073).
- Main commit `b541813` passed Architecture and Web but failed Android in [workflow run #44110381218](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/44110381218). The single reported instrumentation failure was `MaintenanceCorrectionCapacitorAcceptanceTest` at the `Driver form` assertion. Integrated regression failed downstream because Android failed; production geocoder was skipped because it depends on Android. The debug APK artifact was published, while the update-compatible and unsigned release APK steps were skipped.
- The test investigation identified a synchronization gap: the success status appears before the asynchronous post-correction history refresh finishes and the action becomes enabled. The final-quality branch waits for the enabled state and scopes DOM actions to the Maintenance history disclosure. It preserves the existing driver authorization, cross-driver rejection, chain, idempotency and restore assertions; no business rule or product UI behavior is weakened.

### Evidence and release boundaries

- Automated source/correction/effective-date fixtures and browser/Room tests are implementation evidence, not a substitute for a record-by-record reconciliation of deployed production data. No production dataset is present in the reviewed repository or connected sources; that reconciliation remains open until an authorized dataset is supplied and audited.
- The Performance snapshot guard is an optimistic revision-drift fence, not strict transactional/MVCC isolation.
- Production geocoder passed on the preceding main commit `a15acb7`, but was skipped on `b541813` after Android failed. It must pass on the final successful main push.
- Real Dropbox app/account OAuth and backup/restore acceptance remains owner-run; mocked CI does not prove a live account integration.
- Physical-phone/OEM acceptance remains explicitly deferred by the owner and is not a failed engineering task in this pass.
- Final Performance visual composition approval remains separate from calculation/wiring completion.
- Final signed/update-compatible and unsigned release APK artifacts remain to be confirmed by a successful post-merge main workflow.

### Final-quality completion rule

Do not mark the consolidated implementation fully release-ready until the Android correction acceptance and all required CI gates pass on the exact final main SHA, the production-data reconciliation is either completed against an authorized dataset or explicitly retained as an outstanding gate, and all live-account/device/visual approvals are reported separately. Green CI does not waive those owner-run gates.
