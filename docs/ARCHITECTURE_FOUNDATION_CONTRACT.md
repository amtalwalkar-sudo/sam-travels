# Architecture Foundation Contract

Status: approved foundation rules; implementation coverage is tracked below.
Scope: the single-driver Sam Travels application. This contract consolidates the existing architecture, data, persistence, transaction, Android, feature, backup, and security contracts. It supplements those documents; it does not replace their detailed policies.

## 1. Data ownership and transaction boundaries

- Browser-only PWA: IndexedDB (Dexie adapter) is the sole authoritative local business store.
- Installed Android: Room is the sole authoritative local business store for every business capability, workflow projection, event journal, pending operation, and recovery record.
- Android WebView and native overlay are clients of the same Room-backed application/repository boundary. IndexedDB must not become a competing writable Android business store.
- Domain and application code depend on typed repository/port contracts, never concrete Room, Dexie, Capacitor, Android, React, or Dropbox SDK implementations.
- A capability owns its entities, invariants, use cases, validation, repository ports, adapters, migrations, and tests. Cross-capability access uses versioned public contracts.
- A business operation is durable only after the authoritative repository confirms its commit. Acknowledging a gesture or accepting a request is not proof of durable completion.
- Multi-record business transitions commit their event, state projection/revision, terminal status, and same-store outbox entries atomically wherever they share the authoritative database.
- External effects occur after commit and are represented by durable, idempotent outbox work when they must survive interruption. Do not claim Room and IndexedDB form one atomic store; do not use best-effort dual writes or last-write-wins.

Detailed ownership and transaction rules remain in [ARCHITECTURE.md](../ARCHITECTURE.md), [DATA_CONTRACT.md](../DATA_CONTRACT.md), [LOCAL_PERSISTENCE_CONTRACT.md](LOCAL_PERSISTENCE_CONTRACT.md), and [TRANSACTION_AND_RECOVERY_CONTRACT.md](TRANSACTION_AND_RECOVERY_CONTRACT.md).

## 2. Versioning and compatibility

Version every durable boundary that may outlive the current process or app release: persisted record envelopes, database schemas, domain events/commands, native bridge payloads, backup manifests/packages, and public capability contracts.

- Validate data at ingress and before persistence/restore.
- Migrations are explicit, additive where practical, repeatable-safe, and tested from every supported prior schema.
- Preserve stable IDs, event identity, timestamps, revisions, and idempotency keys across retries and migrations.
- Unknown or unsupported versions fail closed with source data preserved. Never silently reinterpret, truncate, or discard unknown data.
- Breaking changes require a migration plan, supported-version policy, compatibility fixtures, and tests before the new writer is enabled.
- Keep both supported backup formats readable: `backup-encryption-v1` and `backup-encryption-v2`. A future format gets a new identifier; it does not redefine either existing format.
- Financial values use integer minor units and an explicit currency. Historical corrections are auditable corrections/reversals, not silent mutation.

Detailed compatibility rules remain in [SECURITY_AND_COMPATIBILITY_CONTRACT.md](SECURITY_AND_COMPATIBILITY_CONTRACT.md), [ROOM_MIGRATION_RUNBOOK.md](ROOM_MIGRATION_RUNBOOK.md), and [DROPBOX_BACKUP_CONTRACT.md](DROPBOX_BACKUP_CONTRACT.md).

## 3. Recovery and reconciliation

Recovery is a cross-cutting application capability with subsystem-specific handlers. It must be durable where required, ordered, idempotent, non-destructive, safe to retry, and observable.

- Reconstruct operational state from authoritative persisted state, not UI memory, service lifetime, or notifications.
- Recover pending commands using their original IDs, timestamps, schema versions, and idempotency keys.
- Treat delivery as at-least-once; deduplicate at the receiver's durable transaction boundary. Do not promise exactly-once transport.
- Reconcile outbox/inbox work without duplicating business effects.
- A failed/unknown transaction must not be reported as completed. Preserve the last known-good data or a recovery checkpoint and expose an actionable state.
- A failed migration or restore must preserve source data and provide a recovery/rollback path.
- Retry only while the original operation remains valid under its own timeout, evidence, permission, and business-state rules. Never fabricate missing GPS evidence or backdate a later fix.
- Recovery handlers must not silently reset business data or application preferences.

