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

**Automated engineering slice complete; external/device acceptance intentionally deferred.**

Implemented capabilities:
- Dropbox OAuth 2.0 Authorization Code + PKCE, least-privilege app-folder scopes, state validation, refresh-token lifecycle and revocation when online. Credentials are stored in Android Keystore-backed storage or the passphrase-encrypted browser vault; secrets are excluded from business records, snapshots, package contents, WorkManager inputs, and logs.
- Consistent versioned browser IndexedDB and Android Room snapshots; AES-256-GCM encrypted backup packages with authenticated manifest metadata, integrity validation, fresh DEK/nonce per package, Argon2id passphrase protection for V1, and recovery-key-only V2 support. V1 restore compatibility is retained.
- Restore flow with validation, explicit confirmation, durable checkpoint-before-replacement, staged transactional replacement, verification, rollback, and checkpoint retention until user verification/discard.
- Dropbox upload/download/history, refresh, bounded transient retry/backoff, collision-safe upload identity, remote metadata/size verification, retention with protection of the selected known-good backup, and NetworkGateway/Internet Access policy enforcement.
- Android daily best-effort WorkManager schedule with connected-network constraint, unique periodic/immediate jobs, bounded retry, policy re-check before requests, Keystore-protected recovery key, run status, interrupted-run reconciliation, and collision-safe V2 upload.
- Cross-runtime native V2 package fixture verified by the TypeScript parser/decryptor. Automated test coverage includes OAuth policy/state/token refresh, retry and retention decisions, interrupted-run status reconciliation, Room restore transaction rollback under injected failure, and secure recovery-key vault persistence.
- Android release variant and Android emulator instrumentation included in the automated CI gate.

**Automated verification:** CI run [#308](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/41835374476), head `b0e70d45db3becb8e53f8b756503e9da7fa25c25`, completed successfully. Web architecture checks, tests and production build passed; Android Capacitor sync, debug/unit/instrumentation test tasks and unsigned release assembly passed. This proves automated build/test status only.

**Acceptance still pending by explicit user deferral:**
- Real Dropbox app/client ID setup and account-backed OAuth redirect, authorization, refresh, upload/download and revocation acceptance. No credentials or tokens are to be committed.
- Physical Android acceptance of background execution across Doze, reboot, locked-device/Keystore availability, app/process interruption, offline deferral/retry, OAuth callbacks and restore recovery.
- User acceptance of the backup/restore experience with disposable data, including a real restore/rollback run.

Do not mark Phase 6 fully accepted until those external/device checks are completed and recorded. Reverse geocoding remains optional and outside this phase's required scope.

## Phase 7 — Internet integrations and release readiness

- Run full unit, integration, browser, migration, security, failure-injection, and Android instrumentation suites. CI now additionally assembles the Android release variant (unsigned build validation).
- Validate PWA and signed Android release builds on physical devices; signed artifact generation requires owner-controlled signing credentials and explicit release approval.
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
