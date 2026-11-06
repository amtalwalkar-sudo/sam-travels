# Architecture Hardening Implementation Contract

**Status:** Implementation contract for the separate architecture-hardening pull request.
**Baseline:** Runtime architecture and Timeline foundation PR #12 at `f02b7d9c2f499412b048ab90aa1723eab943146d`.
**Principle:** Strengthen the architecture without destabilizing the verified foundation.

This contract supplements the existing architecture, persistence, recovery, feature, Timeline, and shared-foundation contracts. It does not replace them or authorize user-facing Timeline/UI/shell work.

## Isolation and change policy

- Keep PR #12 unchanged. Hardening work is performed on a separate branch and reviewed separately.
- Reuse existing authoritative stores, gateways, feature boundaries, and recovery machinery. Do not introduce a second business store, competing command algorithm, or duplicate event records.
- Each stage is a separate commit with targeted tests and a recorded CI result before the next stage is built on it.
- Changes must remain architecture/domain/application/persistence/platform-adapter/test scoped. No visual styling, navigation, Timeline screen, cards, or presentation changes.
- A failed gate blocks progression; do not waive checks to get a green build.
- Physical-phone and live Dropbox/account acceptance are distinct release gates and must not be represented as CI-verified.

## Stage 1 — Compiler/AST-backed persistence boundary enforcement

### Required implementation
- Replace or supplement brittle source-text matching with parser/compiler-backed checks for TypeScript import graphs and forbidden persistence access.
- Enforce repository-relative imports and configured path aliases, feature public entry points, dependency direction, and cycle prevention.
- Enforce Kotlin Room DAO/SQLite access ownership using compiler-supported analysis or a structured Kotlin AST parser; allow direct DAO access only in designated persistence gateways/migrations/backup adapters.
- Guard all production business writes through the authoritative command/application persistence boundary; reject unapproved direct table/database mutations.
- Produce actionable diagnostics: source file, offending symbol/import, violated rule, and approved boundary.

### Tests / exit gate
- Positive fixtures for authorized gateways and imports.
- Negative fixtures for direct IndexedDB, Dexie, Web Storage, Cache API, browser persistence-library imports, Room DAO access outside approved gateways, direct SQLite mutation, direct business writes, and path-alias bypasses.
- AST fixtures prove comments/string literals do not spoof access checks; malformed TypeScript fails closed.
- Run architecture checker suite and the full web and Android CI gates.
- No production behavior or schema change unless strictly needed to close a demonstrated bypass.

### Verification evidence
- **Verified code commit:** `42fd818ac12a5a69860863b1549d736892df4d91`
- **CI run:** Sam Travels CI #631 (`42190831986`)
- **Result:** architecture, web regression/build, Android compile/unit/instrumentation/reliability jobs all succeeded.
- **Scope:** no Workflow/Timeline UI, navigation, styling, or shell work; the only UI-file touch moved non-secret Dropbox convenience settings behind a dedicated persistence adapter. PR #12 remains unchanged.

## Stage 2 — Formal persistence and schema contracts

### Required implementation
- Define stable, explicit schema/record contract versions for persisted authoritative data and backup participants.
- Specify validation at persistence ingress and restore ingress: identity, required fields, enum/event discriminants, revisions, timestamps, and integrity constraints.
- Make migration chains explicit, ordered, deterministic, and idempotent where supported; reject unsupported future versions without destructive fallback.
- Maintain representative historical database and backup fixtures, including malformed, partial, duplicate-identity, and older-version records.
- Preserve source records and semantics; projections and caches remain derived and rebuildable.

### Tests / exit gate
- Migration tests for each supported historical fixture to current version.
- Migration repeatability and rollback/failure-injection tests.
- Validation tests for accepted/rejected records and backup compatibility.
- Tests prove unknown future schema versions fail safely and preserve recoverability.

