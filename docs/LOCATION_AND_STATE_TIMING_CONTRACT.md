# GPS Evidence and State Timing Contract

## Required event snapshots

Capture one GPS snapshot for each of these user-triggered state transitions:
- Shift start
- Shift end
- Ride/trip start
- Ride/trip end
- Ride cancellation, at the cancellation location

This is **event-based location capture, not continuous tracking**. Do not run periodic GPS polling, maintain a location subscription between events, or collect background location merely because a shift is active. Each transition starts a bounded, event-specific acquisition request which ends when a reliable fix is obtained or the request reaches a recoverable failure/timeout state.

Each transition intent has its own stable event ID and event timestamp. Store the GPS fix timestamp separately from the transition timestamp so fix age can be validated and audited.

## Driver interaction and asynchronous acquisition

- The driver's swipe is the immediate command. Recognize it and update the interface with immediate visual feedback; never wait for GPS, network access, or background persistence before responding visually.
- Dispatch GPS acquisition and persistence work asynchronously off the UI/main thread. A slow or cold GPS fix must never freeze, delay, or block swipe recognition, animations, navigation, the live clock, or other presentation updates.
- On swipe, capture the transition intent and its timestamp immediately, assign a stable event ID/idempotency key, and enqueue it for durable local handling. Do not wait for a GPS fix before acknowledging that the gesture was received.
- Distinguish clearly between **action received/pending** and **transition recorded/completed**. Show a concise pending/acquiring-location indicator without blocking the screen or making the driver repeat the gesture. Do not falsely display a completed/successful transition before its required GPS evidence and durable record are committed.
- Persist pending intents promptly to the native Room journal using background I/O. GPS acquisition, Room writes, reconciliation to web storage, and network sync must not execute on the Android main thread or block the React render/gesture thread.
- Keep each event's acquisition associated with that event ID and its original transition timestamp. If several valid actions arrive close together, preserve their order and identity; do not merge, drop, or attach one event's GPS fix to another event. Resolve and commit them through an ordered, idempotent event queue/state machine.
- UI state should be derived from the acknowledged local interaction plus explicit pending/completed/failed event status. Re-rendering or animation must not depend on GPS callbacks.
- If background acquisition or persistence fails, retain the pending intent and show a recoverable status/error. Never silently discard it, fabricate coordinates, or ask the driver to repeat an action that has already been durably queued.

## Reliable-fix acquisition

- For each GPS-required transition, request a fresh fix and continue requesting updates for that event only until a fix meets the configured reliability policy or a recoverable failure/timeout occurs. Stop that event's location request after resolution; do not leave a location listener running.
- Do not mark the transition complete or create a successful transition record with missing, stale, or insufficiently accurate coordinates.
- A reliability policy must validate horizontal accuracy, fix age, coordinate validity, and provider/permission state. Thresholds must be named, configurable through a versioned policy, and covered by tests; never silently label an approximate fix as reliable.
- Show a non-blocking acquiring-location state and, where useful, latest accuracy/age. Preserve the pending transition intent while acquisition continues.
- If permission is denied, location services are disabled, or a reliable fix cannot be obtained, keep the transition pending and explain the blocker without freezing the driver's interface. Do not silently substitute a last-known location.
- When a reliable fix arrives, persist the transition and snapshot durably before reporting completion. Use the event's stable ID so retries cannot create duplicates.
- Capture latitude, longitude, horizontal accuracy in metres, fix timestamp, provider/source, and relevant optional altitude/speed/heading only when available and useful.
- GPS capture must work without internet; GNSS positioning itself does not require mobile data. Network-assisted location may improve acquisition but cannot be a dependency.

## Native platform lifecycle

- GPS acquisition is initiated only by the five user-triggered transition events above. No shift-scoped continuous GPS service, periodic sampling, or idle background location collection is required or permitted by this product contract.
- The native overlay is a separate UI feature. Overlay enabled/disabled/visible state must not gate event-based GPS acquisition.
- A transition GPS request may continue asynchronously while the app is backgrounded only as permitted by Android permissions and policy; do not keep a permanent location foreground service running between events.
- The PWA/browser may provide foreground location while active, but Capacitor's native Android bridge is responsible for event capture in the installed Android app.
- Offline operation is mandatory: location acquisition and event persistence must not depend on internet. Queue non-essential network synchronization for later.
- Request only the Android location permissions required for event-based acquisition. Explain permission needs and provide a clear recoverable path when permission is denied or revoked.
- Handle process death and device restart by recovering pending event intents from durable storage and resuming/reconciling them when permitted. Android may restrict execution; never claim unconditional background execution.
- If the OS or permissions prevent acquisition, preserve the pending event and record the failure/reason when possible. Never invent interpolated GPS points or pretend a snapshot was captured.

## State durations and timers

Maintain event-driven state intervals rather than relying on a UI interval as the source of truth. Persist state-entered and state-exited timestamps; calculate duration from those timestamps so app restarts, WebView reloads, and process death do not reset elapsed time.

Required duration measures:
- Shift duration: shift start to shift end; while active, show elapsed time.
- Ride duration: trip start to trip end; while active, show elapsed time.
- Pickup approach duration: entering the going-to-pickup state (ride accepted/approach begins) until pickup/trip start, or until ride cancellation if cancelled first.
- Cancellation closes the active approach interval and records the cancellation GPS snapshot/time. A cancelled ride must not later accrue trip duration unless a new trip-start event is explicitly created.

Represent intervals with a start event, optional end event, status, and derived duration. Do not overwrite historical intervals when correcting a transition; use an auditable correction/reversal event. Timers are derived from persisted timestamps and do not require GPS to run.

## Clock presentation

- Display the live wall clock in the `Asia/Kolkata` timezone using 24-hour `HH:mm:ss` format.
- Display elapsed durations in `HH:mm:ss`; elapsed hours may exceed 23 and must not wrap at midnight.
- The UI clock is a presentation of the current time, not the authoritative source for persisted event timestamps.
- Persist UTC instants and the relevant local business date/time-zone context. Derive India-local display values with the IANA timezone `Asia/Kolkata`.
- On resume/restart, recompute all live elapsed values from persisted timestamps and the current clock; never resume from a stale in-memory counter.

## Acceptance tests

- Verify no continuous GPS requests, periodic polling, or location listener exists between transition events or during an otherwise active shift.
- Verify each of the five required event types starts its own fresh GPS acquisition and stores the correct event/fix timestamps.
- Verify swipe feedback and screen interaction remain immediate and smooth while GPS is delayed, unavailable, offline, or retrying.
- Verify GPS callbacks, Room writes, and reconciliation never run on or block the UI/main thread.
- Verify pending intent is durably queued with a stable ID and survives WebView reload/process death; retries do not duplicate events.
- Verify rapid successive valid actions preserve event order and each receives its own GPS snapshot; no event is dropped or assigned another event's fix.
- Reject stale and inaccurate fixes; accept only a fix meeting the configured policy.
- Verify the transition remains visibly pending while GPS acquisition is in progress and is not falsely marked complete.
- Verify offline GPS fix acquisition and transition persistence with no internet connection.
- Verify permission denial, location disabled, timeout, and persistence failure produce clear non-blocking recoverable states.
- Verify overlay enabled/disabled state does not affect event-based GPS acquisition.
- Verify shift, trip, and pickup approach durations across midnight, WebView reload, process death, and device reboot/recovery.
- Verify cancellation closes the pickup approach timer and records location at cancellation.
- Verify India clock formatting and elapsed duration formatting, including durations longer than 24 hours.
