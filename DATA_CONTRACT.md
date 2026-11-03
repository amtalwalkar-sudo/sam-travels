# Data and Persistence Contract

## Record envelope

Persisted business records should use a common envelope:

- `id`: stable UUID generated at creation.
- `schemaVersion`: integer for record shape evolution.
- `createdAt`, `updatedAt`: UTC instants.
- `businessDate`: local calendar date (YYYY-MM-DD) when the record belongs to a business day.
- `source`: web, android, import, or integration.
- `revision`: monotonically increasing local revision where useful.
- `deletedAt`: nullable tombstone timestamp for sync-safe deletion.

Feature-specific fields remain in typed feature entities; avoid a giant untyped catch-all record.

## Transition intent, GPS snapshot, and status

Every shift/trip lifecycle action begins as an immutable transition intent with a stable event ID, event type, transition timestamp, source, schema version, and idempotency key. Required event types include shift start/end, trip start/end, and ride cancellation.

The intent is captured at gesture time and queued immediately. Its GPS snapshot is acquired separately for that event; no continuous GPS tracking or periodic location collection is performed. A GPS snapshot contains latitude, longitude, horizontal accuracy in metres, fix timestamp, provider/source, and optional sensor fields only when available. Keep transition time distinct from GPS fix time. Validate coordinate ranges, fix age, and accuracy against a named, versioned reliability policy.

Track explicit lifecycle statuses such as received, pending location, pending persistence, recorded, and needs attention. Gesture receipt is not the same as business transition completion. Do not mark a GPS-required transition recorded until a reliable fix and transition event have been committed durably. Never silently substitute stale last-known coordinates. See [docs/LOCATION_AND_STATE_TIMING_CONTRACT.md](docs/LOCATION_AND_STATE_TIMING_CONTRACT.md).

## Durable state and recovery

- Persist the current domain state as a recoverable projection of immutable, timestamped events. The event journal is authoritative; in-memory UI state is only a cache.
- Persist active shift state, current trip/approach state, pending transition intents, timer start instants, and event completion/reconciliation status locally before relying on network sync.
- Startup must reconstruct the last committed business state after WebView reload, app process death, phone shutdown, battery exhaustion, and device reboot. Do not default an active shift/trip to idle because runtime services were restarted.
- Recovery/replay must be idempotent, ordered, and keyed by stable event IDs. It must not duplicate or omit transitions or create conflicting state.
- A transition's original event instant is immutable. A GPS fix obtained later after restart keeps its own fix timestamp and must not be represented as a fix from the original transition time.
- Persist UTC event instants and local business-date/timezone context. Use Asia/Kolkata for business display where applicable.


## Cross-surface command and state synchronization

- PWA and native overlay actions use the same typed domain command schema and transition coordinator. Include command ID, event ID, origin surface, transition instant, expected prior state/revision, schema version, and idempotency key.
- Maintain one authoritative local state projection with monotonically increasing revision. Do not persist separate PWA and overlay business-state copies.
- Commit each accepted transition once. After commit, publish a typed local state-change notification to active surfaces; notification delivery is at-least-once and consumers deduplicate by event ID/revision.
- A surface that was inactive, disconnected, or recreated must query the latest durable revision and rebuild its view; event notifications alone are not sufficient for recovery.
- Serialize and validate commands against the latest revision. Conflicting stale commands must be rejected or marked needs-attention rather than creating contradictory states.
- Source/origin metadata is audit information, not a different business rule. A Start Ride initiated from the PWA and the same action initiated from the overlay produce the same domain transition.
- Live cross-surface propagation is local and offline-capable. Cloud sync is not in the critical path.


## Internet access policy and optional enrichment

- Persist a versioned app-level network policy (enabled/disabled) locally; it is user-controlled, survives restart/reboot, and is shared across PWA/native surfaces.
- Every app-initiated network operation must be mediated by the network capability gateway. Include capability identifier, purpose, request status, attempt time, and recoverable outcome where relevant.
- Keep network connectivity status distinct from the user's policy choice and from service authentication status.
- Optional reverse-geocoding results are enrichment records linked to immutable GPS snapshots. Store provider, lookup time, result, and status separately; never rewrite coordinates, GPS fix time, or transition time.
- When access is disabled/offline, retain eligible work as pending/deferred and continue all local workflows.

## Repository boundary and authoritative database ownership

