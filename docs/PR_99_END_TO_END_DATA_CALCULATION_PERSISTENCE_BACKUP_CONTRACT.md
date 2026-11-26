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

## 1A. Whole-contract definition of done — authoritative

**The definition of done for PR #99 is completion of this entire contract, not completion of its four-stage closeout tracker.** The four stages are a subordinate Finance/evidence closeout workstream; they are neither a replacement for nor a reduction of the acceptance criteria in this document and its referenced owner contracts.

PR #99 may be declared **WHOLE CONTRACT COMPLETE** only when all of the following are true:

1. Every applicable normative requirement in this contract and its referenced owning contracts has been mapped to implementation and evidence. Every supported data-entry path is audited at the real UI/action-to-command boundary or has a clearly identified, owner-accepted reason why that boundary is not applicable.
2. Browser-only PWA/Dexie and installed Android/Room independently satisfy their authoritative persistence, validation, calculation, correction, revision, transaction, recovery and backup/restore requirements. Android WebView and native overlay use the same Room-backed authority.
3. All required cross-runtime semantic and calculation/provenance comparisons pass using populated, schema-valid data through production export, encrypted package handling, restore, database reopen, startup recovery, recomputation and re-export in both directions. Fixture coverage limitations must remain explicit; a narrower fixture cannot be described as all-domain proof.
4. Every critical gap in the implementation evidence matrix and contract gap register is either closed with named passing tests and exact assertions, or explicitly accepted by the owner as a scoped deferral. A merely documented unresolved blocker, partial test, source inspection, or test that only checks fixture declarations does not count as closure.
5. Negative, boundary, interruption and recovery requirements applicable to supported workflows have passing evidence. Physical-device/OEM, nondeterministic full-OS-reboot and real external Dropbox-account checks may remain outside automated CI only when explicitly retained as external/manual release gates; they are not silently counted as passed.
6. The evidence matrix, gap register, this contract's closeout record and the PR description agree on the final scope and status. Every claim marked proven cites the exact test/assertion and relevant run; no stale baseline CI run is represented as validation of a later head.
7. Required CI is green on the exact final PR head after the final evidence/documentation changes. The final closeout records the exact commit SHA, run URL and required job outcomes; optional skipped jobs are identified accurately.
8. PR metadata is verified as open, draft and unmerged unless the owner separately authorizes a merge.

**Status vocabulary:** `WHOLE CONTRACT COMPLETE` is reserved for all eight conditions above. `STAGES 1–4 COMPLETE` means only that the subordinate four-stage tracker is complete. Neither stage completion nor green CI by itself establishes whole-contract completion. If any applicable critical item remains partial, open, unproven or pending owner acceptance, the whole contract remains **INCOMPLETE**.


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

### 3.0 Current operating configuration — one vehicle and one driver

**Approved current product scope:** Sam Travels operates with exactly one configured active business vehicle and exactly one configured active driver. Multi-vehicle, multi-driver and fleet-management workflows are deferred until separately approved. This is a deliberate product-scope constraint, not a permanent schema or architecture limitation.

1. Admin setup establishes the one active Vehicle profile and one active Driver profile. Work uses that configured pair automatically. Compliance is associated with the Vehicle only: it resolves the one active Vehicle independently and must not require a selected Work Driver or Driver–Vehicle assignment. Other routine workflows use the context required by their domain ownership and must not ask the user to select or reassign a vehicle or driver.
2. The current runtime must fail clearly when either configuration is missing or invalid. It must not silently choose an arbitrary record when multiple active candidates exist. Until the configuration is repaired, dependent entry/calculation actions remain unavailable rather than attaching data to the wrong entity.
3. Every vehicle-bound source record, calculation input, correction, backup reference and restored record uses the same configured `vehicleId`. Every Work/driver-attributed event and calculation uses the same configured `driverId`. The identifiers are stable and explicit; do not duplicate profile details into dependent records where a reference is sufficient.
4. Vehicle and Driver profiles remain separately owned, revisioned feature records. A single current driver-to-vehicle relationship may be retained where required by existing Work contracts, but interactive reassignment, assignment-history management and multiple active pairings are not current product workflows.
5. Existing assignment-history schemas, validators and backup readers may remain for compatibility and future migration. They are not a requirement to populate reassignment histories in the current synthetic fixture, expose assignment UI, or implement fleet functionality now. Historical records must not be discarded or rewritten merely to simplify the current UI.
6. Do not remove stable entity IDs, references, record ownership, versioning or migration seams. A later fleet expansion may introduce an explicit fleet/configuration boundary and assignment workflows through a reviewed contract and migration; it must not require rewriting calculation semantics or weakening historical integrity.
7. This single-configuration rule applies independently to browser IndexedDB and Android Room, and the PWA/WebView and native overlay must resolve the same configured pair from the same runtime-authoritative store.

#### 3.0.1 Authoritative operating-configuration resolution

The application-layer resolver is the only authority for the current operating pair. UI components and feature services must not independently scan profile lists, choose the first result, or infer a vehicle from an arbitrary historical assignment.

A successful resolution must validate one coherent snapshot from the runtime-authoritative repository and return a versioned context containing the configured `vehicleId`, `driverId`, and current `assignmentId` (plus the source record revisions needed to detect stale configuration). Apply all of these checks before enabling a dependent command:

1. Exactly one active Vehicle profile exists in the business configuration. Zero active profiles is `operating_vehicle_missing`; more than one is `operating_vehicle_ambiguous`. Inactive/sold profiles remain historical records and do not count as active.
2. Exactly one active Driver profile exists. Zero is `operating_driver_missing`; more than one is `operating_driver_ambiguous`.
3. The Work-owned `work:selected-driver` record exists, has the supported schema, and names that sole active Driver. Missing, malformed, inactive or mismatched selection fails with a stable `operating_driver_selection_*` category; it must not auto-select or repair the record.
4. Exactly one current active Driver–Vehicle assignment exists across current assignment histories, and it connects the selected Driver to the sole active Vehicle. Missing, multiple, or mismatched pairing fails with `operating_assignment_missing`, `operating_assignment_ambiguous`, or `operating_assignment_pair_mismatch`. Assignment history remains append-only/compatible; old closed assignments do not count as current.
5. The selected-driver lock and assignment effective-time rules owned by the Work/Driver contracts still apply. A configuration change cannot take effect during an active shift, and a transition cannot use an assignment that was not effective at its defined event time.
6. The resolver must read a consistent repository snapshot (or equivalent transactionally consistent set of records). It must not combine a Vehicle from one revision with a Driver/assignment from another. Commands carry the resolved IDs and relevant revisions through the application boundary; a stale configuration revision is rejected and re-resolved before retry.
7. Resolution is read-only. It must not create a selection, activate a profile, close an assignment, or choose a candidate as a side effect. Admin setup/repair is the only permitted place to establish or repair the one configured pair.

