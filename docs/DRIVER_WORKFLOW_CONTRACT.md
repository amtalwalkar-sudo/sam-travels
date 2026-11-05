# Driver Workflow and Business Rules Contract

Status: product workflow decisions approved for documentation; implementation and acceptance are tracked separately.
Scope: the Sam Travels single-driver Work/Shift and Trip/Log Book workflow, including the shared PWA/native Android overlay experience, odometer capture, and trip financial entry.
Authority: this contract owns the driver workflow's product semantics. It supplements, and does not replace, the architecture, feature, transaction/recovery, persistence, Android, GPS/time, security, and UI/UX contracts referenced below.

## 1. Product boundary and governing principles

- Sam Travels is a single-driver digital logbook and business application. The driver manually records shifts and trips. This is not a ride-dispatch, passenger-booking, fleet-management, or driver-assignment system.
- The driver workflow has one domain-owned state machine and one application command pipeline. The PWA and native Android overlay are two presentation surfaces over that same workflow.
- Business rules, validation, calculations, event identity, persistence, and recovery belong to domain/application capabilities. Forms and UI components collect input and render state; they do not own business rules or persistence.
- Core driver operations work offline. Local PWA/overlay synchronization does not use Dropbox or another cloud service.
- Persisted state and immutable event history are authoritative. Screen memory, gesture animations, timers, overlay instances, and WebView instances are disposable.
- All money is stored in integer minor units with explicit currency (initially INR); display formatting must not change stored values.

## 2. Shift lifecycle

### Start shift

- The driver manually switches from Offline to Online to start a shift.
- A shift cannot start until the driver has entered and confirmed the required shift-start odometer reading.
- Shift start records its actual transition timestamp and its own event-scoped GPS evidence under `gps-event-fix-v1`.
- A shift becomes active only after the authoritative durable transition and required evidence are committed. Gesture receipt or a pending GPS request is not a completed shift start.
- A failed or pending start must not cause the overlay to appear as though the shift were active.

### Active shift and going Offline

- One logical shift may contain multiple manually created trips.
- The driver may go Offline at any time except while a ride is active (after Start ride and before End ride).
- A trip created in Going to pickup is a real trip. Before a driver manually ends the shift while that trip is still in pickup approach, the driver must select Cancel trip and complete/save the cancellation-fee form. Only then may the shift end. The trip must never be silently abandoned, deleted, or treated as completed.
- After a trip is cancelled and its cancellation-fee form is saved, the driver remains Online and may create another trip or manually go Offline.
- **04:00 automatic logical-shift boundary:** At 04:00 Asia/Kolkata, KFE closes the previous logical shift and starts a new logical shift while keeping the driver's Online session continuously active. Do not require an Offline/Online toggle and do not represent this as a break in the driver's Online session.
- Trips created before 04:00 remain assigned to the previous logical shift; trips created at or after 04:00 belong to the new logical shift. A trip already in progress at 04:00 remains wholly assigned to the shift in which it was created; never split a trip across shifts.
- The 04:00 boundary is durable, uniquely identified, idempotent, and recoverable if the app is closed, stopped, or offline at that time. Reconciliation must create exactly one boundary/new logical shift, not duplicates.
- The new logical shift's odometer start value is prefilled from the last confirmed odometer reading. The driver may confirm or edit it; an upward edit records the difference as personal kilometres under the approved odometer rule. Keep the confirmation pending until it can be safely presented.
- Do not interrupt an active trip with an odometer pop-up. If no trip is active at 04:00, present the confirmation then. If a trip is in pickup approach, wait until it is cancelled and its cancellation-fee form is saved. If a ride is active, wait until End ride and the Fare form are saved. Then present the odometer confirmation. The Online session remains active throughout.
- A manually ended shift records its actual transition timestamp and its own event-scoped GPS evidence. Its required shift-end odometer reading must be entered before it can end.
- A shift-end command must not be committed while an actual ride remains active or while a pickup-approach trip has not been cancelled and its cancellation-fee form saved.

### Shift duration presentation

- Shift duration is derived from persisted shift-start and shift-end instants and includes time while the app is backgrounded, stopped, or the phone is powered off, subject to the clock-integrity limitations in the GPS/time contract.
- Do not show a prominent continuously running shift timer on the driver-facing Work screen.
- Show the total elapsed shift duration when the driver goes Offline and after the shift has ended.
- This is a presentation decision only. It does not remove durable timestamps, interval calculations, recovery, or reporting of shift duration.

