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

## 4A. Data-collection entry-path proof (Track B0)

A populated fixture loaded directly into a repository is not evidence that the application can collect the data correctly. Before fixture population, audit every currently supported user/device entry path and prove that valid input reaches the authoritative store through the real application boundary.

### B0.1 Entry-path inventory

Build an inventory from the current screens, forms, overlay actions, application commands, services and existing tests. Do not infer a form exists merely because a record type exists. For every supported entry path, record: feature/domain, surface (browser PWA, Android PWA/WebView, native overlay or background/device callback), UI/component or command, production validator, application service/repository, authoritative table/record owner, existing test and exact assertion, and any untested boundary.

The inventory must inspect at least these existing data families and confirm which are user-entered, device-captured, imported, or derived:

- Vehicle and Driver identity/profile/assignment.
- Finance loan setup, EMI/payment entries, prepayment and settlement/correction actions.
- Compliance validity setup, renewal, overlap review and corrections.
- Maintenance records and admin-configured effective-dated maintenance rates.
- Fuel/CNG amount and price-per-kg entry, derived quantity, full/partial refill choice, entry timestamp and GPS snapshot, and later locality enrichment when supported.
- Business Expenses including platform fees, traffic challans and miscellaneous charges, plus reversals/corrections.
- Work/Shift actions and odometer evidence, including start, completion, operational-day/04:00 boundary, active-trip deferral, and daily distance allocation.
- Log Book event creation/linkage and Performance settings/pre-business-cost entry where those are actual persisted inputs.
- Device/background-produced evidence and state transitions (GPS, timestamps, notifications, service/boot callbacks) where the product currently relies on them.

For each inventory row, distinguish a real user-facing path from a test-only fixture loader or internal service. A fixture loader may populate test data, but it cannot replace proof of the real entry path.

### B0.2 Required assertions for each applicable entry path

Reuse existing tests when their assertions reach the required boundary. Add only the missing test at the highest reliable level that exercises the actual path:

1. **Input and UI contract:** the real screen/form/action accepts the intended fields, defaults and choices; field-to-command mapping is correct; cancel/close does not accidentally commit; partial/incomplete input follows the documented save/resume/discard rule.
2. **Validation:** valid data is accepted; required, malformed, out-of-range, inconsistent, duplicate and stale inputs are rejected with no partial business write; domain-specific cross-field and effective-date rules are enforced by production validators.
3. **Command and commit:** the actual production command/service is invoked; stable IDs, actor/source metadata, timestamps, revisions and relationships are preserved; all records that must be atomic commit together.
4. **Read-after-write:** the saved record is read back through the normal application query/projection and remains present after page reload or database close/reopen; UI success is not treated as proof of persistence.
5. **Offline and interruption:** where the feature promises offline-first operation, entry and commit work offline; pending work survives app/WebView/service/process termination and resumes without duplicate records or side effects. Test partial drafts only where the feature contract promises draft persistence/resume.
6. **Device evidence:** where applicable, verify timestamp and GPS snapshots are captured at the defined event boundary, remain stable, and optional reverse-geocoding/enrichment does not rewrite the original evidence or block the driver's workflow. Permission denied/unavailable/stale location behaviour must fail safely according to the owning contract.
7. **Correction and replay:** edits, renewals, reversals, retries and duplicate submissions preserve immutable history/lineage and idempotency; a correction cannot silently rewrite its source or create duplicate downstream effects.
10. **Surface parity:** where the same workflow is exposed on multiple Android surfaces, enter/commit through each surface and assert the other reads the same committed state/event/revision from Room. Do not require a surface that does not expose that workflow.
11. **Derived effects:** calculations and projections are generated from committed source facts, not unsaved UI state; source IDs/revisions/effective dates and provenance are traceable.

Where full UI automation is unavailable or brittle, use the narrowest production boundary that still exercises the real form-to-command mapping and validator/service path, and explicitly label the untested visual interaction as a manual acceptance gate. Do not claim a repository-only unit test proves the UI.

### B0.3 Entry-path negative and resilience scenarios

