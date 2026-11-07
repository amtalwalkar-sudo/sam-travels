# Work Driver Trip Snapshot Integration Contract v1

**Status:** Implementation contract for the approved Admin Driver / Work integration  
**Owner:** Work/Shift capability (with read-only dependencies on Driver Records, Driver Assignment, and Vehicle)  
**Scope:** Persist the selected active Driver and the active vehicle assignment as immutable context on each newly committed trip-start event.

This contract implements the approved rules in `ADMIN_FUNCTIONAL_SPECIFICATION.md`. It does not create a second Work/Shift state machine, a fleet-dispatch capability, or a second source of truth for Driver or Vehicle records.

## 1. Authority and ownership

- Work/Shift remains the sole owner of shift/trip transitions, GPS evidence, event identity, revision ordering, durable intents, and recovery.
- Driver Records remains the owner of Driver profile and lifecycle.
- Driver Assignment remains the owner of assignment history.
- Vehicle remains the owner of Vehicle profile and lifecycle.
- Work stores only the currently selected Driver reference as Work configuration. It must not copy or own Driver profiles or assignment history.
- A trip-start event stores a point-in-time immutable snapshot. That snapshot is historical evidence, not a live foreign-key view.

## 2. Selected Driver

Work has at most one selected Driver at a time.

- Selection must reference an existing Driver whose lifecycle is `active`.
- Selection may be changed while no trip is active. Changing selection never edits existing events or trip snapshots.
- A selected Driver becoming inactive, missing, or lacking a valid active assignment blocks the next trip start. It does not rewrite prior trips.
- Selection is persisted in the existing authoritative record store: Room on Android and IndexedDB in browser-only PWA. Native Android must not dual-write business state to IndexedDB.
- Selection is configuration, not a Work/Shift state transition and must not increment the Work event revision.

## 3. Trip-start preconditions and capture

A new `trip_start` may be committed only when all conditions hold at the durable commit boundary:

1. Exactly one selected Driver reference exists.
2. The Driver profile exists and is active.
3. Exactly one assignment in that Driver's assignment history is active (no `unassignedAt`).
4. The assigned Vehicle exists and is active.
5. The assignment references that Vehicle and the assignment identity is valid.

Capture the following immutable `driverContext` on the committed trip-start event:

- `schemaVersion: 1`
- `driverId`
- `assignmentId`
- `vehicleId`

The trip's existing `command.transitionAt` is the effective trip-start timestamp; do not add a second competing timestamp.

The lookup, validation, and event commit must share the same durable transaction as the Work event/state/outbox writes. This closes the race where a Driver is reassigned, deactivated, or selection changes between preflight validation and trip commit. A failed precondition rejects the trip start without committing the event, advancing the Work revision, or leaving a partially attached snapshot.

## 4. Immutability and projections

- The snapshot is written once with the committed `trip_start` event and is immutable thereafter.
- `trip_end` and `ride_cancel` close the existing trip and do not replace its snapshot.
- Reassignment, Driver selection changes, Vehicle lifecycle changes, or later edits to profile fields must not mutate old snapshots.
- Trip-history projections copy the snapshot from the start event. They do not resolve current Driver/Vehicle records to reconstruct historical context.
- Existing historical events and trips without `driverContext` remain valid and are represented as legacy/unknown context. Never fabricate a Driver or Vehicle for them.

## 5. Contract compatibility and validation

- Extend the existing versioned Work event payload compatibly; the Work command/state machine schema remains version 1 unless a separate reviewed migration proves a version change is required.
- `driverContext` is optional only for legacy trip-start events. Newly committed trip-start events must include it.
- Validate the exact allowed keys, schema version, non-empty stable IDs, and event-kind placement. Reject `driverContext` on non-trip-start events.
- Browser and native validators must enforce equivalent rules.
- Backup export, restore, checkpoint recovery, and event replay must preserve and validate the snapshot. A restore must not silently drop or synthesize it.
- Unknown or malformed context must fail validation before replacing live data.

## 6. Platform transaction requirements

### Android

Use the existing Room `LocalDatabase` transaction and `DriverWorkflowStore` commit path. Read the Work selection record and Driver/assignment/Vehicle feature records through the existing records table within that transaction. Do not introduce another database, a parallel workflow store, or a non-transactional preflight-only check.

### Browser-only PWA

Use the existing Dexie Work event transaction and include the feature-records table in the same transaction. Read the selected Driver, Driver profile, assignment history, and Vehicle from that authoritative store inside the transaction.

The public application boundary should expose typed selection and trip-context contracts; platform adapters implement the same atomic rule. Do not expose private table access to UI or other features.

## 7. Required tests and release gates

- Select active Driver; start trip; verify exact Driver/assignment/Vehicle snapshot.
- Reject no selected Driver, inactive/missing Driver, missing assignment, multiple active assignments, inactive/missing Vehicle, and malformed references.
- Change selected Driver after a completed trip; verify the old trip remains unchanged.
- Reassign Driver after a completed trip; verify the old trip retains the original assignment and Vehicle.
- Race selection/reassignment against trip commit; transaction ordering must produce either a valid snapshot or a rejected start, never a mixed snapshot.
- Verify trip end/cancel preserves start context.
- Verify legacy events without context remain readable.
- Verify browser and native backup/restore/checkpoint/recovery preserve context and reject malformed context.
- Run domain/application, browser persistence, Android unit, Android instrumentation, architecture, and integrated regression gates before merge.

## 8. Explicit exclusions

This contract does not authorize multi-driver selection, multiple simultaneous active Drivers, fleet dispatch, automatic Driver assignment, retroactive trip edits, current-profile snapshots, payment attribution, or changes to GPS/recovery semantics.