Detailed crash windows and failure-injection requirements remain in [TRANSACTION_AND_RECOVERY_CONTRACT.md](TRANSACTION_AND_RECOVERY_CONTRACT.md) and [DROPBOX_BACKUP_CONTRACT.md](DROPBOX_BACKUP_CONTRACT.md).

## 4. Required state-machine ownership

Every stateful business workflow has one domain-owned transition policy. UI components request transitions and render durable projections; they do not implement their own lifecycle rules. Each machine specifies states, permitted transitions, preconditions, rejected transitions, durable commit point, retry/expiry rules, recovery behavior, and user-visible outcomes.

The approved state-machine scope is:

| Workflow | Current implementation position | Required rule |
|---|---|---|
| Shifts | Implemented as part of the shared driver workflow | Keep one transition policy shared by PWA and Android overlay; retain existing shift start/end invariants and tests. |
| Trips | Implemented as part of the shared driver workflow and trip-history projection | Keep start/end/cancel rules in the domain workflow; Timeline is a projection, not a second source of truth. |
| Payments and settlements | Finance capability is not yet implemented | Define the complete lifecycle and reversal/settlement semantics in the Finance feature design before implementing screens or persistence. Do not invent statuses or accounting rules in this foundation change. |
| Loan repayment entries | Finance capability is not yet implemented | Define schedule, due/paid/partial/overpayment/correction semantics and their permitted transitions with the Finance design before implementation. Preserve historical entries and use auditable corrections. Do not invent product/accounting rules here. |
| Backup and restore | Encrypted backup, compatibility, checkpoint, restore, rollback, and verification flows are implemented in the automated engineering slice | Model creation/export/upload and restore as explicit lifecycles. Restore requires validation, confirmation, checkpoint-before-replacement, verification, and rollback until accepted. Keep V1 and V2 compatibility. |
| Pending native actions | Implemented for driver transition intents | Preserve explicit received/pending-persistence/pending-location/recorded/needs-attention/rejected distinctions; reconstruct from Room and reconcile idempotently. Never confuse gesture receipt with durable queueing or completion. |

For each future Finance machine, its feature contract must be approved before the first implementation. A minimum state-machine specification includes:
1. Named states and terminal states.
2. A transition table with actor/command, prior state, preconditions, resulting state, and emitted event.
3. Validation and conflict policy.
4. Atomic persistence and revision/idempotency rules.
5. Retry, interruption, correction/reversal, and recovery behavior.
6. Domain tests for every allowed and rejected transition, including duplicate and concurrent commands.
7. Migration and historical-data compatibility tests.

The two driver surfaces must never introduce separate shift or trip state machines. Backup/restore and native pending-action state machines remain distinct from business-finance state machines.

The approved product semantics for the driver workflow—including distinct trip-creation and Start ride events, odometer rules, trip financial finalization, operational dates, and native overlay parity—are defined in [DRIVER_WORKFLOW_CONTRACT.md](DRIVER_WORKFLOW_CONTRACT.md). This detailed contract does not replace the transaction, persistence, Android, or GPS/time guarantees above.

## 5. Android and platform capability boundaries

- Domain and application rules remain platform-neutral.
- Android-only behavior is implemented behind narrow, versioned platform ports/adapters.
- Check runtime permission and platform capability at the boundary; permission denial/revocation and OS deferral are expected recoverable outcomes.
- Distinguish requested, accepted, running, completed, pending, restricted, failed, and needs-attention outcomes where applicable. Never promise background execution that Android/OEM policy cannot guarantee.
- Keep GPS event-scoped to the approved driver lifecycle actions. No continuous tracking, periodic polling, or background location collection between actions.
- Keep Room, GPS, and network I/O off the Android main thread. Offline local workflows must not depend on internet.
- The platform adapter reports capability and execution outcomes; domain/application policy decides the business result.

Detailed platform rules remain in [ANDROID_NATIVE_CONTRACT.md](ANDROID_NATIVE_CONTRACT.md) and [LOCATION_AND_STATE_TIMING_CONTRACT.md](LOCATION_AND_STATE_TIMING_CONTRACT.md).

## 6. Architecture enforcement and CI merge gates

Architecture rules must be executable, deterministic, and part of pull-request CI. Documentation-only rules are not considered enforced.

