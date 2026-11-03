# Native Android Contract

Capacitor and the native Android layer are mandatory parts of the Sam Travels foundation. Browser/PWA code must not simulate guarantees that only Android can provide.

## Responsibilities

- React/PWA owns presentation and user workflows.
- **Room is the authoritative local database for the installed Android application**, covering all business records and workflow state—not only native-critical pending events.
- The WebView and native overlay are clients of the same Room-backed application/repository boundary. WebView business reads and writes go through typed Capacitor/native APIs; do not maintain a second authoritative Android business database in IndexedDB.
- IndexedDB is authoritative only for browser-only PWA operation where the native Android runtime is absent.
- The same domain/application contracts and validation rules apply across Room and IndexedDB adapters.
- Capacitor provides a versioned, typed bridge.
- Kotlin plugins expose narrow capabilities.
- Android native components perform event-scoped location acquisition and durable journal work without blocking the UI thread.
- Room stores native-critical pending intents and events that must survive WebView reloads and app process death.

## Overlay

- Use a native Android overlay; request `SYSTEM_ALERT_WINDOW` only when the user enables the feature.
- Explain why the permission is needed and provide a clear disabled state when it is denied or revoked.
- Overlay lifecycle must be independent of a particular WebView instance.
- Overlay visibility is impossible while the display is physically off; resume/reconcile when the display wakes.
- The overlay is a separate presentation feature and is not a prerequisite for event-based GPS acquisition.

## Event-based location acquisition

- Provide a Capacitor location bridge backed by Android location APIs for native Android operation and browser geolocation for active PWA operation.
- **Do not implement continuous GPS tracking.** No location polling, subscription, periodic sampling, or background location collection between required user-triggered events, even while a shift is active.
- Start a bounded, fresh location request only for shift start/end, ride/trip start/end, and ride cancellation. Stop that request after a reliable fix or recoverable failure/timeout.
- Acquire GPS offline; internet/network assistance may improve time-to-fix but is never mandatory.
- For each required transition, continue that event's acquisition until a fix passes the configured accuracy and freshness policy. Do not mark the transition complete with unreliable/missing GPS evidence.
- Store fix timestamp and transition timestamp separately, along with coordinates, horizontal accuracy, and source.
- The overlay must not control or gate event-based location acquisition.
- Request only the location permissions needed for this event-based behavior. If permission is denied/revoked or location services are disabled, expose the blocker and retain the pending event for recovery.
- Android may restrict background execution. Resume pending event work only where permitted; do not claim guaranteed execution while the app is backgrounded or terminated.

## Non-blocking driver interaction

- The swipe/gesture handler must synchronously acknowledge receipt in the presentation layer and update the visual state immediately. It must not await GPS, Room, IndexedDB, bridge round-trips, network calls, or reconciliation before rendering feedback.
- Dispatch the event workflow asynchronously. Capture event intent, stable event ID/idempotency key, and transition timestamp immediately; enqueue durable journal work and GPS acquisition off the main/UI thread.
- Use a clear state distinction such as `received`, `pending_location`, `pending_persistence`, `recorded`, and `needs_attention`. Never show `recorded` before reliable GPS evidence and the authoritative durable commit exist.
- Persist pending event intents to Room using background I/O, then perform GPS acquisition and final event commit asynchronously. Keep UI animation/rendering independent from native callbacks and persistence latency.
- Maintain an ordered, idempotent event queue/state machine. Preserve each gesture's event ID, timestamp, event type, and own GPS request. Rapid consecutive actions must not be dropped, merged, duplicated, or have their GPS snapshots crossed.
- Surface progress and recoverable errors non-modally; do not freeze the screen, block navigation, or require a repeated swipe while acquisition is pending.
- If durable intent enqueue itself fails, immediately show a clear actionable error and do not represent the event as safely queued. Preserve the original gesture context for a retry/recovery path where possible.

## Shared PWA and native overlay driver state