## 3. Trip lifecycle

### Manual trip creation and pickup approach

- The driver manually creates each trip. Never create trips automatically from GPS, motion, elapsed time, or shift state.
- Creating a trip immediately creates the trip record and enters the pickup-approach state `GOING_TO_PICKUP`.
- Trip creation records its own event ID, actual timestamp, and event-scoped GPS evidence. It starts the pickup-approach duration.
- Trip creation and Start ride are distinct business events. Do not collapse them into one generic trip-start event.
- Do not require a separate pickup-arrival confirmation or create a pickup-arrival event. The driver can proceed to Start ride or Cancel ride when ready.
- The driver-facing state-aware bottom swipe bar is positioned immediately above the bottom navigation and presents the current action stage:
  1. **Going to pickup** — a trip exists and its approach interval is open.
  2. **Start trip** — the next valid actions are Start ride or Cancel ride; this is an action/presentation stage, not a separate pickup-arrival business event.
  3. **End trip** — a ride is active and End ride is the valid completion action.
- Do not put a map on the Work screen. Keep the screen focused on the current state, required action, and relevant information.

### Start ride

- Start ride is a separate explicit driver action from trip creation.
- It records its own actual timestamp and event-scoped GPS evidence, closes the pickup-approach interval, and starts the ride-duration interval.
- Once the ride is active, the driver cannot go Offline or end the shift until the ride is ended.
- The ride duration is derived from the persisted Start ride and End ride instants.

### Cancel ride

- Cancel ride is permitted only before Start ride, while the trip is in pickup approach / ready-to-start.
- Cancellation records a distinct cancellation event, actual timestamp, and GPS evidence at the cancellation location.
- Cancellation closes the pickup-approach interval and closes that trip as cancelled. It does not create a replacement trip.
- After cancellation, the shift remains Online and the driver may manually create another trip or go Offline.
- A cancelled trip must not later accrue ride duration unless a new trip is explicitly created.

### End ride

- End ride records its own actual timestamp and event-scoped GPS evidence, closes the ride-duration interval, and ends the active ride.
- Ending a ride does not end the shift. The driver remains Online.
- After the End ride transition is durably recorded, the required Fare-entry workflow is presented. Ride completion and financial finalization are distinct states; the trip must not be represented as financially finalized while required Fare data is missing.
- Preserve a pending financial-entry state across navigation, app restart, WebView recreation, and recovery. Do not lose the ended ride or ask the driver to recreate it.

## 4. Odometer rules

### Shift-start reading

- Require an odometer reading at every shift start and every shift end.
- On the first-ever shift start, the field is empty. Do not invent, estimate, or prefill a default reading.
- On subsequent shifts, prefill the new shift-start field with the previous confirmed shift-end reading. The driver may edit it.
- The driver must confirm the start reading before the shift can start.
- A normal shift-start reading cannot be lower than the previous confirmed odometer reading. Block it and direct the user to the controlled correction process; never silently accept or rewrite a lower value.
- If the driver raises the prefilled start reading, immediately show the calculated personal kilometres before shift confirmation. The value is provisional until the start reading is confirmed, then it becomes part of the shift record.

### Shift-end reading and distance

- Require a shift-end odometer reading before the shift can end.
- The latest successfully saved/confirmed odometer reading remains visible on the Work screen in every driver state: Offline, shift-start entry, Online, pickup approach, active ride, between trips, and shift-end entry.
- Display only the latest confirmed/saved reading, never an unsaved form value.
- **Personal km** = current shift-start reading minus the previous confirmed shift-end reading. This is shown immediately when an edited start reading makes it calculable; it remains provisional until start confirmation.
- On the first-ever shift, when no previous shift-end reading exists, show personal kilometres as **“Not available (first shift)”**. Do not display zero or ask the driver to estimate/enter a value manually.
- **Business km** = shift-end reading minus shift-start reading for that shift.
- Odometer readings and distance belong to the shift record, not to individual trip fare entries.
- Do not infer distance from GPS or use GPS distance as a substitute for the odometer calculation.

### Controlled corrections

- A lower-than-previous confirmed start reading is not a normal edit. It requires a separate controlled correction path.
- A correction must preserve the original reading and record the corrected reading, correction timestamp, and reason. It must be auditable; never overwrite the original value silently.
- Corrections follow the shared historical-correction and transaction/recovery contracts.

## 5. Fare, toll, parking, and trip financial finalization

### Fare

