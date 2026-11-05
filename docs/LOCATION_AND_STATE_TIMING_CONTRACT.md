# GPS Evidence and State Timing Contract

## Required event snapshots

Capture a separate GPS snapshot for each of these user-triggered state transitions:
- Shift start
- Shift end
- Trip creation / entry into Going to pickup
- Start ride
- End ride
- Ride cancellation, at the cancellation location

Trip creation and Start ride are distinct events. Do not reuse the trip-creation fix as Start ride evidence. Each accepted transition owns its own event ID, original transition timestamp, and GPS acquisition.

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

- GPS acquisition is initiated only by the six user-triggered transition events above. No shift-scoped continuous GPS service, periodic sampling, or idle background location collection is required or permitted by this product contract.
- The native overlay is a separate UI feature. Overlay enabled/disabled/visible state must not gate event-based GPS acquisition.
- The trip-creation / Going-to-pickup event is a required event-scoped GPS boundary in addition to Start ride, End ride, and cancellation. A trip-creation fix must never stand in for a later Start ride fix.
- A transition GPS request may continue asynchronously while the app is backgrounded only as permitted by Android permissions and policy; do not keep a permanent location foreground service running between events.
- The PWA/browser may provide foreground location while active, but Capacitor's native Android bridge is responsible for event capture in the installed Android app.
- Offline operation is mandatory: location acquisition and event persistence must not depend on internet. Queue non-essential network synchronization for later.
- Request only the Android location permissions required for event-based acquisition. Explain permission needs and provide a clear recoverable path when permission is denied or revoked.
- Handle process death and device restart by recovering pending event intents from durable storage and resuming/reconciling them when permitted. Android may restrict execution; never claim unconditional background execution.
- If the OS or permissions prevent acquisition, preserve the pending event and record the failure/reason when possible. Never invent interpolated GPS points or pretend a snapshot was captured.

## State continuity and restart recovery

- The persisted business state is authoritative; in-memory React state, view state, timers, and Android service instances are disposable caches only.
- Persist every accepted domain transition and its pending/completed status locally. On app launch, WebView recreation, process restart, or device reboot, reconstruct the current state from the durable event journal/repositories before enabling conflicting actions.
- Restore whether the shift is active, whether a ride is in accepted/approach/in-progress/cancelled/completed state, any pending transition/GPS acquisition, and any other in-progress workflow. Do not reset an active shift or trip merely because the app or phone restarted.
- Recovery must be idempotent. Replaying events must not duplicate trips, shifts, payments, or interval boundaries. If data stores disagree, reconcile using stable event IDs/revisions and expose unresolved conflicts instead of guessing.
- Persist pending writes/outbox entries before relying on background sync. Network loss must not erase or roll back committed local work.
- Create and validate schema migrations and recovery checkpoints; never silently clear or replace data after a startup/migration failure. If recovery is incomplete, show a clear recoverable state and preserve the underlying records.
- On restart, calculate elapsed time from persisted event instants and current time, not from a saved counter or the time the app last ran.


## State durations and timers

Maintain event-driven state intervals rather than relying on a UI interval as the source of truth. Persist state-entered and state-exited timestamps; calculate duration from those timestamps so app restarts, WebView reloads, and process death do not reset elapsed time.

Required duration measures:
- Shift duration: shift start to shift end. The driver-facing Work screen does not show a prominent continuously running shift timer; show total elapsed shift duration when the driver goes Offline and after the shift has ended. This presentation choice does not remove durable interval timing, recovery, or reporting.
- Ride duration: Start ride to End ride; while active, show elapsed time.

### 04:00 logical-shift rotation
- At 04:00 Asia/Kolkata, rotate the logical shift automatically while preserving the driver's continuous Online session. This is not an Offline/Online transition and must not be rendered as one.
- Assign each trip to the logical-shift ID active when that trip is created. A trip crossing 04:00 remains wholly assigned to its creation shift; trips created at or after 04:00 use the new logical shift.
- Persist the boundary and new logical-shift identity with stable identity/idempotency so delayed startup, offline operation, process death, or reboot can recover exactly one boundary without duplicate shifts.
- Do not interrupt an active trip with an odometer-confirmation prompt. If a trip is active at 04:00, defer the new shift's odometer confirmation until the trip is resolved: after the cancellation-fee form is saved for a cancelled pickup-approach trip, or after the Fare form is saved for a completed ride. If no trip is active, present the confirmation at the boundary.
- Prefill the new logical shift's odometer confirmation with the last confirmed odometer reading. Allow the driver to confirm or edit it; an upward edit is recorded as personal kilometres under the approved driver-workflow rule.
- The automatic logical boundary is a system-generated shift-segmentation event, not a fabricated driver action. Preserve its actual 04:00 local boundary instant and timezone context. Do not invent a GPS fix for it; GPS evidence rules continue to apply to actual user-triggered shift/trip events defined by the driver workflow contract.
- Pickup approach duration: entering the going-to-pickup state (ride accepted/approach begins) until pickup/trip start, or until ride cancellation if cancelled first.
- Cancellation closes the active approach interval and records the cancellation GPS snapshot/time. A cancelled ride must not later accrue ride duration unless a new trip is explicitly created and its Start ride event is recorded.

