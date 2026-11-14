# Driver Work/Drive End-to-End Workflow — UX Contract Draft

**Status:** Draft for product approval; non-normative until approved and reconciled into the owning product contract.  
**Scope:** Initial Sam Travels experience for one car and one driver.  
**Purpose:** Describe the proposed end-to-end driver journey and screen states while preserving approved business semantics and technical safeguards.

## 1. Authority, hierarchy, and non-goals

This document is a workflow/presentation proposal, not a second source of business or technical rules.

- Product semantics remain owned by [Driver Workflow and Business Rules Contract](DRIVER_WORKFLOW_CONTRACT.md).
- Shift odometer readings, personal/business distance, and daily kilometre allocation remain owned by [Work/Shift Odometer and Daily Business-Kilometre Contract](WORK_SHIFT_ODOMETER_AND_DAILY_DISTANCE_CONTRACT.md).
- Work/Trip immutable context and integration remain owned by [Work Driver and Trip Snapshot Integration Contract](WORK_DRIVER_TRIP_SNAPSHOT_INTEGRATION_CONTRACT.md).
- Form mechanics/lifecycle remain owned by [Form Architecture and Behaviour Contract](FORM_ARCHITECTURE_AND_BEHAVIOUR_CONTRACT.md); fuel-specific semantics remain owned by [Fuel Entry and Business Expense Calculation Contract](FUEL_ENTRY_AND_BUSINESS_EXPENSE_CALCULATION_CONTRACT.md).
- Durable intent, atomic commit, idempotency, outbox and recovery remain owned by [Transaction and Recovery Contract](TRANSACTION_AND_RECOVERY_CONTRACT.md). Startup/resume/shutdown coordination remains owned by [Application Lifecycle Contract](APPLICATION_LIFECYCLE_CONTRACT.md).
- Overlay-specific presentation and gesture behaviour remains solely in [Driver Overlay Contract](DRIVER_OVERLAY_CONTRACT.md); swipe action mapping remains in the versioned presentation metadata.

Where this draft describes UX choices not already approved, they are explicitly marked **Proposed—approval required**. It must not amend, reinterpret, or override an owner contract implicitly.

**Explicitly deferred:** any multi-driver, multi-car, fleet dispatch, concurrent driver, vehicle selection while operating, or fleet-level workflow redesign. Admin's existing bounded Driver/Vehicle setup and assignment records are not operational fleet workflows.

## 2. Journey map (proposed presentation)

The Drive destination should communicate one primary operational state and the next valid action, with secondary required tasks visible and recoverable. Do not make a UI state, timer, gesture animation, notification, or transient surface authoritative.

1. **Ready / not working** → choose/confirm the already configured Work Driver where needed; review latest confirmed odometer; enter shift-start reading and start work.
2. **Working / no trip** → create trip or end shift; outstanding required financial entry or boundary confirmation takes precedence.
3. **Going to pickup** → Start ride or Cancel trip. No separate pickup-arrival confirmation.
4. **Ride active** → End ride is the trip action; do not offer Offline or shift end.
5. **Ride ended / fare required** → Fare form; optional Toll/Parking as specified. Retain and resume until submitted.
6. **Trip cancelled / cancellation fee required** → mandatory fee entry (₹0 valid); after successful save the driver remains Online.
7. **Boundary confirmation pending** → present odometer confirmation only when safe per the owner contract; session remains Online.
8. **Shift ending** → collect and confirm end odometer, commit shift end, then present the completed/offline state and elapsed duration as approved.
9. **Recovering / action pending / needs attention** → identify the operation and truthful status; retain access to the same operation for retry/reconciliation.

The state displayed must be derived from the authoritative workflow projection. Avoid offering controls that are invalid for the current state.

## 3. Start work and shift odometer

### Authoritative rules (not changed by this draft)

- Shift start is a manual Offline→Online action requiring a confirmed non-negative whole-kilometre reading and event-scoped GPS evidence.
- First-ever reading is blank; personal kilometres are unavailable (not zero).
- Subsequent reading prefills from last confirmed shift-end reading. Equal reading means zero personal km; upward adjustment records the exact gap as personal km; a lower reading is blocked and requires the controlled correction path.
- Shift state is active only after durable completion; a queued/pending GPS command is not a completed start.
- Work driver/vehicle context is resolved and locked at the authoritative commit boundary per the snapshot integration contract.

