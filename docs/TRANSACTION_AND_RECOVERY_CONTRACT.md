# Transaction and Recovery Contract

## Purpose and guarantees

This contract defines how Sam Travels accepts, persists, completes, publishes, and recovers a local business action when GPS, storage, the WebView, the native overlay, the Android process, or the device is interrupted.

The guarantee is **durable, ordered, idempotent recovery**, not magical exactly-once execution. Delivery and replay may occur more than once; stable identities and transactional deduplication ensure that one accepted business effect is applied at most once. No layer may claim an action is recorded before its authoritative local commit succeeds.

## Command identity and acceptance boundary

Every state-changing user action carries:
- A globally unique command ID and, for a driver transition, a stable event ID/idempotency key.
- A versioned command/event schema and origin surface (`pwa` or `native_overlay`).
- The original transition instant captured at gesture/command receipt, plus the applicable business-date/timezone context.
- The expected prior state and revision, used for ordered validation rather than blind overwrite.

The presentation acknowledges the gesture immediately and shows a pending state without waiting for GPS, storage, a bridge round trip, or network access. This is a **gesture acknowledgement only**.

The durable acceptance boundary is the successful commit of the pending command/intent to the runtime's authoritative database (Room on Android, IndexedDB in browser-only PWA). Enqueue uses background I/O and must be prompt. If this commit fails, show **not safely queued / needs attention**; do not claim the action is saved, recorded, or recoverable. Do not silently discard the failure or require an unbounded wait on the UI thread.

Once durably queued, the command must not be re-enqueued as a new action merely because the user repeats a gesture, a surface reloads, or a notification is redelivered. Resolve retries using the original command/event ID.

## Transaction boundaries

### 1. Durable intent transaction

Validate command shape and identity, then atomically persist:
- The pending command/transition intent and its stable IDs.
- Its immutable original transition timestamp, origin, schema version, and expected state/revision.
- Its lifecycle status and ordering metadata needed by the coordinator.

This transaction establishes recoverable work. It does not by itself mean a GPS-required business transition is complete.

### 2. Completion transaction

After the ordered coordinator validates the command and the event-specific GPS request returns a fix that passes the named, versioned reliability policy, atomically commit in the authoritative database:
- The accepted immutable transition event and its event-specific GPS evidence, keeping transition time distinct from fix time.
- The resulting authoritative state projection and next revision.
- The terminal event status (recorded) and any durable outbox entries required for post-commit publication or follow-up.

Where a command does not require GPS, its domain event, projection/revision, completion status, and outbox entries use the same atomic completion principle without a location step.

If the completion transaction fails, none of its writes may be exposed as committed. The previously committed pending intent remains available for retry/recovery. Never publish the new revision or mark the transition recorded on a failed/unknown commit.

### 3. Post-commit side effects

Bridge notifications, UI rendering, and other external side effects occur only after the authoritative commit. They are not part of the database transaction. Persist required follow-up work in a durable outbox in the same transaction as the business change; deliver it at least once and mark delivery only after the receiver acknowledges durable handling.

## Shared transaction lifecycle and projection authority

Every state-changing command follows one ordered lifecycle on both IndexedDB and Room:

1. **Validate** the versioned command/event envelope, required evidence, timestamps, and allowed transition before mutation.
2. **Resolve identity and ordering** using stable event ID, command ID, idempotency key, expected prior state, and expected revision. An exact replay resolves to its durable prior outcome; reuse of an identity with a different payload is rejected; stale or competing commands do not overwrite newer state.
3. **Commit authoritative data atomically**: immutable source event/evidence, next state and revision, terminal intent status, and durable outbox work share one database transaction. A failure at any write boundary exposes none of those completion writes as committed; the previously durable intent remains retryable.
4. **Rebuild derived projections** from the committed source event stream after the authoritative transaction. Timeline, trip-history, summaries, and caches are read models only: they are not accepted as command input, are not a source of truth, and are reconstructible after process/database restart or restore.
5. **Acknowledge durable completion** only after the authoritative commit succeeds. Notifications and projection refreshes are post-commit effects; replay may repeat delivery but must not repeat the business effect.

