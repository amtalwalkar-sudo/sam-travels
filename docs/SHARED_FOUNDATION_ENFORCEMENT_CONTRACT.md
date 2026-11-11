# Mandatory Shared Foundation Enforcement Contract

Status: approved architectural requirement; runtime enforcement and acceptance are tracked in the dedicated foundation implementation phase.
Scope: every current and future Sam Travels workflow, including driver shifts/trips, odometer, financial entries, future business modules, PWA, and Android native overlay.

This document is the shared-feature inheritance and onboarding checklist derived from [ARCHITECTURE_FOUNDATION_CONTRACT.md](ARCHITECTURE_FOUNDATION_CONTRACT.md). It requires every feature to consume the shared guarantees; it is not a competing detailed specification. For exact persistence, transaction, GPS, lifecycle, offline, recovery, compatibility, backup, diagnostics and architecture rules, the named owner contracts in [Contract and Documentation Index](CONTRACT_INDEX.md) prevail. If wording differs, update this checklist to reference the owner rather than maintaining a second rule.

## 1. Mandatory inheritance

Every feature and workflow MUST inherit the shared foundation guarantees through approved domain/application contracts and platform adapters. Feature authors must not create competing implementations of:

- authoritative business persistence or repository ownership;
- durable command/intent handling, transaction boundaries, event journals, revisions, or outbox/inbox delivery;
- state reconstruction, startup/resume reconciliation, retry, recovery, or duplicate suppression;
- event-scoped location acquisition, permission/capability handling, evidence validation, and timestamp integrity;
- offline-first operation and policy-controlled network access/synchronization;
- PWA/native-overlay command, state-projection, and revision synchronization;
- schema/contract versioning, migration, compatibility, backup/restore participation, or recovery checkpoints;
- structured local diagnostics, privacy filtering, bounded retention, and failure reporting.

A feature may own its business entities, invariants, use cases, validators, calculations, repository port, migration, and feature-specific recovery handler. It must implement those through the shared contracts and services. It may not create a second global lifecycle, location, persistence, synchronization, or recovery framework.

## 2. Authoritative storage and commit guarantees

- Browser-only PWA uses IndexedDB through the approved persistence adapter as its sole authoritative business store.
- Installed Android uses Room as its sole authoritative business store. WebView and native overlay are clients of the same Room-backed application/repository boundary; Android WebView must not maintain a competing writable IndexedDB business store.
- Domain/application rules remain platform-neutral and depend on typed ports, not concrete storage, UI, network, or Android APIs.
- A user gesture or accepted request is not a durable commit. The UI may show received/pending feedback; it may show success only after the authoritative commit is confirmed.
- Each transition defines its durable intent, atomic completion boundary, state/revision update, event identity, idempotency key, and durable follow-up work.
- Records that form one business transition commit atomically in their authoritative store. External side effects occur post-commit through durable idempotent work; no best-effort dual writes or last-write-wins.
- Offline local workflows must not require network access. Every app-initiated network request uses the shared network policy gateway.

## 3. Lifecycle, interruption, and recovery guarantees

The shared lifecycle/recovery layer applies regardless of which feature or surface initiated an operation.

- Reconstruct state from authoritative persisted records, never from UI memory, a live service, notification state, or a particular WebView instance.
- Reconcile on application startup, resume, WebView recreation, native overlay attachment, connectivity restoration, and device reboot as applicable.
- Preserve committed work across backgrounding, screen-off, process death, force-stop, OS process reclamation, and unexpected power loss. Do not rely on receiving a final shutdown callback.
- A transition must persist its recoverable intent/state before acknowledging durable acceptance. An abrupt power loss cannot be made to save an uncommitted action; recovery must resume only from durable evidence and must not fabricate the missing action.
- Replay/delivery is at-least-once. Stable operation IDs and idempotency keys must prevent duplicate business effects at the receiver's durable transaction boundary.
- A failed, unknown, or interrupted operation must remain visibly pending/failed/needs-attention as appropriate; never report it as completed or silently reset business data/preferences.
- Recovery must preserve original event IDs, timestamps, schema versions, and evidence. A later GPS fix or later clock reading must never be backdated as original evidence.
- Recovery handlers are safe to retry, ordered where dependencies require it, non-destructive, observable, and bounded.

Android execution is subject to OS and OEM policy. The architecture must report permission denial, background restriction, deferred work, and unavailable capability honestly; it must not promise arbitrary execution while the process is stopped or the device is powered off.