The dedicated `architecture` CI job must check:
- Source-size/readability limits.
- Dependency direction and public capability entry-point boundaries.
- Domain/core/application isolation from UI, persistence, and platform SDKs.
- UI isolation from direct storage access and platform plugins.
- No duplicate authoritative business stores or bypass of repository/network-gateway contracts where statically detectable.
- The required `web` job runs the domain transition, compatibility, recovery, and browser unit tests.
- The required `android` job runs Room migration, backup/recovery, and Android instrumentation suites.

Required pull-request checks for `main` are:
- `architecture`
- `web`
- `android`

Repository branch protection/rulesets must require all three checks and must not allow bypass through an ordinary merge. The CI workflow can publish these check names, but repository administrators must configure the GitHub ruleset/branch protection. Verify that configuration separately; a green workflow alone does not prove a merge gate is enforced.

Exceptions require a reviewed, documented reason, an owner, and an expiry/removal condition. Do not add broad suppressions or silently weaken a rule to make CI green.

## 7. Feature registration, lifecycle, and dependency contracts

Every persistent feature must be registered before its persistence or user-facing feature is enabled. There are no exceptions for persistent business data. The registry is the authoritative catalogue of feature capabilities and their durable-data obligations; it is not a second business-data store.

Each registration must declare:
- Stable feature ID and contract version.
- Owning domain/application public entry point and repository boundary.
- Persisted entity/schema identifiers and current schema version.
- Ordered migration path from every supported prior version, including validation and rollback/failure behavior.
- Required and optional feature dependencies, with dependency version/range and declared integration contract.
- Backup participation, including all business records, required references, attachment ownership, serialization/version metadata, and restore validation.
- Restore participation, including compatibility checks, relationship/invariant validation, and recovery behavior.
- Feature lifecycle policy and tests for registration, migration, dependency resolution, backup, restore, and failure paths.

Registration must be deterministic and validated at startup/build time as appropriate. Duplicate IDs, missing required dependencies, incompatible contract versions, missing migrations, or missing backup/restore declarations fail closed. A feature must not become available for writes until its registration and required migrations have succeeded. Registry metadata must not be used to bypass feature-owned repositories or invariants.

### Feature lifecycle and deletion

- Enabled, disabled, and hidden are presentation/availability states; changing among them never deletes, truncates, archives over, or rewrites feature records.
- Disabling a feature must leave its data readable to backup, restore, migration, and recovery services.
- Permanent deletion is a separate explicit destructive operation, not an effect of unregistering a feature or removing its UI.
- Before deletion, resolve and display dependent features and records, reject deletion while required dependents remain, and require explicit confirmation of the exact deletion scope.
- Deletion must run through the owning feature's domain/application operation, preserve audit/recovery safeguards, and have tests for dependency rejection, interruption, and recoverability.
- Feature replacement/removal requires a versioned migration/export plan for retained data. Uninstalling code or hiding navigation is never a data-retention policy.

## 8. Complete business backup and restore participation

A normal business backup includes every registered persistent business feature and its required dependencies. Users must not be offered a way to accidentally omit a feature or relationship required to interpret or use the remaining business data.

- The backup coordinator discovers participants from the validated feature registry; avoid a second manually maintained table allowlist that can drift.
- Every registered participant contributes a versioned snapshot/export contract, required references, attachment inventory, and restore validator.
- Snapshot creation uses the authoritative database's consistent snapshot/transaction boundary. Room is authoritative on installed Android; IndexedDB is authoritative in browser-only PWA operation.
- The package manifest records participant IDs, contract/schema versions, migration compatibility, record counts, relationship/reference metadata, and checksums.
- Optional non-business material may be excluded only when it is explicitly classified as non-business and is not required to interpret or restore included records. Diagnostics, credentials, ephemeral caches, and secrets remain excluded.
- Restore validates the package and every participant/dependency before replacing data, creates the internal recovery checkpoint, requires explicit user confirmation, stages and validates the complete dataset, and commits or rolls back as one recoverable operation.
- Unknown required participants, unsupported versions, missing dependencies, missing attachments, or failed invariants fail closed before replacement. Preserve source package and checkpoint.
- Preserve existing backup-encryption-v1 and backup-encryption-v2 readers. Feature registration does not justify changing either encryption format.
- Tests must prove that adding a registered persistent feature includes it in normal backup and restore without editing a separate allowlist; missing/invalid registration must block backup/restore rather than silently omit records.

