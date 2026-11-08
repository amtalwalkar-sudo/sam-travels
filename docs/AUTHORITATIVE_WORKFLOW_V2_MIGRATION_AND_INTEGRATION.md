# Authoritative Work/Shift Workflow v2 — Migration and Integration Contract

**Status:** Approved product decisions; implementation contract for the integrated Work/Shift v2 change.
**Applies to:** Sam Travels PWA, browser persistence, Android Room persistence, native Android overlay, Admin Driver/Vehicle assignment, Timeline, daily reporting and Performance.
**Authority:** This is a retained product/migration reference. For current implementation semantics, PR #57's merged v2 implementation contract and the current owner contracts (especially `WORK_DRIVER_TRIP_SNAPSHOT_INTEGRATION_CONTRACT.md` and `DRIVER_WORKFLOW_CONTRACT.md`) prevail where wording differs. This document does not supersede the shared persistence/recovery or owner-specific safeguards.

## 1. Non-negotiable product rules

The detailed v2 state/snapshot/transaction requirements in the merged `WORK_DRIVER_TRIP_SNAPSHOT_INTEGRATION_CONTRACT.md` and current owner contracts are authoritative for implementation. This reference records the broader approved migration decisions and acceptance checklist; it must not be used to reintroduce legacy semantics.

### Shift identity and assignment
- One active shift has exactly one Driver and exactly one Vehicle.
- A Driver cannot be part of more than one active shift at a time.
- A Vehicle cannot be used by more than one active shift at a time.
- The Driver and Vehicle are selected and validated before shift start. Both are locked for the complete active shift, including automatic 04:00 logical-shift rotation.
- Vehicle changes are permitted only before starting a shift. A vehicle change never carries forward another vehicle's odometer baseline.
- Admin owns Driver records, Vehicle records and Driver-to-Work assignment history. Work owns active shift selection and lifecycle. An active shift stores immutable Driver/Vehicle identity snapshots.
- Every trip snapshots the active shift ID, Driver ID, Vehicle ID, assignment ID and operational date at trip creation. Later Admin edits or assignment changes never rewrite historical trips.
- A Driver or Vehicle becoming inactive does not rewrite an active or historical shift. It blocks the next shift start; the current shift must be resolved using its existing locked context.

### Authoritative trip lifecycle
- The only trip sequence is: create trip / `GOING_TO_PICKUP` → `START_RIDE` → `END_RIDE`, or create trip / `GOING_TO_PICKUP` → `CANCEL_RIDE`.
- `END_RIDE` and `CANCEL_RIDE` close the current trip. The next trip is a new trip-creation command that enters `GOING_TO_PICKUP`.
- There is no pickup-arrival event.
- Trip creation and Start ride are separate durable events. Legacy `trip_start` must never be reinterpreted as both events.
- A completed trip's Fare must be durably saved before another trip can be created. Fare ₹0 is valid; empty Fare is invalid.
- The driver may go Offline with a pending Fare. The completed trip and pending Fare remain durable and linked to the original trip, shift, Driver, Vehicle and operational date.
- A cancelled trip requires its own mandatory cancellation-fee record. ₹0 is valid; negative or empty values are invalid. Cancellation fee has no payer. Cancelled trips have no Toll or Parking.
- A cancellation fee must be saved before the next trip can be created and before the driver can go Offline. This supersedes the earlier rule that pending cancellation fees did not block the next trip.
- Fare plus optional Toll/Parking entries commit atomically. Cancellation Fee commits atomically with clearing its pending-fee gate. A gate is cleared only after the durable transaction succeeds.
- Saved Fare, Toll, Parking and Cancellation Fee entries are immutable in this scope.

### Financial reporting
- Cancellation fees count as income.
- Daily income and Performance include both completed-trip Fare income and cancellation-fee income.
- Report Fare income and cancellation-fee income as separate categories, while including both in the applicable total income calculation.
- Customer-paid Toll/Parking are pass-through amounts, not income or driver expenses. Driver-paid Toll/Parking remain driver expenses.
- Store INR amounts in integer minor units. ₹0 remains a valid explicit amount, distinct from a missing value.

