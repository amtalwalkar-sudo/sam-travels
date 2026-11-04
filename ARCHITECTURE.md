# Architecture

## Product boundary

Sam Travels is a **single-driver Driver Log Book + ERP**. It models one owner/operator's work, vehicle, trips, records, and business finances. Do not introduce multi-driver assignment, driver rosters, fleet dispatch, or fleet tenancy unless the product scope is explicitly changed.

## Architectural layers

1. **Presentation** — React components, navigation, forms, and responsive layouts. Presentation must not own business calculations or persistence rules.
2. **Application** — use cases and workflows coordinating domain operations.
3. **Domain** — typed entities, invariants, calculations, and feature contracts. No React, browser storage, or Android dependencies.
4. **Persistence** — versioned repositories and migrations. The browser PWA uses IndexedDB (Dexie is the preferred adapter) as its local authority. The installed Android application uses Room as the sole local authority for **all** business records, driver state, event journals, and pending operations; IndexedDB must not become a competing Android business-data store.
5. **Platform adapters** — Capacitor plugins and Kotlin services for Android-only capabilities.
6. **Integrations** — Dropbox OAuth and backup transport behind an integration contract.

Dependencies point inward. Domain and application layers must not import UI, Dexie, Capacitor, Android, or Dropbox SDK details.

## Capability ownership and file-size discipline

A capability owns its domain rules, application use cases, ports, persistence adapter, platform adapter (when needed), presentation adapter, and focused tests. Keep those parts adjacent to their capability rather than placing unrelated responsibilities in shared utilities or a universal service.

The preferred capability shape is:

```text
packages/features/<capability>/
  domain/          # entities, invariants, pure calculations
  application/     # use cases and orchestration
  ports/           # repository and platform capability interfaces
  adapters/        # persistence and integration implementations
  presentation/    # capability-owned UI, when applicable
  tests/           # focused domain/application/adapter tests
```

The shared `core` package is limited to genuinely cross-capability primitives and stable contracts. It must not become a home for feature-specific rules. The current driver workflow packages may be migrated into this shape in small, behaviour-preserving slices; do not perform a risky mass move solely to match a directory diagram.

Files should have one cohesive reason to change. Split files when they combine distinct responsibilities, and keep modules small enough to understand and test in isolation. The automated architecture gate currently rejects source files over 400 lines or 24 KB; a justified exception must be split or explicitly reviewed rather than silently bypassing the gate. Avoid minifying code: readable formatting is part of maintainability.

## Dependency rules

- Dependencies point from outer layers toward inner contracts; inner layers never import outer layers.
- Domain code may depend on shared core types and other domain primitives only.
- Application code may depend on domain and core contracts, never a concrete persistence, UI, or platform adapter.
- Persistence adapters implement application/domain ports; they do not own business invariants.
- Web UI talks to application use cases and presentation/platform adapters. It must not access Dexie tables or Capacitor plugins directly.
- Kotlin Android services and plugins are platform adapters. They call the authoritative repository/use-case boundary and do not create a second driver state machine.
- Cross-capability communication uses explicit typed application contracts/events. Direct imports of another capability's private implementation or tables are prohibited.
- Avoid circular dependencies, service locators with unrestricted access, giant catch-all files, and duplicate implementations of the same business rule.

These rules are checked in CI by `npm run check:architecture`. The guard is intentionally deterministic and local; it checks source size and known layer import boundaries without trying to infer all semantics from naming.

## Local persistence ownership

- There is one authoritative local database per runtime: IndexedDB for a browser-only PWA session, and Room for the installed Android application.
- On Android, the PWA/WebView and native overlay are two clients of the same Room-backed application state. The WebView accesses it through versioned Capacitor/native repository capabilities; it must not independently commit business records to IndexedDB and later attempt dual-write reconciliation.
- In a browser without the native Android runtime, the same domain/application contracts are implemented by the IndexedDB adapter.
- Repository interfaces and use cases are shared; persistence adapters are platform-specific. Domain logic must not branch on database technology.
- Android business writes, driver transitions, projections, and recovery journals commit through Room transactions. Browser PWA writes commit through IndexedDB transactions.
- Do not describe Room and IndexedDB as one atomic store. Do not use best-effort dual writes as a consistency strategy. Any import/export or migration between runtimes is an explicit, validated workflow.
- The authoritative database owns record IDs, revisions, schema versions, migration state, and durable outbox/inbox state for its runtime. UI memory and replicated surface state are disposable projections.
- A platform must not report a write as durable until its authoritative repository confirms the commit. Pending native work must remain recoverable in Room even when the WebView is absent.

## Consolidated architecture foundation contract

The approved cross-cutting rules for ownership, compatibility, recovery, six workflow state machines, platform boundaries, CI enforcement, and local diagnostics are consolidated in [docs/ARCHITECTURE_FOUNDATION_CONTRACT.md](docs/ARCHITECTURE_FOUNDATION_CONTRACT.md). This contract supplements the detailed contracts below; it does not replace them.

## Feature modularity

Features are independently addable modules with stable domain/application contracts. UI can be redesigned without changing business rules; storage can be migrated behind repositories; calculations can evolve without coupling them to forms. Cross-feature communication uses typed application services/events rather than direct component imports.

Initial feature areas: Work/Shift, Log Book/Trips, Finance, Vehicle, Performance, Admin, and Backup & Recovery. This is a proposed initial organization, not permission to expand into unrelated fleet-management scope.

## Offline-first and consistency

