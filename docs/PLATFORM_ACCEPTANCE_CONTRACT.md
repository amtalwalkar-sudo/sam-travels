# PWA and Capacitor Platform Acceptance Contract

## Purpose

This contract defines the verification layers required before declaring a PWA/Capacitor foundation release-ready. It complements the detailed acceptance checks in the individual contracts; it does not replace their feature-specific test cases.

## Verification layers

### 1. Static and architecture checks

CI must verify:
- Dependency direction and feature boundaries.
- No direct feature access to Dexie, Room, or native plugin implementations.
- No Android business-data fallback to IndexedDB.
- No network request path bypasses the user-controlled network gateway.
- No forbidden continuous GPS implementation.
- No secret material in source, generated bundles, fixtures, or logs.
- Contract/schema version declarations and source-file size/readability rules.

Static checks are guardrails, not proof of runtime correctness.

### 2. Domain and application tests

- Run the same platform-neutral domain/application test suites against shared contracts.
- Verify deterministic validation, calculations, state transitions, idempotency, ordering, and error semantics.
- Test failure paths, stale revisions, duplicate commands, and conflicting transitions.
- Keep tests independent of React, browser storage, Capacitor, and Android APIs where the tested rule is platform-neutral.

### 3. Adapter and persistence tests

- Browser adapter tests cover IndexedDB transactions, quota/abort/unavailable storage, close/reopen recovery, and migrations.
- Android adapter tests cover Room transactions, process interruption boundaries, migrations, and repository consistency.
- Test representative prior schema versions, migration interruption/retry, integrity failure, and source preservation.
- Verify failed commits never appear as durable business state.
- Verify Android WebView and overlay observe the same Room-backed records and revision.

### 4. PWA integration tests

- Test offline shell startup, cached asset integrity, update staging/activation, and browser lifecycle recovery.
- Verify service worker does not own business data or bypass network policy.
- Test storage denial/quota failure and multi-tab behavior if multiple tabs are supported.
- Verify browser-only PWA does not require Capacitor or Android packages.

### 5. Capacitor and Android integration tests

- Test runtime handshake, bridge compatibility, payload validation, timeout/unknown outcome, listener lifecycle, and native plugin absence.
- Test Android database ownership and confirm no IndexedDB business-data fallback.
- Test permission denial/revocation, GPS timeout/retry, overlay permission separately from GPS, and native service recovery.
- Test build/release compatibility between packaged web assets and native plugin versions.

### 6. Physical-device acceptance

Emulator CI cannot establish all Android lifecycle and OEM behaviors. Before a production-ready Android acceptance claim, test on a supported physical device:
- App background/foreground and screen off/on.
- WebView recreation and Android process death.
- Device reboot with pending work.
- Event-scoped GPS acquisition, timeout, denial, and retry.
- Overlay permission grant, denial, revocation, and re-enable.
- Battery optimization/Doze behavior and OS deferral.
- App upgrade with existing data and pending work.
- Offline operation and recovery without cloud connectivity.

Record device/OS/build identity and outcome. A physical-device test may be deferred by explicit project decision, but then the release must be labelled as not yet physically accepted.

## Release gate and reporting

A release report must distinguish:
- Static/architecture checks.
- Domain/application tests.
- Persistence/migration tests.
- PWA integration tests.
- Android integration/emulator tests.
- Physical-device acceptance.
- External integration acceptance (for example, Dropbox), when in scope.

Do not collapse these into a single unqualified "all tested" statement. A successful CI workflow does not imply physical-device or live Dropbox acceptance. Missing/deferred gates must be reported explicitly.

## Change discipline

- This contract is a verification policy, not permission to implement every deferred feature.
- New capabilities add their own focused acceptance tests and must satisfy applicable shared platform gates.
- Do not weaken or skip a failing gate to obtain a green workflow; fix the underlying defect or document a reviewed, time-bounded exception.