Browser and Android implementations must expose equivalent success context and stable failure categories. The Android PWA/WebView and native overlay must use the same Room resolver/store; browser PWA uses Dexie. Historical records retain their original references after a configuration change. New records use the configuration resolved at command acceptance, not a later UI refresh.

**Required resolver evidence:** valid sole-pair resolution; each missing/ambiguous Vehicle, Driver, selected-driver and assignment case; selected Driver mismatch; wrong Vehicle pairing; inactive/sold profile; locked active shift; assignment effective-time boundary; stale configuration revision; deterministic parity of result/error category between Dexie and Room. Assert that failure performs no business write. Do not count a test of `resolveWorkDriverContext` alone as proof that every feature command uses the resolver.


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

- The single configured Vehicle and Driver identity/profile pair. Audit legacy assignment-history support for compatibility, but do not treat assignment creation/reassignment as a current user-facing entry path.
- Finance loan setup, EMI/payment entries, prepayment and settlement/correction actions.
- Compliance validity setup, renewal, overlap review and corrections.
- Maintenance records and admin-configured effective-dated maintenance rates.
- Fuel/CNG amount and price-per-kg entry, derived quantity, full/partial refill choice and entry timestamp. Fuel does not capture GPS, persist location evidence, enqueue location work or perform locality enrichment.
- Business Expenses including platform fees, traffic challans and miscellaneous charges, plus reversals/corrections.
- Work/Shift actions and odometer evidence, including start, completion, operational-day/04:00 boundary, active-trip deferral, and daily distance allocation; trip creation when a trip is missing; and edits to existing trips and their linked fare, toll and parking details.
- Edits to existing fare, Maintenance and Compliance records, plus Fuel purchase amount and price/kg corrections (Fuel quantity remains derived from amount / price per kg).
- Log Book event creation/linkage and Performance settings/pre-business-cost entry where those are actual persisted inputs.
- Device/background-produced evidence and state transitions (GPS, timestamps, notifications, service/boot callbacks) where the product currently relies on them.

For each inventory row, distinguish a real user-facing path from a test-only fixture loader or internal service. A fixture loader may populate test data, but it cannot replace proof of the real entry path.

### B0.2 Required assertions for each applicable entry path

Reuse existing tests when their assertions reach the required boundary. Add only the missing test at the highest reliable level that exercises the actual path:

1. **Input and UI contract:** the real screen/form/action accepts the intended fields, defaults and choices; field-to-command mapping is correct; cancel/close does not accidentally commit; partial/incomplete input follows the documented save/resume/discard rule.
2. **Validation:** valid data is accepted; required, malformed, out-of-range, inconsistent, duplicate and stale inputs are rejected with no partial business write; domain-specific cross-field and effective-date rules are enforced by production validators.
3. **Command and commit:** the actual production command/service is invoked; stable IDs, actor/source metadata, timestamps, revisions and relationships are preserved; all records that must be atomic commit together.
4. **Read-after-write:** the saved record is read back through the normal application query/projection and remains present after page reload or database close/reopen; UI success is not treated as proof of persistence.
5. **Offline and interruption:** where the feature promises offline-first operation, entry and commit work offline; pending work survives app/WebView/service/process termination and resumes without duplicate records or side effects. Test partial drafts wherever the owner contract promises preservation: it is automatic, requires no separate draft-save button, and must restore entered values after leaving the form, navigation, switching apps, app backgrounding/closure, process termination and supported phone-restart recovery. Draft recovery must not create or update a business record; only explicit Save/Submit create records. If phone-restart recovery is unsupported on a particular surface, record the platform limitation and acceptance gate.
6. **Device evidence:** where applicable to a GPS-enabled Work/Trip event, verify timestamp and GPS snapshots are captured at the defined event boundary, remain stable, and optional reverse-geocoding/enrichment does not rewrite the original evidence or block the driver's workflow. Fuel is explicitly excluded from GPS and location enrichment. Permission denied/unavailable/stale location behaviour must fail safely according to the owning Work/Trip contract.
7. **Feature-owned edit permissions:** support the following owner-approved operations without imposing a universal Edit lifecycle: add a missing trip; edit an existing trip and its linked fare, toll and parking details; edit fare records; edit Maintenance records; edit Compliance records; and edit Fuel purchase amount and price/kg. Fuel quantity is calculated from amount / price per kg and must be recalculated, not independently edited. Driver, Vehicle and Loan retain their existing feature-specific lifecycle restrictions and downstream-protection rules. Delete remains feature-policy-controlled.
8. **Correction, recalculation and replay:** an accepted edit must preserve the owning feature's required revision/correction/audit lineage and idempotency. It must automatically recalculate every affected downstream projection, allocation, accrual, total and performance/breakeven output from the revised authoritative source facts. Updated dependent figures must be available immediately when the edit operation reports success, without a manual refresh/recalculation or unrelated action. No stale derived figure may be presented as current. If a dependent calculation cannot complete, expose an explicit pending/error state and do not report the affected output as current/successfully recalculated. Repeated submission/recovery must not duplicate corrections or downstream effects.
9. **Surface parity:** where the same workflow is exposed on multiple Android surfaces, enter/commit through each surface and assert the other reads the same committed state/event/revision from Room. Do not require a surface that does not expose that workflow.
10. **Derived effects:** calculations and projections are generated from committed source facts, not unsaved UI state; source IDs/revisions/effective dates and provenance are traceable.

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
- **Network Access UI and policy parity:** reuse the CI-run PWA BackupPanel acceptance for Internet Off/On, disabled Dropbox gating and persistence across reload; add Android WebView/Room propagation and restart proof, no external requests while disabled, and safe deferral of Dropbox and Work/Trip location-enrichment work; Fuel has no geocoding work.
- **End-user backup operation:** reuse the CI-run rendered PWA BackupPanel fake-Dropbox acceptance for connect/session, encrypted upload/download, recovery-key reveal, restore confirmation and checkpoint verification. Add the Android native OAuth/secure-vault BackupPanel path and any still-missing retention/disconnect/failure/rollback UI states. Keep real Dropbox OAuth/remote account delivery as a separate manual/external gate.
- **Event-specific GPS matrix:** each supported Work transition (shift start/end, trip creation, Start ride, End ride, cancellation) must have its own fresh fix and original event timestamp; prove no fix reuse, no continuous tracking, rapid-event ordering and recoverable permission/timeout failures.
- **Backup bounds and consistency:** prove byte-size and record-count limits at the boundary, consistent snapshot semantics during concurrent writes, quota/transaction-abort handling, and documented supported device/storage limits.

