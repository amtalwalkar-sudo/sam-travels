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

## 12. Implementation plan (execute in order)

### Phase 0 — Baseline and evidence inventory
- Record PR head, CI run and current branch state.
- Map every acceptance item to production implementation, existing test, or explicit gap.
- Classify each as implemented-and-proven, implemented-but-under-tested, or genuine defect.
- Reuse existing cross-surface, restart, idempotency, stale-revision and participant tests. Add no test until its unique uncovered assertion is named.

**Exit:** evidence matrix approved; no assumed gaps and no duplicate test scope.

### Phase 1 — Shared fixture schema and valid synthetic data
- Correct the fixture contract to match actual persisted record schemas, especially Performance.
- Build deterministic synthetic Vehicle/Driver dependencies and domain records in dependency order.
- Validate each domain record with the production validator before running lifecycle tests.
- Add explicit expected normalized identities, references, revisions, event order, correction heads, calculation inputs/outputs and provenance.

**Exit:** same fixture asset loads and validates on both platforms; no fixture-only record kinds or weakened validators.

### Phase 2 — Browser/IndexedDB lifecycle runner
- Load the shared fixture through the browser adapter.
- Assert committed records and run production calculations.
- Export, clear test database, restore, close/reopen, startup-recover and re-export.
- Recompute calculations and compare all normalized semantic expectations.
- Keep browser-only tests independent of Android/Capacitor.

**Exit:** browser lifecycle passes with evidence for every required domain.

### Phase 3 — Android/Room lifecycle runner
- Load the same fixture through Room using production participants and validators.
- Verify workflow state is shared by the PWA bridge and overlay boundaries.
- Exercise export, production restore coordinator, Room close/reopen, startup recovery and re-export.
- Recompute calculations using the production application services and compare normalized output.
- Verify no parallel Android IndexedDB business copy or second Room workflow database is created.

**Exit:** Android Room lifecycle passes; PWA and overlay observe the same state/revision.

### Phase 4 — Failure and concurrency closure
- Map current tests to each row of the failure/concurrency matrix.
- Add only missing cases: both-surface stale-write race, reboot-level recovery if not already proven, and any uncovered interrupted-restore/replay boundary.
- Assert pending intent/outbox stable identity and event non-duplication after each recovery.
- Verify rollback preserves exact prior data and checkpoint/journal state.

**Exit:** every matrix item has an explicit passing test or a documented external/manual gate.

### Phase 5 — Cross-runtime semantic parity and calculation proof
- Compare pre-restore and post-restore state within each runtime.
- Compare normalized browser and Room semantics across runtimes.
- Compare calculation values, effective-date inputs, source revisions and provenance.
- Ensure normalization does not hide business differences.

**Exit:** identical semantic outputs for the shared fixture and all required lineage.

### Phase 6 — CI, documentation and PR closeout
- Run targeted tests first, then full required CI.
- Inspect failures and logs; fix only in-scope causes.
- Update the gap register with evidence, exact test names, CI run and remaining manual gates.
- Verify PR scope/diff contains only the agreed documentation and test/production changes necessary for this contract.
- Keep PR draft and unmerged until the user reviews and explicitly requests merge.

**Exit:** green required CI, documented evidence matrix, no open in-scope gaps, and truthful statement of remaining physical-device/external gates.

## 13. Evidence reporting format

For every guarantee, report:

| Guarantee | Production implementation | Existing/new test | Failure condition exercised | Result | Remaining limitation |
|---|---|---|---|---|---|

A test name alone is not proof. The evidence must identify the assertion and lifecycle boundary. Distinguish automated deterministic proof from physical-device or real-account acceptance.