The audit must explicitly check, where applicable: app close during entry; duplicate tap/retry; network loss; permission denial; malformed date/amount/odometer; invalid chronology; overlapping validity; stale revision; missing referenced entity; device clock/time-zone changes; operational-day boundary at 04:00; active-trip boundary deferral; and process/service restart with pending work. Use the owner contract's expected behaviour; do not invent new policy.

### B0.4 Cross-cutting architecture and reliability test audit

In addition to feature entry paths, map existing evidence and remaining gaps for these foundation-wide concerns. These checks may be owned by other contracts or CI suites; reuse those tests and do not duplicate them in PR #99.

- **Schema and upgrade safety:** database/schema version migrations from supported prior versions; data preservation and referential integrity after upgrade; unsupported future schema fails closed; no silent destructive fallback. Downgrade behaviour must be explicit (normally unsupported rather than destructive).
- **Data integrity:** unique/stable identities, required references, revision monotonicity, immutable history, correction/reversal chain integrity, deterministic ordering, and no partial writes after validation or transaction failure.
- **Concurrency and idempotency:** competing writers, stale revisions, duplicate commands/events, retry after timeout/process death, receiver deduplication and one authoritative commit.
- **Offline and lifecycle:** no network dependency for promised local entry/commit; browser reload; Android WebView/service/process recreation; boot/restart; pending work recovery; no duplicate side effects. Distinguish deterministic CI proof from physical-device/OEM gates.
- **Time and device evidence:** UTC/local timestamp semantics, timezone and clock changes, daylight-saving where applicable, operational-day 04:00 boundary, active-trip deferral, GPS permission denied/unavailable/stale results and immutable capture snapshots.
- **Backup package and restore safety:** implement and prove the normative platform-neutral encrypted wire format in Section 4B, including Finance participant normalization, Work/Log Book representation, zero-record participants, package/schema versioning and supported migrations; reject wrong-key/tampered/corrupt/truncated/incompatible packages before mutation; stage and validate the complete target dataset before atomic replacement; prove checkpoint rollback and no loss of pre-restore data. Dropbox authentication, account connectivity and real cloud delivery are separate external-account gates if not deterministically covered in CI.
- **Platform parity:** browser IndexedDB versus Android Room normalized business semantics; Android PWA/WebView and overlay share the same Room authority; no independent writable store or divergent projection.
- **Privacy and security:** secrets, keys, tokens and sensitive business data are not emitted into logs or test artifacts; backup protection follows the owner contract; restore inputs are treated as untrusted data. Verify the intentional backup exclusions on both runtimes: credential-vault material, local recovery checkpoints/journals and diagnostics must not leak into the business snapshot; credentials and diagnostics retain their separately defined secure handling.
- **Scale and operational resilience:** representative larger snapshots, bounded memory/time, snapshot consistency while writes occur, storage-full/transaction-abort behaviour where testable, and actionable failure reporting without exposing sensitive payloads.
- **Form architecture and presentation conformance:** one discoverable inventory of Admin, Performance, Fuel and Work forms; every definition's ID/version/owner/fields/requiredness/primary action; invalid-definition negative fixtures; actual PWA/Android entry boundaries; mobile viewport, keyboard/IME, focus/scroll, touch-target and accessibility behaviour. Generic form-runtime tests do not substitute for feature-specific component state or field mapping.
- **Network Access UI and policy parity:** actual Internet On/Off control, default-disabled state, persisted setting across reload/restart, propagation between Android WebView and overlay without network, no external requests while disabled, and safe deferral of Dropbox/geocoding work.
- **End-user backup operation:** rendered BackupPanel connect/session, manual backup, recovery-key handling, history selection, restore confirmation and visible failure/recovery states. Keep real Dropbox OAuth/remote account delivery as a separate manual/external gate.
- **Event-specific GPS matrix:** each supported Work transition (shift start/end, trip creation, Start ride, End ride, cancellation) must have its own fresh fix and original event timestamp; prove no fix reuse, no continuous tracking, rapid-event ordering and recoverable permission/timeout failures.
- **Backup bounds and consistency:** prove byte-size and record-count limits at the boundary, consistent snapshot semantics during concurrent writes, quota/transaction-abort handling, and documented supported device/storage limits.

