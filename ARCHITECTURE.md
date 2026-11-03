# Architecture

## Product boundary

Sam Travels is a **single-driver Driver Log Book + ERP**. It models one owner/operator's work, vehicle, trips, records, and business finances. Do not introduce multi-driver assignment, driver rosters, fleet dispatch, or fleet tenancy unless the product scope is explicitly changed.

## Architectural layers

1. **Presentation** — React components, navigation, forms, and responsive layouts. Presentation must not own business calculations or persistence rules.
2. **Application** — use cases and workflows coordinating domain operations.
3. **Domain** — typed entities, invariants, calculations, and feature contracts. No React, browser storage, or Android dependencies.
4. **Persistence** — versioned repositories and migrations. Browser/PWA records use IndexedDB (Dexie is the preferred adapter); native-critical pending intents/events are durably journaled by Android (Room).
5. **Platform adapters** — Capacitor plugins and Kotlin services for Android-only capabilities.
6. **Integrations** — Dropbox OAuth and backup transport behind an integration contract.

Dependencies point inward. Domain and application layers must not import UI, Dexie, Capacitor, Android, or Dropbox SDK details.

## Feature modularity

Features are independently addable modules with stable domain/application contracts. UI can be redesigned without changing business rules; storage can be migrated behind repositories; calculations can evolve without coupling them to forms. Cross-feature communication uses typed application services/events rather than direct component imports.

Initial feature areas: Work/Shift, Log Book/Trips, Finance, Vehicle, Performance, Admin, and Backup & Recovery. This is a proposed initial organization, not permission to expand into unrelated fleet-management scope.

## Offline-first and consistency

- User-entered records must be usable offline.
- Writes must have explicit IDs, timestamps, schema versions, and idempotency keys where replay is possible.
- A success acknowledgement must only follow durable persistence at the responsible layer; presentation may acknowledge gesture receipt immediately while showing the business event as pending until durable completion.
- Native event capture must survive WebView reload/process death and reconcile idempotently into the web data model.
- The durable local state, not UI memory or service lifetime, is authoritative. Restore the active shift, trip/approach state, and pending operations after app/process/device restart.
- Persist timestamped state transitions and derive timers from persisted instants so elapsed time includes app downtime and time while the phone is powered off; never resume from an in-memory counter.
- Detect suspicious system-clock changes and flag uncertain elapsed-time calculations rather than silently corrupting history. Offline operation must not depend on network time.
- Conflicts and partial failures must be visible and recoverable; never silently discard records.
- Store dates as explicit local business dates plus unambiguous timestamps where needed. Do not infer historical form dates from the current date.
- Shift/trip/cancellation transitions require event-specific reliable GPS evidence and durable event persistence; no continuous tracking. See [docs/LOCATION_AND_STATE_TIMING_CONTRACT.md](docs/LOCATION_AND_STATE_TIMING_CONTRACT.md).
- Driver gestures and presentation updates must remain responsive while GPS acquisition, persistence, and reconciliation run asynchronously off the UI/main thread.
- State durations are derived from persisted transition timestamps, not volatile UI counters. The live clock is displayed in `Asia/Kolkata` (`HH:mm:ss`).

## Platform strategy

The web application is a PWA. Capacitor packages the same application for Android. Capacitor is a required foundation, not a later optional wrapper. Android-specific capabilities are implemented in Kotlin plugins/services with typed bridge contracts. See [docs/ANDROID_NATIVE_CONTRACT.md](docs/ANDROID_NATIVE_CONTRACT.md).

## Quality attributes

Reliability, data integrity, recoverability, offline usability, accessibility, responsive mobile-first UX, observability, and testability take priority over premature feature breadth.