Timer continuity rules:
- The authoritative elapsed duration is the difference between the persisted start instant and the current instant, or between persisted start and end instants for a closed interval. Never increment a counter as the source of truth.
- A timer must include time spent while the app is backgrounded, the process is dead, or the phone is powered off. Example: a shift started at 08:00 and phone restarted at 12:30 must resume at approximately 04:30:00 elapsed, not at 00:00 or 03:00.
- Persist UTC instants for all transition times. Use the device's current wall-clock instant to recalculate elapsed duration after reboot; monotonic clocks are useful within one boot session but cannot alone account for time across reboot.
- Detect suspicious system-clock changes or time inconsistencies using stored clock/boot anchors where available. If the device clock appears to have moved materially backwards/forwards, flag the timer/time-integrity issue and provide a controlled correction/review path.
- When network time is available, use it as a corroborating clock reference, not a dependency for offline operation. If the device is offline and its clock was manually changed while powered off, exact real-world elapsed time cannot be independently known; surface uncertainty rather than fabricate precision.
- Refresh timers from the current instant when the app resumes. Timer calculation must not depend on GPS or internet.


Represent intervals with a start event, optional end event, status, and derived duration. Do not overwrite historical intervals when correcting a transition; use an auditable correction/reversal event. Timers are derived from persisted timestamps and do not require GPS to run.

## Clock presentation

- Display the live wall clock in the `Asia/Kolkata` timezone using 24-hour `HH:mm:ss` format.
- Display elapsed durations in `HH:mm:ss`; elapsed hours may exceed 23 and must not wrap at midnight.
- The UI clock is a presentation of the current time, not the authoritative source for persisted event timestamps.
- Persist UTC instants and the relevant local business date/time-zone context. Derive India-local display values with the IANA timezone `Asia/Kolkata`.
- On resume/restart, recompute all live elapsed values from persisted timestamps and the current clock; never resume from a stale in-memory counter.

## Acceptance tests

- Verify no continuous GPS requests, periodic polling, or location listener exists between transition events or during an otherwise active shift.
- Verify each of the six required event types (shift start/end, trip creation, Start ride, End ride, cancellation) starts its own fresh GPS acquisition and stores the correct event/fix timestamps.
- Verify swipe feedback and screen interaction remain immediate and smooth while GPS is delayed, unavailable, offline, or retrying.
- Verify GPS callbacks, Room writes, and reconciliation never run on or block the UI/main thread.
- Verify pending intent is durably queued with a stable ID and survives WebView reload/process death; retries do not duplicate events.
- Verify rapid successive valid actions preserve event order and each receives its own GPS snapshot; no event is dropped or assigned another event's fix.
- Reject fixes older than 30 seconds or worse than 50 metres under `gps-event-fix-v1`; accept only a fix meeting both limits.
- Verify the transition remains visibly pending while GPS acquisition is in progress and is not falsely marked complete.
- Verify offline GPS fix acquisition and transition persistence with no internet connection.
- Verify permission denial, location disabled, timeout, and persistence failure produce clear non-blocking recoverable states.
- Verify overlay enabled/disabled state does not affect event-based GPS acquisition.
- Verify pending event recovery after process kill, battery exhaustion, shutdown, and reboot; preserve original event timestamp and never invent an event-time GPS fix.
- Verify active shift, ride, pickup approach, and pending workflows restore to the correct state after reboot.
- Verify timers include elapsed time while app is closed and phone is powered off; test normal reboot and simulated clock changes.
- Verify clock rollback/forward anomalies are flagged and do not silently corrupt historical durations.

- Verify shift, trip, and pickup approach durations across midnight, WebView reload, process death, and device reboot/recovery. Verify the Work screen does not show a prominent live shift timer while retaining correct shift-duration results at shift end and in history.
- Verify the 04:00 Asia/Kolkata boundary rotates the logical shift without interrupting Online status or creating an Offline/Online transition.
- Verify trips created before 04:00 remain assigned to the previous logical shift even when they end after 04:00, and trips created at/after 04:00 use the new logical shift.
- Verify a trip active at 04:00 is not split and no odometer prompt appears during pickup approach or an active ride; verify the prompt appears only after cancellation-fee save or Fare save, respectively.
- Verify the boundary and new logical-shift identity recover exactly once after app closure, offline operation, process death, and reboot; retries must not create duplicate shifts.
- Verify cancellation closes the pickup approach timer and records location at cancellation.
- Verify India clock formatting and elapsed duration formatting, including durations longer than 24 hours.

## Reliability policy and time-integrity decision gates

The location reliability policy must be named and versioned (for example, a policy identifier plus semantic version) and persist the policy version used with each accepted snapshot. It validates at minimum coordinate range, horizontal accuracy, fix age relative to the transition, provider availability, and permission state. The approved version-1 policy is **`gps-event-fix-v1`**: horizontal accuracy must be **50 metres or better**, and the GPS fix must be no more than **30 seconds old relative to the original transition timestamp**. Persist the policy version used with each accepted snapshot. These are strict acceptance limits, not a promise that every environment can obtain a qualifying fix. A fix outside either limit is rejected for normal event completion; retain the durable pending intent and enter the recoverable retry/needs-attention path. Never fall back silently to last-known location. A later post-restart fix keeps its real timestamp and is recovery evidence, not proof of the original event-time location. Policy changes require a new version and must not relabel historical snapshots.

A fix that arrives after restart is timestamped when actually acquired. It may be accepted as a later recovery fix only with an explicit recovery/degraded-evidence status and user-visible meaning; it must never be represented as proof of the original transition location/time. If the product requires strict event-time proof, the transition remains needs-attention until a compliant fix can be obtained or an auditable manual resolution is made.

Clock integrity:
- Store the UTC wall-clock instant and Asia/Kolkata business-date context for each transition.
- Where available, persist monotonic elapsed-time and boot-session anchors alongside wall-clock time to detect discontinuities; do not use monotonic time as a cross-reboot absolute clock.
- Detect backward/forward jumps, impossible ordering, timezone changes, and discrepancies between event ordering and stored instants.
- Never silently reorder or rewrite immutable event timestamps. Preserve event sequence/revision separately from wall-clock values.
- If exact elapsed time cannot be trusted after an offline clock change during power-off, flag uncertainty and require review/correction through an auditable event.