For every item record the owning contract, existing test/assertion, platform, CI/manual status and gap. If an item is intentionally out of scope for PR #99, point to its owner contract and evidence rather than silently omitting it.

### B0.5 B0 exit

Every supported entry path and cross-cutting architecture concern is classified as **already proven**, **partially proven**, **not proven**, or **not applicable**, with exact source/test evidence and a named gap. B0 has two required sub-stages: (a) source/test audit and gap inventory; (b) implement only the missing targeted tests and update this evidence matrix/gap register with results. All critical data paths must have automated proof through the real form/action-to-production-command boundary and authoritative commit, or an explicitly documented physical/manual gate where automation is not feasible. The canonical cross-platform portability decision in Section 4B is binding; B0 must record the current implementation gaps against it. B1 may begin only after the B0 audit is complete, missing in-scope tests are added, their focused checks pass, and the updated evidence matrix identifies any remaining implementation (not test-inventory) work. Prefer records produced by these entry-path tests as fixture inputs where deterministic and practical; otherwise use the shared fixture loader through the same production validators and record why direct entry is unsuitable.

### 4B. Normative cross-platform backup portability decision

**Decision: encrypted business backups MUST be portable between the browser-only PWA and installed Android app.** Platform-bound business backups are not an acceptable final architecture.

The user must be able to create an encrypted backup on either supported runtime and restore it on the other without losing business meaning, historical lineage, pending recoverable work or calculation provenance. This decision is normative for PR #99 and supersedes earlier open alternatives in the gap register.

#### Canonical package architecture

1. **One platform-neutral, versioned wire contract.** Define a canonical backup envelope, manifest and domain-record representation independent of Dexie table names, Room entity names, adapter IDs, Kotlin/TypeScript classes or internal serialization choices. Include explicit package-format version, domain/participant identity, feature schema version, stable record identity, ownership, revisions, relationships, timestamps and integrity metadata.
2. **Canonical domain semantics.** Normalize browser and Android representations into the same business records before encryption/export and after decryption/import. In particular, Finance must have one canonical participant/record model covering loans, payment ledger, reversals, prepayment schedule revisions and settlements. Work/Driver Workflow and Log Book must likewise have canonical event/state/intent/outbox representations. Platform adapter IDs remain local implementation details and must not be required in the portable manifest.
3. **Versioning and migrations.** Keep package-format version distinct from feature schema versions. Provide explicit, deterministic migrations from supported older package versions into the current canonical model. Unknown future versions, unsupported required features and ambiguous lossy migrations fail closed before destination mutation. Do not silently drop records or fields.
4. **Runtime adapters.** Browser IndexedDB and Android Room each map their authoritative local model to/from the canonical contract. Internal database layouts may differ; canonical business meaning, IDs, relationships, revision history and ordering may not.
5. **Encryption interoperability.** Both runtimes must use the existing owner contract's interoperable encryption envelope and key derivation/verification rules. Authenticated package metadata must bind the format/version and manifest to the encrypted payload. Wrong keys, tampering, truncation and malformed envelopes must be rejected before restore staging. Do not invent a second encryption scheme or weaken existing cryptography to achieve portability.
6. **Validate before mutation.** Decrypt and authenticate, parse, migrate, validate the complete canonical manifest and all domain records/references, and stage the normalized target representation before opening the destination replacement transaction. Only then checkpoint and atomically apply through the existing production restore coordinator, read back, verify and retain rollback/recovery guarantees.
7. **Unknown optional versus required data.** The contract must distinguish safely skippable optional extension data from required business data. Unknown required participant/field/version fails closed; optional extensions may be preserved opaquely across round-trips where the format specifies this, never silently discarded.
8. **Snapshot consistency and exclusions.** Export a consistent point-in-time view. Registered participants with zero records remain represented. Credential-vault material, local restore checkpoints/journals and diagnostics remain outside the business backup and retain separate secure handling on both platforms.
9. **No dual authority.** The canonical format is an interchange boundary only. It does not introduce a cloud database, a second Android writable store, or ongoing Dexie↔Room synchronization. IndexedDB remains browser authority; Room remains installed-Android authority.

