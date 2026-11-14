# Work/Shift Odometer and Daily Business-Kilometre Contract

**Status:** Implemented in the PWA and Capacitor/Android persistence paths; physical-device acceptance remains outstanding.  
**Owner:** Work/Shift.  
**Compatibility:** Legacy v1 events remain readable and are not backfilled with invented odometer values. New v2 shift transitions require confirmed readings.

## Authority

- Work/Shift is the sole authority for shift odometer readings and business-kilometre calculation.
- PWA and Capacitor/native Android use the same v2 command fields and validation. Room is authoritative on installed Android; IndexedDB is authoritative for browser-only PWA use.
- UI values are drafts only. A reading becomes authoritative only when the corresponding shift transition, event, projection and outbox are committed atomically.
- GPS, trip routes, fares, elapsed time and estimated map distance never substitute for odometer readings.

## Shift start

- Every v2 shift start requires a non-negative whole-kilometre odometer reading.
- The first-ever shift has no previous reading: the field starts empty and personal kilometres are reported as “Not available (first shift)”.
- Later shift starts prefill the last confirmed shift-end reading. A reading below that value is rejected.
- If the driver enters a higher reading, the command records the previous confirmed reading and the exact difference as personal kilometres. This is part of the immutable shift-start event.
- The confirmed start reading becomes the current shift's start reading and the latest confirmed odometer reading.

## Shift end

- Every v2 shift end requires a non-negative whole-kilometre reading greater than or equal to that shift's confirmed start reading.
- Business kilometres are calculated as end reading minus start reading. The client-provided calculated value is checked again at the authoritative commit boundary; it is not trusted as an independent input.
- The confirmed end reading becomes the latest confirmed reading for the next shift.
- A failed or interrupted shift-end command does not update the confirmed reading or create a daily distance contribution.

## Daily business-kilometre projection

- A shift-end commit appends one immutable shift contribution to the vehicle's `work:daily-business-km` projection in the same transaction as the shift event and state update.
- Each contribution links the shift ID, start/end event IDs, timestamps, both odometer readings and exact business-kilometre delta.
- Multiple shifts for the same vehicle and operational date aggregate without replacing earlier contributions. Duplicate shift contributions are rejected.
- The daily record is a derived projection. The immutable shift events and odometer readings remain the source of truth; the projection can be rebuilt.
- The public daily projection exposes `totalBusinessKm` as the sum of entries whose `allocationStatus` is `allocated`, and `unallocatedBusinessKm` as the separate sum of entries awaiting operational-boundary confirmation. Pending distance is never included in `totalBusinessKm`.
- A downstream consumer may treat a vehicle/operational-date total as fully allocated only when every contribution is allocated, `unallocatedBusinessKm` is zero, and the sum of allocated entry deltas reconciles exactly to `totalBusinessKm`. Missing, malformed, legacy-unresolved or contradictory source facts are an explicit incomplete/needs-attention state, not a zero-distance day.
- Legacy v1 shifts without confirmed odometer facts remain visible as unresolved history. They contribute neither fabricated business kilometres nor a fabricated zero-valued confirmed contribution.
- A shift that starts and ends in the same 04:00 Asia/Kolkata operational date is allocated to that date.
- If a shift has crossed the 04:00 boundary and rotation has not yet been confirmed, its distance remains `awaiting_operational_boundary` and is excluded from the published daily total. It is not assigned wholesale to either day. The implemented 04:00 rotation commits the shared end/start odometer reading and resolves the outgoing contribution to its operational date.

## Integrity, correction and recovery

- Shift command odometer values are immutable event data. Do not overwrite a submitted reading.
- Any future correction must append a linked correction with actor, reason, timestamp and source revision; it must preserve the original and deterministically rebuild affected daily projections.
- Browser transactions and Room transactions must atomically write the transition, event, projection, intent and outbox. A failed write must roll back all authoritative changes.
- Backup/restore must retain shift event odometer values and daily projections. Recovery must rebuild daily projections from source events without double-counting.
- Legacy v1 shifts remain visible in history but are not assigned fabricated start/end readings or business kilometres.

## Acceptance gates

1. First shift with empty start reading; personal km unavailable.
2. Subsequent start prefill; equal reading gives zero personal km; upward edit records exact personal km; lower reading rejected.
3. End reading equal to start gives zero business km; larger reading gives exact delta; lower reading rejected.
4. PWA and Capacitor/Room parity for commands, events, state and daily projections.
5. Retry, duplicate command, process restart, backup/restore and rollback do not duplicate or lose odometer facts.
6. Multiple same-day shifts aggregate; a confirmed 04:00 rotation resolves the outgoing shift contribution exactly once and starts the new operational date at the same odometer reading.
7. Before rotation, an awaiting-boundary contribution is visible in `unallocatedBusinessKm` and excluded from `totalBusinessKm`; after confirmed rotation it moves to allocated totals exactly once. A malformed/missing legacy contribution remains unresolved and cannot be represented as a complete zero-distance day.
7. Duplicate rotation, retry, process death, offline restart and backup/restore preserve one rotation and one daily contribution.
8. Physical Android acceptance remains a release gate for declaring this foundation fully accepted.

## Implementation status and remaining acceptance