### Proposed UX—approval required

- A single start-work panel presents the reading, contextual previous reading (if any), calculated provisional personal km, and one explicit Start shift action.
- Keep the displayed “latest confirmed odometer” separate from the editable draft value.
- If start is pending, label the action as queued/pending and retain its identity; do not show the active-work state until committed.
- Product decision: confirm whether the single-driver deployment should auto-select the only active configured Driver, while preserving existing required selection/validation semantics. No implicit Admin profile creation or assignment.

## 4. Active work and trip lifecycle

### Authoritative lifecycle

- A shift can contain multiple manually created trips.
- Trip creation immediately creates a real trip in `GOING_TO_PICKUP`; creation and Start ride are distinct events, each with its own event identity/time/GPS evidence.
- No automatic trip detection, no pickup-arrival event, and no map on Drive.
- Start ride closes pickup approach and begins ride interval. During active ride, Offline and shift-end are prohibited.
- End ride closes the ride interval and returns the driver Online; it then creates a durable required Fare-entry obligation. Fare must be supplied; explicit ₹0 is valid. Toll/Parking are optional and each entered amount requires payer (Driver or Customer).
- Cancel ride is only allowed during pickup approach. It closes the trip as cancelled and creates mandatory cancellation-fee entry; explicit ₹0 is valid. The fee must be submitted before another Work action or shift end. Never silently abandon or delete a trip.
- Completed and cancelled financial records follow immutability and controlled correction policy.

### Proposed UX—approval required

- Keep a state-focused action area with one clear next primary action and any mandatory obligation displayed adjacent to it.
- Offer Cancel trip as a distinct secondary action in pickup approach, with confirmation text that cancellation fee entry follows. Approval needed: whether an additional cancel confirmation is desired; avoid stacking duplicate confirmations contrary to form contract.
- After End ride or Cancel trip, transition focus to the associated required form without implying that financial finalization has happened.
- Preserve pending financial forms as resumable work; do not hide them behind unrelated screens.

## 5. Fuel and other driver actions

Fuel Entry may be opened from Work even without an active shift and does not mutate shift/trip state. Its approved form semantics are owned by the fuel contract: driver-entered odometer, price/kg, total amount paid, and partial-refill checkbox; quantity is calculated, not entered; full tank is the default; entry timestamp and event GPS snapshot are captured at submission; locality reverse geocoding is deferred until online; shared form working copy survives interruptions; Submit is idempotent and successful purchase is immutable by default. Partial refills count as expense but are excluded from cost/km and mileage calculations.

The Drive workflow should expose Fuel Entry as a separate action, not as a required step to start/end work or a trip. **Proposed—approval required:** placement prominence and whether it appears as a persistent secondary action versus an overflow/action list.

No other driver action is added here unless an approved feature contract already defines it. Platform Fees, Miscellaneous Business Expenses and Traffic Challans are Admin-owned entry workflows, not driver journey steps in this draft.

## 6. Shift ending and elapsed duration

### Authoritative rules

- Driver manually goes Offline only when no ride is active; pickup-approach trip must first be cancelled and its cancellation fee submitted.
- Manual shift end requires confirmed end odometer, actual transition timestamp and event-scoped GPS. End reading must be at least start reading; business km is the difference.
- Ending a shift must not be committed while active ride or unresolved pickup cancellation-fee obligation exists.
- Elapsed shift duration is derived from persisted timestamps and includes background/stopped/powered-off intervals subject to the clock-integrity contract. Driver Workflow contract says do not show a prominent continuously running shift timer; show elapsed duration on going Offline and after shift end.

### Proposed UX—approval required

- Present end odometer entry and calculated business km as a focused confirmation step with one End shift action.
- On successful commit, show Offline/completed summary including elapsed duration and confirmed end reading.
- Approval needed: exact summary contents and whether user can dismiss immediately or sees a short recap. No extra confirmation dialog should stack on the form's declared primary action.

## 7. 04:00 operational boundary

### Authoritative rules