For every item record the owning contract, existing test/assertion, platform, CI/manual status and gap. If an item is intentionally out of scope for PR #99, point to its owner contract and evidence rather than silently omitting it.

### B0.4.1 Current CI blocker correction

The first B0b CI run after the Fuel PWA submit path was added failed before the new Fuel acceptance could execute:

- The Admin acceptance script exceeded the architecture gate's 400-line / 24,576-byte limit after the Fuel flow was appended. Extract the Fuel flow into a focused standalone acceptance script; do not relax the gate.
- The Admin acceptance script attempted to navigate using accessible button name `Work`, but the actual primary navigation label is `Drive`. Correct the test selector to the shipped accessible label; do not change the product navigation just to satisfy the test.
- The Admin browser acceptance passed identity enrollment/activation, Business Setup and Vehicle creation before timing out. The Fuel submit acceptance is therefore **not yet executed or proven**. Android was skipped because architecture/web failed.

These blockers are recorded in PR_99_IMPLEMENTATION_EVIDENCE_MATRIX.md and gap register item 9.36. B0b must close them and demonstrate the standalone Fuel acceptance passing before its evidence row can be upgraded.

### B0.4.2 Android production record-count enforcement

The Android restore coordinator already invokes `requireBackupRecordCountWithinLimit(records.length())` before checkpoint creation and destination replacement, but only after participant and per-record validation. The remaining production gap is early enforcement and export/package creation: `NativeSnapshotBuilder` does not guard export count, `BackupSnapshotContract.validateManifest()` only checks non-negative count, and the shared TypeScript encrypted-package validator checks individual counts but does not sum them against the 1,000,000-record maximum. B0b must add the total-count check to encrypted package creation/parsing, guard NativeSnapshotBuilder export, move the existing native restore check immediately after reading raw records, and add production-path tests for rejection before expensive validation/checkpoint/mutation. This is recorded as gap register item 9.37; the shared TypeScript 512 MiB package parser remains the Android byte-size enforcement path.

### B0.4.3 Android device-readiness prompt integration

B0b must also close the rendered Android WebView device-readiness flow in gap register item 9.38. Existing pure policy tests are sufficient for the permission decision logic and must be reused. Add only the missing UI/native bridge acceptance: required setting missing, prompt presentation, opening Android Settings, returning and re-checking, dismissal/reopen, recommended optional settings, and settings-open failure. Prove that optional settings do not block local data entry and required gates match the Device Readiness contract.

### B0.4.4 Backup creation memory and plaintext-size bound

B0b must close gap register item 9.39: the current 512 MiB limit applies to the serialized encrypted package and is checked after encryption during serialization. Define a plaintext ceiling based on encryption/base64 overhead and supported Android memory, enforce it before hashing/encryption and as early as possible before snapshot materialization, and test the inclusive boundary plus first-over rejection. The cap must be backed by representative browser/Android memory and duration evidence, not selected arbitrarily.

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
- Include populated Finance payment/prepayment history, cross-feature references, historical corrections, Compliance renewal history, Maintenance accrual provenance, Business Expense reversal/correction chains, the single configured Driver–Vehicle relationship, Work/Driver Workflow events/intents/outbox and Log Book event history.
- Compare normalized records, identities, revisions, event ordering, pending work, correction heads and calculation outputs/provenance after restore, reopen, startup recovery and re-export.
- Test older supported package-version migration and fail-closed handling of unknown future/required versions.
- Test wrong key, tampered/corrupt/truncated payload, missing required participant, zero-record participant, unknown required field, dangling reference, invalid revision and interrupted restore. Destination data must remain unchanged on every pre-commit rejection and recover to the exact prior semantic state on an interrupted/failed commit.
- Verify encryption/decryption interoperability with the existing Dropbox backup contract; cloud account/network delivery is a separate gate from local package portability.

**B0 decision outcome:** portability is no longer an open product decision. B0 must audit the current implementation against this target, enumerate concrete gaps, and add them to the implementation backlog. B1–B4 must not treat platform-specific export/restore as sufficient final acceptance.

## 5. Domain coverage and fixture rules

The shared deterministic fixture must contain valid synthetic records, not the user's real vehicle, loan, compliance or financial data.

Required domains:

- **Single operating configuration:** exactly one active synthetic Vehicle and exactly one active selected Work Driver, with one stable configured pair. All vehicle/driver references in the fixture resolve to those same IDs; no second vehicle, second selected driver or reassignment history is required.
- **Finance:** loan schedule, payment ledger entries, prepayment schedule revision and settlement lineage/cutoff where supported by current schemas and validators.
- **Compliance:** validity records, renewal links, overlap-review decision/head and historical correction chain.
- **Maintenance:** effective-dated rate history, fully allocated daily-kilometre source link, immutable daily accrual, and correction chain where supported.
- **Business Expenses and Fuel:** source charges, reversals, correction chain/head and resulting source projection. Fuel must include a baseline full-tank checkpoint, a later full-tank checkpoint that closes the interval, and any intervening partial refill(s); assert that the opening baseline is excluded from interval consumption, intervening partials and closing full refill contribute kg/spend, and the resulting km/kg, effective cost/kg, cost/km and weighted rate history survive backup/restore. Include a second completed interval where supported to prove prospective weighted-rate history.
- **Performance:** actual supported persisted records (currently settings and pre-business-cost records). Calculation provenance is generated from source references by the Performance calculation service and must be asserted as calculation output; do not invent a persisted `source_provenance` record kind.
- **Work/Driver Workflow:** the one configured synthetic driver/vehicle pair, committed ordered events, durable pending intent(s), outbox message(s), stable IDs, revisions, delivery state and recovery status.
- **Feature-owned edit and recalculation lineage:** include a trip added to repair a missing trip, a revised trip with linked fare/toll/parking values, an edited fare record, edited Maintenance and Compliance records, and a Fuel purchase correction that changes amount and/or price/kg while quantity remains derived. Use only current production schemas and supported correction/revision mechanisms. Assert that every affected downstream calculation/projection is recomputed immediately and that the revised outputs, source revisions, correction heads and provenance survive backup/restore; include a failed or interrupted recalculation case if the production path supports recoverable pending work.
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
- Redesign unrelated Driver Workflow, overlay UI, Admin forms or other screens. The explicitly approved single-vehicle/single-driver simplification is in scope: remove routine entity selectors/reassignment flows and resolve the configured pair automatically.
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
17. Both runtimes prove exactly one configured active Vehicle and one active selected Work Driver for Work and other pair-dependent workflows; Compliance resolves and references the Vehicle only, without requiring Work Driver selection or assignment. Each workflow validates only the context its domain ownership requires. Missing or ambiguous required context fails clearly. Legacy assignment history remains readable where present.

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

