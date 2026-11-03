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

**Automated CI gate passed; physical-device acceptance outstanding:** capability ownership and dependency rules are enforceable in CI; web UI state/orchestration has been separated from presentation; native transition policy and transactional store have explicit ownership; browser IndexedDB and Room close/reopen recovery are tested; concurrent PWA/native enqueue is serialized; and Android replay of a completed transition is tested both in-process and after durable Room reopen. Run #135 on commit `3ce16e5` completed successfully: web checks/build and Android build, unit tests, and emulator instrumentation all passed. Physical-device validation remains outstanding for permission changes, GPS retry, overlay/service restart, process interruption, offline relaunch, and reboot. Do not mark Phase 4 accepted until those device checks are recorded.

## Phase 5 — Business modules (incremental, deferred)

- Add Log Book, Finance, Vehicle, Performance, Admin, and other business capabilities incrementally after the core workflow is accepted.
- Preserve module isolation, historical dates, offline persistence, and independently tested calculations.
- Do not broaden product scope without an explicit user-approved feature slice.

**Approved Phase 5 slice complete — Work/Shift capability modularity:** introduced `packages/features/work-shift/index.ts` as the public capability contract; routed the existing Work/Shift UI, platform adapter types, and contract tests through that entry point; and extended the architecture gate to enforce dependency direction, prohibit feature dependencies on UI/storage adapters, and reject external consumers that bypass the public Work/Shift entry point to import its domain/application implementation directly. Added `tests/work-shift-contract.test.ts` to exercise command creation, transition policy, and completion validation through the public entry point. This is a behaviour-preserving architecture/test completion only. No new screens, workflows, calculations, business records, or business-module functionality were added, in accordance with the narrowed driver-workflow-first scope. Log Book, Finance, Vehicle, Performance, Admin, and other business modules remain intentionally deferred until separately approved; this does not claim those modules are implemented.

**Exit gate:** each requested module is separately scoped, reviewed, tested, and approved.

## Phase 6 — Recovery and resilience

- Implement Dropbox OAuth with least-privilege scopes and secure token storage.
- Implement consistent versioned snapshots, encrypted backup packages, daily best-effort backup, retry, and retention.
- Implement user-initiated restore with validation, checkpoint, confirmation, staged replacement, and post-restore verification.
- Add optional online capabilities only through the network gateway; reverse geocoding remains optional and is not required for the driver-first scope.
- Verify disabled policy blocks all app-initiated network requests.

**Implementation in progress — recovery vertical slice now present in code:**

- Added the packages/features/backup public capability with backup-encryption-v1: AES-256-GCM payload encryption, a fresh 256-bit DEK and 96-bit nonce per backup, authenticated manifest metadata, SHA-256 plaintext integrity validation, Argon2id v1.3 via the bundled hash-wasm WebAssembly implementation (64 MiB, 3 iterations, parallelism 1), and independent passphrase/recovery-key DEK envelopes. A stable user recovery key can be reused across backup generations; the app must show/save it at initial setup/rotation and must not log or upload it.
- Added production encrypted package parsing/serialization and tests for the production Argon2id provider, both recovery paths, stable recovery-key reuse, wrong passphrases, and authenticated tampering.
- Added consistent browser IndexedDB snapshots in one read transaction across records, driver state, intents, events, and outbox. Browser restore validates schema/counts/revision, creates a durable checkpoint before replacement, performs a single replacement transaction, verifies the restored state, supports rollback, and retains the checkpoint until explicit verification and discard.
- Added an Android Room backup bridge that snapshots the authoritative Room records in a transaction, creates a separate durable recovery checkpoint before replacement, validates the imported record envelope/count/schema/revision, replaces data transactionally, verifies restored record contents, supports rollback after interruption, and retains the checkpoint until explicit verification/discard.
- Added a cross-runtime backup/restore orchestration API. Added Dropbox OAuth 2.0 PKCE with least-privilege file scopes, state validation, refresh-token lifecycle, Android Keystore-backed credential storage, and a shared NetworkGateway boundary. Encrypted package upload/download, paginated backup history, and configurable retention operations are implemented in the Dropbox client. Local disconnect/status remain available while Internet Access is disabled.
- Added a passphrase-encrypted browser credential vault using Argon2id and AES-256-GCM, with a verifier for wrong-passphrase detection. OAuth tokens remain encrypted in a dedicated IndexedDB vault table, excluded from business snapshots and backup packages. The Dropbox client factory now supports Android Keystore storage and the unlocked browser vault. No token or recovery secret is stored in ordinary business records.

**Still required before Phase 6 can pass its exit gate:**

- Wire the backup connection, recovery-key/passphrase setup, manual backup, history, restore confirmation, and checkpoint verification/rollback operations into user-facing UI.
- Configure the user's Dropbox app key/client ID and redirect URI, then verify the real OAuth redirect, authorization, refresh, upload, download, and revocation/error paths. No credentials or tokens may be committed.
- Implement durable daily best-effort scheduling and retry/backoff. Android WorkManager and supported PWA scheduling need lifecycle-aware execution; the current Dropbox upload/retention methods are callable operations, not a scheduled job system.
- Add end-to-end Android instrumentation for Room snapshot/restore/checkpoint interruption and browser tests for checkpoint rollback, plus complete auth-expiry/offline/network-gateway failure-injection coverage.
- Add a user-facing browser-vault unlock/lock flow and ensure its passphrase is never persisted.
- Complete physical-device acceptance for Android background scheduling, app/process interruption, offline deferral, and restore recovery.

Do not mark Phase 6 complete until these remaining items are implemented and tested. Existing CI run #143 verified the earlier core foundation only; backup/recovery code requires its own complete green CI run.

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