This contract defines required behavior. It does not claim that the current backup implementation already discovers participants from a registry. The implementation audit must verify whether current snapshot serialization uses a whole-database snapshot or explicit table/record allowlists, and must document any attachment/reference limitations before claiming automatic completeness.

## 9. Calculation ownership and feature integration contracts

Every business calculation has one owning domain/application capability and an explicit, versioned calculation contract. Presentation, forms, reports, and other features call that contract; they do not reimplement formulas.

A calculation contract records:
- Stable calculation ID, owner, contract/rule version, and effective-date policy.
- Formula and units, rounding/precision policy, currency treatment where applicable.
- Required and optional inputs, source feature/field, identity and time period semantics.
- Inclusion and exclusion rules, null/missing-data behavior, and validation.
- Output shape and meaning, including whether values are actual, estimated, scheduled, or derived.
- Historical-result policy and an explicit migration/recalculation policy when rules change.
- Golden examples, boundary cases, and regression tests.

New feature data may affect an existing calculation only through an explicitly approved, versioned integration contract. That contract names the source feature, consumed fields/events, mapping and timing rules, treatment of missing/disabled data, effective date, and expected effect on outputs. A new feature must not silently change existing calculations or historical results. Existing calculation behavior remains unchanged until the integration and its tests are approved.

- Cross-feature reads use public application queries/contracts or published domain events, never another feature's private tables or persistence adapters.
- The source feature owns validation and meaning of its data; the calculation owner owns the formula and decides whether/how to consume it.
- Keep actual transactions distinct from planned schedules, estimates, and calculated expectations.
- Calculation changes require before/after regression fixtures and explicit review of affected consumers.
- Where historical outputs are stored, identify the rule version and inputs needed to explain/reproduce them; never silently overwrite history.
- CI must check calculation contract coverage and run the associated regression suite. Static architecture checks must reject direct cross-feature persistence access where detectable.

The first implementation task is an inventory of existing calculations and their actual inputs/consumers, followed by an audit of backup snapshot and restore code. Do not invent formulas or infer that an existing metric consumes a new feature merely because the concepts are related.

## 9.1 Mandatory cross-feature time-integrity and value-state semantics

These are mandatory shared-foundation requirements for every capability that records, reads, allocates, aggregates, schedules, or presents timestamps, durations, counts, distances, money, or other measured/derived values. They apply to Work/Shift, Log Book/Trips, Finance, Vehicle, Performance, Admin, Timeline, and future capabilities. A feature contract may add stricter domain-specific rules but must not weaken these guarantees.

### Time integrity
- Persist event occurrence times as immutable, unambiguous UTC instants. Preserve the applicable IANA business-timezone context and business date separately; Sam Travels uses Asia/Kolkata for its current business-date and display rules.
- Keep the time an event occurred distinct from the time it was received, persisted, synchronized, recovered, or enriched. Delayed delivery and recovery must never rewrite the original occurrence instant or disguise a later observation as contemporaneous evidence.
- Keep event sequence/order and stable identity separate from wall-clock timestamps. A clock correction must not reorder or rewrite immutable historical event instants.
- Derive elapsed durations from authoritative persisted interval endpoints/current instants, not periodically incremented UI counters or formatted display strings. Monotonic elapsed-time anchors may corroborate duration within a boot session; they are not an absolute clock across reboot.
- Where available, retain boot-session/monotonic anchors and clock-integrity diagnostics to detect wall-clock discontinuities. If offline clock changes or missing anchors make exact elapsed time unknowable, expose an explicit uncertain/needs-review result; never fabricate precision or silently correct history.
- Network time may corroborate a clock but is never a dependency for offline business operations. Timezone/display changes must not mutate stored UTC instants or historical business dates.
- Use the detailed GPS/fix-age, event-time, reboot and clock-anomaly requirements in [Location and State Timing](LOCATION_AND_STATE_TIMING_CONTRACT.md) for driver events. These shared rules also apply to non-GPS timestamps and intervals in every other capability.

