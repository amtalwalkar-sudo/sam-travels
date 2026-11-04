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

## 7. Local diagnostics and support export

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
- The existing architecture checker covers source-size limits and selected TypeScript import boundaries, but its coverage is narrower than this contract; the dedicated CI job and stronger boundary checks are required.
- The repository has privacy principles but not a complete structured local diagnostics recorder/export capability. The implementation must be introduced with the first supported diagnostic integration slice.
- GitHub required-check configuration is external repository administration. A workflow job is necessary but does not itself configure branch protection.

## Change and verification policy

- Audit existing contracts and code before each architecture change; preserve complete existing rules and avoid parallel/contradictory documents.
- Update only the owning contract and its references. Keep implementation changes narrow and behavior-preserving.
- Add tests with each enforceable rule or state-machine behavior.
- Run architecture checks, all web/unit tests, production build, Android build/unit/instrumentation tests, migration and backup compatibility tests before merge.
- Report automated CI results separately from physical-device acceptance and real Dropbox account acceptance. Those are not implied by emulator or static checks.