### Implementation evidence under test
- Shared TypeScript record-envelope v1 and backup snapshot v1 validators are defined in `packages/core/src/persistence-contract.ts`.
- Browser IndexedDB schema is explicitly versioned at v5; Android Room remains v3 with the ordered 1→2→3 migration chain. RoomStore now registers both migrations, matching Backup.
- Record validation is enforced by the application service, Dexie write adapter, Android Room write plugin, and backup export/restore ingress. Legacy Room rows remain readable for migration/recovery; typed application reads validate before business use.
- Native and browser backup manifests validate required metadata, record counts, participant versions, and reject unsupported future versions before checkpoint/replacement.
- Work command, intent, state, committed-event, and outbox discriminants/revisions are validated at browser/native persistence and backup boundaries; malformed persisted intents/events fail closed rather than being silently skipped.
- Historical/adversarial fixtures live in `fixtures/persistence/`; TypeScript and Android tests exercise v1/v2 Room migration, Dexie v1→v5 upgrade, record validation, duplicate identities, future-version rejection, and migration rollback.

## Stage 3 — Real persisted-data cross-platform parity

### Required implementation
- Drive the same deterministic headless projection contract from records actually read from PWA IndexedDB/Dexie and Android Room—not only a shared synthetic fixture or mocked bridge.
- Normalize only platform-specific transport/storage representations; do not normalize away business differences.
- Compare complete outputs: stable event/group IDs, metric IDs, values, result states, ordering, shift/day allocation, and diagnostics where contractually relevant.
- Include ordinary, edge, missing/invalid, duplicate/replayed, migrated, and restored persisted datasets.

### Tests / exit gate
- Web integration test persists then reads the dataset from IndexedDB and runs projection.
- Android instrumentation persists then reads the equivalent dataset from Room and runs projection through the real Android data gateway.
- Compare deterministic serialized business outputs against one parity oracle with explainable mismatch diagnostics.
- Fixture-only parity remains useful but is not sufficient for this gate.

### Stage 3 implementation evidence — verified
- `tests/timeline-projection-service.test.ts` persists ordinary, pending-edge, and historical legacy rows in Dexie/IndexedDB. Current v1 rows are read through `DexieDriverWorkflowRepository`; the legacy compatibility fixture is read from the persisted IndexedDB table and projected without weakening current ingress validation. Replayed delivery is checked against stable IndexedDB identity, and malformed current records are rejected at the repository read boundary.
- The web regression suite emits `timeline-projection-parity-oracle-v1.json`, containing complete deterministic serialized outputs for ordinary, pending shift/trip edge, and migrated-legacy datasets. CI uploads this oracle; the Android job explicitly depends on the web job and downloads that exact artifact, preventing parallel-job races or separately-authored expected values.
- `vite.timeline-parity.config.ts` builds the exact shared `packages/domain/src/timeline.ts` projector as a browser-executable IIFE for Android instrumentation.
- Android instrumentation persists ordinary records to an on-disk Room database, verifies duplicate delivery does not create extra rows, exports and replaces/restores the feature-owned records inside Room transactions, closes and reopens the database, reads events through `DriverWorkflowStore.listEvents`, and executes the same projector in Android WebView. It compares the complete serialized output—not selected metrics—to the Dexie-generated oracle.
- Android also persists and reopens a pending shift/trip edge dataset and compares the full output to the same oracle. A Room v2 historical fixture now contains a legacy event; the ordered 2→3 migration carries it into `logbook_events`, and instrumentation compares its full projection/invalid-event diagnostics with the Dexie legacy-row oracle. Malformed persisted events fail closed at both Dexie and Room read boundaries.
- The web restore/reopen test compares complete projection values before and after snapshot restore and database restart. Android native snapshot adapter replacement/restore is followed by physical database close/reopen before projection.
- **Stage 3 verification:** CI run #741 (`42203502104`) on code commit `6e11d75c3d9860f2d6632a6a443d33e7f1e4f869` passed architecture enforcement, the complete web regression suite and production build, Android assemble/unit/instrumentation compilation, and the required Android emulator Room/workflow/backup reliability gate. The Android parity and historical migration instrumentation tests ran as part of that gate.

## Stage 4 — Recovery and transaction guarantees

