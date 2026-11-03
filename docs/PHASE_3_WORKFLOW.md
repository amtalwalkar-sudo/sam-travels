# Phase 3 — Shared Driver Workflow and PWA/Native Synchronisation

## Implemented

- Versioned single-driver commands preserve command/event IDs, source surface, original transition instant, expected prior state, expected revision, and idempotency key.
- Domain transition rules cover shift start/end, trip start/end, and cancellation. Illegal or stale commands are rejected.
- Browser-only PWA persists a driver projection, pending intents, immutable event records, and outbox entries in Dexie.
- Dexie completion uses one transaction for event evidence, state revision, terminal intent status, and outbox entry. Duplicate completion cannot create a second event.
- Android uses the same Room-authoritative records table for pending intents, events, state projection, and outbox records. Native enqueue and completion run on a background executor; completion uses a Room transaction.
- Capacitor exposes typed native snapshot, enqueue, pending recovery, one-shot location capture, completion, event history, and state-change notifications.
- Browser geolocation and Android LocationManager each perform a single bounded fresh-fix request only after the intent is durably queued. No continuous GPS listener or polling is introduced.
- Both PWA and native floating overlay controls dispatch the same versioned command shape into the Room journal. Overlay actions work without requiring the WebView to be visible.
- Overlay requires explicit Android display-over-other-apps permission and can be enabled/disabled from the Android app.
- PWA refreshes from the authoritative repository and catches up on revision changes; overlay observes Room invalidations. Missed notifications are repaired by reading the current projection.
- Pending intents survive app restart and can be retried with the original event ID and transition timestamp.

## Automated coverage

- Browser repository tests cover queue-before-location, atomic completion, stale concurrent commands, duplicate completion, and pending-intent recovery.
- Existing CI runs TypeScript/unit tests, PWA production build, Capacitor sync, Android debug build, and Android instrumentation APK compilation.

## Device validation still required

CI compilation is not physical-device acceptance. Validate Android runtime permission flows, cold GPS accuracy/freshness and timeout behavior, overlay permission grant/revocation, app process death/reboot, WebView recreation, overlay state reconciliation, and rapid conflicting PWA/native actions on supported Android devices. Android OS/OEM restrictions may defer overlay service execution; pending intents remain durable and resume when execution is available. Phase 3 code is implemented; final device acceptance is tracked in Phase 7 and is not claimed here.
