# GPS Evidence and State Timing Contract

## Required event snapshots

Capture a GPS snapshot for each of these state transitions:
- Shift start
- Shift end
- Ride/trip start
- Ride/trip end
- Ride cancellation, at the cancellation location

Each accepted transition has an event timestamp and a location snapshot associated with the same event ID. Store the fix's own timestamp separately from the transition timestamp so the age of the fix can be validated and audited.

## Reliable-fix acquisition

- On a transition request, begin or continue GPS acquisition and keep requesting updates until a fix meets the configured reliability policy.
- Do not finalize the transition or save a successful transition record with missing, stale, or insufficiently accurate coordinates.
- A reliability policy must validate horizontal accuracy, fix age, coordinate validity, and provider/permission state. Thresholds must be named, configurable through a versioned policy, and covered by tests; never silently label an approximate fix as reliable.
- Show a clear acquiring-location state and the latest accuracy/age to the user. Preserve the pending transition intent while acquisition continues.
- If permission is denied, location services are disabled, or a reliable fix cannot be obtained, keep the transition pending and explain the blocker. Do not fabricate coordinates or silently substitute a last-known location.
- When a reliable fix arrives, persist the transition and snapshot durably before reporting success. Use a stable event ID so retries cannot create duplicate transitions.
- Capture latitude, longitude, horizontal accuracy in metres, fix timestamp, provider/source, and relevant optional altitude/speed/heading only when available and useful.
- GPS capture must work without internet; GNSS positioning itself does not require mobile data. Network-assisted location may improve acquisition but cannot be a dependency.

## Shift-controlled background operation

- The active shift is the controlling condition for background GPS and related native work. Starting a shift must start the native location-tracking service and required background workers, independently of whether the native overlay is enabled, visible, or operational.
- Keep native GPS collection and durable event capture running for the entire active shift, including when the app is backgrounded or the screen is off, to the extent permitted by Android permissions, OS policy, and device power management.
- Stop shift-scoped continuous GPS collection and shift-scoped background work when the shift ends. Persist the stop transition and final GPS snapshot before reporting shift completion.
- The native overlay is a separate UI feature. Overlay enabled/disabled/visible state must not gate, start, or stop shift GPS tracking.
- Do not collect continuous background location while there is no active shift, except for a user-initiated transition fix needed to start a shift.
- The PWA/browser may provide foreground location while active, but it cannot guarantee continuous background operation. Capacitor's native Android service is responsible for background collection in the installed Android app.
- Offline operation is mandatory: location acquisition and event persistence must not depend on internet. Queue any non-essential network synchronization for later.
- Background location requires the appropriate Android runtime permissions and a policy-compliant location foreground service with its required persistent notification. Explain and request permissions before the user starts a shift; do not imply that a service can run if permission is denied or revoked.
- Handle process death, reboot, Doze, app standby, and OEM battery restrictions with recovery and visible degraded states. Android may restrict execution; never claim unconditional uninterrupted tracking.
- The overlay cannot be visible while the physical display is off. This does not itself stop shift GPS tracking; screen-off tracking is governed by the native service and Android restrictions.
- If the OS or permissions prevent tracking during an active shift, record the tracking gap and its reason when execution resumes. Never invent interpolated GPS points or pretend continuous coverage occurred.

## State durations and timers

Maintain event-driven state intervals rather than relying on a UI interval as the source of truth. Persist state-entered and state-exited timestamps; calculate duration from those timestamps so app restarts, WebView reloads, and process death do not reset elapsed time.

Required duration measures:
- Shift duration: shift start to shift end; while active, show elapsed time.
- Ride duration: trip start to trip end; while active, show elapsed time.
- Pickup approach duration: entering the going-to-pickup state (ride accepted/approach begins) until pickup/trip start, or until ride cancellation if cancelled first.
- Cancellation closes the active approach interval and records the cancellation GPS snapshot/time. A cancelled ride must not later accrue trip duration unless a new trip-start event is explicitly created.

Represent intervals with a start event, optional end event, status, and derived duration. Do not overwrite historical intervals when correcting a transition; use an auditable correction/reversal event.

## Clock presentation

- Display the live wall clock in the `Asia/Kolkata` timezone using 24-hour `HH:mm:ss` format.
- Display elapsed durations in `HH:mm:ss`; elapsed hours may exceed 23 and must not wrap at midnight.
- The UI clock is a presentation of the current time, not the authoritative source for persisted event timestamps.
- Persist UTC instants and the relevant local business date/time-zone context. Derive India-local display values with the IANA timezone `Asia/Kolkata`.
- On resume/restart, recompute all live elapsed values from persisted timestamps and the current clock; never resume from a stale in-memory counter.

## Acceptance tests

- Offline GPS fix acquisition and transition persistence with no internet connection.
- Reject stale and inaccurate fixes; accept only a fix meeting the configured policy.
- Ensure the transition remains pending while GPS acquisition is in progress.
- Verify snapshots for all five required event types and correct event/fix timestamps.
- Verify shift start launches background location regardless of overlay state; shift end stops it.
- Verify tracking continues with overlay disabled, including screen-off/process-death recovery where Android permits.
- Verify tracking gaps caused by permission/OS restrictions are recorded honestly.
- Verify shift, trip, and pickup approach durations across midnight, WebView reload, process death, and device reboot/recovery.
- Verify cancellation closes the pickup approach timer and records location at cancellation.
- Verify India clock formatting and elapsed duration formatting, including durations longer than 24 hours.
