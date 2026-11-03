# Local Persistence Ownership Contract

## Purpose

Define one unambiguous local source of truth for each runtime so that browser storage, Android storage, the PWA, and the native overlay cannot create competing business histories.

## Authoritative store by runtime

| Runtime | Authoritative local store | Scope |
|---|---|---|
| Browser-only PWA | IndexedDB (Dexie preferred) | All local business records, workflow state, projections, and pending local operations |
| Installed Android app | Room | All local business records, workflow state, projections, event journal, pending operations, and recovery metadata |

The choice is runtime-wide, not feature-specific. Features must not select a different authoritative database.

## Installed Android ownership

- Room is the sole authoritative local business database for the installed application.
- This includes shifts, trips/log book, finance, vehicle, maintenance, compliance, performance source records, admin settings, driver state projections, transition events, GPS evidence/status, pending operations, and recovery metadata.
- The React application running in the Android WebView and the native Android overlay are two clients of the same application state and Room-backed repository boundary.
- WebView business reads and writes use versioned, typed Capacitor/native APIs. The overlay uses the same domain/application use cases and repositories.
- IndexedDB must not hold a second writable copy of Android business records. Disposable UI/cache data is permissible only when explicitly non-authoritative, reconstructible, and unnecessary for recovery.

## Browser-only PWA ownership

- When the native Android runtime is absent, IndexedDB is the sole authoritative local business database.
- Browser repositories implement the same domain/application contracts and validation rules as the Android Room repositories.
- Browser operation must not require Android or Capacitor packages.

## Shared domain and repository contracts

- Domain entities, invariants, calculations, command schemas, and application use cases are platform-neutral.
- Application services depend on repository interfaces, not storage SDKs.
- Room and IndexedDB adapters own serialization, indexes, constraints, transaction mechanics, migrations, and platform-specific recovery.
- Database technology must not leak into feature forms, components, or domain calculations.
- Record identity, schema version, revision, event ID, and idempotency semantics must be consistent across adapters.

## Transaction and side-effect boundaries

- An Android business write is durable only after its Room transaction commits.
- A browser-only business write is durable only after its IndexedDB transaction commits.
- For an accepted Android driver transition, commit the event, required GPS evidence/status, resulting state projection/revision, and durable outbox entries in one Room transaction wherever they share the same database.
- Do not publish a committed state notification before the authoritative transaction commits.
- Bridge notifications, UI rendering, Dropbox transport, and other external side effects occur after commit. Required follow-up work is represented by durable outbox records and processed idempotently.
- Never imply that a Room transaction and an IndexedDB transaction form one atomic transaction.
- Never use best-effort dual writes followed by "last write wins" reconciliation for the same business operation.

## Cross-surface reads and writes

- PWA and overlay dispatch the same versioned application commands.
- On Android, both surfaces read the same Room-backed state projection and revision.
- A surface that reconnects or resumes reads the latest durable revision; notifications are hints, not the source of truth.
- Duplicate commands, notifications, and outbox deliveries are safe through stable IDs, revisions, and idempotency keys.
- If a Room commit fails, the transition is not reported as recorded and no committed revision is published. Any pending intent that was previously committed remains recoverable.

## Migration, import/export, and recovery

- Every persistent schema change has an explicit versioned migration and supported-source-version policy.
- Migration tests cover representative prior versions, interruption, retry, integrity validation, and rollback/recovery behavior.
- A failed migration must preserve the original database and create/use a recovery checkpoint where possible. Never silently clear or recreate business data to make startup succeed.
- Moving data between a browser PWA and installed Android app is an explicit import/export or migration workflow. Validate package integrity, schema compatibility, IDs, relationships, and duplicate handling before commit; retain a recovery path.
- Backup/restore follows the separate Dropbox Backup and Recovery Contract and must operate on a consistent snapshot of the runtime's authoritative database.

## Required verification

1. Android WebView creates a business record; the overlay and a recreated WebView read the same record and revision from Room.
2. Native overlay creates a driver transition; the WebView observes the same committed state without refresh or internet.
3. A failed Room transaction never appears as a committed business transition in either surface.
4. Killing/recreating the WebView does not lose, duplicate, or fork Android business records.
5. Duplicate commands, outbox deliveries, and state notifications do not duplicate records or revisions.
6. Browser-only PWA can create, close, reload, and recover records using IndexedDB without Android dependencies.
7. Interrupted or failed migrations preserve source data and expose a recoverable state.
8. Automated architecture checks prevent Android feature code from directly writing business records to IndexedDB or bypassing repository interfaces.

## Crash-safe transaction and replay rules

The authoritative-store transaction and recovery rules are specified in [the Transaction and Recovery Contract](TRANSACTION_AND_RECOVERY_CONTRACT.md). For both adapters, durable intent enqueue is distinct from business completion; a GPS-required transition is recorded only after validated evidence, event, projection/revision, and outbox commit together. Notifications and external effects are post-commit. Duplicate commands and deliveries must be harmless through stable IDs and atomic receiver deduplication. Recovery never clears source data to bypass an error.
