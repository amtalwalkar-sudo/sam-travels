# Native Driver Overlay Contract

Status: approved product and platform contract; implementation and acceptance are tracked separately.
Scope: the native Android driver overlay and its interaction with the Sam Travels PWA, including visibility, operational actions, minimize/restore presentation, shared forms, lifecycle, accessibility, and verification.
Authority: this is the single normative contract for overlay-specific behaviour and duties. Other documents may define shared domain, persistence, transaction, security, GPS/time, or architecture guarantees, but must not define a competing overlay interaction or lifecycle contract.

## 1. Purpose and boundary

- The native overlay is an optional, compact operating surface for the driver's existing Work/Shift and Trip workflow. It is not a separate application, workflow, state machine, or business authority.
- The PWA remains the controller of shift start and shift end. The overlay has no Start shift or End shift control and cannot independently create, end, or otherwise own a shift.
- The overlay may issue the same valid trip actions as the PWA through the shared versioned application command boundary.
- Overlay presentation, gesture state, bubble position, timers, and Android service instances are disposable UI state. They are never authoritative business state.
- The overlay is not required for GPS acquisition, durable event capture, recovery, or normal PWA operation.

## 2. Availability, permission, and visibility lifecycle

- The overlay is user-enabled. Request Android `SYSTEM_ALERT_WINDOW` permission only when the user enables the feature, explain why it is needed, and provide a clear disabled state when permission is denied or revoked.
- Permission denial/revocation or user disablement affects overlay availability only. It must not block otherwise valid PWA operations or create a second shift state.
- When enabled and authorized, show the operational overlay only after the PWA-controlled shift-start transition has durably committed.
- Keep the overlay available through the active shift, including when the WebView is paused, recreated, or not visible.
- Dismiss both the operational panel and minimized bubble only after the shift-end transition has durably committed. A failed, rejected, or pending shift start/end must not be represented as completed by overlay visibility changes.
- Visibility is a projection of the authoritative durable shift state. On service start, process restart, WebView recreation, overlay reattachment, app resume, and display wake, reconcile the latest durable state before showing operational controls.
- Android cannot display an overlay while the physical display is off. Reconcile and restore the correct panel/bubble state after the display wakes if the shift remains active and the feature remains enabled/authorized.
- The overlay lifecycle must not depend on a particular WebView instance.

## 3. Operational panel and supported actions

- The expanded overlay is a focused operational panel showing the current durable driver state, the next valid action, relevant elapsed time, and any required pending form or recoverable status.
- Its trip actions are: create trip / enter Going to pickup, Start ride, End ride, and Cancel ride before Start ride. Only actions valid for the current committed state are enabled.
- The overlay must not expose Start shift or End shift controls. Shift start/end remain PWA-controlled.
- The PWA and overlay use the same versioned state-aware swipe/action contract (`contracts/driver-swipe-presentation-v1.json`) where the workflow specifies a swipe bar. Shared visual tokens are defined separately in `contracts/driver-presentation-v1.json`; both platform adapters consume those tokens while allowing the overlay a compact layout. Presentation changes must not redefine workflow validity, form semantics, persistence, or command ownership: action label, valid state, enabled/pending behaviour, gesture threshold, reset behaviour, and accessibility semantics. Either surface may issue a valid action.
- Immediate gesture feedback may acknowledge receipt/pending only. It must not claim a business transition is committed before the shared durable command succeeds.
- Do not add map, dispatch, passenger-booking, fleet-management, or unrelated controls to the overlay.

## 4. Minimize, bubble, and restore interaction

The overlay supports both approved minimization gestures and a compact, movable restore bubble:

1. **Dragging the expanded overlay to minimize:** the driver can drag the operational overlay to its defined minimize target/threshold to minimize it.
2. **Upward-swipe minimization:** an upward swipe that crosses the defined gesture threshold minimizes the operational overlay. It must be recognized as a minimize gesture, not accidentally dispatch or duplicate a driver workflow action.
3. **Draggable, dockable bubble:** minimized mode is a compact bubble. The driver can drag it to reposition it and dock it to either the left or right screen edge. Docking must keep the bubble reachable and avoid placing it outside the usable display area.
4. **Tap to restore:** tapping the bubble restores the operational panel. The same active workflow state and any open/in-progress financial or cancellation form must be presented; restoration must not create a new trip, repeat a command, reset a timer, or discard user input.