#### Required portability proof

- Export a populated encrypted canonical package from browser and restore it into a clean and a pre-populated Android Room database.
- Export a populated encrypted canonical package from Android and restore it into a clean and a pre-populated browser IndexedDB database.
- Include populated Finance payment/prepayment history, cross-feature references, historical corrections, Compliance renewal history, Maintenance accrual provenance, Business Expense reversal/correction chains, Driver assignments, Work/Driver Workflow events/intents/outbox and Log Book event history.
- Compare normalized records, identities, revisions, event ordering, pending work, correction heads and calculation outputs/provenance after restore, reopen, startup recovery and re-export.
- Test older supported package-version migration and fail-closed handling of unknown future/required versions.
- Test wrong key, tampered/corrupt/truncated payload, missing required participant, zero-record participant, unknown required field, dangling reference, invalid revision and interrupted restore. Destination data must remain unchanged on every pre-commit rejection and recover to the exact prior semantic state on an interrupted/failed commit.
- Verify encryption/decryption interoperability with the existing Dropbox backup contract; cloud account/network delivery is a separate gate from local package portability.

**B0 decision outcome:** portability is no longer an open product decision. B0 must audit the current implementation against this target, enumerate concrete gaps, and add them to the implementation backlog. B1–B4 must not treat platform-specific export/restore as sufficient final acceptance.

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
10. Execute the real startup recovery coordinator. On Android, include the production Room restore coordinator and startup recovery gate.
11. Re-export after recovery.
12. Re-run calculations and compare normalized semantic state, calculation outputs and provenance with the pre-export baseline.

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
2. B0 inventories every currently supported entry path and classifies it as already proven, partially proven, not proven or not applicable.
3. Every critical entry path has evidence through the real form/action-to-production-command/validator-to-authoritative-commit boundary, or an explicit manual/device acceptance gate.
4. Cross-cutting architecture tests (schema migration, data integrity, offline/retry, concurrency, time boundaries, canonical encrypted cross-platform backup compatibility, restore rollback, privacy and platform lifecycle) are mapped to existing tests or named gaps without duplication.
5. Shared fixture is populated with valid synthetic data for every supported domain and lineage listed above, including zero-record participants.
6. Matching valid/invalid feature records and whole snapshots produce equivalent browser/Android validator outcomes and stable error categories.
7. Browser fixture loader uses production validators/participants and exercises the production IndexedDB backup/restore lifecycle.
8. Room fixture loader uses production validators/participants and exercises the production Room backup/restore lifecycle.
9. Both runtimes complete export → restore → reopen → startup recovery → re-export.
10. Normalized semantic comparison passes across the two runtimes.
11. Calculations are recomputed before and after restore with identical values and provenance.
12. Encrypted business backup is proven portable in both directions using the canonical versioned wire format; platform-bound-only packages are not accepted as final architecture. Backup exclusions are consistent across runtimes.
13. Cross-surface workflow guarantees are mapped to existing tests or receive only the specific missing tests; no duplicate coverage for already-proven behaviour.
14. Failure injection covers rollback/recovery, stale writes, duplicate replay, pending intents and outbox.
15. Web tests, architecture checks, Android unit/instrumentation tests and integrated regression gate pass in CI.
16. PR remains draft and unmerged pending user review; physical-device/manual and external-account gates are clearly reported and not falsely marked complete.

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

### Track B — Data collection, populated fixture and end-to-end semantic parity (remaining)

**Status: not yet implemented. This is the active work track.**

#### B0. Audit and close data-collection entry paths and foundation tests

