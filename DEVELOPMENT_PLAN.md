# Development Plan

Sam Travels is delivered through **seven phases**. Work proceeds in order, with reviewable gates. Phase 1 architecture and contracts are approved. Phase 2 establishes the application and persistence foundation on this same pull request.

## Phase 1 — Architecture and contracts (approved)

**Scope:** documentation and design only.

- Confirm single-driver product boundary and seven-phase delivery model.
- Define layered architecture, modular/add-on feature contracts, and UI/form/business-logic separation.
- Define runtime-wide local persistence ownership: Room for installed Android; IndexedDB for browser-only PWA.
- Define typed command/state contracts for PWA and native overlay.
- Define durable intent, atomic completion, outbox/inbox, idempotency, crash recovery, and failure-injection expectations.
- Define event-scoped GPS evidence, versioned reliability policy, time integrity, and timer semantics.
- Define user-controlled Internet Access gateway, offline defaults, and integration capability registration.
- Define Dropbox backup/restore, consistent snapshots, checkpoint-before-restore, reset safeguards, and security/compatibility expectations.

**Exit gate:** contracts agree on source of truth, transaction boundaries, command/event identity, offline behavior, GPS event boundaries, clock semantics, network policy, backup/restore safety, security, migration, and module compatibility. User approval is recorded; implementation proceeds to Phase 2.

## Phase 2 — Application and database foundation (complete)

- Create React + TypeScript + Vite PWA and Capacitor Android scaffold.
- Establish domain/application packages, typed feature registration, repository interfaces, and dependency rules.
- Implement browser IndexedDB and Android Room adapters with versioned migrations.
- Implement typed Capacitor bridge and shared state/command contracts.
- Add local network policy store/gateway foundation and secure credential abstractions without enabling integrations by default.
- Establish CI, architecture checks, unit tests, repository integration tests, migration tests, and Android build baseline.

**Exit gate (verified):** the browser PWA builds and runs its unit/repository tests; the Capacitor Android debug APK and Android instrumentation-test APK compile; Room and Dexie are the selected runtime authorities; the Room bridge compiles; network policy defaults closed. The Android Room instrumentation test is included and compiled in CI; emulator/physical-device execution and lifecycle validation remain part of Phase 7.

## Phase 3 — Shared driver workflow and PWA/native overlay synchronization

- Implement single-driver shift, ride/trip, approach, cancellation, and completion state machine.
- Implement immediate gesture feedback, durable intent enqueue, event-scoped GPS acquisition, and atomic completion.
- Implement event IDs, ordering, conflict rejection, idempotent replay, transactional outbox/inbox, and revision catch-up.
- Synchronize PWA and native overlay locally without refresh or internet.
- Implement Asia/Kolkata clock, persisted UTC transitions, timer derivation, and clock-integrity warnings.
- Keep all core workflows offline; no continuous GPS tracking.

**Implementation delivered; device acceptance outstanding:** shared versioned driver commands and transition rules; durable Room/Dexie intents, events, projection and outbox; event-scoped GPS bridge; PWA controls; native overlay; stale-command rejection and pending retry are implemented. Browser automated tests and CI must pass. Physical-device permission, GPS, overlay, process-death/reboot, and timing validation remain a release gate; do not claim those are complete from CI compilation alone.

## Phase 4 — Core workflow, persistence, recovery, and modularity hardening

- Audit and reduce oversized or multi-responsibility files; put every capability in its proper owner area.
- Enforce dependency direction, public capability contracts, source-size limits, and readable source formatting in CI.
- Keep domain, application, persistence, platform adapters, and presentation independently replaceable.
- Harden shared driver transitions and ensure the PWA and native overlay use the same authoritative state and atomic command boundary.
- Verify Room transactions for enqueue, completion, idempotency, conflict rejection, event history, and outbox.
- Verify Dexie transaction parity for browser-only PWA.
- Complete startup reconciliation, pending-intent recovery, stale-operation handling, and user-visible recovery states.
- Add failure-injection, concurrency, migration, and native repository tests.
- Keep business modules deferred until the driver workflow and recovery acceptance gate passes.