### Zero, unavailable, pending and invalid values
- A value of zero is a valid known value and must remain distinct from missing, unavailable, unknown, pending/incomplete, invalid/needs-attention, and not-applicable states.
- A missing/null/undefined/invalid source value must never be coerced to numeric zero, an empty string, false, or a successful/complete result merely to simplify rendering or aggregation.
- A zero may be reported only when it is explicitly recorded as zero, or when the authoritative source scope is complete and the metric's approved calculation contract defines an empty qualifying set as zero (for example, a completed query with no matching ride records yields a ride count of zero).
- If required inputs are missing, invalid, or still pending, the result must carry that state. Do not present a partial aggregate as a final total; a partial value is permitted only when it is explicitly labelled partial and its excluded/pending scope is clear.
- Not-applicable is a domain decision, not a synonym for zero or missing. Each feature/calculation contract defines which inputs are required, optional, or legitimately absent and how each state affects its output.
- User-facing presentation must preserve the value and its status together. The same underlying facts must produce the same zero/unavailable/pending meaning on PWA and Android.

### Presentation non-interference
- Changes to visibility, ordering, labels, formatting, grouping, filters, layout, or other presentation configuration must not mutate authoritative business records, timestamps, financial ownership, calculation rules, historical results, or source data.
- Presentation may select or format a projection; it must not convert an unavailable value into zero, recompute a business formula independently, or persist a presentation choice as a business fact.
- Hiding/removing a displayed metric or feature does not delete its source records or disable calculations required by other consumers.

### Required verification
- Test zero, missing, invalid, pending, not-applicable, and complete-empty cases independently for every shared calculation/value contract.
- Test event occurrence time separately from received/persisted/recovered time, including delayed delivery, restart, clock rollback/forward, timezone/display changes, and offline reboot uncertainty.
- Test that equal-time events remain deterministically ordered without mutating timestamps, and that PWA/Android adapters return equivalent values and statuses.
- Test that presentation-only changes leave source-record snapshots, revisions, ownership, calculation outputs, and historical results unchanged.

## 10. Local diagnostics and support export

Diagnostics are local-first and are not business records.

- Capture structured diagnostic events with event ID, correlation/operation ID, timestamp, subsystem, operation, outcome, failure category, retry/recovery result, and app/schema version where available.
- Record only allowlisted, non-sensitive context. Redact tokens, credentials, passphrases, recovery keys, authorization codes, raw request headers, and sensitive personal/financial data before persistence.
- Do not include precise GPS coordinates or full business-record payloads in ordinary diagnostics.
- Keep diagnostics separate from business tables and exclude them from phone/Dropbox business backups and restore.
- Apply a bounded local retention/size policy. Diagnostics must never exhaust storage or block a business operation.
- Export is an explicit user action. Preview what will be included where practical, sanitize the export, and let the user decide where to share it.
- No automatic diagnostic upload, telemetry transmission, or background support-data transfer is permitted by this contract.
- Diagnostic failure must never fail or roll back a business operation. Diagnostics are best-effort supporting evidence, not the source of truth.

The repository currently has privacy/redaction principles but no complete structured diagnostic recorder/export path. Implement this as a small, separately testable capability when it can be wired to real workflow/recovery boundaries; do not add an unused logging framework or automatic telemetry merely to satisfy the contract.

## 11. Runtime architecture completion gates

The following six gates are the remaining integrated proof obligations for the shared Architecture Foundation. They consolidate the requirements already defined in Sections 1–10 and the owning contracts linked above; they do not replace those contracts or establish a second source of architectural policy.

**Current status: all six gates are `Documented — implementation/evidence audit pending`.** Existing implementation slices and tests may satisfy parts of a gate, but no gate is complete until the exact remaining scope is audited and its evidence is recorded against the tested commit/build. Do not infer full completion from the existence of a contract, checker, test name, or earlier green CI run.

