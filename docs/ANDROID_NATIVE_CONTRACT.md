# Native Android Contract

Capacitor and the native Android layer are mandatory parts of the Sam Travels foundation. Browser/PWA code must not simulate guarantees that only Android can provide.

## Responsibilities

- React/PWA owns presentation and user workflows.
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

## Background and recovery behavior

- Do not run a persistent location foreground service for continuous GPS; this product does not require continuous tracking.
- Use a short-lived, policy-compliant execution mechanism for event-scoped acquisition where required by the Android version. A foreground service and notification must only be used when the specific operation and current Android policy justify them; do not keep one alive between events.
- Use WorkManager for deferrable/retryable work such as backup and later reconciliation, not as a substitute for immediate event-time GPS acquisition.
- Use wake locks sparingly, with bounded acquisition and guaranteed release paths.
- Handle Doze, app standby, process death, reboot, permission revocation, and OEM battery restrictions. Persist pending intents so they can be recovered; report when Android prevents immediate completion.
- Request battery-optimization exemptions only when justified, with an explanation; never imply Android can guarantee uninterrupted execution.
- On restart, reconcile pending event intents and their event status without fabricating a GPS snapshot or creating duplicate transitions.

## Durable event capture

1. On gesture receipt, create a stable event ID/idempotency key and capture the transition timestamp.
2. Immediately update the UI to a non-blocking pending state; do not wait for GPS.
3. Enqueue the pending intent durably in Room using background I/O.
4. Acquire a fresh GPS fix for that event and validate it against the named, versioned reliability policy.
5. Commit the transition, GPS snapshot, and native journal status to Room in a transaction.
6. Reconcile the journal into web/domain storage asynchronously.
7. Mark the event reconciled only after the receiving transaction commits.
8. Replay safely after crashes; duplicates must be idempotently ignored.

## Bridge contract

- Typed request/response payloads with explicit contract versions.
- Explicit capability and permission status.
- Structured errors (permission denied, unavailable, transient failure, invalid request, persistence failure, location timeout/unavailable).
- Bridge calls must be safe across WebView recreation and plugin reinitialization.
- Bridge APIs must expose asynchronous status/events without making the presentation layer await background completion to remain responsive.

## Validation

Test on physical Android devices for immediate gesture feedback under slow/cold GPS, offline transitions, GPS unavailable, permission revoke/grant, overlay enabled/disabled, WebView reload, app process kill, device reboot, Doze, and representative OEM battery settings. Verify no continuous location listener/polling exists. Verify all native I/O and location work stay off the main thread. Emulator success alone is insufficient for release claims.