**B0a — Audit (completed 2026-11-18 against main SHA a99ea6f48b05d3df1e35a72266acdaa127c010d7):** The source/test/owner-contract inventory is recorded in Implementation Evidence Matrix Sections 0D and B0a.1–B0a.6 and architecture gap register Sections 9.19–9.32. The audit includes Admin/Work/Fuel/Performance entry paths, browser/Room persistence, forms, workflow surfaces, GPS/time, network policy, backup UI/package/participants/exclusions, migrations, deletion/actor/correction provenance, scale limits, and owner-policy status. All identified items are classified; open decisions and manual gates remain explicit and are not falsely marked proven. Inspect every supported screen/form/action/device/import path, production validator, command/service, authoritative store, backup adapter and existing test assertion. Classify each item as already proven, partially proven, not proven or not applicable. Map the existing G-13 through G-24 architecture findings and all cross-cutting concerns to exact owner contracts and test evidence. Audit and test the crash window between a form handler's domain commit and the SharedFormRuntime's later working-copy status write. The active in-memory promise cache is not durable idempotency. A process restart must not turn an already committed submission into a duplicate-ID error or a second event; operation ID, payload identity and first-submit timestamp must survive retry. Record exact missing assertions; do not infer coverage from filenames or broad test names. Include every rendered data-entry or decision surface, not only the 19 shared form definitions: identity enrollment/activation, append-only correction editors, Compliance overlap review and other specialized persisted workflows must either use the shared registry or have a narrow equivalent-contract exception with explicit guarantees. Verify the primary-action contract using the owner's clarified standard action meanings: Save and Submit both create records; Edit updates an existing record only where that feature permits it; Delete deletes a record only where that feature permits it. Explicit permitted edits include trips (and linked fare/toll/parking details), fare records, Maintenance records, Compliance records, and Fuel amount/price per kg. Adding a missing trip is record creation and must include its fare/toll/parking details. Fuel quantity remains derived and is recalculated after amount or price/kg changes. Driver, Vehicle and Loan retain their special lifecycle restrictions. Every accepted edit must refresh all affected downstream calculations and displayed figures immediately, while preserving correction/revision lineage. In-progress preservation and draft save/resume are separate working-copy operations and do not create business records. Continue until each row in the feature and cross-cutting inventory has an owner contract, source boundary, exact test assertion, runtime/surface and status. Reconcile historical audit documents against the current feature inventory. Audit generic repository deletion call sites and legacy deletedAt compatibility; map actor provenance for both record creation and updates (including the existing createdBy path and the absence of updatedBy) and permitted correction authority. Identify any owner contract still marked proposed/not ratified and do not claim its business policy is proven by implementation/tests. Record product-contract conflicts (including Fuel form field definitions) without silently choosing a business rule.

**B0b — Close test gaps and update evidence (next):** Add only the targeted tests that B0a proves are missing. Run their focused test suites, then update this contract's evidence matrix and the architecture gap register with exact test names/assertions, platform, result and remaining manual/device gates. If a gap requires production implementation (including the canonical portable backup format), record its dependency and implementation phase; do not mark it as test-proven. Do not begin fixture population while the entry-path/test inventory remains incomplete.

Do not repeat Track A tests that already prove the same assertions. Existing tests may be cited as evidence and will run naturally in required CI.

**B0 exit:** no supported entry path, owner-contract status, data-provenance/mutation concern or cross-cutting foundation concern remains unclassified; the one-vehicle/one-driver configuration contract is mapped to its real Admin setup, runtime resolution and dependent entry paths; multi-entity selectors/reassignment are removed from current workflows or explicitly tracked as production corrections; Save/Submit create-record semantics and feature-owned Edit/Delete permissions are documented and implemented consistently; the approved trip/fare/toll/parking, Maintenance, Compliance and Fuel edit paths are proven; accepted edits immediately refresh all affected downstream calculations without stale displayed outputs; shared form submission is proven crash-safe/idempotent across process death; every critical collection path has automated evidence through real form/action-to-command/validator-to-authoritative-commit or an explicit manual/device gate; every test gap identified in B0a has either been covered by a focused passing test or is explicitly documented with its implementation dependency and acceptance gate; unratified business rules and product-contract conflicts are explicitly surfaced to the owner and are not falsely marked proven; deletion/actor/correction boundaries are mapped; historical audit documents no longer misstate the current feature inventory; evidence documents are updated. The mandatory portability architecture decision is recorded as a production implementation gap until the canonical wire format and cross-platform tests are actually implemented. Only then may B1 begin.

#### B1. Populate the shared synthetic fixture

Use one deterministic fixture asset for both platforms, with schema-valid synthetic records and dependencies in valid creation order. Include registered participants with zero records so participant inventory and empty-owner semantics are tested, not inferred:

1. Exactly one active Vehicle and one active selected Driver configuration, with a single stable relationship for the Work workflow. No multi-vehicle/multi-driver assignment-history fixture is required.
2. Finance: loan schedule, payment ledger, prepayment schedule revision and settlement lineage/cutoff where the current schema supports them.
3. Compliance: validity records, renewals, overlap decision/head and correction history.
4. Maintenance: effective-dated rate history, fully allocated daily-kilometre source, immutable accrual and supported correction history.
5. Business Expenses: charges, reversals and correction-chain head.
6. Performance: only persisted `settings` and `pre_business_cost` records; calculation provenance must be asserted from the production calculation result, not persisted as a fabricated record kind.
7. Work/Driver Workflow and Log Book: stable ordered event IDs, committed state/revisions, pending intent, outbox entry/delivery state and linked Log Book history.

For every record, use current production schemas and validators. Add matching valid and invalid record/snapshot cases to a validator-parity matrix and compare browser/Android accept-or-reject outcomes plus stable error categories. Capture expected stable IDs, revisions, references, effective dates, correction heads and calculation inputs. Include Compliance renewal generations/early-overlap review supersession; Maintenance rate, allocated business/personal km, source revision and correction heads; Business Expense fuel and ordinary charges, references to the one configured Vehicle/Driver and trip-financial records, and reversal/correction chains; and Work intents/outbox in pending, acknowledged, retried and failed states linked to ordered Log Book events. Do not populate multi-vehicle reassignment or multi-driver assignment histories as current-scope fixture data. Classify Performance recovery/provenance data as durable or derived/transient from the actual owner contract; if derived, prove deterministic reconstruction rather than inventing persisted record kinds. Do not use the user's actual personal/vehicle/loan/compliance/financial data.

**B1 exit:** the shared fixture is populated; positive and negative records/snapshots pass the browser and Android production validators with matching semantic outcomes; zero-record participants are accounted for; no fixture-only schema or validator relaxation.

#### B2. Browser lifecycle and canonical package adapter

