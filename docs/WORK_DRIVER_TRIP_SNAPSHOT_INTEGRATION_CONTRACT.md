# Work Driver and Trip Snapshot Integration Contract v2

**Status:** Approved implementation contract  
**Owner:** Work/Shift  
**Compatibility:** Additive v2 lifecycle; existing v1 event and intent payloads remain readable and retain their original meaning.

## 1. Authority and ownership

- Work/Shift owns the selected Driver reference, active shift, transition sequence, event identity, revision ordering, pending intents and recovery.
- Admin Driver Records owns Driver profile and lifecycle. Admin Driver Assignment owns assignment history. Vehicle owns Vehicle profile and lifecycle.
- Work stores only **work:selected-driver** with **{ schemaVersion: 1, driverId, lockedShiftId? }**; the optional lock is written and cleared atomically with shift start/end. It never copies the Admin profile or assignment history.
- Work validates the selected Driver, active assignment and active Vehicle at the shift-start durable commit boundary.
- Browser IndexedDB and Android Room enforce the same logical contract. UI is never an authority and may not resolve or persist historical context itself.

## 2. Versioned lifecycle

New commands carry **workflowVersion: 2**. Existing v1 commands are not rewritten.

| Current state | Command | Next state |
|---|---|---|
| idle | shift_start | shift_active |
| shift_active | trip_create | going_to_pickup |
| going_to_pickup | start_ride | trip_active |
| trip_active | end_ride | shift_active |
| going_to_pickup | cancel_ride | shift_active |
| shift_active | shift_end | idle |

Trip creation and Start Ride are distinct events. There is no pickup-arrival event. A created trip can only proceed to Start Ride or Cancel Ride. A completed/cancelled trip is closed; the next trip requires a new trip_create.

The legacy trip_start, trip_end, and ride_cancel transitions remain accepted only with their original v1 interpretation. New PWA and native overlay actions use v2.

## 3. Shift-start snapshot

At the atomic shift_start commit, Work resolves the single selected Driver reference and validates:

1. The Work-selected Driver reference exists and is well formed.
2. The referenced Admin Driver exists and is active.
3. Exactly one assignment is active at the transition instant.
4. The assigned Vehicle exists and is active.
5. Assignment and Vehicle identities are consistent.

The committed shift_start event stores immutable driverContext:

- schemaVersion: 1
- driverId
- assignmentId
- vehicleId

The active Work projection also retains shiftId (the shift-start event ID) and shiftContext. The selected Work record is atomically marked with lockedShiftId at shift start and unlocked at shift end; its revision participates in selection compare-and-set, preventing a selection/shift-start race. Driver/Vehicle selection is locked for the whole active shift. Admin edits, reassignment or later lifecycle changes do not rewrite the active shift snapshot or its historical events.

## 4. Trip-creation snapshot

At the atomic trip_create commit, Work copies the already captured active shift context; it does not re-resolve the current Admin profile or assignment. The event stores immutable tripContext:

- schemaVersion: 1
- shiftId
- driverId
- assignmentId
- vehicleId
- operationalDate

operationalDate is calculated in Asia/Kolkata using the 04:00 boundary: local times before 04:00 belong to the previous operational date; 04:00 and later belong to the current date. The snapshot is fixed at trip creation, including when the trip crosses 04:00.

start_ride, end_ride, and cancel_ride retain the trip's original context by referencing the created trip projection; they do not look up current Admin records or replace the snapshot.

## 4.1 Trip financial facts inherit immutable trip context

Completed-ride financial closeout and cancellation-fee records are linked to the stable trip identity and the corresponding committed end-ride or cancellation event. The financial amount may be entered after the event; the entry/submission timestamp is audit evidence and does not replace the trip's business date.

For every trip-linked financial fact:
- Resolve vehicle, driver, assignment, shift and Asia/Kolkata operational date from the immutable tripContext captured at trip creation in Section 4. Do not resolve current Admin selection, current assignment, or current vehicle to reconstruct historical attribution.
- Completed-ride gross fare uses the trip's captured operationalDate. A cancellation fee uses the same trip operationalDate and remains linked to the cancellation event. Neither is re-dated merely because the driver submits the amount later.
- Parking and toll inherit the same trip context and operationalDate. The existing trip-form payer/inclusion control is authoritative: customer-paid amounts contribute to the customer charge as represented by the trip form; driver-paid amounts are separate driver expenses. An amount already included in the fare/customer charge must not also be added as a separate driver expense.
- Keep tripId and the authoritative endRideEventId/cancellationEventId as source links. Do not create a separate trip-to-payout, cash/platform, or received-earnings workflow.
- A trip crossing the 04:00 boundary remains assigned to its creation shift and operationalDate; the financial closeout follows that same immutable assignment.

The Work/Trip snapshot is the authority for historical trip/vehicle/driver/date attribution. Finance/breakeven consumers must join through the public trip context rather than copy mutable Admin data or invent a second attribution engine.

## 5. Atomicity and recovery

- Browser commit includes the records, state, intent, immutable event and outbox in one Dexie transaction.
- Android commit includes the same logical writes in one Room transaction.
- Context resolution, validation and event commit occur inside that transaction. A missing, inactive, ambiguous or malformed Driver/assignment/Vehicle rejects the command without advancing revision or partially writing an event.
- Event IDs, command IDs and idempotency keys remain stable. Replays are idempotent.
- A recorded event's command and snapshots are immutable. Duplicate IDs with changed payloads are rejected.
- Existing v1 events and pending intents without these snapshots remain readable as legacy history. Never synthesize missing historical context or reinterpret a v1 trip_start as a v2 trip_create.

## 6. Required parity and regression checks

- Work selection is persisted independently of Admin Driver records and cannot change during an active shift.
- Both platforms reject shift start without one active selected Driver, one active assignment and one active Vehicle.
- Both platforms capture the same shift context at shift start and the same trip context at trip creation.
- Reassignment/profile changes after shift start do not rewrite the active shift or previously created trip snapshots.
- Start Ride is accepted only from going_to_pickup; End Ride only from trip_active; Cancel Ride only from going_to_pickup.
- Cancelled trips close without a ride-start timestamp. No replacement trip is created automatically.
- Browser and Android recovery, backup/restore, replay and projections preserve v1 and v2 records without dropping or fabricating data.
