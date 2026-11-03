# Development Plan

Sam Travels is delivered through **seven phases**. Work proceeds in order, with reviewable gates. Do not begin a later phase until its required outputs and acceptance criteria are reviewed. Phase 1 architecture and contracts are approved. Phase 2 establishes the application and persistence foundation on this same pull request.

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
- Lock GPS event-fix v1 at 50 m / 30 s and backup-encryption v1 at AES-256-GCM with passphrase/recovery-key wrapping.

**Exit gate:** contracts agree on source of truth, transaction boundaries, command/event identity, offline behavior, GPS event boundaries, clock semantics, network policy, backup/restore safety, security, migration, and module compatibility. No contradictory phase plan or duplicate ownership rule remains. User approval is recorded; implementation proceeds to Phase 2.

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

**Exit gate:** both surfaces operate the same workflow; five GPS event types are verified; restart/reboot recovery, failure injection, offline operation, timer continuity, and physical-device responsiveness pass.

## Phase 4 — Business modules

- Implement Log Book history and records.
- Implement Finance, loans, EMI schedules, payments, and prepayments.
- Implement Vehicle, maintenance, and compliance.
- Implement Performance using domain-owned, independently tested calculations and date-range filters.
- Implement Admin configuration and backup/recovery controls.
- Keep modules independently addable and presentation replaceable.

**Exit gate:** module contracts, validations, historical dates, calculations, offline persistence, and regression tests pass without changing stable driver workflow behavior.

## Phase 5 — Recovery and resilience

- Complete startup recovery, interrupted-operation handling, and corruption/migration recovery.
- Validate process death, force-stop deferral, battery exhaustion, shutdown/reboot, Doze, permission revocation, and OEM battery restrictions.
- Verify recovery checkpoints, data reset safeguards, and user-facing recovery states.
- Add physical-device failure-injection coverage and operational diagnostics.

**Exit gate:** recoverable states and limitations are explicit; no silent data loss; supported interruption scenarios pass on representative physical Android devices.

## Phase 6 — Internet integrations

- Implement Dropbox OAuth with least-privilege scopes and secure token storage.
- Implement consistent versioned snapshots, encrypted backup packages, daily best-effort backup, retry, and retention.
- Implement user-initiated restore with validation, checkpoint, confirmation, staged replacement, and post-restore verification.
- Add optional online capabilities only through the network gateway; reverse geocoding remains optional enrichment.
- Verify disabled policy blocks all app-initiated network requests.

**Exit gate:** backup/restore, auth expiry, offline deferral, integrity validation, retention, and network policy enforcement pass.

## Phase 7 — Reliability validation and release

- Run full unit, integration, browser, migration, security, failure-injection, and Android instrumentation suites.
- Validate PWA and signed Android release builds on physical devices.
- Verify permission flows, offline behavior, overlay lifecycle, event-based GPS, recovery, backup/restore, and clock integrity.
- Resolve release-blocking defects, verify CI, prepare release notes and recovery instructions, and produce the signed Android artifact.
- Deploy PWA and publish release artifacts only after explicit release approval.

**Exit gate:** all required checks green, known platform limitations documented, no unresolved data-integrity blocker, and user approves release.

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
- CI is green; no secrets or tokens are committed.
- User-facing permissions, limitations, backup state, and recovery state are explicit.

## Delivery rule

Prefer complete vertical slices over disconnected screens. Do not merge unfinished features merely because the UI renders. Preserve stable contracts and expand them through reviewed, versioned changes.