**In progress:** capability ownership and dependency rules are enforceable in CI; web UI state/orchestration has been separated from presentation; native transition policy and transactional store have explicit ownership; browser IndexedDB and Room close/reopen recovery are tested; concurrent PWA/native enqueue is serialized; and Android replay of a completed transition is tested both in-process and after durable Room reopen. Run #128 was cancelled when newer commits superseded it; run #129 passed the web checks and its Android emulator instrumentation stage was still running when Phase 5 work began. The latest Phase 4 replay test is included in run #129. Physical-device validation remains outstanding. Do not mark Phase 4 accepted until the required CI and device gates are satisfied.

## Phase 5 — Business modules (incremental, deferred)

- Add Log Book, Finance, Vehicle, Performance, Admin, and other business capabilities incrementally after the core workflow is accepted.
- Preserve module isolation, historical dates, offline persistence, and independently tested calculations.
- Do not broaden product scope without an explicit user-approved feature slice.

**Started — architecture-only Work/Shift slice:** introduced `packages/features/work-shift/index.ts` as the public capability contract; routed the existing Work/Shift UI and platform adapter types through that entry point; and extended the architecture gate so lower layers cannot depend on feature modules and the feature contract cannot depend on UI or persistence adapters. This is a behaviour-preserving boundary step only. No new screens, workflows, calculations, business records, or business-module functionality were added. The next steps in this phase remain limited to incrementally placing the already-existing Work/Shift capability behind this contract without changing its behaviour.

**Exit gate:** each requested module is separately scoped, reviewed, tested, and approved.

## Phase 6 — Recovery and resilience

- Implement Dropbox OAuth with least-privilege scopes and secure token storage.
- Implement consistent versioned snapshots, encrypted backup packages, daily best-effort backup, retry, and retention.
- Implement user-initiated restore with validation, checkpoint, confirmation, staged replacement, and post-restore verification.
- Add optional online capabilities only through the network gateway; reverse geocoding remains optional enrichment.
- Verify disabled policy blocks all app-initiated network requests.

**Exit gate:** backup/restore, auth expiry, offline deferral, integrity validation, retention, and network policy enforcement pass.

## Phase 7 — Internet integrations and release readiness

- Run full unit, integration, browser, migration, security, failure-injection, and Android instrumentation suites.
- Validate PWA and signed Android release builds on physical devices.
- Verify permission flows, offline behavior, overlay lifecycle, event-based GPS, recovery, backup/restore, and clock integrity.
- Implement optional Internet integrations only through the network gateway.
- Resolve release blockers and prepare release artifacts only after explicit approval.

**Exit gate:** all required checks green, physical-device acceptance recorded, no unresolved data-integrity blocker, and user approves release.

## Cross-phase engineering gates

- **Persistence ownership:** Room is the sole Android business database; IndexedDB is authoritative only in browser-only PWA. No dual writes.
- **Transaction/recovery:** follow [Transaction and Recovery Contract](docs/TRANSACTION_AND_RECOVERY_CONTRACT.md); gesture feedback is not durable acceptance and transport is at-least-once/idempotent.
- **GPS/time:** follow [GPS Evidence and State Timing Contract](docs/LOCATION_AND_STATE_TIMING_CONTRACT.md); no continuous tracking; thresholds are explicit/versioned; later fixes are never backdated.
- **Network:** follow [Internet Access Control Contract](docs/NETWORK_ACCESS_CONTRACT.md); master policy defaults disabled and all requests pass through the gateway.
- **Backup:** follow [Dropbox Backup and Recovery Contract](docs/DROPBOX_BACKUP_CONTRACT.md); consistent snapshot, validation, checkpoint-before-restore, and explicit confirmation.
- **Modularity/security:** follow [Feature Module Contract](docs/FEATURE_MODULE_CONTRACT.md) and [Security, Privacy, and Compatibility Contract](docs/SECURITY_AND_COMPATIBILITY_CONTRACT.md).
- **Single-driver scope:** do not introduce multi-driver or fleet features without a new approved scope decision.

## Definition of done

- Acceptance criteria and failure cases are documented before implementation.
- Domain logic has unit tests; persistence has migration/recovery tests.
- UI flows have component/browser coverage.
- Native behavior has Android instrumentation and physical-device coverage where applicable.
- Offline, duplicate-event, crash, reboot, clock-change, and restore paths are tested.
- Architecture checks, CI, and tests are green; no secrets or tokens are committed.
- User-facing permissions, limitations, backup state, and recovery state are explicit.

## Delivery rule

Prefer complete vertical slices over disconnected screens. Do not merge unfinished features merely because the UI renders. Preserve stable contracts and expand them through reviewed, versioned changes.
