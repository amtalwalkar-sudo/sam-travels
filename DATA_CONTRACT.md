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

## Repository boundary

Application/domain code depends on repository interfaces, never directly on IndexedDB, Dexie, Room, or Capacitor. Adapters own serialization, transactions, indexes, migrations, and platform-specific details.

## Durability and acknowledgement

- The presentation layer acknowledges the swipe immediately with responsive visual feedback; it does not await GPS, database I/O, network access, or reconciliation.
- The native event workflow promptly writes a pending intent to Room using background I/O. A pending intent is recoverable and carries its stable event ID and original transition timestamp.
- A business transition is acknowledged as recorded only after the reliable GPS snapshot and event have committed in the authoritative local transaction.
- Native journal events carry stable event IDs and idempotency keys; replaying an event must not create duplicate business records.
- Cross-store operations use an explicit journal/outbox and reconciliation process; do not pretend an IndexedDB + Room operation is one atomic transaction.
- Failed writes remain visible as failed/pending and are retryable without duplication.
- Ordered processing must preserve distinct rapid gestures and associate each GPS fix with its originating event; no dropped, merged, or crossed events.

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
