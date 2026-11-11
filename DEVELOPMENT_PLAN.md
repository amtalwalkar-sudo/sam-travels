# Development Plan

> **Plan provenance:** This document retains the staged architecture plan and its original phase decisions. Some scope guards below describe earlier documentation-only planning work and are historical, not a statement that the current PR is documentation-only. Current contract ownership is indexed in [docs/CONTRACT_INDEX.md](docs/CONTRACT_INDEX.md); current implementation and acceptance evidence must be read from the relevant audit at its named SHA.

## Permanent application architecture enhancement

The approved, frozen scope is [docs/PERMANENT_APPLICATION_ARCHITECTURE.md](docs/PERMANENT_APPLICATION_ARCHITECTURE.md). The Stage 0 repository audit and evidence-based gap matrix are [docs/PERMANENT_APPLICATION_ARCHITECTURE_AUDIT.md](docs/PERMANENT_APPLICATION_ARCHITECTURE_AUDIT.md). Implementation proceeds only through the approved stages and gates; Stage 5 remains authoritative. Current feature onboarding and acceptance are tracked by the owning feature contracts and their conformance audits.


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

**Approved detailed product workflow contract:** [DRIVER_WORKFLOW_CONTRACT.md](docs/DRIVER_WORKFLOW_CONTRACT.md) now records the shift/trip event distinctions, odometer requirements, Fare/Toll/Parking rules, operational-day assignment, and explicit PWA-controlled overlay lifecycle/full financial-entry parity. This is a documentation and product-rule milestone only. It does not claim that every detailed rule is implemented or accepted. Unresolved product decisions are listed in that contract and must be decided before their affected implementation slices are finalized.

**Approved shared form contract:** [FORM_ARCHITECTURE_AND_BEHAVIOUR_CONTRACT.md](docs/FORM_ARCHITECTURE_AND_BEHAVIOUR_CONTRACT.md) records the shared form architecture, form-specific policies, one Save-or-Submit action, lifecycle/status semantics, in-progress preservation, validation, fat-finger/illogical-entry safeguards, destructive-action safeguards, explicit units/currency/precision/rounding rules, adaptive viewport and scrolling policy, keyboard-safe layouts, automatic focus, Enter/Next sequential field navigation, appropriate numeric/custom keypad behaviour, forgiving correction, mobile touch/accessibility, compatibility, and conformance requirements. It defines universal repeated-entry workflows with form-declared save-per-entry or whole-batch completion, add-another/review/correction, duplicate prevention, interruption recovery, truthful status, and safe pause/resume. Section 20 now specifies the native Android overlay presentation: a transparent full-screen positioning window with a movable opaque form panel, dedicated drag handle, default bottom placement, remembered position independent of the underlying app, stable internal form geometry and primary-action location, thumb-zone ergonomics with left/right-hand preference, keyboard/safe-area adaptation, touch pass-through where supported, and PWA/native parity. This remains documentation only; it does not claim these guarantees are implemented or runtime-enforced.

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

## Phase 4B — Mandatory shared foundation runtime enforcement and acceptance

**Separate implementation phase; required before Phase 5 business-module expansion.** This phase turns the normative shared contract in [SHARED_FOUNDATION_ENFORCEMENT_CONTRACT.md](docs/SHARED_FOUNDATION_ENFORCEMENT_CONTRACT.md) into verified runtime and CI guarantees for every existing and future feature. It is not part of the documentation-only driver workflow change. No runtime implementation is authorized by this plan update.

**Implementation sequence:**
- Audit existing TypeScript, Kotlin/Android, Room, IndexedDB, GPS, lifecycle, network, recovery, backup/restore, feature-registration, and diagnostics paths against the shared contract. Produce a gap matrix that distinguishes already implemented, partially implemented, missing, and device-only acceptance.
- Reuse existing shared services and contracts; remove or prevent feature-local competing persistence, GPS, lifecycle, sync, and recovery paths. Do not rewrite stable working foundations without evidence.
- Close runtime gaps in durable command/intent handling, atomic commits, revision/outbox handling, idempotent replay, startup/resume/reboot reconciliation, and explicit pending/failed/needs-attention outcomes.
- Ensure event-scoped GPS and time integrity are mediated by shared platform ports with honest permission/OS-deferral outcomes; no continuous tracking.
- Enforce PWA/native overlay parity through the same application use cases and Room-backed Android state.
- Complete feature registration and dependency/version validation, full backup participant discovery/restore validation, and bounded privacy-safe diagnostics at real operation/recovery boundaries.
- Extend architecture enforcement across TypeScript and Kotlin/Android boundaries. Keep CI checks deterministic and fail closed on detectable bypasses.
- Add/extend automated tests and failure injection. Preserve existing database, command, bridge, and backup compatibility; migrations must be explicit and repeatable-safe.

