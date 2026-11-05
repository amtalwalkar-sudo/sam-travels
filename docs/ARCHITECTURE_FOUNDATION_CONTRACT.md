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
