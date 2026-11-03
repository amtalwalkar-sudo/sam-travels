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

## Background capture boundary

- PWA/browser geolocation may be used while the app is active and the browser grants permission, but it cannot promise reliable continuous background operation.
- Background GPS tracking is permitted only while the native Android overlay feature is enabled and native code confirms the overlay/service is actually running and the required permissions are valid.
- If the overlay stops, is disabled, or loses required permissions, stop background location collection and expose a clear unavailable/degraded state. Do not continue hidden background tracking.
- This is an explicit product privacy boundary: no background location collection outside the active native overlay operating state.
- The overlay cannot be visible while the physical display is off. Native location/service behavior while screen-off remains subject to Android version, foreground-service policy, user permissions, and OEM battery controls; do not promise uninterrupted operation.
- A transition initiated by the user must still obtain its required fix and durably save its event even when offline. If Android has suspended execution, resume and reconcile when the OS allows; do not falsely acknowledge completion.

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
- Verify background location starts only when native overlay operation is confirmed and stops when overlay operation ends.
- Verify shift, trip, and pickup approach durations across midnight, WebView reload, process death, and device reboot/recovery.
- Verify cancellation closes the pickup approach timer and records location at cancellation.
- Verify India clock formatting and elapsed duration formatting, including durations longer than 24 hours.