**Mandatory automated acceptance tests:**
1. **Authority and boundary:** browser-only PWA writes only through IndexedDB adapter; installed Android WebView and overlay write through the same Room-backed repository/application boundary; no Android IndexedDB business-store fallback or dual write.
2. **Atomic durability:** inject interruption before intent commit, after intent commit, during completion, and after commit/before outbox delivery. Only committed operations are reported durable; restart reconstructs the correct state.
3. **Idempotency and concurrency:** replay identical commands, deliver outbox messages repeatedly, submit stale revisions, and race PWA/overlay commands. No duplicate trip, shift boundary, fare, odometer entry, or other business effect; conflicts are explicit.
4. **Lifecycle recovery:** close/reopen the app, recreate WebView/overlay, background/foreground, kill the process at each durable boundary, and simulate reboot/reconciliation. Pending and committed operations recover without relying on UI/service memory.
5. **GPS evidence:** test distinct fixes for each GPS-required event; valid accuracy/age boundaries; stale, inaccurate, unavailable, permission-denied/revoked, and OS-deferred outcomes. A later fix must never be backdated or reused for another event.
6. **Time integrity:** test timezone/DST-independent UTC persistence, Asia/Kolkata operational-day boundary at 04:00, clock changes, app downtime across the boundary, and idempotent single logical-shift rotation without breaking the continuous Online session.
7. **Offline/network policy:** complete local workflows without connectivity; queue only durable work; reconnect and replay in order; deduplicate repeated delivery; prove all network calls pass through the shared policy gateway.
8. **Surface parity:** issue each supported driver command from PWA and overlay; verify identical validation, financial calculations, pending/final states, and convergence on the same Room revision.
9. **Feature registration:** missing/duplicate IDs, incompatible versions, missing migrations/dependencies, and missing backup/restore declarations block write enablement; valid feature registration succeeds deterministically.
10. **Backup completeness and restore:** register a test persistent feature and prove its records/references are included without a second allowlist; reject missing/unknown participants and unsupported schemas before replacement; inject restore interruption and prove checkpoint/rollback and source preservation.
11. **Diagnostics:** verify bounded retention, redaction of GPS/secrets/financial payloads, explicit export only, no network transmission, and that diagnostics failure never fails a business transaction.
12. **Cross-platform architecture gate:** add fixtures proving the CI architecture checker catches prohibited TypeScript and Kotlin imports, direct persistence/platform access, dependency-direction violations, and feature-entry-point bypasses.
13. **Migration/compatibility regression:** migrate every supported prior Room/schema/contract fixture; preserve stable IDs, event ordering, timestamps, idempotency keys, and both supported backup V1/V2 readers.
14. **Full regression:** run the complete web, architecture, Android unit/instrumentation, persistence, recovery, backup, and restore suites with no weakening or broad suppressions of existing gates.
15. **Native overlay form ergonomics and parity:** verify transparent-window/opaque-panel composition, no Sam Travels header or bottom navigation, default bottom placement, drag-handle-only vertical movement, safe-boundary clamping, remembered position across host apps and form reopen, stable panel geometry and Save/Submit location, right/left-hand thumb reachability, touch pass-through where supported, keyboard/IME and safe-inset adaptation, orientation/small-screen behaviour, preservation of form state while moving/repositioning, and PWA/native Fare and Cancellation Fee parity. Keep physical-device/OEM acceptance separate from emulator/CI results.
16. **Automated form architecture enforcement and conformance:** validate every registered form against a versioned definition schema; enforce TypeScript and Kotlin/Android dependency boundaries and prohibit presentation-layer business logic, form-local persistence/recovery, and application-boundary bypasses; run form lifecycle, validation, Save/Submit, persistence/recovery, idempotency, migration/restore, and PWA/native parity tests; include negative fixtures proving prohibited patterns fail; make applicable checks required CI gates with actionable, privacy-safe diagnostics. Keep emulator/CI evidence distinct from physical-device/OEM acceptance.

**Device acceptance (separate from automated CI):**
- Verify screen-off/wake, permission changes, background restrictions/Doze, process death, force-stop/relaunch, reboot, GPS availability, and overlay reattachment on a representative Android device.
- Record OS/device/API-level outcomes and repeatability. Architecture must adapt to supported Android versions and OEM restrictions; do not hard-code one handset model.
- A powered-off device cannot execute work while off. Acceptance proves already committed data survives and reconciliation is correct after boot; it does not require an impossible shutdown callback or fabricated GPS event.

**Exit gate — blocks Phase 5 runtime feature expansion:**
- Every automated acceptance test above passes in CI.
- TypeScript and Kotlin architecture gates are required checks, not advisory jobs.
- Runtime gap matrix is closed or has explicitly approved, bounded exceptions.
- No known data-loss, duplicate-effect, migration, restore, or privacy blocker remains.
- Device-only limitations and results are recorded separately; CI green is not represented as physical-device acceptance.
- User reviews the evidence and explicitly authorizes proceeding to the next runtime feature phase.

**Historical scope guard:** This statement applied to the original planning phase when it was written. It does not describe the current PR #69, which contains implementation and integration work. Current PR scope and acceptance must be read from PR #69 and the exact-SHA evidence linked by the [Contract and Documentation Index](docs/CONTRACT_INDEX.md).

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

## Phase 7 — Automated release candidate and post-merge acceptance

- Run full unit, integration, browser, architecture, migration, security, failure-injection, and Android emulator instrumentation suites before merge.
- Assemble the unsigned Android release APK in CI. After the PR is merged, the push-to-main workflow publishes the APK as the `sam-travels-release-apk` GitHub Actions artifact.
- Verify the main-branch workflow succeeded and the APK artifact is present and downloadable before asking for physical-phone testing.
- Physical-device acceptance follows artifact publication, not precedes PR merge: validate permission flows, offline behavior, overlay lifecycle, event-based GPS, recovery, backup/restore, and clock integrity.
- Real Dropbox account/OAuth acceptance remains separately deferred by user decision; no credentials or tokens are committed.
- Signed production distribution remains a separate owner-controlled step requiring signing credentials and explicit release approval.

**Pre-merge exit gate:** required automated checks green, no unresolved automated data-integrity blocker, and PR ready to merge.
**Post-merge exit gate:** main-branch APK artifact verified; physical-device and Dropbox acceptance are recorded only when the user later performs those deferred checks.

## Cross-phase engineering gates

- **Forms:** follow [Form Architecture and Behaviour Contract](docs/FORM_ARCHITECTURE_AND_BEHAVIOUR_CONTRACT.md); every current/future form uses the shared architecture and declares its own business-specific lifecycle, action, validation, date/time, editing, deletion, and presentation policies.
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