- Add the browser fixture loader/runner for the shared populated fixture.
- Load through the browser persistence/application boundary and production validators/backup participants.
- Implement the browser adapter to export/import the canonical platform-neutral versioned wire contract from Section 4B; retain current local Track A checkpoint/rollback/recovery guarantees.
- Capture pre-backup normalized source state and run the relevant production calculations, including source provenance.
- Execute browser canonical export → encrypted package creation → same-platform restore → close/reopen → startup recovery → re-export.
- Capture post-recovery state and recompute calculations; compare against the pre-backup expected semantic baseline.
- Run a compact **same-record golden journey** using records created by the rendered PWA entry-path acceptance (not direct fixture insertion): create representative Admin/Fuel/Work records, calculate dependent outputs, export through the production encrypted canonical adapter, restore into clean and pre-populated IndexedDB destinations, close/reopen, recover, re-export and compare the same record IDs, revisions, references, correction lineage and calculation provenance. The full synthetic fixture remains the exhaustive all-domain parity dataset; this golden journey specifically bridges real UI collection to backup/restore.

**B2 exit:** browser adapter reads/writes the canonical package contract; both the populated synthetic lifecycle and the UI-originated golden journey preserve business semantics and calculation results. Cross-platform acceptance remains pending B3.

#### B3. Android Room lifecycle and cross-platform portability

- Add the Room fixture loader/runner for the exact same fixture asset and IDs.
- Load through Room production participants and validators.
- Implement the Room adapter to export/import the same canonical package contract; preserve the existing Room production restore coordinator and Track A rollback/recovery guarantees.
- Capture pre-backup state and run the production calculations.
- Execute Android canonical export → encrypted package creation → same-platform restore → Room close/reopen → startup recovery → re-export.
- Restore a populated browser-exported encrypted package into Room, and restore a populated Android-exported encrypted package into browser IndexedDB. Test both clean and pre-populated destinations, plus fail-closed and rollback cases.
- Capture post-recovery state and recompute calculations.
- Verify Driver Workflow state remains shared between the PWA/native bridge and overlay service through the existing authoritative Room store.
- Run the matching compact **same-record Android golden journey**: create representative records through the actual Room-backed Capacitor WebView and native overlay entry boundaries, calculate dependent outputs, export using the production encrypted canonical adapter, restore into clean and pre-populated Room destinations, close/reopen, recover, re-export and compare the same IDs, revisions, relationships, event order, correction lineage and calculation provenance. Do not substitute raw `NativeBackupCoverage` record replacement for this encrypted production path.

**B3 exit:** Android lifecycle preserves business semantics and calculations; both the synthetic all-domain lifecycle and UI-originated golden journey pass; populated encrypted backup portability passes in both directions; no second Android workflow/business store is introduced.

#### B4. Cross-runtime semantic and calculation comparison

Compare browser and Room normalized results for (in addition to all fixture IDs and values):

- Participant inventory and ownership, including participants with zero records.
- Validator parity for matching valid/invalid feature records and whole snapshots, including stable error categories.
- Exactly one current Driver–Vehicle pairing for Work and other pair-dependent workflows, with consistent Vehicle identity across Vehicle-owned records. Compliance references the configured Vehicle only and is independent of Driver selection/assignment. Historical assignment compatibility is validated only when legacy records are present; reassignment scenarios are deferred.
- Record IDs, schema versions and revisions.
- Cross-feature references and referential integrity.
- Event IDs/order, pending intent identity/status and outbox identity/delivery state for pending, acknowledged, retried and failed cases.
- Log Book event linkage/order.
- Correction-chain heads and revision lineage.
- Fuel full-to-full interval checkpoint IDs, included source purchase IDs, quantity/spend, km/kg, effective interval cost/kg, cost/km and weighted rate history.
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


## 14. User-approved practical execution boundary (2026-11-20)

This section narrows the execution backlog for PR #99 without weakening the data-integrity and financial-correctness guarantees above. Where earlier candidate checklists imply exhaustive testing, this section is the approved prioritization for this PR.

### Mandatory closure

1. One populated, schema-valid synthetic fixture for Finance, Compliance, Maintenance, Business Expenses/Fuel, Performance, Work and Log Book. Use existing production schemas, validators and backup participants. Include representative supported corrections, reversals, effective-dated records and ordered Work/Log Book event lineage. Keep the configured single active Vehicle/Driver pair.
2. Run the same fixture independently through production Browser/Dexie and Android/Room export, restore, database reopen, startup recovery, calculation recomputation and re-export.
3. Compare normalized business semantics: IDs, revisions, references, event ordering, correction-chain heads, pending/outbox state, calculation outputs and source provenance.
4. Include focused negative restore and interrupted-restore recovery assertions sufficient to show invalid input fails closed and existing data is preserved or recoverable.
5. Android Device Readiness rendered acceptance must prove the actual WebView prompt and that optional settings do not block normal Driver workspace entry. The app must recheck status on resume; opening settings is not proof that a setting was granted.
6. Backup plaintext preflight must measure the actual serialized plaintext byte count and estimate package expansion before expensive encryption. The estimate must be tied to the existing encrypted-package ceiling and documented overhead; it must not be presented as a device-memory or performance benchmark.

### Explicitly deferred (not PR #99 merge blockers)

- Physical certification across Android OEMs/models/OS versions, including Xiaomi/Redmi, Samsung and Pixel. Keep this as a manual device acceptance gate.
- Full OS reboot acceptance where CI cannot deterministically exercise it; do not conflate it with process-death/startup-recovery tests.
- Exhaustive combinations of optional notification, overlay and battery-optimization settings. Optional settings must remain optional and non-blocking.
- Repeated tests of the same guarantee at multiple layers when one production-path test and existing lower-level tests establish it.
- Rare theoretical permutations without a credible impact on data loss, incorrect financial calculations, recovery safety or ordinary Driver operation.
- Real Dropbox account/cloud delivery acceptance where automated CI uses mocked OAuth and package transport.

### Scope control

Do not introduce new storage architecture, unrelated feature work, Performance redesign, fleet/multi-driver workflows or broad OEM-specific automation in this PR. If implementation exposes a concrete integrity or calculation defect, fix that exact boundary. Otherwise record the limitation and keep the agreed deferral.

The PR remains draft and unmerged until mandatory closure has passing evidence on the exact final head. Green CI is necessary but is not itself proof that the populated all-domain lifecycle has run.


## 15. Current completion record and four-stage closeout plan — 2026-11-21

This section records the current implementation position and the agreed remaining work. It does not replace normative domain contracts. Finance payment-allocation policy was explicitly ratified by the owner on 2026-11-22; the Stage 2 work below now verifies service and cross-runtime conformance to that approved policy.

### Completed work recorded at this checkpoint