Restore uses the same ordering discipline. Validate/decrypt the complete backup before mutation; capture a consistent pre-restore checkpoint; replace all registered participants atomically; read back and compare the committed dataset; and retain the checkpoint until verification is explicitly recorded. If the process stops after replacement but before verification, startup recovery rolls back the unverified restore from the checkpoint. If replacement transaction aborts before commit, the old dataset remains authoritative and no partial replacement is exposed.

Startup recovery is a process boundary, not a repeated read-side action. Browser runtime memoizes successful reconciliation for the current page process and retries after a failed recovery; a page reload starts a new recovery pass. Android uses one process-wide gate shared by the Backup plugin, DriverWorkflow plugin, generic Room record gateway, and native overlay service. No native Room-backed read/write, driver state/intent/event operation, or backup export/restore may pass the gate before checkpoint reconciliation succeeds. A successful restore in the current process is not mistaken for a process-death interruption by another plugin or service; if rollback itself fails, the gate is invalidated and operational access remains blocked until recovery succeeds. Before replacement, native restore also verifies that the snapshot/manifest revision matches the revision inside the authoritative driver-state record.

## Event-scoped GPS and interruption

- Only the defined lifecycle actions request location: shift start/end, trip start/end, and ride cancellation. No continuous tracking, periodic polling, or background location listener is permitted between events.
- Each accepted GPS-required event owns one bounded fresh-fix request. Stop that request after success or recoverable timeout/failure.
- Keep the original transition instant immutable. Store the actual GPS fix instant separately.
- If the process/device stops before a fix is durably committed, preserve the pending intent and resume/retry acquisition when execution is available. A later fix is evidence of the later fix time; never backdate it or claim it proves the original location.
- If a fix was obtained in memory but the completion transaction did not commit, it is not durable evidence. Reacquire and validate a fresh fix rather than inventing or assuming the lost snapshot was stored.
- Never substitute stale last-known coordinates, merge fixes between rapid events, or associate one event's fix with another event.
- GPS acquisition and persistence run off the Android main/UI thread. Internet is not required for GNSS acquisition or local recovery.

## Ordered coordination and conflicts

One coordinator serializes state-changing commands against the latest durable state/revision. A command whose expected prior state/revision is stale must be revalidated; it is either accepted as a valid next transition or rejected/marked for attention with a clear reason. Do not use last-write-wins to resolve driver lifecycle conflicts.

For conflicting actions such as End Ride and Cancel Ride, only one valid transition may commit from a given prior state. The losing/stale command remains auditable and receives an explicit rejected/needs-attention outcome; it must not create a second or contradictory business transition.

Rapid distinct gestures retain distinct IDs and order. Duplicate delivery of the same ID is a no-op after the original outcome is known. Cross-surface notifications never initiate GPS; only the one accepted transition owns its event-specific acquisition.

## Outbox, inbox, and idempotent replay

- The outbox is written in the same authoritative transaction as the state change it announces.
- Each outbox message has a stable message ID, event/command reference, schema version, destination/capability, creation revision, and delivery state.
- Receivers maintain an inbox/deduplication record or equivalent idempotency boundary. Applying a message and recording its handled ID must be atomic in the receiver's store.
- Delivery is at-least-once. Retry after timeout or process death using the same message ID. A sender must not infer failure merely because an acknowledgement was lost.
- Notifications are hints, not state. On WebView/overlay attach or resume, query the authoritative latest revision and rebuild from it; deduplicate notifications by event ID/revision.
- Replay is ordered by the coordinator and safe to repeat. Replaying a completed event, inbox message, or outbox delivery must not duplicate a business record, state transition, payment, or revision.

This provides exactly-once **business effects through idempotency and transactions**, not an exactly-once transport guarantee.

## Lifecycle statuses and user feedback

Persist enough status to distinguish at least:
- `received`: gesture/command observed in the current presentation; not yet durable.
- `pending_persistence`: enqueue or completion persistence is in progress.
- `pending_location`: durable intent exists; event-specific GPS acquisition is outstanding.
- `recorded`: required evidence, event, projection/revision, and completion status committed durably.
- `needs_attention`: a durable or validation failure requires retry, permission action, or user review.
- `rejected`: command was stale or invalid and did not change business state.