- Operational day/logical shift boundary is exactly 04:00 Asia/Kolkata; actual event timestamps remain unchanged.
- Rotation preserves the continuous Online session. Trips remain assigned to shift and operational date from trip creation; never split a trip across boundary.
- Rotation is durable, uniquely identified, idempotent and recoverable. Confirmed rotation uses the shared odometer to close outgoing shift and begin the next logical shift.
- Odometer confirmation prefilled from latest confirmed reading may be confirmed or raised (increase is personal km); no prompt may interrupt an active ride.
- At boundary during pickup approach, defer prompt until trip cancellation and mandatory cancellation fee submission. During active ride, defer until End ride and Fare form submission. When no active trip, present promptly. The underlying boundary work is not dropped or duplicated while prompt is deferred.

### Proposed UX—approval required

- Use a persistent, non-modal “operational boundary pending” notice only when safe to surface; make clear Online remains active.
- When safe, present boundary odometer confirmation as a focused action, temporarily prioritized above creating a new trip. Confirm whether this prioritization is acceptable.
- Do not label the boundary as driver manually ending work or as a break/offline interval.

## 8. Offline, lifecycle, recovery, and outcomes

### Authoritative safeguards

- Browser-only PWA uses IndexedDB as authoritative business store; installed Android uses Room. UI state and browser/native surface instances are disposable.
- Startup gates load committed state, validate runtime/store, recover eligible pending intents/outbox, register listeners, reconcile revision, and only then enable state-changing operations.
- On focus/visibility return, WebView/overlay reattachment or service restart, reread durable revision and reconcile pending work before actions; stale revision is not accepted.
- Driver transition command follows durable-intent→event-time GPS validation→atomic authoritative completion. Stable command/event/idempotency identities ensure retries/replays apply business effect at most once.
- Gesture acknowledgement is not durable acceptance. A commit failure is “not safely queued/needs attention”; pending is not recorded; recorded/success is shown only after authoritative commit.
- GPS evidence is event-scoped; recovery may use a fix only inside the contract-defined original event-time window (30 seconds). Expired evidence transitions to needs-attention; it must not be replaced by later location data attached to the old event.
- Pending Fare/cancellation fee and fuel form working copy retain identity and inputs through supported navigation, process restart and recovery. Backup/restore preserves the source facts and must follow its owner contract.
- Network connectivity is optional for core driver operations. Offline state must not be confused with store/bridge/recovery failures.

### Proposed UX—approval required

- A compact status banner categorizes “Restoring”, “Action queued”, “GPS verification”, “Recorded”, “Needs attention”, and “Workspace unavailable”, with clear per-operation feedback.
- Retry resumes the same operation identity where permitted; when GPS recovery window expired, guide the driver to explicitly reissue as a new action only where the service/contract allows.
- Approval needed: wording and severity styling of statuses; whether unresolved needs-attention items are summarized on Drive top panel or dedicated recovery section. Avoid adding destructive “discard pending” affordance.

## 9. Proposed workflow state-to-view table

| Authoritative state / obligation | Driver-facing primary action | Secondary/required UI | Must not imply |
|---|---|---|---|
| Idle / no shift | Start shift | Driver context; start odometer | Shift active before commit |
| Shift active / no trip | Create trip or End shift | Fuel action; confirmed odometer | Trip auto-created |
| Going to pickup | Start ride | Cancel trip; fee obligation after cancellation | Pickup arrival event |
| Trip active | End ride | Status; no Offline/end shift | Ride ended before commit |
| Ride ended, Fare pending | Submit trip financials | Toll/Parking optional sections | Financial finalization pre-submit |
| Cancelled, fee pending | Submit cancellation fee | ₹0 allowed | Ready for next work action before fee save |
| Boundary pending, no trip active | Confirm boundary odometer | Pending boundary details | Offline toggle or interrupted ride |
| Boundary pending, active trip | Current trip action | Boundary deferred indicator | Odometer modal during ride |
| Shift end form | End shift | End odometer/business km | Shift ended before commit |
| Pending/unknown/needs attention | Retry/reconcile same operation (when valid) | Specific reason and retained draft | Recorded success or discarded intent |

## 10. Acceptance criteria for this UX draft (gates before implementation)