**B0a — Audit (completed 2026-11-18 against main SHA a99ea6f48b05d3df1e35a72266acdaa127c010d7):** The source/test/owner-contract inventory is recorded in Implementation Evidence Matrix Sections 0D and B0a.1–B0a.5 and architecture gap register Sections 9.19–9.31. The audit includes Admin/Work/Fuel/Performance entry paths, browser/Room persistence, forms, workflow surfaces, GPS/time, network policy, backup UI/package/participants/exclusions, migrations, deletion/actor/correction provenance, scale limits, and owner-policy status. All identified items are classified; open decisions and manual gates remain explicit and are not falsely marked proven. Inspect every supported screen/form/action/device/import path, production validator, command/service, authoritative store, backup adapter and existing test assertion. Classify each item as already proven, partially proven, not proven or not applicable. Map the existing G-13 through G-24 architecture findings and all cross-cutting concerns to exact owner contracts and test evidence. Record exact missing assertions; do not infer coverage from filenames or broad test names. Continue until each row in the feature and cross-cutting inventory has an owner contract, source boundary, exact test assertion, runtime/surface and status. Reconcile historical audit documents against the current feature inventory. Audit generic repository deletion call sites and legacy deletedAt compatibility; map original actor attribution and permitted correction authority. Identify any owner contract still marked proposed/not ratified and do not claim its business policy is proven by implementation/tests. Record product-contract conflicts (including Fuel form field definitions) without silently choosing a business rule.

**B0b — Close test gaps and update evidence (next):** Add only the targeted tests that B0a proves are missing. Run their focused test suites, then update this contract's evidence matrix and the architecture gap register with exact test names/assertions, platform, result and remaining manual/device gates. If a gap requires production implementation (including the canonical portable backup format), record its dependency and implementation phase; do not mark it as test-proven. Do not begin fixture population while the entry-path/test inventory remains incomplete.

Do not repeat Track A tests that already prove the same assertions. Existing tests may be cited as evidence and will run naturally in required CI.

**B0 exit:** no supported entry path, owner-contract status, data-provenance/mutation concern or cross-cutting foundation concern remains unclassified; every critical collection path has automated evidence through real form/action-to-command/validator-to-authoritative-commit or an explicit manual/device gate; every test gap identified in B0a has either been covered by a focused passing test or is explicitly documented with its implementation dependency and acceptance gate; unratified business rules and product-contract conflicts are explicitly surfaced to the owner and are not falsely marked proven; deletion/actor/correction boundaries are mapped; historical audit documents no longer misstate the current feature inventory; evidence documents are updated. The mandatory portability architecture decision is recorded as a production implementation gap until the canonical wire format and cross-platform tests are actually implemented. Only then may B1 begin.

#### B1. Populate the shared synthetic fixture

Use one deterministic fixture asset for both platforms, with schema-valid synthetic records and dependencies in valid creation order. Include registered participants with zero records so participant inventory and empty-owner semantics are tested, not inferred:

1. Vehicle and Driver identity dependencies.
2. Finance: loan schedule, payment ledger, prepayment schedule revision and settlement lineage/cutoff where the current schema supports them.
3. Compliance: validity records, renewals, overlap decision/head and correction history.
4. Maintenance: effective-dated rate history, fully allocated daily-kilometre source, immutable accrual and supported correction history.
5. Business Expenses: charges, reversals and correction-chain head.
6. Performance: only persisted `settings` and `pre_business_cost` records; calculation provenance must be asserted from the production calculation result, not persisted as a fabricated record kind.
7. Work/Driver Workflow and Log Book: stable ordered event IDs, committed state/revisions, pending intent, outbox entry/delivery state and linked Log Book history.

For every record, use current production schemas and validators. Add matching valid and invalid record/snapshot cases to a validator-parity matrix and compare browser/Android accept-or-reject outcomes plus stable error categories. Capture expected stable IDs, revisions, references, effective dates, correction heads and calculation inputs. Include Compliance renewal generations/early-overlap review supersession; Maintenance rate, allocated business/personal km, source revision and correction heads; Business Expense fuel and ordinary charges, Vehicle/Driver/trip-financial references and reversal/correction chains; Driver assignment interval/reassignment history; and Work intents/outbox in pending, acknowledged, retried and failed states linked to ordered Log Book events. Classify Performance recovery/provenance data as durable or derived/transient from the actual owner contract; if derived, prove deterministic reconstruction rather than inventing persisted record kinds. Do not use the user's actual personal/vehicle/loan/compliance/financial data.