Application/domain code depends on repository interfaces, never directly on IndexedDB, Dexie, Room, or Capacitor. Adapters own serialization, transactions, indexes, migrations, and platform-specific details.

The authoritative local database is selected by runtime, not by feature:

- **Browser-only PWA:** IndexedDB (Dexie is the preferred adapter) is authoritative for all local business records and workflow state.
- **Installed Android app:** Room is authoritative for all local business records, driver workflow state, transition/event journal, pending operations, projections, and recovery metadata.
- **Android WebView and native overlay:** both are clients of the same Room-backed repository/application boundary. The WebView must use the typed Capacitor bridge for business reads/writes and must not independently commit the same business records to IndexedDB.
- **Shared domain/application layer:** the same typed entities, validation, use cases, and repository interfaces apply on both platforms. Only the persistence adapter and platform capability implementations differ.

Do not dual-write the same business operation to Room and IndexedDB and then attempt to infer which copy wins. Do not claim cross-database atomicity. Android commits must be transactionally authoritative in Room; browser commits must be transactionally authoritative in IndexedDB. Moving data between environments is an explicit import/export or migration workflow with validation, version checks, and recovery safeguards.

Room's transaction boundary must cover each accepted Android business transition, its event evidence/status, resulting state projection/revision, and durable outbox entries wherever those records share the same database. External notifications and WebView rendering occur after commit and are replayable. IndexedDB uses an equivalent transaction boundary for browser-only operation.

## Durability and acknowledgement

- The presentation layer acknowledges the swipe immediately with responsive visual feedback; it does not await GPS, database I/O, network access, or reconciliation.
- The native event workflow promptly writes a pending intent to Room using background I/O. A pending intent is recoverable and carries its stable event ID and original transition timestamp.
- A business transition is acknowledged as recorded only after the reliable GPS snapshot and event have committed in the authoritative local transaction.
- Native journal events carry stable event IDs and idempotency keys; replaying an event must not create duplicate business records.
- Cross-store operations use an explicit journal/outbox and reconciliation process; do not pretend an IndexedDB + Room operation is one atomic transaction.
- Failed writes remain visible as failed/pending and are retryable without duplication.
- Ordered processing must preserve distinct rapid gestures and associate each GPS fix with its originating event; no dropped, merged, or crossed events.

## Time integrity

- Persist event timestamps as unambiguous UTC instants; preserve the business timezone/date used for display and reporting.
- Compute elapsed durations from persisted start and end instants/current instant, not a periodically incremented counter.
- Recompute active timers after restart so powered-off time is included. A monotonic clock alone is insufficient across reboot; use wall-clock instants with boot/clock-change diagnostics.
- If the device's offline wall clock is manually changed while powered off, exact real-world elapsed time cannot be independently established. Record clock-integrity warnings and provide a review/correction path rather than silently altering event history.


## Dates, money, and units

- Store money as integer minor units (paise) with an explicit currency code; avoid binary floating-point as the source of truth.
- Store distances in a documented base unit with explicit conversion at input/output boundaries.
- Store business dates separately from timestamps. Historical entries must be allowed when the feature's validation rules permit them.
- Rounding rules for financial calculations must be named, tested, and displayed consistently.

## Migrations and recovery

- Every persistent schema change has a versioned migration and a rollback/recovery strategy.
- Migrations are repeatable-safe and tested against representative prior versions.
- Never silently clear data after migration failure. Preserve the source, create a recovery checkpoint where possible, and present a recoverable error state.
- Backup/restore operates on a versioned manifest and validates checksums before replacing live data.

## Privacy and security

- Minimize collected personal data.
- Encrypt or protect secrets using platform-appropriate secure storage; never place OAuth tokens in source control or ordinary exported business records.
- Logs must not expose access tokens, passwords, or unnecessary personal/financial details.

## Transaction, outbox, and recovery guarantees

Follow [docs/TRANSACTION_AND_RECOVERY_CONTRACT.md](docs/TRANSACTION_AND_RECOVERY_CONTRACT.md) for the normative command acceptance boundary, pending-intent and completion transactions, ordered conflict handling, outbox/inbox idempotency, lifecycle statuses, restart recovery sequence, failure windows, and failure-injection tests. In particular, gesture acknowledgement is not durable acceptance; only a committed intent is safely queued, and only a committed completion transaction may be shown as recorded. At-least-once delivery plus idempotency protects business effects; do not claim exactly-once transport.
