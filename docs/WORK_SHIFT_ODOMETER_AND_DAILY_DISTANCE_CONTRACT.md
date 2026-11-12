# Work/Shift Odometer and Daily Business-Kilometre Contract

**Status:** Additive implementation contract; physical-device acceptance remains outstanding.  
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
- A shift that starts and ends in the same 04:00 Asia/Kolkata operational date is allocated to that date.
- If a shift crosses the 04:00 boundary before the automatic logical-shift/odometer confirmation flow has split it, its distance is retained as `awaiting_operational_boundary` and excluded from the published daily total. It is not assigned wholesale to either day. The outstanding 04:00 boundary workflow must split/resolve that distance before it can be included in daily totals.

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
6. Multiple same-day shifts aggregate; 04:00-crossing shifts remain withheld until boundary splitting is implemented and accepted.
7. Physical Android acceptance before this foundation is declared complete.

## Explicit remaining dependency

The approved 04:00 logical-shift rotation and odometer confirmation while Online is still a required follow-on within this foundation. Until that boundary workflow is implemented and accepted, cross-boundary business kilometres remain explicitly unallocated. Maintenance accruals must consume only allocated, confirmed daily business kilometres; they must never accrue against the unallocated bucket.