## 4. GPS and time are shared event services

- Location is acquired only for explicitly approved user/business events. No continuous tracking, periodic polling, or passive background collection between events.
- Every event that requires GPS obtains its own event-scoped evidence through the shared location service and versioned policy (currently `gps-event-fix-v1`: maximum 50 m horizontal accuracy and maximum 30 s fix age relative to the original transition timestamp).
- One event's fix must not be reused as proof for another event. Missing, stale, inaccurate, denied, or unavailable evidence is represented explicitly and follows that event's approved pending/rejection/recovery policy.
- Persist actual UTC instants and required local timezone/context. Derive durations from persisted interval boundaries; do not depend on a screen timer or process lifetime.
- Location acquisition, permission checks, time integrity, and platform limitations are implemented once behind shared ports/adapters, not separately by each feature.

## 5. PWA and Android surface parity

- PWA and native overlay are presentation surfaces over one workflow and one application contract, not independent business state machines.
- Both surfaces invoke the same versioned commands, validators, calculations, and transition policies.
- On installed Android, both use the same Room-backed state and revision. A command from either surface is validated against the latest committed revision and is reflected in the other surface after commit.
- Overlay/WebView lifecycle changes must not discard pending operations or create duplicate records. Reattachment reconciles from durable state before enabling controls.
- A feature may expose different presentation layouts, but may not fork business rules or bypass the shared command boundary.

## 6. Feature onboarding and enforcement

Before a persistent feature is enabled for writes, it must register and pass validation for:

- stable feature ID and contract version;
- owning domain/application entry point and repository boundary;
- persisted entities and schema versions;
- migration path and failure/rollback behavior;
- declared dependencies and version compatibility;
- backup/restore participation, required references/attachments, and restore validator;
- state-machine, calculation, and cross-feature contracts where applicable;
- feature-specific recovery handlers and automated tests.

Missing/duplicate registration, missing migrations, undeclared dependencies, unsupported contract versions, or missing backup/restore participation fail closed. Feature registration must be validated deterministically. Hiding/disabling a feature does not delete its data.

Architecture CI must enforce dependency direction and public entry points across TypeScript and Kotlin/Android source boundaries, detect direct storage/platform access and duplicate authorities where statically possible, and fail on unregistered persistent feature capabilities. Static checks are supplemented by runtime integration tests; documentation alone is not enforcement.

## 7. Diagnostics and backup inherit the same foundation

- Every feature uses the shared bounded, privacy-safe local diagnostics capability at real operation/recovery boundaries. Diagnostics must not include precise coordinates, secrets, credentials, or full business payloads; diagnostic failure must never fail a business operation.
- Every persistent feature participates in complete business backup/restore through validated registration and shared coordinator discovery. No feature-specific backup silo or drifting manual allowlist is permitted.
- Restore validates all required participants, schemas, dependencies, references, and attachments before replacement; creates a checkpoint; requires explicit confirmation; and supports verification/rollback.
- Diagnostics, credentials, ephemeral caches, and secrets remain outside business backup packages.

## 8. Required conformance for every feature

A feature is not foundation-conformant until it demonstrates:

1. All writes go through its public application/repository contract and the correct authoritative store.
2. Commit, revision, event identity, and idempotency are atomic and recoverable.
3. Duplicate, stale, concurrent, interrupted, and retried commands cannot create duplicate or contradictory business effects.
4. Startup/resume/reboot reconciliation restores the correct durable state without relying on UI/service memory.
5. GPS-required events use distinct, valid event-scoped evidence and handle permission/OS restrictions honestly.
6. Offline operation and later synchronization preserve ordering and deduplicate delivery.
7. PWA/native surfaces use identical business rules and converge on the same committed revision.
8. Schema migration, backup inclusion, restore validation, and rollback preserve the feature's records and relationships.
9. Diagnostics are bounded, redacted, local, and non-blocking.
10. Automated architecture and behavior tests cover both allowed and rejected paths.

## 9. Non-claims and change control

This contract states required architecture; it does not assert that every listed capability is currently implemented or runtime-enforced. The implementation phase must audit actual code, close gaps, and attach test evidence. Existing completed foundation slices must be reused and regression-tested, not rewritten merely to match new terminology.

Changes to a shared service or contract require versioning/compatibility review and regression tests across all registered consumers. A feature cannot locally weaken a shared guarantee. Any exception requires explicit architectural review, documented scope, owner, expiry, and a test proving the exception cannot affect other features.