- The calculation/provenance and entry-path audit is substantially complete for the scope described in the 2026-11-21 evidence-matrix addendum: Work/Shift distance allocation and 04:00 handling; Maintenance accrual eligibility and effective-rate snapshots; Business Start Date Compliance/complete-EMI allocation; Reduce Tenure-only prepayment; Performance source/revision provenance and cost boundaries; Fuel and expense calculation rules; and correction lineage.
- Rendered PWA entry and Android Room-backed WebView entry/readback coverage is recorded in the evidence matrix for the named Admin, Work, trip-financial, Fuel and expense paths.
- The latest exact-head CI checkpoint is green on `fee8389c56f7d96222301429fc3cbc0c7eb5691d`, workflow run [44936696946](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/44936696946): Architecture, PWA rendered acceptance, Android instrumentation, Cross-platform encrypted backup restore and Integrated regression passed. Production geocoder verification was skipped on this PR run and is not a required PR gate.
- Android-produced populated encrypted package → TypeScript production decrypt/Browser-Dexie restore has passing cross-platform CI evidence. The Room shared seven-domain lifecycle instrumentation also passes, but this is not evidence that a TypeScript-produced populated encrypted package has been restored through Android's production decrypt/Room restore path.

### Four-stage closeout plan

The stages below are the only planned closeout sequence for the currently identified gaps. Preserve completed work; add tests or production changes only at a demonstrated missing boundary.

#### Stage 1 — Persist Finance Admin actor attribution

**Status: COMPLETE — implementation, Browser/Android evidence and exact-head CI all passed on 2026-11-21.**


- Inspect the Finance payment, prepayment and settlement command/event paths and the active Admin-session source.
- Persist the authenticated Admin actor on each immutable Finance event in the same atomic write as the financial mutation; do not infer actor identity later from mutable profile state.
- Preserve actor attribution through retries, corrections, history projections and backup/restore.
- Add focused positive, missing-actor, correction/retry and persistence/restore assertions on the relevant Browser and Android paths.
- New payment, reversal, prepayment and settlement writes resolve the active actor through the Admin-session callback and fail closed with `finance_admin_actor_required` when the callback is absent, the actor is not an Admin, or the person ID is invalid. The application callback obtains the actor through `PersonIdentityService.currentActor()`, which validates the active Admin session and its PIN-verification lifetime.
- The actor is written as `createdBy: { personId, role: "admin" }` in the same atomic record-batch/CAS write as the Finance event. Replays return the original immutable event and original actor; they do not rewrite attribution.
- TypeScript and Android backup validators reject a non-Admin actor when attribution is present. Legacy historical Finance events with no `createdBy` remain readable; no historical actor is fabricated.
- **Passing evidence:** `tests/finance-loan-payment-service.test.ts` (missing/Driver actor rejection, actor persistence on payment/reversal/settlement, retry identity and settlement atomicity); `tests/finance-loan-prepayment-service.test.ts` (missing/Driver actor rejection and persisted revision attribution); `tests/loan-prepayment-records.test.ts` (reject Driver-authored history); rendered PWA `admin-form-browser-acceptance.mjs` + `assertFinanceAdminActorProvenance` (Dexie readback of payment, reversal, prepayment and settlement); Android `AdminEntryPathAuditCapacitorAcceptanceTest.calculationAndExpenseEntryPathsCommitThroughRoomBackedWebView` (Room readback of payment, prepayment and settlement); and `NativeFinancePaymentBackupTest.exportsRestoresAndRevalidatesLoanPaymentHistoryInRoomBackup` plus `rejectsDriverAuthorshipInFinancePaymentBackup` (Room backup/restore actor preservation and non-Admin rejection).
- **Exact-head CI:** [Sam Travels CI run 44936696946](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/44936696946) passed Architecture, full Web/PWA regression, Android instrumentation, Cross-platform encrypted backup restore and Integrated regression on `fee8389c56f7d96222301429fc3cbc0c7eb5691d`. Production geocoder verification was skipped and is not a required PR gate.
- **Exit evidence:** the stored Finance event itself identifies the correct Admin actor, and the same attribution survives readback and restore without duplicate financial events.

#### Stage 2 — Implement owner-approved Finance payment-allocation policy

**Status: COMPLETE — GREEN CI.**

**Owner decision: APPROVED AS WRITTEN — 2026-11-22.** The owner approved all six rules in `FINANCE_LOAN_PAYMENT_WORKFLOW_CONTRACT.md`: deterministic oldest-due-first proposal; user-reviewable/manual allocation within payment and installment bounds; partial EMI coverage; explicit unallocated credit with no automatic principal-prepayment or future-EMI conversion; separate explicit processing of unallocated credit; and immutable schedule-version/installment linkage.

- The Finance owner contract is normative and records the approval date.
- The owning `FinanceLoanPaymentService` enforces due-date eligibility, selected schedule version, positive integer-paise amounts, per-installment unpaid capacity, payment-total bounds, explicit unallocated credit, idempotency, full reversal and atomic ledger/loan revision commits. Manual allocation is permitted only within those service-validated limits.
- Regression coverage in `tests/finance-loan-payment-service.test.ts` includes oldest-due-first across multiple due EMIs, future EMI exclusion, manual allocation override, per-installment and total-payment bounds, partial payment/completion, excess-credit isolation, schedule-version effectiveness, reversal capacity restoration, duplicate/conflicting command replay, concurrent over-allocation prevention and atomic settlement interaction.
- Browser and Android use the same Finance application service semantics. Android Room Finance backup tests validate and round-trip payment/allocation ledger records; the complete Android instrumentation and Browser encrypted restore gates passed in the same required CI.
- **Exact-head CI:** [Sam Travels CI run 45005171430](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/45005171430) passed Architecture, Web/PWA, Android instrumentation, Cross-platform encrypted backup restore and Integrated regression on `8f91d1a8bf2e0219a544fa38e002fa74ba3c9774`. Production geocoder verification was skipped as an optional PR-only gate.
- **Exit evidence:** owner-approved normative policy, service-boundary invariants, focused regression coverage, Room backup/restore validation and green required CI. The separate approved Reduce Tenure prepayment and settlement contracts remain unchanged.

#### Stage 3 — Reverse encrypted restore and semantic parity

**Status: COMPLETE — GREEN CI.**