- The PWA driver controls and native Android overlay are two presentation surfaces for one driver workflow, not independent applications or separate state machines.
- A driver action initiated in either surface must enter the same versioned application/domain transition command pipeline and update the same durable local state. Do not implement separate PWA-only and overlay-only start/end/cancel business logic.
- A PWA action (for example, Start Ride) must be reflected by the overlay; an overlay action (for example, End Ride or Cancel Ride) must be reflected by the PWA main screen. Apply the same rule to shift start/end and all shared driver lifecycle actions.
- Propagate committed state changes to every currently active surface in real time through a typed, versioned event/state subscription. The Capacitor bridge must support bidirectional communication: PWA-to-native commands and native-to-PWA state/event notifications. The overlay must also observe changes originating in the PWA/WebView.
- The overlay must remain able to issue driver actions when the WebView is paused, recreated, or not currently visible. It must submit through the same domain transition contract and durable journal, not create a parallel record.
- Both surfaces render from the shared state projection and its revision. On opening/resuming, each surface must fetch/reconcile the latest durable revision before enabling actions; do not rely only on events that may have been missed while a surface was inactive.
- Give each command a stable command/event ID, origin surface (pwa or native_overlay), transition timestamp, expected prior state/revision, and idempotency key. Preserve the originating event's identity through GPS acquisition, persistence, and propagation.
- A command is acknowledged visually immediately as received/pending, without waiting for GPS or storage I/O. Both surfaces show consistent pending/completed/needs-attention status; neither may claim the business transition is recorded until the shared durable transition and required GPS evidence are committed.
- Persist the transition and resulting state revision once in the authoritative local journal/repository. Notify the other surface only after the durable commit; retries and duplicate notifications must be idempotent.
- Serialize state-changing commands through one ordered transition coordinator. Validate each command against the latest committed state/revision. If near-simultaneous actions conflict (for example, End Ride and Cancel Ride), accept at most one valid transition, reject/stale-mark the other with a clear explanation, and never let surfaces display contradictory final states.
- Do not use network/cloud sync as the mechanism between the PWA and overlay on the same device. Local native event/state delivery must work offline; Dropbox/cloud services are for backup and external recovery, not live control synchronization.
- If one surface is disconnected or misses a notification, it must catch up from the durable state revision on reconnect/resume. Show a subtle stale/syncing status while reconciling, then render the latest state.
- Timer displays on both surfaces derive from the same persisted transition instants and must agree, including after either surface is recreated or the phone reboots.
- GPS remains event-triggered only. Cross-surface state propagation must not start continuous GPS or create extra location requests; the single accepted transition owns its one event-scoped GPS acquisition.


## Header internet access control

- Display an Internet icon immediately beside the GPS icon in the PWA header and native Android-facing header/status surface.
- Tapping it exposes the persisted app-level Internet Access toggle and a clear status: policy disabled, device offline, connecting/working, or service/authentication error.
- This is not an Android runtime permission request. Android's `INTERNET` permission is normally declared in the manifest and granted at install time; the in-app toggle controls whether Sam Travels initiates network requests.
- PWA and native surfaces use one shared persisted policy and propagate changes locally/offline. The choice survives app restart and device reboot.
- All native and web network clients must consult the same versioned policy gateway. No direct SDK/client/network call may bypass it.
- Turning access off prevents new optional requests and safely defers eligible work; it must not interrupt local driver actions or discard records. Distinguish app policy from actual network connectivity and Dropbox authentication.
- Keep the shell and core workflows available offline; remote assets and optional services must not be startup dependencies.

## Durable state restoration and device interruption

- Room/native journal and the versioned domain repository are the durable source of truth. React component state, WebView memory, service instances, and timer counters are never authoritative.
- Persist the current business state and every accepted transition locally, including active shift, current ride/approach status, pending GPS/event operations, and event timestamps. Do not rely on an in-memory service surviving.
- On application launch, WebView recreation, Android process recreation, or device reboot, load and validate durable state before presenting the operational screen. Restore the same active shift/trip/workflow state; do not silently reset to idle or ask the driver to recreate records.
- Use boot-aware recovery and idempotent journal replay. Re-register eligible pending work after reboot where Android permits. A force-stop or OS restriction may defer execution until the user next opens the app; preserve pending state and explain it rather than dropping it.
- Commit each transition and its state change atomically in the authoritative local store where possible. Keep an outbox for cross-store reconciliation and retry without duplicate records.
- Startup recovery and migrations must be non-destructive. If integrity validation fails, preserve original data and present a recovery path rather than clearing the database.


## Background and recovery behavior

- Do not run a persistent location foreground service for continuous GPS; this product does not require continuous tracking.
- Use a short-lived, policy-compliant execution mechanism for event-scoped acquisition where required by the Android version. A foreground service and notification must only be used when the specific operation and current Android policy justify them; do not keep one alive between events.
- Use WorkManager for deferrable/retryable work such as backup and later reconciliation, not as a substitute for immediate event-time GPS acquisition.
- Use wake locks sparingly, with bounded acquisition and guaranteed release paths.
- Handle Doze, app standby, process death, reboot, permission revocation, and OEM battery restrictions. Persist pending intents so they can be recovered; report when Android prevents immediate completion.
- Request battery-optimization exemptions only when justified, with an explanation; never imply Android can guarantee uninterrupted execution.
- On restart, reconcile pending event intents and their event status without fabricating a GPS snapshot or creating duplicate transitions.

