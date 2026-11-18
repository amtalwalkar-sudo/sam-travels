# PR #99 — End-to-End Data, Calculation, Persistence and Backup/Restore Contract

**Status:** Contract-first; implementation plan follows this document.  
**PR:** [#99](https://github.com/amtalwalkar-sudo/sam-travels/pull/99)  
**Branch:** `docs/repository-foundation-audit-gap-register`  
**Scope:** Verification and completion of the existing data and backup/restore architecture across browser-only PWA and installed Android. This contract does not authorize unrelated product features or a new storage architecture.

## 1. Purpose and outcome

The initial source/test inventory is recorded in [PR #99 Implementation Evidence Matrix](PR_99_IMPLEMENTATION_EVIDENCE_MATRIX.md). It is a static inspection baseline, not a CI pass claim; update it as each phase executes.

Prove, with deterministic automated evidence, that business facts collected by the application remain authoritative, internally consistent and reproducible through persistence, domain calculations, backup, restore, database reopen and startup recovery.

The proof must cover both supported runtime configurations independently:

- **Browser-only PWA:** Dexie/IndexedDB is the sole authoritative local business store.
- **Installed Android:** Room is the sole authoritative local business store. The Capacitor PWA/WebView and native overlay are two clients of the same Room-backed workflow and business persistence boundary.

Dexie and Room are platform alternatives. They are not two writable stores to synchronize inside the installed Android app. Do not add a central database, dual-write Android business records to IndexedDB, or introduce last-write-wins reconciliation.

The target is one coherent proof chain:

`user entry / device evidence → validated command → committed source record/event → derived projection → domain calculation + provenance → consistent snapshot → validated restore → reopen/startup recovery → equivalent records, state and calculations`

## 2. Normative ownership and precedence

This document adds PR #99 acceptance and evidence requirements; it does not replace domain policy or duplicate implementation rules owned elsewhere.

- [Local Persistence Contract](LOCAL_PERSISTENCE_CONTRACT.md) owns runtime store selection and repository ownership.
- [Transaction and Recovery Contract](TRANSACTION_AND_RECOVERY_CONTRACT.md) owns durable intent, atomic completion, revisions, idempotency, outbox, startup recovery and failure semantics.
- [Dropbox Backup Contract](DROPBOX_BACKUP_CONTRACT.md) owns backup package, encryption, scheduling, destination, checkpoint and restore safeguards.
- Feature contracts and validators own each domain's source facts, effective dates, correction rules and calculation semantics.
- [Work/Shift Odometer and Daily Business-Kilometre Contract](WORK_SHIFT_ODOMETER_AND_DAILY_DISTANCE_CONTRACT.md) owns confirmed odometer facts, operational-day allocation and daily distance.
- This PR contract owns the cross-runtime end-to-end fixture, lifecycle execution, semantic parity, traceability and evidence required to prove the above work together.

If this contract conflicts with a domain rule or a higher-level technical safeguard, stop and update the owning contract through review; do not weaken the existing rule to make a fixture pass.

## 3. Runtime and surface guarantees

### 3.1 Browser-only PWA

1. All authoritative business writes go through the browser repository/application boundary and commit to IndexedDB.
2. A successful write is visible after page reload and database close/reopen.
3. Pending intents, committed events, projections, outbox records and correction lineage that are part of the supported browser workflow remain durable across reload/restart.
4. Backup exports one consistent IndexedDB snapshot; restore validates and replaces the registered dataset safely.
5. After restore, database reopen and startup recovery, source records, references, revisions, pending work, event ordering and calculation outputs reconcile to the pre-export semantic state.

### 3.2 Installed Android

1. Room is the only authoritative local business database for the installed app.
2. The PWA/WebView and native overlay read the same committed Driver Workflow state and revision from Room.
3. An event created through either surface is visible to the other after commit; notifications are hints, and each surface re-reads the authoritative revision.
4. Pending intents and outbox messages survive WebView destruction, service destruction, process termination and device restart. Recovery resumes the same stable IDs; it does not create a second workflow history.
5. Service recreation is idempotent. Replayed commands and deliveries cannot duplicate an event, business effect, projection contribution or revision.
6. Both surfaces submit versioned commands with expected prior state/revision. Stale or competing writes are rejected or explicitly resolved by the ordered coordinator; neither surface may overwrite newer state with a stale snapshot.
7. Backup reads the Room authoritative store, including the workflow records and Log Book events registered for backup. Restore/recovery returns the same committed state and recoverable pending work.
8. The overlay service and Capacitor plugins must not create independent Room database names, divergent workflow stores or a second Android business database.

### 3.3 Shared workflow commit semantics

A driver transition is not committed merely because a button was tapped, a notification was sent, or a UI projection changed. The authoritative transaction boundary is specified by the Transaction and Recovery Contract. The event, required evidence/status, resulting state/revision, terminal intent status and durable outbox work must be atomic where they share the authoritative database.

Delivery is at-least-once. Stable IDs, atomic deduplication and idempotent receivers provide at-most-once business effects. Do not claim exactly-once transport.

## 4. End-to-end evidence chain

Every tested business flow must be traceable through the following stages. A stage may be omitted only when the domain genuinely has no such concept; record the reason in the fixture contract.

| Stage | Required evidence |
|---|---|
| Data collection | Input/command identity, source surface, source timestamp, actor/source metadata and required device evidence; no synthetic value may masquerade as user data |
| Validation | Domain validator and application command boundary accept valid data and reject invalid/incomplete data |
| Commit | Authoritative repository transaction; stable record/event ID, schema version and revision |
| Derived state | Rebuildable projections link to immutable source IDs/revisions; projections are not promoted to source-of-truth |
| Calculation | Calculation inputs, effective dates, deterministic units/rounding, output and source provenance |
| Backup snapshot | Runtime-authoritative consistent snapshot, participant manifest, counts, schema versions, revision/watermark and integrity metadata |
| Restore validation | Package integrity, participant ownership, schema compatibility, references, revisions and feature validators checked before replacement |
| Restore commit | Checkpoint, atomic/staged replacement, read-back verification and rollback/recovery journal |
| Reopen/recovery | Close/reopen or process recreation, startup reconciliation, pending intent/outbox handling and projection rebuild |
| Post-restore proof | Normalized source records, event order, references, correction heads, calculation values and provenance equivalent to pre-export values |

The same logical fixture must be exercised on both runtime adapters. Platform-specific serialized representations may differ only where explicitly normalized; business meaning and lineage may not.

## 5. Domain coverage and fixture rules

The shared deterministic fixture must contain valid synthetic records, not the user's real vehicle, loan, compliance or financial data.

Required domains:

- **Vehicle and identity dependencies:** valid synthetic Vehicle and Driver records required to resolve feature references.
- **Finance:** loan schedule, payment ledger entries, prepayment schedule revision and settlement lineage/cutoff where supported by current schemas and validators.
- **Compliance:** validity records, renewal links, overlap-review decision/head and historical correction chain.
- **Maintenance:** effective-dated rate history, fully allocated daily-kilometre source link, immutable daily accrual, and correction chain where supported.
- **Business Expenses:** source charges, reversals, correction chain/head and resulting source projection.
- **Performance:** actual supported persisted records (currently settings and pre-business-cost records). Calculation provenance is generated from source references by the Performance calculation service and must be asserted as calculation output; do not invent a persisted `source_provenance` record kind.
- **Work/Driver Workflow:** selected synthetic driver/vehicle, committed ordered events, durable pending intent(s), outbox message(s), stable IDs, revisions, delivery state and recovery status.
- **Log Book:** event history with stable event IDs and ordering/occurrence timestamps, reconciled to the corresponding Work events where applicable.

Use the real production validators and production backup participants. Do not weaken validators, bypass services solely to make the fixture load, or add new feature record types just for the fixture. Where a current schema cannot represent a requested lineage, document the exact limitation and stop for contract review rather than guessing fields.

The fixture must include both a valid populated scenario and explicit negative cases for dangling references, malformed revisions, duplicate identities, invalid correction heads and interrupted restore.

## 6. Calculation and provenance parity

For every calculation represented by the fixture:

1. Persist only authoritative source facts and immutable correction history; derived outputs remain derived.
2. Record the exact source record IDs and revisions consumed by the calculation, including effective-date/rate/schedule versions where applicable.
3. Recompute through the production calculation service before backup and after restore. Do not compare only serialized stored outputs if the output is derived.
4. Compare normalized outputs exactly for integer/paise/distance arithmetic and deterministically normalized rational values. Do not introduce floating-point tolerances where the domain uses integer or rational arithmetic.
5. Assert source provenance is unchanged after restore and that a changed source revision would be detected rather than silently reusing stale output.
6. Confirm that corrections, reversals, renewals, prepayments and settlement cutoffs retain their chain/head and effective-date semantics after restore.

This is a persistence and restore proof, not approval to change financial or operational calculation policy.

## 7. Backup and restore lifecycle requirements

Run the same lifecycle on browser and Android:

1. Create/populate the runtime database through supported application services or schema-valid fixture loaders that use production validators.
2. Read back and assert the committed source records, workflow state, pending work and revisions.
3. Run relevant production calculations and capture normalized output plus source provenance.
4. Export using the production backup runtime and participant registry.
5. Validate participant inventory, ownership, counts, schema versions, snapshot revision and cross-record references.
6. Clear/replace only within the test database, then restore using the production restore path.
7. Close/reopen the database (browser IndexedDB and Android Room).
8. Execute the real startup recovery coordinator. On Android, include the production Room restore coordinator and startup recovery gate.
9. Re-export after recovery.
10. Re-run calculations and compare normalized semantic state, calculation outputs and provenance with the pre-export baseline.

For Android, additionally exercise the Room-backed workflow through both PWA/native bridge and overlay service boundaries. For browser, exercise the IndexedDB-backed PWA lifecycle without Android dependencies.

A successful isolated participant round-trip is necessary but not sufficient for this end-to-end acceptance.

## 8. Failure, concurrency and lifecycle matrix

The integrated proof must cover, using existing tests where they already provide adequate evidence:

- PWA-to-overlay and overlay-to-PWA committed event visibility.
- Concurrent or interleaved commands from both surfaces using the same expected revision; stale-write rejection and one authoritative winner.
- Duplicate command/event IDs with identical payload (idempotent prior result) and conflicting payload (rejected).
- Pending intent persisted before termination and recovered with the original ID/timestamp.
- Outbox persisted atomically with event/state commit; retry after process death and receiver deduplication.
- Android service recreation and process death; no second workflow state or duplicate event.
- Device restart/reboot recovery for active state, pending intent and undelivered outbox where the platform permits deterministic instrumentation.
- Interrupted restore after replacement commit but before read-back verification; startup rolls back to the checkpoint and preserves a recoverable journal.
- Failed restore transaction and corrupted/incompatible package fail closed without losing the pre-restore dataset.
- Browser page reload/database reopen and recovery of pending work.
- Backup taken while writes are attempted: exported snapshot must represent one consistent committed boundary, not a mixed set of revisions.
- Projection rebuild and post-restore calculation rerun produce the same results without double-counting.

Use deterministic instrumentation/failure injection for transaction boundaries. Emulator tests do not prove OEM-specific physical-device scheduling or force-stop behaviour; retain physical-device acceptance as a separately reported release gate where required by the existing Android/Platform contracts.

## 9. Normalized semantic comparison

The shared comparison must include at least:

- Participant IDs and ownership.
- Record IDs, schema versions and revisions.
- Cross-feature references and referential integrity.
- Immutable source-event IDs and ordered event sequence.
- Pending-intent IDs, status, original timestamps and command payload identity.
- Outbox message IDs, event references, creation revision and delivery status.
- Log Book event IDs and deterministic ordering.
- Correction-chain heads and revision numbers.
- Finance payment/prepayment/settlement lineage and schedule version/cutoff.
- Compliance renewal links and overlap-review decision heads.
- Maintenance daily accrual source ID/revision, fully allocated distance and effective-rate snapshot.
- Business Expense charge/reversal links and correction heads.
- Performance calculation values and source provenance generated by the calculation service.
- Recomputed calculation outputs and effective-date inputs.

Normalization may remove platform-only storage metadata (for example, Room row wrappers versus Dexie envelopes) but must not remove business fields, IDs, revisions, timestamps, source references or event order.

## 10. Out of scope and architectural guardrails

This PR is not authorization to:
- Add a central/cloud database or sync server.
- Make Dexie and Room dual writable stores on Android.
- Redesign Driver Workflow, overlay UI, Admin forms or other screens.
- Add new business features, record kinds, calculations or accounting policy.
- Seed real user profile, vehicle, loan, compliance, or financial data into fixtures.
- Change domain validators to accept invalid fixture data.
- Claim physical-device, Dropbox-account, reboot or OEM lifecycle proof from CI alone.
- Merge the PR before the user explicitly requests it.

If a required test exposes a production defect, make the smallest change strictly necessary to satisfy an already-approved contract. If the fix would change domain policy, public schema, UI/product behaviour or another PR's scope, stop and present the evidence and proposed scope decision before editing production code.

## 11. Acceptance gates

PR #99 is complete only when all gates pass:

1. This contract and implementation plan are committed and internally consistent with the owner contracts.
2. Shared fixture is populated with valid synthetic data for every supported domain and lineage listed above.
3. Browser fixture loader uses production validators/participants and exercises the production IndexedDB backup/restore lifecycle.
4. Room fixture loader uses production validators/participants and exercises the production Room backup/restore lifecycle.
5. Both runtimes complete export → restore → reopen → startup recovery → re-export.
6. Normalized semantic comparison passes across the two runtimes.
7. Calculations are recomputed before and after restore with identical values and provenance.
8. Cross-surface workflow guarantees are mapped to existing tests or receive only the specific missing tests; no duplicate coverage for already-proven behaviour.
9. Failure injection covers rollback/recovery, stale writes, duplicate replay, pending intents and outbox.
10. Web tests, architecture checks, Android unit/instrumentation tests and integrated regression gate pass in CI.
11. PR remains draft and unmerged pending user review; physical-device/manual gates are clearly reported and not falsely marked complete.

## 12. Two-track implementation plan

The agreed PR #99 work is divided into two tracks. **Track A is the completed restore/recovery foundation. Track B is the remaining populated-fixture and end-to-end semantic-parity work.** Track B must reuse Track A; it must not reimplement or duplicate its tests.

### Track A — Restore/recovery foundation (implemented; reuse, do not repeat)

**Status: foundation implemented and covered by existing tests.** This track is not a new execution backlog.

Existing implementation/evidence includes:

- Browser production IndexedDB export/restore lifecycle, close/reopen and recovery.
- Android production Room restore coordinator, transaction/checkpoint/read-back/rollback and startup recovery path.
- Shared fixture contract seed and platform loaders that verify the seed's contract metadata.
- Referential-integrity checks, including dangling-reference rejection.
- Interrupted restore/failure-injection rollback coverage.
- Existing workflow atomicity, idempotency, pending-intent recovery, process-death recovery, outbox durability/replay and revision-conflict tests, as mapped in the [Implementation Evidence Matrix](PR_99_IMPLEMENTATION_EVIDENCE_MATRIX.md).

**Track A execution rule:** do not rebuild these paths, add equivalent tests, or rerun their isolated test suites just to reconfirm known behaviour. Their existing test names and assertions are the evidence baseline. They will run naturally as dependencies of required CI, but no separate retest task is created.

If Track B exposes a concrete integration failure in a Track A component, inspect that exact failing boundary and make only the smallest in-scope correction. Do not reopen Track A wholesale.

### Track B — Populated shared fixture and end-to-end semantic parity (remaining)

**Status: not yet implemented. This is the active work track.**

#### B1. Populate the shared synthetic fixture

Use one deterministic fixture asset for both platforms, with schema-valid synthetic records and dependencies in valid creation order:

1. Vehicle and Driver identity dependencies.
2. Finance: loan schedule, payment ledger, prepayment schedule revision and settlement lineage/cutoff where the current schema supports them.
3. Compliance: validity records, renewals, overlap decision/head and correction history.
4. Maintenance: effective-dated rate history, fully allocated daily-kilometre source, immutable accrual and supported correction history.
5. Business Expenses: charges, reversals and correction-chain head.
6. Performance: only persisted `settings` and `pre_business_cost` records; calculation provenance must be asserted from the production calculation result, not persisted as a fabricated record kind.
7. Work/Driver Workflow and Log Book: stable ordered event IDs, committed state/revisions, pending intent, outbox entry/delivery state and linked Log Book history.

For every record, use current production schemas and validators. Capture expected stable IDs, revisions, references, effective dates, correction heads and calculation inputs. Do not use the user's actual personal/vehicle/loan/compliance/financial data.

**B1 exit:** the shared fixture is populated and accepted by the existing production validators on both platforms. No fixture-only schema or validator relaxation.

#### B2. Browser lifecycle using existing Track A path

- Add the browser fixture loader/runner for the shared populated fixture.
- Load through the browser persistence/application boundary and production validators/backup participants.
- Capture pre-backup normalized source state and run the relevant production calculations, including source provenance.
- Execute the already-existing production IndexedDB export → restore → close/reopen → startup recovery → re-export path.
- Capture post-recovery state and recompute calculations.
- Compare against the pre-backup expected semantic baseline.

**B2 exit:** browser lifecycle proves the populated dataset survives the production path with identical business semantics and calculation results.

#### B3. Android Room lifecycle using existing Track A path

- Add the Room fixture loader/runner for the exact same fixture asset and IDs.
- Load through Room production participants and validators.
- Capture pre-backup state and run the production calculations.
- Execute the existing Room export → production restore coordinator → Room close/reopen → startup recovery → re-export path.
- Capture post-recovery state and recompute calculations.
- Verify Driver Workflow state remains shared between the PWA/native bridge and overlay service through the existing authoritative Room store.

**B3 exit:** Android lifecycle proves the populated dataset survives with identical business semantics and calculation results; no second Android workflow/business store is introduced.

#### B4. Cross-runtime semantic and calculation comparison

Compare browser and Room normalized results for:

- Participant inventory and ownership.
- Record IDs, schema versions and revisions.
- Cross-feature references and referential integrity.
- Event IDs/order, pending intent identity/status and outbox identity/delivery state.
- Log Book event linkage/order.
- Correction-chain heads and revision lineage.
- Finance payment/prepayment/settlement lineage.
- Compliance renewal/overlap decision lineage.
- Maintenance accrual source, allocated distance and effective-rate snapshot.
- Business Expense charge/reversal lineage.
- Performance calculation outputs, inputs and generated source provenance.

Recompute calculations before and after restore on each runtime using the production services. Compare deterministic outputs and provenance, not merely serialized snapshots.

**B4 exit:** browser pre/post, Room pre/post, and cross-runtime semantic comparisons all pass.

#### B5. Only the genuinely missing integration assertions

Start from the evidence matrix. Existing atomicity, idempotency, pending-intent, process-death, outbox and stale-revision tests are not to be duplicated.

Add a test only if source/assertion inspection confirms a real uncovered acceptance item. The initial audit identified these candidates:

- Direct Android PWA-to-overlay and overlay-to-PWA Driver Workflow event/state/revision visibility (not merely shared database use or another feature's bridge refresh).
- Actual surface-level stale-write interleaving: PWA reads revision N, overlay commits N+1, PWA submits stale N and is rejected; both surfaces converge to N+1.
- Android undelivered outbox retry after process death only if existing process-restart assertions do not already prove stable-ID retry and receiver deduplication.

Do not add another generic service recreation, process restart, duplicate completion, atomic rollback or pending-intent test where existing tests already prove the same assertion.

A full OS reboot is not to be conflated with process death. First inspect existing boot/restart evidence. If reboot persistence is not already covered and cannot be deterministic in CI, record it as a physical-device acceptance item rather than creating a flaky duplicate emulator test.

**B5 exit:** each identified missing assertion is either covered by one focused test or explicitly recorded as an external/manual gate; no duplicate coverage.

#### B6. CI and evidence closeout

- Run targeted tests for the new fixture loaders/runners, semantic comparison and any newly added B5 tests.
- Then run the repository's required CI once on the final PR head; existing tests execute as part of CI, not as a separate repeat-testing workstream.
- Update the evidence matrix and gap register with exact test names/assertions, commit SHA, CI run and remaining manual gates.
- Confirm the diff contains only this contract's documentation, fixture/test implementation and the smallest necessary in-scope fixes.
- Keep PR #99 draft and unmerged until user review and explicit merge instruction.

**B6 exit:** populated fixture, both runtime lifecycle runners, semantic/calculation parity, focused missing assertions, green required CI and accurate evidence ledger.

### Execution order and stop conditions

Execute strictly in this order: **Track B1 → B2 → B3 → B4 → B5 → B6.** Track A is the prerequisite already supplied by the current implementation; do not repeat it.

Stop and report before changing production behaviour, public schemas, domain calculation policy, UI or unrelated PR scope. If a current feature schema cannot express a fixture lineage, document the exact schema limitation and seek a contract decision instead of inventing fields.

## 13. Evidence reporting format

For every guarantee, report:

| Guarantee | Production implementation | Existing/new test | Failure condition exercised | Result | Remaining limitation |
|---|---|---|---|---|---|

A test name alone is not proof. The evidence must identify the assertion and lifecycle boundary. Distinguish automated deterministic proof from physical-device or real-account acceptance.
