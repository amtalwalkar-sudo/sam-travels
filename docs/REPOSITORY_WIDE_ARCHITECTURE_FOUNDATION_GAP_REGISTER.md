# Repository-Wide Architecture Foundation Gap Register

**Status:** In-progress audit register; not an implementation completion certificate.  
**Audited revision:** `main` at `a99ea6f48b05d3df1e35a72266acdaa127c010d7` (2026-11-17).  
**Latest CI evidence at audit start:** workflow run [#44118872802](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/44118872802), exact same SHA; Architecture, Web, Android, Production geocoder verification and Integrated regression gate all succeeded.  
**Change scope:** Documentation only. This register does not change application source, tests, persisted data, contracts or runtime behaviour.

## 1. Purpose and evidence rules

This register updates the repository-wide audit against the current main revision without rewriting earlier audit snapshots. It consolidates gaps across calculation authority, feature ownership, application orchestration, screen/shell composition, persistence/recovery, cross-platform parity, diagnostics, accessibility and documentation.

A green CI run is evidence for the jobs actually executed. It is not proof of every requirement in the Architecture Foundation or UI/UX Shell contracts, and it does not replace physical-device, live-account or owner acceptance.

Status labels:
- **Confirmed gap:** current source inspection demonstrates an unmet boundary or missing proof.
- **Partially addressed:** a mechanism exists, but complete production wiring or contract evidence remains open.
- **Verification open:** insufficient source/test evidence to close the requirement.
- **Reconciled since prior audit:** an earlier finding appears corrected in current source; regression and integrated evidence still need to be tied to the latest revision.
- **Deferred acceptance:** explicitly outside automated repository verification and intentionally deferred; not a software defect.

## 2. Reconciliations against the earlier calculation/wiring audit

The earlier `CALCULATION_AUTHORITY_AND_APPLICATION_WIRING_AUDIT_V1.md` records a baseline at commit `2148f244...`. Its CA-10 and CA-11 findings must not be copied forward as current defects without qualification:

| Earlier finding | Current source observation at audited SHA | Current disposition |
|---|---|---|
| CA-10: Performance fixed-cost adapter rebuilt daily EMI/Compliance allocations | `PerformanceFixedCostAllocationAdapterV1` now projects the owner's `source.daily[].amountPaise` rows verbatim through `canonicalDailyRows`, retaining source version and correction refs | **Reconciled since prior audit.** Keep regression coverage for canonical-row identity, rounding and correction provenance. |
| CA-11: Performance sources lacked one shared calculation snapshot | `PerformanceCalculationServiceV1` now prepares source snapshots and uses `PerformanceCalculationSnapshotBoundaryV1`; runtime injects the same authoritative repository into that boundary | **Partially addressed / verification open.** Inspect the full before/after fingerprint fence, mutation windows, release-on-error behaviour and tests that mutate source data between reads. |
| CA-12: recovery/Driver Target policy mismatch | Current Contract Index identifies Breakeven/Driver Target v2.0 and Addendum J as the owner; current Performance service has separate source ports and policy inputs | **Verification open.** Prove runtime, passbook, lifetime and selected-period results against the approved aggregate 18-month pool and fixed monthly Driver Target policy. |

The earlier audit remains valid historical evidence for its own baseline; this register is the current reconciliation layer.

## 3. Confirmed architecture and composition gaps

### G-01 — Work workflow orchestration still crosses the React presentation boundary
**Severity:** High.  
**Evidence:** `apps/web/src/ui/use-driver-workspace.ts` obtains the Work runtime, repository, identity, Work service, selection service, Timeline projection/enrichment and Maintenance-related dependencies. The hook coordinates committed Work events with downstream Log Book/Timeline/Maintenance effects and owns substantial initialization/recovery orchestration.  
**Required closure:** Move durable cross-feature coordination to an application-owned Work coordinator/use-case boundary. Keep the hook limited to transient view state, subscriptions and typed action invocation. Preserve the existing atomic Work transaction and outbox guarantees. Add tests proving React mount/unmount does not own or duplicate business effects.

### G-02 — Primary screen composition remains centrally hard-coded
**Severity:** Medium.  
**Evidence:** `PrimaryScreenComposition.tsx` switches directly on Drive, Timeline, Performance and Admin and constructs each context inline. The feature host validates context identity/version, but adding or replacing a production screen still requires editing this central composition file.  
**Required closure:** Register production screen contributions with typed context factories/owners and let the composition host resolve them. Preserve the four approved navigation destinations and fail-closed context validation. Demonstrate replacing each production screen without editing unrelated feature internals or persistence.

### G-03 — Performance presentation still needs a complete controller/read-model boundary proof
**Severity:** High.  
**Evidence:** Primary composition constructs `PerformanceScreenControllerV1` and adapts calculation services into `loadPeriod`, which is an improvement over passing the raw calculation service. The actual Performance feature screen implementation and its full interaction/state path still need an end-to-end review to prove it receives display-ready projections and does not recreate calculation, source reconciliation or policy logic.  
**Required closure:** Inspect Performance feature presentation, tests and all consumers. Keep formulas and source reconciliation in domain/application owners; expose a typed presentation read model and commands. Prove screen replacement and source-snapshot provenance through the actual production renderer.

### G-04 — Application bootstrap remains a broad composition/dispatch surface
**Severity:** Medium.  
**Evidence:** `apps/web/src/main.tsx` still imports many capability services and validators and performs platform repository construction, runtime registration, service initialization and Admin/form runtime composition. A dedicated `admin-form-runtime.ts` and business-expense submission handler exist, so earlier claims that the entire Admin dispatcher remains inline are no longer accurate.  
**Required closure:** Finish separating platform bootstrap, application service composition and feature form command routing. Keep exactly one authoritative platform repository and one runtime registry initialization. Avoid replacing this with another global service locator or a second form framework.

### G-05 — Shell/global overlay ownership is only partially replaceable
**Severity:** Medium.  
**Evidence:** `App.tsx` injects `ShellRenderer`, but it also renders `DeviceReadinessPrompt` outside the shell. `ApplicationShell` owns navigation and settings panel state; global readiness prompt/backdrop behaviour is not currently represented as an explicit shell/application overlay slot.  
**Required closure:** Define a stable application overlay host/slot contract and test shell replacement with readiness, diagnostics/feedback and other global overlays. Preserve lifecycle ownership and Android readiness semantics; do not move device policy into feature UI.

### G-06 — Feature-owned application/domain code is still spread across shared packages
**Severity:** Medium.  
**Evidence:** Application services and domain calculations remain concentrated in `packages/application/src` and `packages/domain/src`, with broad root barrel exports. This is a discoverability/ownership placement issue, not evidence that the existing calculations are wrong.  
**Required closure:** Inventory service ownership and public API usage. Relocate only cohesive capability-owned code into existing feature sublayers in behaviour-preserving slices, retaining narrow public entry points and genuine shared coordinators. Do not perform a mass move or break platform parity.

### G-07 — Trip Financial form/service construction is distributed across workspace hooks
**Severity:** Medium.  
**Evidence:** Fare/completed-trip and Cancellation Fee hooks consume the shared trip-financial form runtime, but the workspace hooks still coordinate draft queues, refresh, validation/presentation state and submit flows separately. The current state is less coupled than the earlier audit implied; a complete construction and lifecycle trace is still needed.  
**Required closure:** Verify one application-owned runtime/service composition, then keep feature-specific draft state and presentation actions in their respective surfaces. Ensure no duplicate working-copy repositories or service instances are created on remount.

### G-08 — Feature presentation context typing is not fully closed
**Severity:** Medium.  
**Evidence:** `FeatureScreenHost` accepts `context: unknown` and validates the runtime context ID/version before rendering. Runtime validation is valuable, but the composition-time mapping from mount point/context ID to a typed context is not statically exhaustive.  
**Required closure:** Add a typed registry/context map so a screen cannot be registered with a mismatched context at compile time where practical; retain runtime fail-closed validation for version skew and plugin boundaries.

## 4. Architecture enforcement gaps

### G-09 — Static checker does not yet prove the complete Architecture Foundation
**Severity:** High.  
**Evidence:** `scripts/check-architecture.mjs` walks TypeScript/JavaScript/Kotlin/Java files, checks source-size limits, parses TypeScript imports, applies TypeScript layer rules, checks selected Kotlin Room/Capacitor declarations and platform-neutral Kotlin imports, and checks selected runtime registry/repository construction invariants. It does not establish the full feature-owned sublayer dependency graph and public API rules across all Kotlin packages, Gradle module edges, or all declared feature/backup/calculation contracts.  
**Required closure:** Add positive and negative fixtures for TS and Kotlin/Java dependency direction, public feature APIs, Gradle edges, cycles, aliases/path resolution and persistence gateways. Ensure tests demonstrate each rule rejects a violating fixture and accepts a valid one. Do not weaken existing Room/Dexie, transaction or cycle checks to make relocation easier.

### G-10 — Feature registry and backup participant completeness need a single cross-platform proof
**Severity:** High.  
**Evidence:** Runtime feature discovery and dynamic Android feature-record backup participant registration exist. Browser backup participants are registered through a dedicated bootstrap function. The current audit has not reconciled every persistent feature manifest/store/schema/migration against both browser and Room participant registries and restore validators.  
**Required closure:** Produce a generated or test-enforced manifest-to-participant matrix for every persistent capability. Verify schema/version coverage, empty-feature compatibility, relationships, unknown records, attachment handling, interrupted restore, rollback and participant discovery on both platforms.

### G-11 — Recovery proof needs an explicit production-path matrix
**Severity:** High.  
**Evidence:** The repository contains meaningful Android instrumentation and browser tests for driver workflow interruption, process restart, backup restore failure and Maintenance correction acceptance. However, a full cross-feature matrix covering close/recreate, process death/reboot, offline delay, duplicate/replayed delivery, lost acknowledgement, stale revisions and restore/retry across all durable workflows has not been shown in one evidence record.  
**Required closure:** Map each contract failure window to the actual IndexedDB/Room production path and a failure-injection test. Verify idempotent business effects and no partial commits; do not infer end-to-end recovery from isolated unit tests.

### G-12 — Diagnostics coverage and privacy guarantees need end-to-end evidence
**Severity:** Medium.  
**Evidence:** Safe diagnostic event creation and browser/native diagnostic tests exist, but this audit has not proven that every required failure/recovery boundary emits bounded, correlated, privacy-redacted diagnostics without affecting the business transaction.  
**Required closure:** Trace each durable failure boundary to its diagnostic event, redaction policy, retention cap and non-interference test on both platforms.

## 5. Calculation and data-flow verification still open

1. Complete the Performance source-consumer inventory: Revenue, Fuel, Maintenance, platform fees, challans, miscellaneous costs, toll/parking, EMI, Compliance, pre-business recovery, Driver Target, completeness and corrections.
2. Prove the single snapshot fence across all Performance adapters with a source mutation injected between reads; verify repository revision/fingerprint and per-source identities are coherent and release occurs on success and failure.
3. Prove approved Business Start Date recovery policy in all output surfaces: complete qualifying source amounts aggregated into one 18-month pool, equal monthly instalments, daily distribution inside each recovery month, and Driver Target as a fixed monthly rupee amount with only first BStart month prorated by calendar days.
4. Trace correction-chain provenance from original source → correction/reversal → owner projection → Full Cost Breakeven → Performance/passbook/history → backup/restore → recalculation. Include Maintenance correction boundary and effective-date changes.
5. Inventory every consumer of daily business kilometres and Maintenance accruals. Prove personal distance (including the gap between prior end odometer and next shift start odometer) is excluded from business km and business cost attribution.
6. Verify historical source reconciliation for fuel purchase intervals, platform fees, challans, miscellaneous expenses, trip financials, EMI/prepayment/settlement, Compliance renewals and effective-date changes. Unknown/ambiguous legacy data must remain explicitly reviewable, not silently assigned.

## 6. UI/UX, shell and platform verification still open

1. Inspect every production screen's composition, state hooks, view models/read models, action adapters and visual components. Confirm screens do not construct repositories, own business calculations or coordinate cross-feature durable effects.
2. Inventory global CSS selectors, layout assumptions, navigation state, focus/back behaviour, safe areas, scroll ownership, dialogs and overlay stacking. Determine which are intentional shell contracts and which create accidental cross-screen coupling.
3. Verify replacement of Drive, Timeline, Performance and Admin with real production contexts; test wrong context ID/version, missing renderer, renderer failure/retry, shell replacement, overlay replacement and navigation stability.
4. Verify PWA, Android WebView and native overlay boundaries separately. A green Android build or WebView instrumentation run does not by itself establish physical device usability or native overlay parity.
5. Audit accessibility and responsive behaviour against the UI/UX contract: semantic names, keyboard/focus, screen reader announcements, contrast, text scaling, touch targets, narrow viewport and orientation. Record automated versus manual evidence separately.

## 7. Explicitly deferred acceptance (not software defects)

The following remain separate owner/environment acceptance gates and are not to be misreported as failed CI:
- Physical phone testing, including OEM-specific background restrictions, force-stop/reboot and real-world GPS/permission flows.
- Live Dropbox account authentication, upload/download, scheduled backup and restore against the owner's account.
- Final owner visual/usability approval on the actual phone.
- Any external GitHub branch protection/ruleset configuration; the audited `main` branch metadata reports `protected: false`, so required-check enforcement is not established by the green run. This is repository administration, not an application code defect.
- Future multi-driver/multi-car scope and Finance payment/settlement workflow expansion where the current product contract explicitly defers those capabilities.

## 8. Current audit disposition

The foundation is substantial and several earlier gaps have been improved: canonical fixed-cost row consumption, a calculation snapshot boundary, feature presentation context validation, an extracted Admin form runtime, browser/Android backup participants and extensive Android recovery tests are present.

The architecture is **not yet demonstrated to be fully uncoupled or fully verified**. The highest-priority software gaps are Work orchestration ownership, production screen registration/context typing, architecture enforcement completeness, persistent-feature backup completeness, cross-feature recovery evidence, and calculation/correction provenance. The current green CI is a valid positive signal but does not close these proof gaps.

This register is a documentation checkpoint, not permission for a broad refactor. Close gaps through small, owner-aligned changes with focused tests and exact-SHA CI evidence. Preserve the existing feature-owned calculations, transaction boundaries, platform stores, and visual freedom.