**B1 exit:** the shared fixture is populated; positive and negative records/snapshots pass the browser and Android production validators with matching semantic outcomes; zero-record participants are accounted for; no fixture-only schema or validator relaxation.

#### B2. Browser lifecycle and canonical package adapter

- Add the browser fixture loader/runner for the shared populated fixture.
- Load through the browser persistence/application boundary and production validators/backup participants.
- Implement the browser adapter to export/import the canonical platform-neutral versioned wire contract from Section 4B; retain current local Track A checkpoint/rollback/recovery guarantees.
- Capture pre-backup normalized source state and run the relevant production calculations, including source provenance.
- Execute browser canonical export → encrypted package creation → same-platform restore → close/reopen → startup recovery → re-export.
- Capture post-recovery state and recompute calculations; compare against the pre-backup expected semantic baseline.

**B2 exit:** browser adapter reads/writes the canonical package contract and the populated browser lifecycle preserves business semantics and calculation results. Cross-platform acceptance remains pending B3.

#### B3. Android Room lifecycle and cross-platform portability

- Add the Room fixture loader/runner for the exact same fixture asset and IDs.
- Load through Room production participants and validators.
- Implement the Room adapter to export/import the same canonical package contract; preserve the existing Room production restore coordinator and Track A rollback/recovery guarantees.
- Capture pre-backup state and run the production calculations.
- Execute Android canonical export → encrypted package creation → same-platform restore → Room close/reopen → startup recovery → re-export.
- Restore a populated browser-exported encrypted package into Room, and restore a populated Android-exported encrypted package into browser IndexedDB. Test both clean and pre-populated destinations, plus fail-closed and rollback cases.
- Capture post-recovery state and recompute calculations.
- Verify Driver Workflow state remains shared between the PWA/native bridge and overlay service through the existing authoritative Room store.

**B3 exit:** Android lifecycle preserves business semantics and calculations; populated encrypted backup portability passes in both directions; no second Android workflow/business store is introduced.

#### B4. Cross-runtime semantic and calculation comparison

Compare browser and Room normalized results for (in addition to all fixture IDs and values):

- Participant inventory and ownership, including participants with zero records.
- Validator parity for matching valid/invalid feature records and whole snapshots, including stable error categories.
- Driver assignment temporal intervals, reassignment and Vehicle lifecycle references.
- Record IDs, schema versions and revisions.
- Cross-feature references and referential integrity.
- Event IDs/order, pending intent identity/status and outbox identity/delivery state for pending, acknowledged, retried and failed cases.
- Log Book event linkage/order.
- Correction-chain heads and revision lineage.
- Finance payment/prepayment/settlement lineage.
- Compliance multi-generation renewal/early-overlap review supersession and correction lineage.
- Maintenance accrual source/revision, business and personal allocated distance, effective-rate snapshot and correction-chain head.
- Business Expense fuel and ordinary charge references (Vehicle/Driver/trip-financial), reversals and correction-chain heads.
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

Execute strictly in this order: **Track B0a audit → B0b close test gaps/update evidence → B1 → B2 → B3 → B4 → B5 → B6.** Track A is the prerequisite already supplied by the current implementation; do not repeat it.

Stop and report before changing production behaviour, public schemas, domain calculation policy, UI or unrelated PR scope. If a current feature schema cannot express a fixture lineage, document the exact schema limitation and seek a contract decision instead of inventing fields.

## 13. Evidence reporting format

For every guarantee, report:

| Guarantee | Production implementation | Existing/new test | Failure condition exercised | Result | Remaining limitation |
|---|---|---|---|---|---|

A test name alone is not proof. The evidence must identify the assertion and lifecycle boundary. Distinguish automated deterministic proof from physical-device or real-account acceptance.
