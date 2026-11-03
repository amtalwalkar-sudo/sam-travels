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

## Transition and GPS snapshot records

Every shift/trip lifecycle transition is an immutable event with a stable ID, event type, event timestamp, source, schema version, and idempotency key. Required event types include shift start/end, trip start/end, and ride cancellation.

A GPS snapshot linked to a required transition contains latitude, longitude, horizontal accuracy in metres, fix timestamp, provider/source, and optional sensor fields only when available. Keep transition time distinct from GPS fix time. Validate coordinate ranges, fix age, and accuracy against a named, versioned reliability policy.

Do not mark a GPS-required transition complete until a reliable fix and transition event have been committed durably. Pending acquisition is a distinct state, not a successful event. Never silently substitute stale last-known coordinates. See [docs/LOCATION_AND_STATE_TIMING_CONTRACT.md](docs/LOCATION_AND_STATE_TIMING_CONTRACT.md).

State intervals reference their start and end transition IDs. Durations are derived from persisted instants, allowing recovery after app restarts; elapsed-time UI counters are never the source of truth. Use `Asia/Kolkata` for live wall-clock presentation and retain UTC instants for audit and ordering.

## Repository boundary

Application/domain code depends on repository interfaces, never directly on IndexedDB, Dexie, Room, or Capacitor. Adapters own serialization, transactions, indexes, migrations, and platform-specific details.

## Durability and acknowledgement

- A record-changing operation resolves successfully only after its authoritative local transaction commits.
- Native-critical capture is committed to Room before the native bridge acknowledges it.
- Native journal events carry stable event IDs and idempotency keys; replaying an event must not create duplicate business records.
- Cross-store operations use an explicit journal/outbox and reconciliation process; do not pretend an IndexedDB + Room operation is one atomic transaction.
- Failed writes remain visible as failed/pending and are retryable without duplication.

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