- Android instrumentation test `SharedSevenDomainBackupLifecycleTest.sharedSevenDomainFixtureSurvivesProductionRoomRestoreReopenAndReexport` consumes the TypeScript-produced populated v2 artifact generated by the Browser/Dexie production lifecycle test. It authenticates/decrypts the package with `NativeBackupRestoreCoordinator.restoreEncrypted`, restores into a pre-populated Room destination, verifies replacement of destination-only rows, and compares canonical participants and normalized records against the artifact's semantic oracle.
- The same test closes and reopens Room, runs `NativeStartupRecovery.ensure`, and verifies normalized record equality after re-export. The populated graph retains stable IDs/revisions/references, Finance payment allocation, Compliance overlap decisions, Maintenance and Fuel correction-chain heads, Work event ordering, pending/outbox state, and persisted calculation inputs/provenance.
- The reverse direction runs in the required Android emulator instrumentation gate. The existing `tests/android-produced-backup-restore.test.ts` continues to prove Android-produced populated encrypted package → TypeScript production Browser/Dexie restore, reopen and re-export.
- Exact baseline CI evidence: [run 45006087881](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/45006087881) passed Architecture, Web/PWA, Android emulator instrumentation (including the populated Room lifecycle test), Cross-platform encrypted backup restore and Integrated regression on `b2dac52a13d8d2ac8f28b46cdc6c334934a1f841`. Production geocoder verification was skipped as an optional PR-only gate.
- **Scope note:** the fixture still explicitly records that Finance prepayment/settlement transaction lineage is not part of this 29-record populated graph. Stage 3 proves parity for the declared populated graph; it does not claim that the fixture contains every Finance lifecycle event or certify physical OEM reboot / real Dropbox delivery.
- **Exit evidence:** both encrypted production directions pass on the shared populated semantic graph, including Room restore/reopen/startup recovery/re-export, with normalized parity and green required CI.

#### Stage 4 — Evidence closeout and exact-head CI

- Update the fixture status, this contract and the implementation evidence matrix only after the corresponding production-path evidence exists.
- Record exact test names, platform, assertions, commit SHA and CI run; distinguish automated evidence from deferred manual/device/external-account gates.
- Run focused suites for changed boundaries, then the complete required CI workflow on the final PR head; resolve failures without expanding scope.
- **Exit evidence:** all mandatory automated items in this closeout plan have direct evidence, the final exact-head CI is green, and no fixture or matrix status overstates what was exercised.

### Scope and workflow controls

- Keep PR #99 draft, open and unmerged unless the owner explicitly requests otherwise.
- Do not repeat already-passing Track A restore/recovery tests without a concrete integration failure.
- Do not expand into unrelated UI redesign, new feature architecture, fleet/multi-driver workflows or exhaustive OEM testing.
- Physical OEM certification, full OS reboot acceptance where not deterministic in CI, and real Dropbox account delivery remain explicitly deferred external/manual gates.
- A green CI run is necessary evidence for that commit; it does not by itself close a contract item whose required production lifecycle or business-policy approval has not been demonstrated.



### Stage 4 closeout — 2026-11-22

**Status: COMPLETE — GREEN CI on the exact evidence/documentation head.**

- Stage 1 (Finance Admin actor attribution), Stage 2 (owner-approved Finance payment-allocation policy), and Stage 3 (reverse encrypted restore and semantic parity) are complete with their focused evidence and exact-head CI checkpoints recorded above.
- Stage 4 is an evidence/CI closeout, not a new production implementation phase. No production code or fixture schema was changed for this closeout. The existing production-path evidence was reconciled into this contract, the implementation evidence matrix and the architecture gap register.
- The populated shared semantic lifecycle is exercised by Browser/Dexie production export and encrypted package generation, Android production decrypt/Room restore into a pre-populated destination, normalized semantic comparison, Room close/reopen, startup recovery and re-export. The reverse Android-produced encrypted package → Browser/Dexie production restore direction remains covered by `tests/android-produced-backup-restore.test.ts`.
- The restored-Room Performance acceptance now drives the actual Android WebView composition and rendered Performance screen from the restored Room repository. The exact CI job step is **“Verify Performance calculations and dashboard end to end through the rendered PWA”** on Web, with Android restored-Room acceptance included in Android instrumentation.
- **Exact-head CI:** commit `68fa1233a7d84df0ef77c35e95b1a353085750c5`; [Sam Travels CI run 45034254979](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/45034254979). Required jobs passed: Architecture, Web, Android, Cross-platform encrypted backup restore, and Integrated regression gate. Optional Production geocoder verification was skipped; it is not a required PR gate.
- The Stage 3/4 fixture limitation remains explicit: the 29-record populated graph contains the Finance loan/payment ledger but not Finance prepayment/settlement transaction lineage. Physical OEM certification, full OS reboot acceptance where not deterministic in CI, and real Dropbox account delivery remain external/manual gates.
- This stage completion does not assert that all PR #99 whole-contract requirements are complete. The remaining entry-path, owner-rule, cross-runtime, correction/provenance and gap-register items remain governed by §1A and the current evidence matrix. PR #99 remains draft, open and unmerged.

**Stage 4 exit evidence:** evidence ledgers reconciled; exact commit and run recorded; all required CI jobs green; optional skip and remaining fixture/manual limitations disclosed.


**Stage 4 CI reconciliation (supersedes the provisional status above):** The evidence/documentation commits were created after run 45034254979. That run is green on source head `68fa1233a7d84df0ef77c35e95b1a353085750c5`, but the current PR head is `f2efeb74ff8a383d3d572d7acae3b668c51c8336`. Because the contract requires CI after the final evidence/documentation changes, Stage 4 is **IMPLEMENTATION/EVIDENCE RECONCILIATION COMPLETE — EXACT-HEAD CI PENDING**, not complete. Do not use run 45034254979 as final-head validation. The workflow supports manual dispatch; the available GitHub connection in this session exposes no workflow-dispatch action, so a run on the current head could not be started here.


## 16. Stage 5 acceptance and Stage 6 whole-contract audit — 2026-11-25

### Stage 5 scoped acceptance

