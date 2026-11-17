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

### G-01 — Work application ownership has improved; presentation hook remains broad
**Severity:** Medium.  
**Evidence:** The earlier concern that the React hook directly coordinates committed Work side effects is no longer accurate. `WorkApplicationRuntimeV1` constructs and delegates to `WorkApplicationCoordinatorV1`, which owns startup replay/reconciliation, Maintenance accrual and Log Book event dispatch. `use-driver-workspace.ts` now subscribes to the workflow, invokes typed workflow actions and refreshes transient presentation state. However, the hook still combines repository-backed driver selection, lifecycle listeners, Timeline enrichment queue scheduling, trip-financial workspace state and UI action handlers in one large presentation hook.  
**Required closure:** Preserve the coordinator boundary. Further split the hook into focused presentation hooks/adapters, keeping durable event delivery and recovery in the coordinator. Add lifecycle/remount tests proving UI subscriptions cannot duplicate application side effects.

### G-02 — Primary screen composition remains centrally hard-coded
**Severity:** Medium.  
**Evidence:** `PrimaryScreenComposition.tsx` switches directly on Drive, Timeline, Performance and Admin and constructs each context inline. The feature host validates context identity/version, but adding or replacing a production screen still requires editing this central composition file.  
**Required closure:** Register production screen contributions with typed context factories/owners and let the composition host resolve them. Preserve the four approved navigation destinations and fail-closed context validation. Demonstrate replacing each production screen without editing unrelated feature internals or persistence.

### G-03 — Performance presentation has a controller boundary; screen still owns substantial display derivation
**Severity:** Medium.  
**Evidence:** `PerformanceScreenControllerV1` now coordinates calculation and distance projections outside the React component, and the screen receives a typed `loadPeriod` capability rather than raw calculation services. The production `PerformanceScreen.tsx` still derives category totals, monthly totals, fuel cost/km, target achievement and other display metrics in the presentation layer. These may be acceptable display projections, but the audit has not proven that none duplicate normative business calculations or diverge from the domain result.  
**Required closure:** Classify every screen-derived metric as display-only aggregation or business calculation. Move any reusable/business-significant calculation into the owning domain/application projection. Prove all production screen consumers use the same controller result and preserve provenance.

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

### G-07 — Trip Financial runtime is composed centrally; separate presentation hooks remain
**Severity:** Low.  
**Evidence:** `App.tsx` constructs one `TripFinancialFormRuntimeV1` and provides it through `TripFinancialFormRuntimeProvider`. Completed-trip/Fare and Cancellation Fee hooks consume that shared runtime; they do not independently construct the form runtime or Trip Financial service. Each hook still owns its own transient drafts, serial write queue, refresh and submit feedback.  
**Required closure:** Retain the single shared runtime. Verify provider lifetime/remount behaviour and keep feature-specific draft state isolated; no consolidation into one generic hook is required unless a real duplicated invariant is found.

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


## 9. Backup/restore coverage audit — feature inventory and parity findings

### 9.1 Persistent feature inventory

The current core feature registry declares the following persistent obligations (including the platform-owned record store). The generated extension catalogue separately discovers the 12 feature packages; non-persistent extensions are not backup participants.

| Persistent owner | Browser representation / participant | Android Room representation / participant(s) | Audit result |
|---|---|---|---|
| Platform records | `records` / `platform-records` | `records` / `platform-records` | Both have generic envelope validation; confirm every platform-owned record family and exclusions. |
| Work | `driverState`, `driverIntents`, `driverOutbox` / `work-driver-state` | Work rows in `records` / `work-driver-state` | Separate physical representation; verify equivalent export/restore and pending/outbox replay semantics. |
| Log Book | `driverEvents` / `logbook-events` | `logbook_events` / `logbook-events` | Separate physical table; schema migration and legacy event normalization exist. |
| Finance | `records` / one `finance-records` participant for loans, payments and prepayments | `records` / `finance-records`, `finance-payment-records`, `finance-prepayment-records` | **Participant granularity differs.** See G-13. |
| Vehicle | `records` / `vehicle-records` | `records` / `vehicle-records` | Owner validator exists on both. |
| Driver Records | `records` / `driver-records` | `records` / `driver-records` | Owner validator exists on both; relationship parity still needs fixtures. |
| Compliance | `records` / `compliance-records` | `records` / `compliance-records` | Owner validator exists on both; overlap/correction-chain parity needs fixtures. |
| Maintenance | `records` / `maintenance-records` | `records` / `maintenance-records` | Owner validator exists on both; daily accrual, effective-rate and correction boundary parity needs fixtures. |
| Business Expenses | `records` / `business-expenses-records` | `records` / `business-expenses-records` | Owner validator exists on both; historical correction/reversal parity needs fixtures. |
| Performance | `records` / `performance-records` | `records` / `performance-records` | Owner validator exists on both; source references and policy history need fixtures. |