### Required implementation
- Establish a shared documented transaction/recovery lifecycle for commands, persistence, projections, and restore: validate → identity/revision/idempotency check → authoritative atomic write → derived projection rebuild/update → durable completion.
- Ensure derived Timeline/summary/cache data never becomes an authoritative source and can be rebuilt from source records.
- Preserve checkpoint-before-replacement restore semantics; validate backup before mutation and verify restored state after commit.
- Make interruption, duplicate delivery, concurrent/stale commands, migration failure, restore failure, and restart paths observable through bounded privacy-safe diagnostics.
- Roll back or recover to a known valid state; avoid partial writes and duplicate business records.

### Tests / exit gate
- Failure injection at every durable transition boundary.
- Duplicate/replay and concurrent command tests proving exactly-once effects (idempotent outcomes, not assumed exactly-once delivery).
- Restart/reopen tests for browser persistence and Room.
- Restore checkpoint, replacement, verification, and rollback tests.
- Derived projection rebuild equivalence test before/after restart and restore.

### Implementation evidence under test
- Browser and Room completion resolve an exact committed replay from its durable event, state revision, and outbox; command ID or idempotency-key reuse across distinct event IDs is rejected.
- IndexedDB and Room transaction suites inject failures at event, state/revision, terminal-intent, and outbox writes and verify that no partial completion becomes authoritative.
- Unverified restore checkpoints are reconciled by browser and native startup hooks before driver repositories expose operational state; rollback is verified against the retained checkpoint.
- Timeline and trip-history projections remain derived from persisted event rows and are rebuilt after restore/reopen.
- `packages/storage-browser/src/driver-workflow.ts` and `android/app/src/main/java/in/samtravels/app/DriverWorkflowStore.kt` now resolve exact committed replays from durable event/state/outbox records and reject command-ID or idempotency-key reuse across different event IDs. Duplicate delivery returns the prior committed outcome without another business write.
- Browser and Room transaction tests inject failures at each authoritative completion write (event, state/revision, terminal intent, and outbox). They verify atomic rollback leaves the prior state, retryable intent, event table, and outbox consistent, including after reopen.
- Browser `recoverBrowserRestoreTransactions` and native `NativeBackupRecovery.recoverPending` reconcile `checkpoint` / `restored_unverified` restore journals before operational driver repositories are exposed. Native recovery is shared with explicit checkpoint rollback; both paths verify restored data against the retained checkpoint.
- Browser `backup-runtime` memoizes successful startup reconciliation for the page process and resets the gate after a failed restore/rollback. Android `NativeStartupRecovery` is a process-wide gate shared by Backup, DriverWorkflow, RoomStore, and the overlay service; startup recovery runs before their operational reads/writes, and a failed rollback invalidates the gate. The overlay stays disabled when recovery cannot complete.
- Native restore validates the backup snapshot revision against the authoritative `work-driver-state/driver-state` row before creating a checkpoint or replacing records; absent driver state is valid only at revision zero.
- Native checkpoint capture and journal creation are in one Room transaction before replacement. Replacement and journal status transition are atomic; a process restart before post-restore verification rolls back to the pre-restore checkpoint.
- Browser recovery tests prove a pre-restore checkpoint survives IndexedDB close/reopen and is automatically reconciled; restored authoritative events rebuild the trip-history projection to the same complete output after restore and reopen.
- Android Room instrumentation proves checkpoint/journal durability across database close/reopen and startup recovery rollback; transaction triggers inject failures at the Log Book, state, intent, and outbox write boundaries. Existing tests also cover duplicate/replayed completion, command identity reuse, and stale/competing commands.
- **Initial implementation:** commit `3f540d7d34de1340d274a52b97a3ca8ac5e8e8e2`; CI #748 (`42207494968`) passed architecture enforcement, the complete web regression suite/build, Android assemble/unit/AndroidTest compilation, and the Android emulator Room/workflow/backup reliability gate. A post-run audit then found that the generic RoomStore gateway and one overlay attention-write path also needed to pass the process-wide recovery gate.
- **Follow-up hardening:** commit `30b179e5df0a056dd1bd003490c5d00492fd71c3` gates RoomStore get/put/list/remove and the overlay's attention-status write through `NativeStartupRecovery`. The same process-wide gate now protects Backup, DriverWorkflow, RoomStore, and the overlay service; failed recovery keeps operational access blocked. Native restore validates the backup's declared revision against the authoritative driver-state row before checkpoint/replacement.
- Web failure/recovery coverage includes `tests/transaction-recovery-guarantees.test.ts` (event/state/intent/outbox write failures, identity reuse and duplicate completion), `tests/driver-workflow.test.ts` (pending-intent retry after IndexedDB reopen and failed-consumer replay), `tests/backup-restore-failure-recovery.test.ts` (interrupted export, pre-mutation rejection and replacement rollback), `tests/recovery-lifecycle.test.ts` (checkpoint recovery after reopen and derived trip-projection rebuild), and `tests/timeline-projection-service.test.ts` (Timeline rebuild equivalence after restore/reopen).
- Android coverage includes `DriverWorkflowStoreTest` (write-boundary rollback, replay/idempotency, competing commands and Room reopen), `BackupRestoreTransactionFailureTest` (replacement rollback and checkpoint recovery after Room reopen), `LocalDatabaseMigrationTest` (ordered migration, migration failure rollback and future-version safety), and `NativeBackupCoverageTest` (participant integrity and snapshot-revision rejection).
- **Stage 4 verification:** CI run #751 (`42211390874`) on implementation head `30b179e5df0a056dd1bd003490c5d00492fd71c3` passed the architecture gate, focused recovery/reliability tests, the complete web regression suite and production build, Android debug/release assembly and unit/AndroidTest compilation, and the required Android emulator Room/workflow/backup instrumentation gate. See [CI run #751](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/42211390874).
- Stage 5 integrated regression remains not started. PR #13 remains draft/unmerged, PR #12 remains unchanged, and no Workflow/Timeline UI, navigation, styling, cards, or shell work is included. Physical-device and live Dropbox/account acceptance remain separate deferred release gates.