Additional interaction requirements:

- Minimize/restore and bubble movement are presentation-only operations. They do not change shift/trip state, timestamps, event history, GPS acquisition, financial status, or durable command revisions.
- The bubble may show the current state-interval elapsed timer. Derive it from persisted state-entry timestamps and the shared clock/timing rules; never maintain a separate incrementing timer as authority.
- Persist bubble position/dock side only as a presentation preference if persistence is implemented. Losing that preference must not affect business records or prevent restore.
- Gesture hit targets and thresholds must distinguish panel drag, upward minimize, bubble drag, bubble tap, and workflow swipe actions. Gesture cancellation/interruption must leave business state unchanged.
- Provide an accessible explicit Minimize control and an accessible bubble action named to restore the driver panel. Gesture-only operation is insufficient. The explicit control must produce the same minimized state as the gestures.
- Respect system insets, display cut-outs, edge areas, and usable screen bounds. The docked bubble must remain tappable and must not obscure required system affordances.
- Do not introduce an additional floating bubble, duplicate overlay window, or competing overlay state owner.

## 5. Shared workflow, state, and commands

- PWA and native overlay are two clients of one driver workflow, not separate state machines.
- Both surfaces use the same versioned application commands, domain transition policy, validation, calculations, durable records, and pending/finalization states.
- On installed Android, Room is the sole authoritative local business store. The WebView and overlay use the same Room-backed application/repository boundary. Browser-only PWA operation uses the corresponding IndexedDB adapter under the same domain/application contracts.
- An action from either surface is validated against the latest committed state/revision and persisted once. Committed changes propagate locally to the other active surface; cloud/Dropbox sync is not used for same-device live synchronization.
- The overlay remains able to issue valid driver actions when the WebView is paused, recreated, or absent. It must not create parallel records or maintain a writable business-state copy.
- Each command retains its stable ID, origin surface, transition timestamp, expected prior state/revision, and idempotency key through persistence, recovery, and propagation.
- On attach/resume/reconnect, reconcile from the latest durable revision rather than trusting missed notifications or view memory.
- Both surfaces display consistent pending, completed, rejected, and needs-attention states. A stale surface must reconcile before enabling state-changing actions.
- Timer values and state intervals derive from the same persisted transition instants and agree across PWA, expanded panel, and bubble.

## 6. Forms and financial workflow parity

- The overlay supports the complete trip and financial workflow required by the driver contract: Fare (including explicit zero), optional Toll and Parking for completed rides, independent Driver/Customer payer selection for each entered amount, mandatory cancellation-fee entry (including explicit zero), and resumption/completion of pending financial entry.
- Empty and explicit zero remain distinct. Required Fare/cancellation-fee validation and optional Toll/Parking semantics are identical on PWA and overlay.
- All forms use the same versioned form definitions, field semantics, domain/application validation, calculations, commands, and durable persistence. The overlay is only a presentation adapter; it must not implement overlay-specific financial rules or write business records directly.
- Present a required form on the surface the driver is actively using where supported by the shared form workflow. If a form is pending or interrupted, preserve its recoverable working copy and durable workflow status so it can be resumed from either surface without duplicate submission.
- Minimize, drag, dock, tap-to-restore, WebView recreation, service recreation, and process restart must not discard form values, change the form's business identity, or silently submit it.
- Completed ride and financial finalization remain distinct when Fare is pending. A cancelled trip's mandatory cancellation-fee entry remains distinct from Fare and has no Toll/Parking fields.
- Odometer requirements remain governed by the shared shift/odometer application contract. If odometer entry is hosted by the overlay, it must call the same use case and validation as the PWA.

## 7. Durability, transaction, and recovery duties