- For a completed ride, Fare is required before the trip can be financially finalized.
- An empty Fare means “not entered” and blocks financial finalization.
- An explicitly entered Fare of ₹0 is valid (for example, a complimentary ride). Zero must not be treated as missing.
- Present the Fare entry after the End ride event has been recorded with its timestamp/GPS evidence and the ride-duration interval has been closed.
- Keep the ended ride and its pending Fare state durable if the user leaves the form or the app is interrupted.

### Toll and parking

- Toll and Parking are separate optional amounts; neither is required when no amount applies.
- Keep Toll and Parking in collapsed/expandable sections rather than permanently displaying all fields.
- For each amount entered, independently require a payer selection: **Driver** or **Customer**.
- If no amount is entered for a category, payer selection is not required.
- The same amount and payer rules apply in the PWA and native overlay.

### Financial meaning

- **Customer charge** = Fare + customer-paid Toll + customer-paid Parking.
- **Driver expenses** = driver-paid Toll + driver-paid Parking.
- **Net Trip Earnings (before fuel)** = Fare − driver-paid Toll − driver-paid Parking.
- Customer-paid Toll/Parking are pass-through amounts. They increase the customer charge but are neither driver income nor driver expenses.
- Fuel and other operating expenses are not subtracted in this trip-level calculation; later Performance calculations may define their own approved rules.
- Cancellation fees are separate financial entries for cancelled trips. Do not merge them into Fare or assume the completed-ride Fare/Toll/Parking rules automatically define cancellation-fee requirements.

### Examples

| Entry | Customer charge | Driver expenses | Net Trip Earnings (before fuel) |
|---|---:|---:|---:|
| Fare ₹2,520; driver Toll ₹320; driver Parking ₹250 | ₹2,520 | ₹570 | ₹1,950 |
| Fare ₹1,850; customer Toll ₹320 | ₹2,170 | ₹0 | ₹1,850 |
| Fare ₹0; no Toll/Parking | ₹0 | ₹0 | ₹0 |

- Fare entries may be edited until the trip is finalized. Any correction after finalization must preserve historical auditability under the financial correction contract; the precise post-finalization correction UX is not defined here.

## 6. Shared PWA and native Android overlay workflow

### One workflow, two surfaces

- The PWA and native Android overlay expose the same driver workflow, not separate applications or state machines.
- Both surfaces use the same versioned commands, domain transition policy, validation, calculations, durable records, pending/finalization states, and Room-backed application/repository boundary on installed Android.
- The browser-only PWA uses the corresponding IndexedDB adapter under the same domain/application contracts.
- A command from either surface is validated against the latest committed state/revision and is persisted once. Committed changes propagate to the other active surface locally and in real time.
- The overlay must remain able to issue valid driver actions while the PWA WebView is paused, recreated, or not visible. It must not create parallel records or use cloud sync as live synchronization.
- Both surfaces reconcile the latest durable revision on attach/resume and display the same pending, completed, rejected, or needs-attention result.
- The UI may acknowledge a gesture immediately as received/pending. It must not claim a transition or financial entry is committed before the authoritative durable operation succeeds.

### Overlay visibility follows the PWA-controlled shift lifecycle

- The main PWA is the controller of shift start/end. The overlay does not have an independent shift lifecycle or its own start/end shift authority.
- When the overlay feature is enabled and its required Android permission is granted, show the native overlay only after the shift-start transition has durably committed.
- Close/hide the overlay only after the shift-end transition has durably committed.
- A failed, rejected, or still-pending shift start must not show an active-shift overlay. A failed, rejected, or still-pending shift end must not close the overlay as though the shift ended.
- The overlay's visibility is a projection of the authoritative shift state. On process restart, WebView recreation, or overlay reattachment, reconcile from the durable shift projection before showing operational controls.
- Overlay permission denial/revocation or the user disabling the overlay affects overlay availability only; it must not create a second shift state or block otherwise valid local shift/trip operations in the PWA.
- Android cannot display the overlay while the screen is physically off. Reconcile and show it when the display wakes if the shift remains active and the feature is enabled/authorized.

### Full trip and financial-entry parity

The overlay must support all driver trip operations, not merely a subset of buttons:
- Create trip / begin Going to pickup.
- Start ride.
- End ride.
- Cancel ride.
- Enter Fare, including explicit zero and the distinction between empty and zero.
- Enter optional Toll and Parking amounts.
- Select Driver or Customer independently as payer for each entered Toll/Parking amount.
- Resume and complete a pending Fare/financial-entry workflow.