## Stage 5 — Integrated regression gate

### Required implementation
- Add/extend a single CI gate that runs architecture enforcement, schema/contract validation, historical migration fixtures, persisted-data parity, recovery/transaction reliability, full web regression/build, and Android build/unit/instrumentation reliability gates.
- Ensure stage-specific test groups are included in required integrated execution, not merely present in repository.
- Preserve existing CI gates; do not downgrade or silently skip failures.

### Exit gate
- All architecture, web, Android, storage, parity, migration, recovery, and backup/restore checks pass on the hardening PR head.
- PR description records exact commit SHA and CI run(s) for each stage.
- Scope audit confirms PR #12 is unchanged and no UI/shell/presentation work entered this branch.

## Acceptance register

| Stage | Deliverable | Evidence required | Status |
|---|---|---|---|
| 1 | AST/compiler-backed persistence ownership enforcement | Positive/negative architecture fixtures and CI #631 on `42fd818ac12a5a69860863b1549d736892df4d91` | Verified |
| 2 | Versioned persistence/schema contracts and migration fixtures | Historical fixture migration, validation, rollback tests; CI run `42197902329` passed all architecture, web, and Android gates on Stage 2 head `af2da94a4defccafa46e12143b08591650bb670e` | Verified |
| 3 | Actual IndexedDB + Room persisted-record parity | Full Dexie-generated projection oracle; durable Room restore/reopen; pending-edge and Room v2 migrated-legacy comparisons; malformed-record rejection; CI #741 (`42203502104`) on `6e11d75c3d9860f2d6632a6a443d33e7f1e4f869` | Verified |
| 4 | Transaction/recovery guarantees | Atomic event/state/intent/outbox writes; idempotent replay; process-wide startup recovery across browser, DriverWorkflow, Backup, generic RoomStore, and overlay; snapshot revision validation; checkpoint-before-replacement restore; derived projection rebuild; web and Room failure-injection suites; CI #751 (`42211390874`) on `30b179e5df0a056dd1bd003490c5d00492fd71c3` | Verified |
| 5 | Integrated regression gate | Full CI green on PR head | Not yet verified |

A contract or documentation commit alone does not count as implementation completion. Mark a stage verified only after its code, tests, and CI evidence are present.