Stage 5 is **ACCEPTED** on exact PR head ae59d7a77e079f31c9e14048c6dffbd0efb680ff. Required CI [Sam Travels CI run #45514874954](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/45514874954) completed successfully on that exact SHA. Architecture, Web, Android, Cross-platform encrypted backup restore and Integrated regression gate passed; optional Production geocoder verification was skipped. The requirement-level Browser/Dexie and Android/Room assertions are mapped in docs/PR_99_IMPLEMENTATION_EVIDENCE_MATRIX.md §9.51. This is not whole-contract acceptance under §1A.

### Stage 6 initial §1A audit

Stage 6 is **ACTIVE — NOT ACCEPTED**. The populated 46-record production lifecycle, cross-runtime restore directions, same-record UI-originated golden journeys, Stage 4 integrated calculation/provenance assertions and Stage 5 negative/boundary/interruption evidence are scoped proof, not a waiver of remaining entry-path and owner-contract requirements.

The current evidence audit identifies unresolved critical implementation/test work:
- Fuel amount/price correction UI and immediate downstream recalculation/provenance on Browser and Android.
- Trip/fare correction and missing-trip insertion with linked fare/toll/parking lineage, while preserving immutable Work/GPS/odometer events.
- Maintenance correction propagation into actual-expense and applicable downstream read models; visit correction is not proven in the audited path.
- Compliance correction/renewal readback and immediate consumer refresh across supported surfaces.
- Complete one-Vehicle/one-Driver operating-context binding for dependent Fuel, Maintenance, Finance, Business Expenses and Performance commands, plus stale-revision/no-write parity.
- Historical deletion/legacy deletedAt audit, update-actor provenance where required, and complete domain correction-authority mapping.
- Remaining rendered device-readiness, event-specific GPS and form conformance/accessibility assertions required by the referenced owner contracts.

External/manual gates remain physical OEM/device certification and owner usability/visual approval; full OS reboot persistence where deterministic emulator proof is unavailable; and live Dropbox account authentication/upload/download/scheduled-backup/restore. Repository branch-protection/ruleset enforcement is a separate repository-administration check. None is counted as a CI pass.

The evidence matrix §9.52 contains the initial eight-condition assessment, the explicit remaining-gap list and external-gate classification. No scoped deferral is treated as owner-accepted unless the owner explicitly accepts it. Stage 6 and whole-contract status remain **INCOMPLETE** until all applicable critical requirements are proven or explicitly owner-accepted, the four project records agree, required CI passes on the exact final PR head, and PR metadata is verified. PR #99 remains open, draft and unmerged.


## 17. Stage 6 focused implementation checkpoint — Fuel correction — 2026-11-25

Stages 1–5 remain accepted. Stage 6 remains active and is the only stage being worked. The first focused slice adds a rendered, append-only correction path for immutable Fuel purchases: the driver/admin can correct amount paid or price/kg with a reason; the original source remains unchanged; correction history exposes timestamp, field, before/after values, actor role and reason; and the Fuel panel refreshes corrected source, interval/rate history and daily expense readback.

The application service accepts the original target revision and correction-chain revision from the UI so retry after an ambiguous commit reuses the same command intent. Browser presentation/service tests and an Android WebView + Room instrumentation acceptance test have been authored. See implementation evidence matrix §9.53 for exact files and test names.

**Disposition: IMPLEMENTATION ADDED — NOT YET ACCEPTED.** Test source is not passing evidence. Acceptance requires all five required CI jobs to pass on the final exact PR head, including Web and Android execution of the new tests. No other Stage 6 requirement is closed by this slice.


## §1A current acceptance reconciliation — 2026-11-26

This status addendum is authoritative for the current PR #99 checkpoint and supersedes earlier provisional Stage 6 status statements only where later named evidence is mapped in `docs/PR_99_IMPLEMENTATION_EVIDENCE_MATRIX.md` §§9.49–9.54. Stages 1–5 remain accepted; Stage 6 is the final whole-contract reconciliation stage.

| §1A condition | Current result | Evidence / remaining acceptance |
|---|---|---|
| 1. Every supported entry path is audited at the real UI/action-to-command boundary | **IMPLEMENTATION AND FOCUSED UI EVIDENCE ADDED** | Rendered Browser and Room-backed WebView coverage now includes Admin, Fuel correction, Work/Trip/Fare/Toll/Parking/Cancellation, trip financial correction, Maintenance expense/visit correction, Compliance correction/renewal and Device Readiness. Named tests are mapped in evidence matrix §9.54. Verify no supported specialized entry path remains unmapped before final acceptance. |
| 2. Browser/Dexie and Android/Room independently enforce authority, validation, calculations, correction, revisions and recovery | **SCOPED CORE PROVEN; FINAL INTEGRATION CI PENDING** | Stage 3/4/5 production lifecycle, parity and recovery evidence remains accepted. Stage 6 correction/context tests add Browser and Room boundaries. Final integrated exact-head CI remains required. |
| 3. Populated production cross-runtime semantic, calculation and provenance parity | **ACCEPTED FOR THE DECLARED POPULATED GRAPH AND STAGE 4 CALCULATION SCOPE** | Shared populated fixture, both encrypted restore directions, Room reopen/recovery/re-export and same-record calculation/provenance evidence are recorded in Stages 3–5 and matrix §§9.48–9.51. This does not substitute for the new focused correction UI tests. |
| 4. Every critical gap is closed or explicitly owner-accepted | **IMPLEMENTATION GAPS CLOSED; OWNER POLICY RATIFICATION MUST BE EXPLICIT WHERE REQUIRED** | Fuel, Maintenance, Compliance, operating-context, historical deletion/provenance, device/GPS/form and focused trip financial correction tests are mapped in §9.54. The normative Driver Workflow contract still requires the trip-financial post-submission correction UX/schema to be explicitly defined/approved; do not infer owner ratification from code or CI. Any such approval/deferral must be recorded before this condition passes. |
| 5. Applicable negative, boundary, interruption and recovery proof | **ACCEPTED — STAGE 5** | Exact-head Stage 5 acceptance and Browser/Dexie + Android/Room negative/recovery map remain recorded in matrix §9.51. Reopen only for a concrete regression or uncovered normative clause. |
| 6. Evidence matrix, gap register, contract closeout, execution plan and PR description agree | **DOCUMENTS RECONCILED; PR DESCRIPTION UPDATE AND FINAL REVIEW PENDING** | This addendum, execution-plan checkpoint, matrix §9.54 and architecture-gap-register §9.53 supersede stale Stage 6 open lists. Update the PR body to match these records, then verify consistency on the resulting head. |
| 7. Required CI is green on the exact final PR head | **PENDING** | All code and documentation changes require a fresh complete run on the final SHA. Required jobs: Architecture, Web, Android, Cross-platform encrypted backup restore and Integrated regression gate. Optional Production geocoder verification is not a required PR gate. |
| 8. PR metadata is open, draft and unmerged | **VERIFIED** | PR #99 remains open, draft and unmerged. No merge or close is authorized. No new PR is to be opened. |

### Stage 6 final acceptance rule

Whole-contract completion is not claimed by this checkpoint. It requires: (a) explicit owner disposition for the feature-specific Trip Financial correction policy required by the Driver Workflow contract; (b) confirmation that every applicable entry path is mapped to its named Browser and Android evidence; (c) all four project records and the PR description agree; (d) all five required CI jobs pass on the exact final PR head; and (e) PR #99 remains open/draft/unmerged unless the owner separately authorizes a merge.

Physical OEM/device certification, non-deterministic full OS reboot persistence, live Dropbox account authentication/upload/download/scheduled-backup/restore, final owner visual/usability approval, and repository branch-protection/ruleset verification remain separate manual or administrative gates. They are not CI passes.