These actions must call the same application use cases and validators as the PWA. The overlay must not implement separate financial formulas, payer rules, fare-required checks, or finalization logic. Changes made in either surface must be reflected in the other after the shared durable commit.

Odometer entry and confirmation are shift-start/shift-end workflow requirements. Their UI may be hosted by the PWA or native surface, but both must call the same shift/odometer application contract if exposed on both.

## 7. Operational date

- The operational-day and logical-shift boundary is **04:00 Asia/Kolkata local time**, not midnight.
- Persist each event's actual timestamp; never alter or round event time to fit an operational date or shift.
- Assign a trip's operational date and logical-shift ID when the trip is created. Both remain fixed for the lifetime of the trip, even if the trip crosses 04:00.
- Example: a trip created at 03:50 and ended at 04:20 belongs to the previous operational day and previous logical shift. A trip created at 04:00 or later belongs to the new operational day and new logical shift.
- At 04:00, rotate the logical shift automatically while retaining one continuous Online session. The old shift boundary and new shift identity must be committed/recovered idempotently; do not synthesize an Offline/Online cycle.
- An active trip at the boundary remains assigned to its creation shift. Defer the new shift's odometer confirmation until the current trip workflow is safely resolved: after cancellation-fee save for a pickup-approach cancellation, or after Fare save for a completed ride. If no trip is active, show the confirmation at the boundary.
- Prefill the new logical shift's odometer confirmation with the last confirmed odometer reading. Allow confirmation or an upward edit; under the approved rule, record the increase as personal kilometres. Do not show the prompt while the driver is in an active ride.
- Store UTC instants and the relevant local date/time-zone context; use the existing `Asia/Kolkata` timezone contract for boundary interpretation.

## 8. Timing, GPS, and durability integration

- Required GPS evidence is event-scoped and must follow `gps-event-fix-v1`: horizontal accuracy no worse than 50 metres and fix age no greater than 30 seconds relative to the original transition timestamp.
- Capture separate event identities/timestamps and GPS evidence for shift start, shift end, trip creation/Going to pickup, Start ride, End ride, and Cancel ride. These are separate events; a trip-creation GPS fix must not be reused as Start ride evidence.
- Keep the existing non-blocking gesture, durable-intent, atomic-completion, idempotency, ordered-command, recovery, and outbox rules. A later recovery fix is not proof of the original event-time location.
- Persist state interval boundaries and derive pickup approach, ride, and shift durations from their persisted instants. Cancellation closes the approach interval; End ride closes the ride interval.
- The Work screen must not display a prominent live shift timer, but duration calculations and historical reporting remain required. See the shift-duration presentation decision in Section 2.
- No continuous GPS tracking is permitted between these user-triggered events.

## 9. Explicitly unresolved product decisions

The following are intentionally not guessed or silently decided by this contract:
1. Whether a pending Fare entry blocks creation of another trip or other driver actions.
2. Cancellation-fee required/optional rules, zero-value treatment, payer, and whether cancellation records support Toll/Parking.
 3. Whether controlled odometer corrections alter only the corrected shift or require recalculation/review of later shift distance allocations.
4. Thresholds or warnings for unusually large odometer differences.
5. The exact user interaction for editing a financial entry after trip finalization, while preserving auditable corrections.

No implementation may invent these behaviours. Each requires an explicit product decision and an update to this contract before the corresponding workflow is finalized.

## 10. Contract ownership and acceptance

- This contract owns the driver workflow's product rules and state semantics, including automatic 04:00 logical-shift rotation and deferred odometer confirmation.
- `ANDROID_NATIVE_CONTRACT.md` owns Android overlay/bridge execution, Room ownership, permissions, lifecycle and platform behavior; this document adds the explicit shift-controlled overlay visibility and workflow parity requirements.
- `LOCATION_AND_STATE_TIMING_CONTRACT.md` owns GPS evidence, timestamp integrity, duration derivation, and timer recovery; this document identifies the distinct driver events that require that evidence.
- `FEATURE_MODULE_CONTRACT.md` owns feature boundaries, public entry points, calculation ownership, forms as adapters, and add-on isolation.
- `TRANSACTION_AND_RECOVERY_CONTRACT.md`, persistence, backup, security, and lifecycle contracts remain authoritative for their existing guarantees.
- The UI/UX and application shell presentation contract owns presentation architecture and visual/component standards; it does not override these business rules.
- Approval of this contract documents product requirements only. It does not claim that every listed behavior is implemented, tested, or accepted on a physical phone.