1. Every view/action maps to an existing domain state, obligation or approved feature capability; UI creates no independent state machine.
2. Start shift requires reading and durable authoritative commit; first and subsequent odometer rules remain exact.
3. Trip creation, Start ride, End ride and Cancel ride remain distinct commands/events and preserve fixed trip shift/date context.
4. Active ride prevents Offline/shift end; pickup cancellation-fee obligation prevents shift end and subsequent Work action until submitted.
5. Fare and cancellation fee requiredness/₹0 semantics, optional Toll/Parking payer rules, and form lifecycle remain as owner contracts define.
6. Fuel Entry is shift-independent and follows the existing fuel/form contracts without modifying Work state.
7. 04:00 rotation preserves continuous Online session and defers confirmation through active ride or pickup cancellation plus fee-save; rotation and projection are exactly-once in effect under replay.
8. Offline operation, app/tab background, process death, WebView restart, native service restart and recovery restore durable authoritative state before controls become actionable.
9. Pending, unknown, failed and recorded outcomes are visually distinct; success never precedes commit; retries retain identity and do not duplicate effects.
10. PWA and native overlay presentations preserve identical business meaning; overlay-specific acceptance is evaluated only against Driver Overlay contract.
11. Form layouts/actions follow shared form contract: working copy retained, single primary Save/Submit action, no stacked confirmation, and truthful lifecycle feedback.
12. Multi-car/multi-driver workflow is absent and explicitly deferred.

## 11. Acceptance scenario/regression coverage

These are coverage requirements to map onto existing suites and add only if absent; this draft does not claim tests were executed or implementation changed.

- **Start odometer:** first shift empty/no personal-km; subsequent equal reading; upward edit exact personal km; lower value blocked; end odometer equal start/greater/lower validation; authoritative confirmed reading never replaced by draft.
- **Command truthfulness:** gesture acknowledgement with intent-queue commit failure; GPS pending; GPS denied/timeout/inaccurate; within 30s recovery; expired GPS window; atomic write failure; retry and duplicate event identity; conflicting payload identity; stale revision; PWA/Room parity.
- **Trip state:** manually create pickup trip; start ride; end ride and fare obligation; cancellation and fee required incl ₹0; no trip abandoned; cannot Offline/end shift while active ride; cannot end shift or launch next Work operation while cancellation fee obligation is pending.
- **Fare form:** Fare missing blocks submit; Fare ₹0 accepted; optional Toll/Parking each payer requirement; interrupted working copy resumes; submit retry idempotent.
- **Fuel form:** available with shift inactive/active and does not alter workflow; partial/full behavior; values retained on navigation/background/process restart; submission event timestamp/location snapshot; duplicate submit idempotent.
- **Boundary:** exactly before/at/after 04:00 local; no active trip boundary prompt; pickup approach deferral until cancel and fee submit; active ride deferral until End ride and Fare submit; boundary retry/offline/process restart; exactly one rotation and daily contribution; no split trip; pending unallocated distance semantics until rotation.
- **Lifecycle/recovery:** browser tab hidden/return, app background/foreground, WebView recreation, process kill/restart, native overlay/service reattach, offline startup, store/bridge unavailable, migration/recovery error; state refresh and revision reconciliation before enabling actions.
- **Backup/restore:** active/pending workflows and immutable event facts round-trip, with restore integrity/atomicity checks under existing backup contract.
- **Presentation:** state-to-action mapping contract test, accessibility and keyboard/touch conformance, narrow phone layout, form single-primary-action, no false success, and consistency between PWA and overlay.

## 12. Open product approval decisions

1. In single-driver setup, auto-select only eligible Driver or require explicit selection each time Work is entered?
2. Fuel action prominence on Drive (persistent secondary action vs menu), without affecting shift/trip state?
3. UX prominence/placement of pending boundary indicator and priority of confirmation once safe?
4. Exact end-shift summary contents and dismiss behaviour?
5. Status labels/visual severity and placement for pending/recovery/needs-attention items?
6. Whether a separate cancel-trip confirmation is needed (must not duplicate form/command confirmation).
7. Desired action priority when multiple required obligations coexist, while respecting existing command gates and not inventing ordering semantics.

Approval of these presentation decisions does not authorize altering business or technical owner contracts. Any semantic change must be reviewed and made in the relevant owner document.

## 13. Implementation and merge gate

This is documentation draft only. No UI implementation, workflow service change, business-rule change, migration, test modification, PR merge, or release claim is authorized by this task. After product approval, reconcile approved normative UX decisions into the designated product contract owner and create implementation scope separately.
