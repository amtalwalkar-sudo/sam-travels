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

## Core-foundation hardening update

Native Android enqueue, retry, and completion share one Room transaction boundary through `DriverWorkflowStore`. The overlay no longer owns a separate transition/commit algorithm. Competing PWA and overlay commands are checked and inserted under the same Room transaction; event evidence, projection, terminal intent status, and outbox are committed together. Recovery cannot reactivate an already-recorded intent.

Business-module entry forms are intentionally not part of the active driver workspace while the core workflow is being stabilized. Future business modules remain an extension point and are not part of the current acceptance gate.

## Core acceptance gate

- One Room transaction owns native enqueue and completion across PWA and overlay.
- Duplicate event identity is idempotent only when command and idempotency identities match.
- Competing commands at the same revision cannot both queue.
- Only recoverable pending intents can be reactivated; recorded intents are immutable.
- Both surfaces read the same Room projection and revision.
- Every completed transition writes event evidence, projection, terminal intent status, and outbox in one transaction.
- Pending operations remain visible after process restart and can be retried without changing their original transition instant.
- Browser-only PWA continues to use Dexie transactions for the equivalent atomic boundary.
- Device acceptance (permissions, GPS, overlay lifecycle, process death, reboot, and WebView recreation) remains a physical-device gate and is not inferred from CI compilation.

## Core-foundation hardening update

Native Android enqueue, retry, and completion share one Room transaction boundary through `DriverWorkflowStore`. The overlay no longer owns a separate transition/commit algorithm. Competing PWA and overlay commands are checked and inserted under the same Room transaction; event evidence, projection, terminal intent status, and outbox are committed together. Recovery cannot reactivate an already-recorded intent.

Business-module entry forms are intentionally not part of the active driver workspace while the core workflow is being stabilized. Future business modules remain an extension point and are not part of the current acceptance gate.

## Core acceptance gate

- One Room transaction owns native enqueue and completion across PWA and overlay.
- Duplicate event identity is idempotent only when command and idempotency identities match.
- Competing commands at the same revision cannot both queue.
- Only recoverable pending intents can be reactivated; recorded intents are immutable.
- Both surfaces read the same Room projection and revision.
- Every completed transition writes event evidence, projection, terminal intent status, and outbox in one transaction.
- Pending operations remain visible after process restart and can be retried without changing their original transition instant.
- Browser-only PWA continues to use Dexie transactions for the equivalent atomic boundary.
- Device acceptance (permissions, GPS, overlay lifecycle, process death, reboot, and WebView recreation) remains a physical-device gate and is not inferred from CI compilation.

## Overlay restart and cross-surface recovery hardening

- The native overlay and Capacitor workflow plugin open separate Room clients against the same authoritative database with multi-instance invalidation enabled, so committed PWA/overlay changes invalidate the other surface's cached reads.
- The overlay presents a recovery action for a persisted pending GPS intent after the service or process is restarted. It retries the original event identity and original transition timestamp; it does not create a replacement transition.
- The overlay owns at most one active event-location request and removes its listener/timeout when the service is destroyed. An interrupted acquisition leaves the durable intent available for recovery.
- Android instrumentation coverage verifies exact duplicate-command idempotency, rejects a reused event identity with a changed payload, and closes/reopens a file-backed Room database to prove a pending intent survives repository recreation and can be recovered.


## Android lifecycle and pending-event reconciliation hardening

- The driver overlay remains a user-enabled Android foreground service with a persistent notification and the location foreground-service type. Screen-off operation relies on this foreground-service boundary and a bounded partial wake lock held only during an event GPS request (40-second safety timeout); GPS is still requested only for a driver action.
- `START_STICKY` service recreation reopens the same Room database and scans for a durable `pending_location` intent. If the original event-time GPS evidence window is still open, the service retries that same event ID and original transition instant. It never creates a replacement action.
- The approved GPS policy remains strict: the fix must be no more than 50 metres horizontal accuracy and within 30 seconds of the original transition instant. If process death or GPS interruption outlasts that evidence window, the intent is retained and marked `needs_attention` with `gps_recovery_window_expired`; a later fix is never attached to an old gesture.
- The PWA reconciles pending intents on initial load and while active. Expired intents are moved to an explicit needs-attention state; pending and recorded events remain durable in Room/IndexedDB.
- The app records whether the user explicitly enabled the overlay. A boot receiver attempts restart only when overlay permission and the Android location permissions required for a background location foreground service are available. On Android 10+, this includes `ACCESS_BACKGROUND_LOCATION`. If Android does not permit the boot-time start, it records a deferred restart; opening the app in the foreground resumes the previously enabled overlay and reconciles pending events.
- Android force-stop, revoked permissions, OEM battery restrictions, and OS policy can still defer background execution. The application must retain pending work and reconcile it on the next permitted execution; no CI result can override these OS boundaries.