A status shown after restart must be reconstructed from durable data, not a volatile component flag. Explain whether an action is safely queued, awaiting location, recorded, or requires attention. Never imply a pending intent is a completed business record.

## Recovery sequence

On startup, WebView recreation, overlay reattachment, process recreation, or device reboot:
1. Open and validate the authoritative database and schema/migration state before presenting operational state.
2. Load the latest committed projection/revision and restore active shift/trip/approach state from durable transitions.
3. Scan durable pending intents, incomplete completion work, and undelivered outbox entries.
4. Re-submit pending commands to the ordered coordinator using their original IDs and timestamps; deduplicate already completed outcomes.
5. Resume eligible event-scoped GPS acquisition only when the app/runtime can legally execute it. If Android defers execution (including force-stop or OEM restrictions), retain the intent and show the deferred/needs-attention reason.
6. Retry outbox delivery idempotently. Publish committed revisions only after reading/confirming the durable commit.
7. Reconcile each active surface from the latest durable revision; do not depend on notifications having been received while it was inactive.

Recovery must be non-destructive. Corruption, migration failure, or an unknown transaction outcome must preserve source data and enter an explicit recovery/review path. Never clear/recreate the database merely to make startup succeed.

## Failure-window policy

| Interruption point | Required outcome |
|---|---|
| Gesture acknowledged, before durable enqueue | Not safely queued; do not claim saved. Offer retry/review. |
| Pending intent committed, before GPS starts | Recover the same intent and request its event-scoped fix when execution is available. |
| GPS request interrupted or times out | Keep intent pending/needs-attention; retry only under the bounded location policy. |
| Fix obtained, before completion commit | Treat in-memory fix as non-durable; preserve intent and reacquire a fresh fix. |
| Completion transaction commits, before notification | Business event remains recorded; replay outbox/notification without duplicating it. |
| Receiver commits, acknowledgement is lost | Redelivery is deduplicated by inbox/message ID. |
| WebView or overlay closes during work | Durable Room state remains authoritative; reattach by reading latest revision. |
| Database commit fails | Do not publish a committed revision; retain prior durable intent and surface failure. |
| Device is force-stopped or OS defers work | Preserve pending work; resume when the user reopens or Android permits execution. |

## Required failure-injection and acceptance tests

1. Kill the process before enqueue commit; verify the UI never claimed durable acceptance.
2. Fail the enqueue transaction; verify a clear not-safely-queued state and no business record.
3. Kill after intent commit but before GPS; reopen and verify the same event ID and original transition instant resume.
4. Interrupt GPS, revoke permission, return an invalid/stale fix, or time out; verify pending status and no fabricated coordinates.
5. Kill after GPS returns but before completion commit; verify recovery reacquires a fresh fix and does not backdate it.
6. Fail each write in the completion transaction; verify event, evidence, projection, revision, and outbox are all committed or none are exposed as committed.
7. Kill immediately after completion commit but before notification; verify outbox replay updates both surfaces once.
8. Deliver duplicate commands, notifications, and outbox messages; verify no duplicate records, payments, state transitions, or revisions.
9. Race conflicting End Ride and Cancel Ride commands from PWA and overlay; verify one valid transition wins and the other is explicitly rejected/flagged.
10. Recreate WebView/overlay and reboot with pending work; verify authoritative state and pending statuses recover without internet.
11. Verify all GPS/database work is off the UI/main thread and no continuous/periodic location collection exists.
12. Exercise database corruption/migration failure; verify source preservation and a recoverable error path.
13. Inject failure at each event, state/revision, intent-status, and outbox write; verify transaction rollback on IndexedDB and Room.
14. Reopen each platform with a restore checkpoint in `checkpoint` or `restored_unverified`; verify startup recovery restores the pre-restore authoritative dataset and retains the checkpoint.
15. Rebuild Timeline and trip-history read models from authoritative events after restart and restore; verify no derived projection/cache is required to recover business state.

No test or release claim is satisfied by an emulator-only happy path; include deterministic automated transaction/failure-injection tests and physical-device Android validation for platform lifecycle behavior.
