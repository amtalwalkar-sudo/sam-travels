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