- Durable Room state, immutable transition events, pending intents, and the shared repository revision are authoritative. React state, WebView memory, Android service instances, overlay views, gesture progress, and bubble state are disposable.
- The overlay must submit actions through the shared durable-intent and transaction boundary. Visual acknowledgement is not proof of durable acceptance or completion.
- A command may be shown as safely queued only after its authoritative local intent commit. A completed transition is shown only after required event evidence and the authoritative state commit succeed.
- Preserve command/event identity, idempotency, ordered transitions, atomic state/event/outbox completion, and at-least-once recovery as defined by the Transaction and Recovery Contract.
- On process death, service recreation, WebView recreation, or reboot, recover the same active shift/trip and pending workflow from durable state. Never infer an active shift from a stale overlay view or silently reset to idle.
- Recovery must not fabricate GPS evidence, backdate a transition, duplicate a command, create a second trip, or finalize a financial form twice.
- If durable recovery is blocked or integrity cannot be established, show a clear recoverable blocked/needs-attention state and do not enable unsafe actions.
- Overlay presentation operations must never start continuous GPS or create additional event-scoped location requests. GPS remains limited to the six approved driver transition events under the location/time contract.

## 8. Accessibility, responsiveness, and platform constraints

- Keep touch handling and rendering responsive. Gesture feedback must not wait for GPS, database I/O, bridge round-trips, network calls, or recovery.
- Perform Room, GPS, and other blocking work off the Android main/UI thread.
- Expose semantic labels and accessible actions for operational controls, minimize, bubble restore, and current status. Support non-gesture access to minimize and restore.
- Handle touch cancellation, interrupted drags, multi-touch, orientation/size changes, display wake, and system inset changes without altering business state.
- Overlay permission and Android background-execution limits must be reported honestly. Do not claim guaranteed operation while Android prevents execution or the display is off.
- Keep the PWA usable when the overlay is unavailable.

## 9. Required verification and acceptance

Automated tests and CI must verify:

1. Overlay visibility follows only committed PWA-controlled shift start/end state, including failed and pending transitions.
2. Permission denied, revoked, disabled, re-enabled, and granted states affect overlay availability only.
3. Dragging the expanded panel to minimize works and does not dispatch a driver action.
4. Upward-swipe minimization works at the defined threshold and does not dispatch or duplicate a workflow action.
5. Bubble dragging, repositioning, and left/right docking work within usable display bounds.
6. Tapping the bubble restores the operational panel and same durable workflow state.
7. The explicit accessible Minimize and Restore actions produce the same result as their gesture equivalents.
8. Financial and cancellation form values, identity, validation state, and pending status survive minimize/restore, bubble movement, WebView recreation, service recreation, and process restart.
9. Minimize/restore never changes business state, timestamps, event history, GPS requests, financial status, or command revision.
10. PWA-originated and overlay-originated actions converge on one durable state revision; duplicate and conflicting commands remain idempotent and correctly rejected/stale-marked.
11. Timers in PWA, panel, and bubble agree after elapsed time, app backgrounding, process recreation, and reboot, subject to documented device clock limitations.
12. No continuous GPS or extra GPS acquisition is introduced by overlay visibility or presentation gestures.
13. No native database, location, or blocking bridge work runs on the Android main thread.
14. Emulator and physical-device acceptance cover representative display sizes/insets and Android lifecycle restrictions. Emulator CI alone is not physical-device acceptance.

A passing emulator/CI suite does not establish physical-device acceptance. Do not claim release readiness until the applicable platform acceptance gates are complete.

## 10. Contract ownership and change control

- This document is the single authority for overlay-specific duties, visibility, operational actions, minimization gestures, bubble behaviour, restore, form parity, and overlay acceptance tests.
- [DRIVER_WORKFLOW_CONTRACT.md](DRIVER_WORKFLOW_CONTRACT.md) remains the authority for driver business semantics, shift/trip state transitions, odometer rules, and financial meaning. It points to this document for overlay-specific presentation and lifecycle behaviour.
- [ANDROID_NATIVE_CONTRACT.md](ANDROID_NATIVE_CONTRACT.md) remains the authority for Android platform, Room, bridge, permission, service, and native execution guarantees. It points to this document rather than restating overlay product behaviour.
- [TRANSACTION_AND_RECOVERY_CONTRACT.md](TRANSACTION_AND_RECOVERY_CONTRACT.md), persistence, GPS/time, security, lifecycle, feature, and UI/UX contracts retain authority for their cross-cutting guarantees.
- If another document appears to conflict on overlay-specific behaviour, this contract prevails until the conflict is reconciled. Do not add a second overlay interaction specification elsewhere.
- Changes to these overlay behaviours require an explicit product decision, a corresponding update here, and regression tests. Documentation approval does not claim implementation or acceptance.