| Gate | Required implementation and verification evidence | Current status |
|---|---|---|
| **1. Cross-language ownership enforcement (TypeScript and Kotlin)** | Extend the architecture gate beyond TypeScript import checks to inspect all tracked TypeScript/JavaScript and Kotlin/Java source boundaries. Enforce dependency direction, feature public-entry-point ownership, repository/DAO access boundaries, domain/application isolation from UI and platform SDKs, no direct cross-feature private persistence access, no duplicate authoritative stores, and no dependency cycles. Resolve TypeScript path aliases and relative imports; inspect Kotlin package/import and Gradle module/dependency edges so package renames, aliases, generated paths or direct Gradle dependencies cannot trivially bypass checks. Add negative fixtures proving prohibited imports, dependencies and storage access fail, and positive fixtures proving approved public contracts pass. Where static analysis cannot establish runtime behavior, require corresponding runtime contract tests. The required `architecture` CI job must run these checks on every relevant change. | **Documented — implementation/evidence audit pending.** Existing checker coverage includes selected TypeScript boundaries and source-size checks; complete Kotlin/Android boundary enforcement is not yet evidenced by this contract. |
| **2. Complete persistent-feature backup and restore proof** | Inventory every persistent feature/entity, its authoritative store, references, attachments, schema/contract version and migration path. Validate that each feature registers a versioned snapshot/export participant and restore validator, and that the shared coordinator discovers participants from the validated registry rather than a separately maintained allowlist. Test that adding a registered persistent feature automatically includes all required data and relationships in backup and restore; missing/duplicate/unsupported registration, schema, dependency, reference or attachment must fail closed before replacement. Verify consistent snapshot boundaries, manifest counts/checksums, both supported encrypted formats, checkpoint-before-restore, confirmation, staged validation, interrupted restore, rollback and preservation of the previous known-good data. Produce a feature-by-feature coverage matrix linking each persistent feature to its tests and evidence. | **Documented — implementation/evidence audit pending.** Existing backup encryption/interoperability and restore-safety tests cover important slices; they do not alone prove automatic completeness for every persistent feature. |
| **3. Real recovery under interruption and duplicate delivery** | Exercise actual authoritative repository/transaction paths with failure injection before and after durable intent, business commit, projection/revision update, outbox enqueue, receiver commit, migration and restore boundaries. Cover app closure, WebView recreation, process death, device restart/reboot, offline periods, delayed/replayed events, duplicate commands/messages, lost acknowledgements, stale revisions and retry. Verify stable IDs/idempotency keys, at-least-once delivery with exactly-once business effects at durable receiver boundaries, deterministic reconstruction, no duplicate business effects, no partial commits, no loss or mutation of source records, and honest pending/needs-attention states. Test both Room and IndexedDB authoritative adapters; preserve platform-specific limitations. | **Documented — implementation/evidence audit pending.** Existing driver workflow and backup tests provide a foundation; integrated failure-window coverage across all registered persistent capabilities is not yet demonstrated here. |
| **4. Equivalent PWA and Android business results** | Feed identical versioned deterministic business fixtures and operation sequences through browser-only PWA/IndexedDB and installed Android/Room application boundaries. Compare normalized authoritative records and business outcomes: transition acceptance/rejection, event identity and order, revisions, time/date semantics, calculations, financial values, pending/complete/error states, migration behavior and restore results. Presentation may differ, but business meaning and calculation outputs must match. Prove Android WebView and native overlay use the same Room-backed application contract and cannot create a competing writable IndexedDB business store. Run these parity suites in required CI; record OS/device lifecycle checks separately. | **Documented — implementation/evidence audit pending.** Shared contracts require parity; a complete cross-platform business-result comparison report is not yet recorded here. |
| **5. Diagnostics connected to real failure and recovery boundaries** | Implement the bounded, privacy-safe local diagnostics capability specified in Section 10 and connect it to actual operation/recovery points: durable enqueue/commit outcomes, validation rejection, migration, outbox/inbox delivery, duplicate suppression, startup/resume reconciliation, backup snapshot/validation/upload/restore/checkpoint/rollback and recovery-handler outcomes. Use stable correlation/operation IDs and structured outcome/failure/retry fields. Prove diagnostic events correspond to the actual durable outcome rather than UI intent; redact secrets, credentials, precise coordinates and full business payloads; enforce bounded retention; exclude diagnostics from business backup; and prove diagnostics failure cannot block or roll back business work. Include tests for redaction, retention limits, dropped/failed diagnostic writes and correlation across retry/recovery. No automatic telemetry or diagnostic upload is authorized by this requirement. | **Documented — implementation/evidence audit pending.** The contract explicitly records that a complete structured recorder/export path is not yet present; an unused logging framework does not satisfy this gate. |
| **6. Integrated regression against the completed runtime foundation** | Run the full mandatory suite together on the same candidate revision: cross-language architecture enforcement; feature registry and dependency validation; authoritative Room/IndexedDB persistence; schema and contract migrations; transaction/idempotency/recovery failure injection; backup participant completeness and both backup-format compatibility; restore validation/checkpoint/rollback; cross-platform business-result parity; time/value-state integrity; offline/network-policy behavior; diagnostics redaction/retention/non-interference; feature and calculation regression; and production PWA plus Android build/unit/instrumentation tests. Verify that all required CI jobs are green for the exact commit and required GitHub branch protection/rulesets enforce them. Retain machine-readable reports, test fixtures and links to CI jobs. Track physical-device and real Dropbox account acceptance separately; emulator/CI evidence must not be represented as physical-device or live-account acceptance. | **Documented — implementation/evidence audit pending.** CI run #42979514553 passed on code SHA `1d4f5ddd08ad38591dba82b3537f353d8705ca30`; that workflow result does not by itself demonstrate every sub-gate listed in this row or prove repository branch-protection configuration. Keep the detailed acceptance items open until their specific evidence is linked. |