## Android database ownership and transaction boundary

- Room stores the complete installed-app business dataset: shifts, trips/log book, finance, vehicle, maintenance, compliance, performance source records, admin settings, driver state projections, immutable transition events, pending GPS work, and recovery/outbox metadata.
- The overlay and WebView must call the same application use cases and Room-backed repositories. They must not keep separate writable business-state copies.
- A business transition's Room transaction commits the accepted event/evidence/status and resulting authoritative state revision together wherever technically possible. Publish notifications to the other surface only after commit.
- External side effects (bridge notifications, optional network requests, Dropbox transport) are not part of a Room transaction. Represent required follow-up work with durable outbox entries committed alongside the business change, then process them idempotently.
- IndexedDB is used as the authoritative adapter only in browser-only mode. On Android, it may hold disposable presentation/cache data only if explicitly documented; it must never be used as a second business source of truth or as a required recovery dependency.
- Never attempt an implicit dual write to Room and IndexedDB. Import/export between browser and Android is a separately validated user/data migration workflow.
- Database migrations are versioned, transactional where supported, repeatable-safe, and tested from supported prior versions. Preserve source data and a recoverable checkpoint on failure; never silently reset the database.

## Durable event capture

1. On gesture receipt, create a stable event ID/idempotency key and capture the transition timestamp.
2. Immediately update the UI to a non-blocking pending state; do not wait for GPS.
3. Enqueue the pending intent durably in Room using background I/O.
4. Acquire a fresh GPS fix for that event and validate it against the named, versioned reliability policy.
5. Commit the transition, GPS snapshot, and native journal status to Room in a transaction.
6. Reconcile the journal into web/domain storage asynchronously.
7. Mark the event reconciled only after the receiving transaction commits.
8. Replay safely after crashes; duplicates must be idempotently ignored.

## Clock and timer continuity

- Persist transition instants as UTC instants and retain the Asia/Kolkata business-date context.
- Derive active and completed durations from persisted start/end instants. Never store an incrementing UI counter as the source of truth.
- Recalculate active timers from the current system wall clock after process restart and device reboot, so elapsed time while the phone was switched off is included.
- Use monotonic elapsed time only as an in-boot measurement/consistency aid; it resets on reboot and cannot replace persisted wall-clock instants for cross-reboot duration.
- Detect clock discontinuities using persisted wall-clock/monotonic/boot-session anchors where available. Flag suspicious changes for review; do not silently rewrite historical event timestamps.
- Network time can corroborate device time when available but must not be required. If the offline device clock is manually changed while powered off, exact elapsed real-world time cannot be guaranteed; surface that uncertainty.
- Timers must restore from persisted state and update from real elapsed time, including periods when the app was closed or the device was off. Durations over 24 hours must not wrap.


## Bridge contract

- Typed request/response payloads with explicit contract versions.
- Explicit capability and permission status.
- Structured errors (permission denied, unavailable, transient failure, invalid request, persistence failure, location timeout/unavailable).
- Bridge calls must be safe across WebView recreation and plugin reinitialization.
- Bridge APIs must expose asynchronous status/events without making the presentation layer await background completion to remain responsive.

## Validation

Test on physical Android devices for immediate gesture feedback under slow/cold GPS, offline transitions, GPS unavailable, permission revoke/grant, overlay enabled/disabled, WebView reload, app process kill, battery exhaustion, shutdown, device reboot, Doze, and representative OEM battery settings. Verify active state and timers restore after reboot and include powered-off elapsed time; test clock changes and flag uncertainty. Verify no continuous location listener/polling exists. Verify all native I/O and location work stay off the main thread. Emulator success alone is insufficient for release claims.

## Crash-safe transition transaction and recovery

The native implementation must conform to [the Transaction and Recovery Contract](TRANSACTION_AND_RECOVERY_CONTRACT.md). Room first durably queues each command intent; after the event-scoped GPS fix is validated, one completion transaction commits event/evidence, projection/revision, terminal status, and outbox. A failed completion leaves the prior intent recoverable and must not publish a committed revision. Outbox and bridge delivery are at-least-once and idempotent. Recovery must tolerate every documented crash window, preserve the original transition instant, and never backdate a later GPS fix.
