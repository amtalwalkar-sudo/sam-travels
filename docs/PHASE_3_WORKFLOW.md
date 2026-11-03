# Phase 3 — Shared Driver Workflow and PWA/Native Synchronisation

## Scope

Deliver one durable single-driver shift/ride workflow shared by the browser PWA and the Android native surface. The PWA and overlay are controllers over one authoritative state, not independent state machines.

## First implementation slice

- Add a platform-neutral transition planner for shift start/end, ride start/end, and ride cancellation.
- Require a command ID, original transition instant, and expected state revision.
- Separate planning from completion: a planned transition is a pending intent, not a completed business event.
- Require one GPS evidence snapshot for each accepted transition, validated against gps-event-fix-v1 (50 m maximum horizontal accuracy and 30 s maximum age relative to the original transition instant).
- Reject stale revisions and illegal transitions; never resolve competing actions with last-write-wins.
- Advance the projection only after compliant evidence is supplied. The authoritative adapter must atomically persist the event and next projection.

## Remaining Phase 3 work

1. Persist pending intents and immutable event journal entries in Room and Dexie adapters with idempotent replay.
2. Add native event-scoped GPS acquisition and recoverable pending-fix handling; never use continuous location tracking or silently substitute last-known coordinates.
3. Add typed Capacitor command/query/subscription APIs and reconcile revisions when either surface attaches or resumes.
4. Implement native overlay commands against the same Room-backed use cases, including operation when the WebView is paused or absent.
5. Add deterministic concurrency, duplicate delivery, restart, and offline tests; verify Android bridge behavior on device.

## Safety boundaries

- Immediate UI acknowledgement is not proof of a durable enqueue or recorded event.
- The caller must durably store the pending intent before requesting GPS.
- A GPS failure leaves the intent recoverable and the state unchanged.
- Event GPS acquisition is initiated only by a validated transition; synchronization never starts location acquisition.
- Room remains the Android authority; Dexie remains the browser-only authority.
- No business forms, finance, Dropbox, or continuous tracking are pulled into this phase.

## Current status

The pure domain transition planner and unit tests are the first implementation slice. Persistence orchestration, native GPS acquisition, live bridge subscriptions, and overlay integration are not yet complete. Phase 3 is in progress, not complete.