- User-entered records must be usable offline.
- Writes must have explicit IDs, timestamps, schema versions, and idempotency keys where replay is possible.
- A success acknowledgement must only follow durable persistence at the responsible layer; presentation may acknowledge gesture receipt immediately while showing the business event as pending until durable completion.
- Native event capture must survive WebView reload/process death and reconcile idempotently into the authoritative application state in Room on Android; browser-only operation uses IndexedDB.
- The durable local state, not UI memory or service lifetime, is authoritative. Restore the active shift, trip/approach state, and pending operations after app/process/device restart.
- Persist timestamped state transitions and derive timers from persisted instants so elapsed time includes app downtime and time while the phone is powered off; never resume from an in-memory counter.
- Detect suspicious system-clock changes and flag uncertain elapsed-time calculations rather than silently corrupting history. Offline operation must not depend on network time.
- Conflicts and partial failures must be visible and recoverable; never silently discard records.
- Store dates as explicit local business dates plus unambiguous timestamps where needed. Do not infer historical form dates from the current date.
- Shift/trip/cancellation transitions require event-specific reliable GPS evidence and durable event persistence; no continuous tracking. See [docs/LOCATION_AND_STATE_TIMING_CONTRACT.md](docs/LOCATION_AND_STATE_TIMING_CONTRACT.md).
- Driver gestures and presentation updates must remain responsive while GPS acquisition, persistence, and reconciliation run asynchronously off the UI/main thread.
- State durations are derived from persisted transition timestamps, not volatile UI counters. The live clock is displayed in `Asia/Kolkata` (`HH:mm:ss`).

## One shared driver workflow across PWA and Android overlay

The PWA driver screen and native Android overlay are synchronized views/controllers over one local domain state. They are not separate state machines.

- Both surfaces dispatch the same application transition commands and observe the same durable state projection/revision.
- A transition from either surface is persisted once, then propagated locally to the other surface through the typed Capacitor/native event bridge. This must work offline and must not depend on Dropbox or cloud round-trips.
- The native overlay can operate when the WebView is paused or absent; it writes through the same domain contract and native durable journal rather than maintaining a separate business state.
- Each surface reconciles the latest durable revision on attach/resume to recover missed notifications.
- One ordered coordinator validates commands against the latest state, handles duplicate IDs idempotently, and resolves conflicting near-simultaneous actions so only a valid transition becomes final.
- Both surfaces show immediate pending feedback and then the same durable completion/error status. Timers and current shift/ride state derive from shared persisted timestamps.
- GPS remains event-scoped: the accepted transition owns one location request; synchronization itself never starts location tracking.

## User-controlled internet access

Sam Travels is local-first. Core driver workflows, local records, calculations, timers, recovery, and PWA/native overlay synchronization must work without internet. A dedicated Internet icon sits beside the GPS icon in the header and controls the app's persisted network-access policy. This is an in-app capability toggle, not an Android runtime permission prompt. All app-initiated network traffic must pass through a shared policy gateway; no feature may bypass it. The policy is disabled until the user explicitly enables it and is shared by PWA and native surfaces. Dropbox backup/restore and optional future services (such as reverse geocoding) use this gateway. See [docs/NETWORK_ACCESS_CONTRACT.md](docs/NETWORK_ACCESS_CONTRACT.md).

## Platform strategy

The web application is a PWA. Capacitor packages the same application for Android. Capacitor is a required foundation, not a later optional wrapper. Android-specific capabilities are implemented in Kotlin plugins/services with typed bridge contracts. See [docs/ANDROID_NATIVE_CONTRACT.md](docs/ANDROID_NATIVE_CONTRACT.md) and [docs/LOCAL_PERSISTENCE_CONTRACT.md](docs/LOCAL_PERSISTENCE_CONTRACT.md).

## Quality attributes

Reliability, data integrity, recoverability, offline usability, accessibility, responsive mobile-first UX, observability, and testability take priority over premature feature breadth.

## Crash-safe transactions and recovery

All state-changing workflows follow the durable-intent, atomic-completion, and post-commit-outbox boundaries defined in [docs/TRANSACTION_AND_RECOVERY_CONTRACT.md](docs/TRANSACTION_AND_RECOVERY_CONTRACT.md). Gesture feedback is immediate but is not a durability claim; a command is safely queued only after its authoritative local intent commit. GPS-required transitions remain pending until their event-specific evidence and resulting state commit atomically. Replay and delivery are at-least-once and idempotent; no exactly-once transport or silent last-write-wins behavior is assumed.

## GPS evidence, time integrity, and backup safety

Event-scoped GPS and clock semantics are governed by [docs/LOCATION_AND_STATE_TIMING_CONTRACT.md](docs/LOCATION_AND_STATE_TIMING_CONTRACT.md). The approved GPS policy is `gps-event-fix-v1` (50 m maximum horizontal accuracy; 30 s maximum fix age). The approved backup design is `backup-encryption-v1` (client-side AES-256-GCM, per-backup 256-bit DEK, Argon2id passphrase wrapping or independent 256-bit recovery key). Implementations must match the versioned contracts. Backup packages use consistent authoritative snapshots and validated, checkpoint-protected restore as defined in [docs/DROPBOX_BACKUP_CONTRACT.md](docs/DROPBOX_BACKUP_CONTRACT.md).

## Feature and security contracts

Feature registration, extension boundaries, and presentation/domain separation follow [docs/FEATURE_MODULE_CONTRACT.md](docs/FEATURE_MODULE_CONTRACT.md). Data minimization, secrets, import validation, platform permissions, and compatibility follow [docs/SECURITY_AND_COMPATIBILITY_CONTRACT.md](docs/SECURITY_AND_COMPATIBILITY_CONTRACT.md).