### Odometer
- Odometer history is vehicle-specific.
- The selected Vehicle is locked during a shift. Changing Vehicle is permitted only before shift start.
- A shift-end reading lower than that shift's confirmed start reading is rejected.
- A positive difference between the previous confirmed reading for the same Vehicle and the new shift-start reading is personal kilometres.
- Business kilometres equal shift-end minus shift-start for that shift.
- More than 700 business km in one shift produces an advisory warning and does not block completion.
- Confirmed readings are immutable once committed. This workflow does not introduce a new correction path; any approved controlled odometer correction remains governed by `DRIVER_WORKFLOW_CONTRACT.md` and the applicable transaction/recovery contract.
- At the 04:00 Asia/Kolkata boundary, one odometer reading closes the previous logical shift and opens the next logical shift. If a trip is active, defer this reading until the trip ends and its Fare is saved; attribute the intervening trip distance to the previous logical shift. The Driver/Vehicle and online session remain continuous.

## 2. Domain state machine and application commands

The domain owns the authoritative transition policy. UI controls must not implement transition rules.

### States
- `OFFLINE`
- `SHIFT_ACTIVE`
- `GOING_TO_PICKUP`
- `RIDE_ACTIVE`
- `NEEDS_ATTENTION` (recovery/validation hold; not a business lifecycle state)

Pending Fare and pending Cancellation Fee are durable financial obligations associated with closed trips. They are not represented by pretending the trip is still active.

### Lifecycle commands
- `START_SHIFT`: requires exactly one active Driver and Vehicle selection, a valid assignment, a confirmed vehicle-specific start odometer and required GPS evidence.
- `CREATE_TRIP`: requires an active shift, no active trip, no pending Fare, and no pending Cancellation Fee. It snapshots shift, Driver, Vehicle, assignment and operational date and enters `GOING_TO_PICKUP`.
- `START_RIDE`: only from `GOING_TO_PICKUP`.
- `END_RIDE`: only from `RIDE_ACTIVE`; closes the trip and creates a durable pending-Fare obligation.
- `CANCEL_RIDE`: only from `GOING_TO_PICKUP`; closes the trip and creates a durable pending-Cancellation-Fee obligation.
- `END_SHIFT`: requires no active ride, no active pickup-approach trip, no pending Cancellation Fee, and a valid non-decreasing vehicle odometer reading. A pending Fare is allowed.
- `ROTATE_SHIFT_0400`: idempotently closes the old logical shift and opens the next logical shift without changing the online session, Driver or Vehicle. It uses one shared boundary odometer reading. If a trip is active, rotation and odometer prompt are deferred until that trip is closed and Fare is saved.
- `SAVE_FARE`: commits Fare and any optional Toll/Parking as one transaction and releases the pending-Fare trip-creation gate.
- `SAVE_CANCELLATION_FEE`: commits the mandatory fee and releases the pending-fee trip-creation and Offline gates in one transaction.

Every lifecycle command has stable command/event/idempotency identities, expected revision, actual transition instant and event-scoped GPS evidence where required. Rejected/stale commands do not advance revision. The same typed application use cases are called by PWA and Android overlay.

## 3. Legacy five-event schema and deterministic migration

The legacy event discriminants are `shift_start`, `shift_end`, `trip_start`, `trip_end`, and `ride_cancel`. The new event discriminants are `shift_start`, `shift_end`, `trip_create`, `ride_start`, `ride_end`, `ride_cancel`, and `shift_rotate_0400`.

### Compatibility policy
- Introduce an explicitly versioned Work event/command/state schema v2. Do not silently change the meaning of schema v1.
- Keep a v1 reader/validator for immutable historical events and pending intents. New writes use v2 only after the v2 migration and recovery gate has completed.
- Legacy `trip_start` is retained as a legacy ride-start fact only when the surrounding history proves an existing trip had already been created by the old workflow. It must not be used to invent a separate pickup-approach interval or trip-creation GPS evidence.
- Legacy `trip_end` maps to the closure of the legacy active trip. Legacy `ride_cancel` maps to cancellation of the legacy trip/approach state according to its stored prior state. Preserve original payload, event ID, revision, timestamps and GPS evidence.
- Historical records without Driver/Vehicle context remain explicitly `legacy_unknown`; never fabricate a snapshot.
- Pending v1 intents retain their original command schema and recovery semantics. Do not rewrite transition time, GPS time, event ID or idempotency key. A v1 intent that cannot be safely replayed remains visible as needs-attention and is never silently discarded.
- Do not synthesize missing events, GPS fixes, Fare records, Cancellation Fees, odometer readings, shift boundaries or assignment snapshots.
- Build v2 projections by deterministic replay of the immutable event stream plus committed financial records. Re-running migration must produce the same result and no duplicate events or financial entries.
- A migration failure leaves the original v1 data intact and blocks new lifecycle actions until recovery succeeds or the issue is explicitly resolved.