### Completion and evidence rules

- The six gates are independently necessary. Passing static architecture checks does not prove backup completeness; backup tests do not prove recovery under every interruption; parity does not prove diagnostics are correctly connected; and a green individual job does not prove the integrated foundation.
- Each evidence record must identify the repository commit, build, test suite/fixture set, environment, outcome and any known limitation. A result from an earlier commit cannot silently verify a later change.
- Existing implementation and test coverage must be inspected and reused. Do not rewrite working foundation components or create duplicate services merely to satisfy the wording of these gates.
- Any uncovered gap must be assigned to its owning contract/module and closed with the narrowest compatible implementation and tests. Shared guarantees remain centralized; feature-specific behavior remains owned by its feature.
- **Physical-phone testing remains deferred by the user.** CI and emulator evidence may establish automated contract, integration and business-result parity, but cannot claim acceptance on the user's Redmi Note 11 Pro+ 5G or another physical device. Record physical-device acceptance separately when authorized.
- **Dropbox/live-account acceptance remains deferred.** Automated package, encryption, restore and provider-adapter tests do not prove OAuth, scheduling or real-account behavior.
- These gates are completion criteria, not implementation authorization. Implementation work must follow the existing development/change-control process and the user's separate authorization. This documentation update does not authorize runtime code, schema/migration, CI workflow, branch-protection or UI changes.

## Audit and implementation status

At the time this contract was prepared:
- Data ownership, transaction boundaries, durable driver intents, replay/idempotency, versioned Room migration, Android platform boundaries, and V1/V2 backup compatibility are already documented and have implementation/tests in the current foundation.
- Shift/trip transitions, trip-history projection, backup/restore safety, and pending native driver actions have existing implementation and automated coverage.
- Payment/settlement and loan repayment workflows are not present in the repository yet. Their state machines are a required future Finance design/implementation gate, not a claim of completed functionality.
- The existing architecture checker covers source-size limits and selected TypeScript import boundaries, but it does not yet validate a runtime Feature Registry, complete backup participant discovery, calculation contracts, or cross-feature integration declarations. Those checks must be introduced with the registry/inventory implementation; documentation alone is not enforcement.
- The repository has privacy principles but not a complete structured local diagnostics recorder/export capability. The implementation must be introduced with the first supported diagnostic integration slice.
- Feature registry, automatic participant discovery, and calculation-contract enforcement are architectural requirements, not claims that those runtime capabilities already exist. Audit the current persistence/backup/calculation implementations before selecting implementation scope.
- GitHub required-check configuration is external repository administration. A workflow job is necessary but does not itself configure branch protection.

## Change and verification policy

- Audit existing contracts and code before each architecture change; preserve complete existing rules and avoid parallel/contradictory documents.
- Update only the owning contract and its references. Keep implementation changes narrow and behavior-preserving.
- Add tests with each enforceable rule or state-machine behavior.
- Run architecture checks, all web/unit tests, production build, Android build/unit/instrumentation tests, migration and backup compatibility tests before merge.
- Report automated CI results separately from physical-device acceptance and real Dropbox account acceptance. Those are not implied by emulator or static checks.