The browser registers eight explicit feature adapter modules during bootstrap (Business Settings, Vehicle, Driver Records, Compliance, Maintenance, Finance, Business Expenses and Performance). Work and Log Book are handled by the shared snapshot tables. Android registers the corresponding eight feature validators in `MainActivity.onCreate`; Finance registration adds its payment and prepayment participants. Room schema coverage checks all declared Room tables against the participant entity inventory. Browser Dexie coverage checks all database tables against registered and explicitly excluded tables.

This is meaningful coverage, but it is not yet a generated, single-source proof that every persistent feature contract maps to equivalent browser and Android record ownership, schema version, validator, relationship rules and restore effects.

### 9.2 G-13 — Finance participant manifests differ between platforms
**Severity:** High for cross-platform restore; medium if backups are intentionally platform-bound.  
**Evidence:** Browser Finance registers a single `finance-records` participant for the full `feature:finance:` namespace, including loan, payment and prepayment records. Android registers three participants: `finance-records`, `finance-payment-records` and `finance-prepayment-records`. Native manifest compatibility treats the additional Android participants as safely omittable only when the incoming snapshot has no records under their namespaces. A browser backup with payment or prepayment rows therefore does not match the native participant inventory. In the reverse direction, the browser expects its single Finance participant and does not currently demonstrate normalization of the two native Finance participant IDs into it.  
**Required closure:** Decide whether encrypted backup packages are required to restore across PWA and Android. If yes, define one canonical Finance participant identity/manifest and test both directions with loans, payment ledger, reversals, prepayment revisions and settlement. If backups are deliberately platform-bound, document and enforce that restriction clearly before a restore can begin.

### 9.3 G-14 — Backup manifest metadata is not fully platform-neutral
**Severity:** High if cross-platform restore is required.  
**Evidence:** The shared TypeScript `SnapshotManifest` participant shape contains `id`, `featureId`, `snapshotVersion` and `restoreValidatorId`. Android's native participant manifest additionally includes `adapterId`, and native compatibility canonicalization reads that field from incoming manifests. Browser snapshots also represent Work state and Log Book events in separate arrays/tables, while Android serializes Work records into the shared `records` array and Log Book into a separate Room table.  
**Required closure:** Define a platform-neutral wire manifest independent of adapter implementation details; keep platform adapter IDs internal. Provide a versioned normalization layer for the browser and Room snapshot payload shapes. Add actual encrypted-package export-on-one-platform/restore-on-the-other tests, not only encryption-v2 cryptographic interoperability tests.

### 9.4 G-15 — Feature validator parity is duplicated, not contract-generated
**Severity:** Medium.  
**Evidence:** Browser feature validators are TypeScript implementations; Android validators are separately maintained Kotlin implementations. Both cover the major persistent owners, but this audit has not found a shared set of serialized valid/invalid fixtures exercised by both validator suites for every feature and relationship chain. The feature manifest contracts identify participant and validator IDs, but do not themselves generate the native validator logic.  
**Required closure:** Create a feature-by-feature fixture matrix with matching valid and invalid serialized records and whole snapshots. Run each fixture through browser and Android validators; compare accept/reject result and stable error category. Include vehicle references, driver assignment histories, Compliance renewal/overlap decisions, Maintenance rate/accrual/corrections, Finance payments/prepayments/settlements, Business Expense reversals/corrections, Performance settings/recovery records, Work intents/outbox and Log Book events.

### 9.5 G-16 — Restore acceptance evidence is stronger for isolated features than for the complete feature set
**Severity:** High.  
**Evidence:** Dedicated browser backup tests exist for Business Settings, Vehicle, Driver Records, Compliance, Maintenance, Finance, Business Expenses and Performance; dedicated Android instrumentation exists for the corresponding owners plus native snapshot/coverage tests. However, this audit has not yet verified one populated, integrated snapshot containing representative records for every persistent owner, then restored it through both stores and checked every cross-feature reference and correction chain. Native participant discovery and table coverage tests prove registration metadata and Room table accounting, not full semantic round-trip of every feature in one integrated snapshot.  
**Required closure:** Add an integrated populated fixture with all persistent owners, including zero-record participants, cross-feature references, pending Work/outbox state, Log Book events, Finance payment/prepayment history, historical corrections and Maintenance accrual provenance. Export, validate, restore, verify, rollback and re-export on browser and Android; compare normalized business records and participant inventories.

### 9.6 Explicitly covered but excluded from backup

Browser backup explicitly excludes recovery checkpoints, credential-vault material and diagnostics from the business snapshot table inventory. This is an intentional security/operational boundary, not an omission, provided credentials remain in their secure vault and restore journals/checkpoints remain local recovery infrastructure. Confirm the same exclusion semantics on Android and document which diagnostic export/retention mechanism, if any, is separate from business backup.

### 9.7 Backup audit conclusion

Current source shows explicit persistent-feature participants and fail-closed table/record ownership checks on both platforms. The important remaining issue is not simply missing participant registration: it is proving that platform-specific participant manifests, serialized snapshot shapes, validators and restore outcomes are semantically equivalent. Finance participant divergence is a concrete incompatibility risk; full cross-platform encrypted restore has not been demonstrated. Do not claim complete backup parity until G-13 through G-16 are closed with integrated tests.