The approved 04:00 logical-shift rotation and odometer confirmation flow is implemented. Work exposes the pending boundary action, defers it during an active trip, and commits the outgoing shift end, daily-distance contribution, incoming shift start, driver/vehicle continuity and outbox atomically in the PWA and Android Room paths. Physical-device acceptance is still outstanding; do not treat passing automated Android tests as a substitute for testing on the target phone.

Until a pending boundary is confirmed, cross-boundary business kilometres remain explicitly unallocated. Maintenance must consume only fully allocated, confirmed daily business kilometres; it must never accrue against the unallocated bucket.

## 04:00 operational-day boundary rotation (approved)

- The operational-day boundary is 04:00 in `Asia/Kolkata`.
- A boundary must never interrupt an active trip. If the boundary passes while the driver is going to pickup or is on a trip, the existing logical shift remains active until that trip reaches a terminal state.
- Once the trip ends, Work presents a required boundary-rotation action and asks for one confirmed odometer reading. It must not silently rotate in the background or infer the reading from GPS, route distance, elapsed time or a prior reading.
- The confirmed reading closes the outgoing logical shift and starts the incoming logical shift at the same odometer value. The shared reading prevents a gap or double-count between the two logical shifts; the outgoing shift's exact odometer delta is assigned to its existing operational date and the incoming shift starts on the new operational date.
- Rotation is one authoritative, idempotent operation: persist the outgoing shift-end fact, its daily business-kilometre contribution, the incoming shift-start fact/state, and integration outbox effects atomically. A partial rotation is not allowed. A retry must return the original result and must not append a second daily contribution.
- The driver and vehicle assignment remain locked/continuous across rotation; rotation must not require reselecting the driver or vehicle, and must preserve the confirmed odometer as the next start baseline.
- If no trip is active when the boundary is reached, the same required confirmation is presented immediately. If the app is offline, the boundary action remains visible and can be completed under the existing durable offline/GPS recovery rules; it must not fabricate a reading.
- If the user delays confirmation after 04:00, the pending boundary remains outstanding. No new operational-day kilometres are attributed until the rotation is committed; the system must expose the pending state rather than silently misallocate distance.

### Boundary-rotation acceptance

1. At 03:59, no boundary rotation is requested.
2. At 04:00 during pickup or an active trip, no shift-end transition is attempted and the trip remains uninterrupted.
3. When that trip reaches a terminal state after 04:00, Work requests one odometer reading and offers one logical rotation action.
4. The same odometer value is used as outgoing end and incoming start; the outgoing contribution is allocated once to the old operational date and the new shift belongs to the new operational date.
5. A boundary reached while idle/shift-active (no trip) requests confirmation immediately.
6. Rotation survives duplicate taps, GPS retry, process death, offline restart and backup/restore without duplicate events or daily distance.
7. Driver/vehicle identity and selection lock remain continuous across the rotation.


## Maintenance daily accrual records

- Maintenance accrual is downstream of the authoritative `work:daily-business-km` projection; it never derives kilometres from GPS, fares, trips or elapsed time.
- A vehicle/operational-date accrual is eligible only when every daily contribution has `allocationStatus: allocated`, the unallocated total is zero, and the allocated entry sum exactly matches the published daily total.
- The immutable accrual stores the source daily-record ID and revision, operational date, allocated kilometres, rate effective on that date, rate snapshot and paise amount. Its identity is deterministic per vehicle and operational date.
- Repeating the same accrual request returns the existing record. A changed source revision or different calculation is an immutable conflict; an existing accrual is never rewritten to follow later rate changes.
- A committed 04:00 rotation closes the outgoing operational day and its durable Work outbox invokes the Maintenance accrual integration. Ordinary `shift_end` events do not trigger accrual because another shift may still contribute to the same operational date.
- The integration locates the exact daily projection contribution by outgoing shift ID and rotation event ID, and calls Maintenance only when the projection is fully allocated with zero unallocated kilometres. Missing, ambiguous or inconsistent source records are not accrued.
- Replayed outbox events return the existing accrual when its daily source ID, revision and business/personal kilometre totals still match. The original effective-rate and paise snapshots remain immutable even if a later rate entry is appended; a changed daily source revision remains an immutable conflict.
- Backup and restore validate the daily source link, revision, full allocation, reconciled kilometre total and effective-rate snapshot. A snapshot with an incomplete or inconsistent source is rejected.


## Personal-distance and Maintenance cost attribution (approved)

- At each subsequent shift start, the odometer difference from the previous confirmed shift end is wholly personal distance. For example, previous end 500 km and next start 550 km means 50 personal km and 0 business km from that gap.
- The inter-shift gap is persisted on the authoritative shift-start event and carried as a separate `personalKm` value into the Work daily-distance contribution. It is never included in the business-kilometre total.
- Maintenance accrual calculates business Maintenance amount as allocated business kilometres multiplied by the rate effective on the operational date. Personal Maintenance amount is calculated separately as personal kilometres multiplied by that same effective rate; it is not included in the business `amountPaise` or business expense totals.
- Both personal and business distance/amount attribution must be deterministic in integer paise, immutable, parity-tested across browser and Android Room, and backup/restore validated. Unknown or unclassified costs must not be silently apportioned.
- Maintenance remains the currently implemented per-kilometre cost-rate capability. Fuel has not been implemented and is explicitly out of scope: do not introduce Fuel records, UI, calculations, or accruals in this slice. A later Fuel feature may add its own cost/km rate and reuse this separation.
