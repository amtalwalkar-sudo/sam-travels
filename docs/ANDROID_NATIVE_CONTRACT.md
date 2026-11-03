# Native Android Contract

Capacitor and the native Android layer are mandatory parts of the Sam Travels foundation. Browser/PWA code must not simulate guarantees that only Android can provide.

## Responsibilities

- React/PWA owns presentation and user workflows.
- Capacitor provides a versioned, typed bridge.
- Kotlin plugins expose narrow capabilities.
- Android services own long-running or OS-integrated work permitted by the installed Android version and device policy.
- Room stores native-critical journal/state that must survive WebView reloads and app process death.

## Overlay

- Use a native Android overlay; request `SYSTEM_ALERT_WINDOW` only when the user enables the feature.
- Explain why the permission is needed and provide a clear disabled state when it is denied or revoked.
- Overlay lifecycle must be independent of a particular WebView instance.
- Overlay visibility is impossible while the display is physically off; resume/reconcile when the display wakes.
- The overlay is a separate presentation feature and is not a prerequisite for shift GPS tracking or background services.

## Location acquisition and shift-scoped background service

- Provide a Capacitor location bridge backed by Android location APIs for native Android operation and browser geolocation for active PWA operation.
- Acquire GPS offline; internet/network assistance may improve time-to-fix but is never mandatory.
- For required state transitions, continue acquiring until a fix passes the configured accuracy and freshness policy. Do not finalize or acknowledge a transition with an unreliable/missing fix.
- Store fix timestamp and transition timestamp separately, along with coordinates, horizontal accuracy, and source.
- Starting a shift must start the native location foreground service and shift-scoped background workers, irrespective of overlay permission, overlay visibility, or overlay running state.
- Continue shift-scoped location collection while the shift is active, including app background and screen-off periods, subject to granted permissions and Android execution/power policy.
- Ending the shift must durably capture the end GPS snapshot and transition, then stop shift-scoped continuous tracking/background work.
- The overlay must not control the lifecycle of location tracking. Disabling or losing overlay permission must not stop GPS collection during an active shift.
- Do not continuously track when no shift is active, except for the user-initiated GPS fix required to start a shift.
- Background tracking requires appropriate location permissions, including background-location access where required by the Android version and use case, and a policy-compliant location foreground service with the required persistent notification. Request and explain these permissions before shift start.
- If permission is denied/revoked, location services are disabled, or Android stops/restricts the service, expose the failure and record a tracking gap when possible. Never claim complete coverage or fabricate coordinates.
- The screen being off prevents overlay display, not by itself the intended shift-tracking lifecycle. Screen-off execution remains subject to Android foreground-service rules, Doze, OEM restrictions, and user permissions.
- Use WorkManager for deferrable/retryable work, not as a substitute for continuous GPS sampling.

## Background and screen-off behavior

- Use a foreground service only for user-noticeable work that qualifies under current Android foreground-service policy, with required notification and declared service type.
- Use WorkManager for deferrable/retryable jobs, including scheduled backup work.
- Use wake locks sparingly, with bounded acquisition and guaranteed release paths.
- Handle Doze, app standby, process death, reboot, permission revocation, and OEM battery restrictions.
- Request battery-optimization exemptions only when justified, with an explanation; never imply Android can guarantee uninterrupted execution.
- Register boot recovery only for supported, policy-compliant use cases. If an active shift is recovered after process/device restart, reconcile the persisted shift state and resume tracking only when permissions and Android policy allow.

## Durable event capture

1. Validate the event and assign a stable event ID/idempotency key.
2. For a GPS-required transition, acquire and validate the fix before finalizing the transition.
3. Commit transition, GPS snapshot, and native journal event to Room in a transaction.
4. Acknowledge success to the bridge only after commit.
5. Reconcile the journal into web/domain storage asynchronously.
6. Mark the event reconciled only after the receiving transaction commits.
7. Replay safely after crashes; duplicates must be idempotently ignored.

## Bridge contract

- Typed request/response payloads with explicit contract versions.
- Explicit capability and permission status.
- Structured errors (permission denied, unavailable, transient failure, invalid request, persistence failure, location timeout/unavailable).
- No silent fallback from native durable capture to volatile JavaScript memory.
- Bridge calls must be safe across WebView recreation and plugin reinitialization.

## Validation

Test on physical Android devices across screen on/off, WebView reload, app process kill, device reboot, permission revoke/grant, offline transitions, overlay enabled/disabled, shift start/stop, GPS cold/warm fix, stale/inaccurate fix rejection, and representative OEM battery settings. Emulator success alone is insufficient for release claims.