### Physical storage
- Browser IndexedDB/Dexie and Android Room must both preserve the same logical v1/v2 event, intent and projection contracts.
- If the physical table layout does not change, do not create a needless physical database migration solely to change JSON payload versions. If a physical change is needed, add an explicit additive Dexie/Room migration; never use destructive fallback.
- Backup export, restore, recovery checkpoints, event replay and projection rebuild must preserve both legacy v1 and new v2 records. Unknown future versions fail closed before live-data replacement.
- Migration tests must cover v1 fixtures, interrupted upgrade, retry/idempotence, malformed and future versions, backup/restore round trips, and rollback/checkpoint recovery.

## 4. Durable transaction boundaries and projections

- The authoritative source is the ordered immutable event log plus separately committed financial records and the durable shift/vehicle odometer records.
- Each command validates current state/revision and all required feature records at the durable commit boundary.
- A command transaction writes the event, state projection, intent status and outbox row atomically.
- Fare save writes Fare, optional Toll/Parking, and clears the pending-Fare obligation atomically.
- Cancellation-fee save writes the fee and clears the pending-fee obligation atomically.
- A transaction failure must leave either the complete previous state or the complete new state; never a partial financial entry or prematurely released gate.
- Projections (current state, trip history, shift history, daily totals and Performance) are rebuildable and must never become an independent source of truth.
- Recovery replays durable intents and events idempotently. Stale commands are rejected. No cloud service is required for core workflow recovery.

## 5. Admin Driver-to-Work and Vehicle selection

- Admin owns Driver and Vehicle records and assignment history.
- One active shift binds one Driver and one Vehicle. The same Driver or Vehicle cannot be bound to another concurrent active shift.
- A Driver's active Work assignment identifies the Vehicle eligible for a new shift. Work may select only an active Driver with a valid active assignment to an active Vehicle.
- Shift start snapshots and locks the Driver/Vehicle pair. Neither may be changed while the shift is active.
- Reassignment and vehicle changes are effective for future shifts only.
- Assignment/selection validation and shift-start commit must be atomic against current Driver, assignment and Vehicle records.
- A trip snapshots the active shift context at trip creation, not at Start ride.
- Admin changes never rewrite old shifts or trip history.

## 6. PWA and native Android overlay parity

- PWA and Android overlay invoke the same application command semantics and domain validation.
- Overlay actions include Create trip, Start ride, End ride, Cancel ride, resume/save pending Fare, and resume/save pending Cancellation Fee, plus optional Toll/Parking capture within Fare finalization.
- Overlay controls are a projection of durable workflow state. They cannot bypass a pending-Fare, pending-fee, assignment, odometer or shift gate.
- Overlay and PWA show the same state, active trip, original shift context, outstanding financial obligations and truthful commit/recovery status.
- Native Room and browser Dexie adapters implement equivalent transaction boundaries, validation and replay semantics.

## 7. Acceptance gates

The integrated change is not complete until all of the following pass:

1. Domain transition matrix and invalid-transition tests for every command and state.
2. Legacy v1 event/intent migration and deterministic replay tests.
3. Browser IndexedDB transaction, interrupted write, idempotency and projection-rebuild tests.
4. Android Room migration, transaction, recovery and backup/restore tests.
5. PWA interaction tests for the complete lifecycle and pending financial obligations.
6. Native overlay parity tests for every lifecycle and financial action, including process restart.
7. Admin tests for Driver assignment, active shift locking, Vehicle selection, concurrent shift prevention and historical snapshot immutability.
8. Reporting tests proving Fare and Cancellation Fee are separate categories and both included in daily income/Performance.
9. Full CI, Android emulator acceptance and migration/recovery regression.
10. Physical-device acceptance for shift start/end, GPS evidence, offline/restart recovery, 04:00 rotation and overlay operation. CI/emulator success alone is not physical-device acceptance.

No acceptance item may be marked complete without an observed passing result. If physical hardware is not available to the implementer, report that gate as pending user-device verification rather than claiming it passed.
