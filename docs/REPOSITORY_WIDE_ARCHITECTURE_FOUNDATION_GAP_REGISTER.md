# Repository-Wide Architecture Foundation Gap Register

**Status:** In-progress audit register; not an implementation completion certificate.  
**Audited baseline:** `main` at `a99ea6f48b05d3df1e35a72266acdaa127c010d7` (2026-11-17).  
**Backup/restore transaction trace:** source inspected on the same baseline; findings recorded in G-17/G-18. Documentation update commit: pending.  
**Latest CI evidence at audit start:** workflow run [#44118872802](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/44118872802), exact same SHA; Architecture, Web, Android, Production geocoder verification and Integrated regression gate all succeeded.  
**Change scope:** This register is an audit artifact. The accompanying PR also adds backup/restore recovery tests, extracts the Android Room restore coordinator without changing its transaction boundaries, and closes Driver-assignment-to-Vehicle existence validation on both platforms.

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
- Multi-vehicle, multi-driver and fleet-management workflows are explicitly deferred by the approved PR #99 single-vehicle/single-driver operating contract; Finance payment/settlement expansion remains governed by its owning contract.

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
**Severity:** High — cross-platform portability is a binding requirement.  
**Evidence:** Browser Finance registers a single `finance-records` participant for the full `feature:finance:` namespace, including loan, payment and prepayment records. Android registers three participants: `finance-records`, `finance-payment-records` and `finance-prepayment-records`. Native manifest compatibility treats the additional Android participants as safely omittable only when the incoming snapshot has no records under their namespaces. A browser backup with payment or prepayment rows therefore does not match the native participant inventory. In the reverse direction, the browser expects its single Finance participant and does not currently demonstrate normalization of the two native Finance participant IDs into it.  
**Required closure (binding):** Business backups MUST be portable between browser PWA and installed Android. Define one canonical Finance participant identity and wire representation covering loans, payment ledger, reversals, prepayment schedule revisions and settlements. Keep Room participant/adapter IDs internal. Add browser→Android and Android→browser encrypted restore tests with populated Finance history, including clean and pre-populated destinations, and compare normalized records, lineage and calculations. Platform-bound-only backups are not an acceptable final resolution.

### 9.3 G-14 — Backup manifest metadata is not fully platform-neutral
**Severity:** High — cross-platform restore is required.  
**Evidence:** The shared TypeScript `SnapshotManifest` participant shape contains `id`, `featureId`, `snapshotVersion` and `restoreValidatorId`. Android's native participant manifest additionally includes `adapterId`, and native compatibility canonicalization reads that field from incoming manifests. Browser snapshots also represent Work state and Log Book events in separate arrays/tables, while Android serializes Work records into the shared `records` array and Log Book into a separate Room table.  
**Required closure:** Implement the canonical platform-neutral, versioned wire manifest and payload independent of adapter implementation details. Keep adapter IDs and local table/entity names internal. Normalize Finance, Work/Driver Workflow and Log Book payload shapes. Separate package-format version from feature schema versions and add deterministic migrations for supported prior versions. Prove actual encrypted export-on-one-platform/restore-on-the-other in both directions, not only encryption-v2 cryptographic interoperability.

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

### 9.7 G-17 — Actual restore transactions are robust locally, but do not normalize cross-platform packages
**Severity:** High for cross-platform restore.
**Status:** Confirmed source-level incompatibility in both directions; runtime integration test still required to capture the exact surfaced error and prove no mutation.

**Browser transaction (TypeScript):**
1. `restoreBackupForCurrentRuntime` requires confirmation, decrypts the package and parses the plaintext before dispatching to the browser store.
2. `restoreBrowserSnapshot` validates the browser snapshot and manifest before reading current tables or creating a checkpoint.
3. It snapshots the current Dexie tables, creates a local checkpoint, then clears/repopulates the registered snapshot tables in one read/write transaction and marks the checkpoint `restored_unverified`.
4. It reads back and compares every registered table. On failure it restores the prior tables and marks `rollback_complete`.
5. A successful restore remains unverified until explicit verification; startup recovery rolls back checkpoints left in `checkpoint` or `restored_unverified`.

**Android transaction (Kotlin/Room):**
1. The Capacitor bridge requires explicit confirmation and a snapshot plus manifest. The shared TypeScript runtime decrypts before calling this bridge.
2. Android validates snapshot and manifest shape, validates both participant manifests against its registered participants, validates business record ownership/relationships and snapshot revision, then checks schema/count limits.
3. It creates a Room checkpoint and journal in a transaction.
4. It replaces participant-owned business records and marks the journal `restored_unverified` in a Room transaction.
5. It rebuilds a snapshot and compares record count plus canonical owner/id/payload/schema/timestamp tuples.
6. On failure it rolls back from the checkpoint and verifies the rollback. Startup recovery also rolls back pending/unverified journals. Successful restores require explicit verification before checkpoint discard.

**Confirmed Finance mismatch in both directions:**
- **Browser package → Android:** Android's expected participant manifest contains separate `finance-records`, `finance-payment-records` and `finance-prepayment-records`. The browser manifest has one `finance-records` participant. Android's compatibility path only permits omission of the two native Finance participants when no records exist for their namespaces. Payment/prepayment rows make those omissions unsafe, so the package is rejected before checkpoint creation. In addition, Android's canonical participant comparison expects the native `adapterId` field, which the browser manifest does not define.
- **Android package → browser:** Browser expects one `finance-records` participant and compares participant identities/feature/version/validator fields before checkpoint creation. Android emits separate payment and prepayment participant IDs, so the manifest does not match. Beyond Finance, the serialized snapshot shapes are different: browser has separate `driverState`, `driverIntents`, `driverEvents` and `driverOutbox` arrays and RecordEnvelope rows; Android puts owner-tagged JSON-string records in one `records` array and stores Log Book rows there under their own participant. There is no demonstrated normalization layer to make those payloads acceptable to the other platform.
- **Conclusion:** For a populated Finance snapshot, the source code establishes a pre-mutation rejection in each direction. This is not merely a cosmetic manifest mismatch. The exact thrown/surfaced error can vary by which incompatible shape is encountered first; the decisive fact is that validation is before checkpoint and data replacement.

**Required closure (binding):** Implement the canonical platform-neutral wire format and runtime adapters. Export a populated encrypted package from browser and restore into Android; export from Android and restore into browser. Include Finance payments/prepayments, Work/Driver Workflow, Log Book, cross-feature references and correction histories. Validate/authenticate/decrypt, migrate, normalize and validate the entire canonical dataset before destination mutation; stage the target representation before checkpoint/atomic apply. Compare normalized records, revisions, relationships, event order, pending work and calculation provenance after reopen/recovery/re-export. Test wrong key, tamper, corrupt/truncated payload, unknown required version/participant, missing reference and interrupted restore; destination data must remain unchanged or recover exactly to its pre-restore state.

### 9.8 G-18 — Cross-feature references and correction-chain round-trip are not yet proven as one populated snapshot
**Severity:** High.
**Evidence:** Browser Finance validation links loans to Vehicle, payments to loan schedules and prepayment schedule revisions, and settlements to loan lifecycle. Business Expenses validation links expenses to Vehicle/Driver records, validates reversal pairs and validates append-only historical correction chains and chain heads. Android has corresponding feature-specific relationship validators and separate Business Expense/Maintenance correction backup validators. These checks run as part of feature-owned record validation, but the audit has not yet established a single fully populated snapshot where all owner records and all correction/provenance chains survive export → restore → re-export on both platforms. The distinct browser/Android payload formats and Finance participant identities currently prevent claiming that cross-platform integrated round-trip.
**Required closure:** Build a deterministic populated fixture spanning Vehicle, Driver Records, Finance loans/payment reversals/prepayment revisions/settlements, Compliance, Maintenance rate history/daily accrual/corrections, Business Expenses with Vehicle/Driver references and reversal/correction chains, Performance source references/recovery state, Work pending intents/outbox and Log Book events. Exercise each platform's native export/restore/rollback/re-export and compare normalized business semantics, including correction chain heads, revisions, source IDs, effective dates, schedule versions and Maintenance accrual provenance.

### 9.9 G-19 — Maintenance rate/accrual validation is substantial, but integrated correction provenance round-trip is open
**Severity:** High for historical financial correctness.
**Confirmed coverage:** Browser validates rate-history identity/default effective date, daily accrual source ID and revision, fully allocated daily business kilometres, personal-kilometre allocation, and the rate effective on the operational date. It validates Maintenance historical correction events by target, feature, field, chain revision, projected result and chain head. Browser tests include export/restore of an accrual with its daily-km source and effective rate, rejection of unallocated source kilometres, and separate correction validation paths. Android validates Vehicle references, rate-history chronology/default, daily-accrual source and revision, full allocation, effective-rate snapshots, and Maintenance correction chains.
**Gap:** The inspected tests do not establish one complete populated round-trip combining multiple rate changes, daily accruals on both sides of an effective-date change, personal/business distance split, one or more historical corrections, correction chain head, and source revision/provenance. Nor is there evidence of browser↔Android semantic equivalence; the snapshot wire incompatibility already blocks that claim. Audit also needs to prove rollback/re-export preserves the same rate and correction provenance, not merely that validators accept a fixture.
**Required closure:** Add deterministic native fixtures for both stores and assert unchanged rate entries, effectiveFrom, ratePaisePerKm, dailyBusinessKmRecordId/revision, businessKm/personalKm, correction IDs/revisions, projected amount, chain head and source IDs after restore and re-export.

### 9.10 G-20 — Business Expense links and correction heads are validated, but complete dependency closure is not proven
**Severity:** High.
**Confirmed coverage:** Browser checks Vehicle references, Driver record schema for expense driver references, unique and correctly paired charge/reversal records, correction target/revision/allowed fields, projected corrected payload and correction-chain head. Browser tests exercise fuel correction restore with a two-step chain and assert projected amount and correction references. Android checks Vehicle/Driver references against owner-tagged participants, trip-financial obligation links, reversal pairing and the Business Expense correction validator.
**Gap:** Browser assignment/expense reference validation and Android relationship validation are feature-local checks; the audit has not yet demonstrated a populated integrated snapshot where all referenced Vehicle and Driver profiles, assignments, original charges, reversals, trip-financial source records, correction events and chain heads are restored together and then re-exported unchanged. Exact symmetry of correction rules and chain-head validation between TypeScript and Kotlin also remains unproven.
**Required closure:** Add cross-platform-native populated fixtures covering fuel and ordinary expenses, Vehicle/Driver refs, trip-financial source refs, charge/reversal pairs, multiple correction revisions and chain heads; assert semantic equality after restore/re-export and rejection of dangling or mismatched references.

### 9.11 G-21 — Compliance renewal/review/correction history has good feature-level validation, but whole-snapshot round-trip is open
**Severity:** High.
**Confirmed coverage:** Browser checks Compliance→Vehicle identity, renewal predecessor existence and same Vehicle/compliance identity, overlap-review event source references, ordered decision revisions/supersession and review head, plus historical correction projections and correction chain heads. Tests cover early renewal with overlap dates, rejection of a missing renewal predecessor, and restore of overlap-review decisions plus correction history. Android performs corresponding Vehicle and renewal-source checks, overlap-review history validation and Compliance historical-correction validation.
**Gap:** Feature tests are isolated. No inspected test proves that multiple renewal generations, overlap decisions, review heads, corrected validity/cost fields and historical correction heads survive in the same complete snapshot with Vehicle and Driver assignment history and all other owners. TypeScript/Kotlin rule parity and rollback/re-export preservation remain unproven.
**Required closure:** Add a complete Compliance history fixture with multiple renewal generations, an early renewal overlap, review decision supersession, corrections and heads; restore and re-export on both platforms and compare normalized history and provenance.

### 9.12 G-22 — Driver assignment history is retained, but referential integrity to Vehicle history is incomplete
**Severity:** Medium–High.
**Confirmed coverage:** Browser validates Driver profile identity/schema, assignment history identity/schema and selected-for-Work uniqueness. Android validates profile identity, selected-driver uniqueness, assignment ID uniqueness, chronological ordering, valid assignment periods and at most one active assignment.
**Gap:** The inspected Driver validators check that assignment `vehicleId` has the Vehicle namespace/prefix, but do not prove the referenced Vehicle record exists in the same snapshot or that assignment intervals are consistent with Vehicle lifecycle/other assignment history. Business Expense and Compliance validate their own Vehicle/Driver links, but that does not close Driver assignment references. Isolated assignment export tests do not prove assignment history plus Vehicle history round-trip together.
**Required closure:** Resolve every assignment vehicleId against the snapshot Vehicle owner, validate assignment temporal/lifecycle policy, and add fixtures for reassignment, closed/open intervals and missing Vehicle rejection on browser and Android.

### 9.13 G-23 — Performance backup currently preserves settings and pre-business costs, not demonstrated source/recovery/correction provenance
**Severity:** High if Performance recovery state is expected to be durable.
**Confirmed coverage:** Browser and Android Performance participants validate settings and pre-business cost records (identity, amounts, note/command ID). Browser tests export/restore the driver target and multiple independent pre-business cost entries.
**Gap:** The inspected Performance backup validators do not validate or persist a source-reference graph to Finance/Compliance/Maintenance/Business Expense/Work records, nor do they demonstrate a recovery checkpoint/recovery state or historical correction chain for Performance. This may be intentional if those values are derived projections and recovery state is deliberately local/transient; the product contract must explicitly classify each as durable or derived. Current tests do not establish the requested source-reference, recovery-state and correction-provenance round-trip.
**Required closure:** Reconcile Performance persistence contract with actual record owners. If source references/recovery/correction provenance are durable, add participant records and validators that resolve source IDs/revisions and validate correction chains. If derived/transient, document the exclusion and prove deterministic reconstruction from restored authoritative owners.

### 9.14 G-24 — Work intents/outbox and Log Book events have contract validation, but integrated event-history recovery is open
**Severity:** High for offline-first recovery and audit history.
**Confirmed coverage:** Browser snapshot stores Work state, intents, events and outbox in dedicated arrays; it validates their contracts. Android stores Work state/intents/outbox as owner-tagged records and Log Book events in a separate Room table, validating state/intent/outbox and stored event contracts. Android snapshot export includes all registered participants and derives snapshot revision from Work state.
**Gap:** The wire representation differs across platforms, and the audit has not established that a populated pending intent + outbox item + corresponding Log Book event history can be restored, replayed/reconciled, and re-exported without duplicate effects, dropped events, reordered history or broken references. Browser and Android Work snapshot representations also differ (separate arrays versus owner-tagged records). Feature contract validation alone does not prove idempotent recovery after restore.
**Required closure:** Create shared semantic fixtures for pending, acknowledged, retried and failed Work intents/outbox plus associated Log Book events, including duplicate/replay boundaries and 04:00 operational-day transition. Restore into each native store, run startup reconciliation, assert exactly-once business effects and stable event/outbox history, then re-export and compare normalized state.

### 9.7 Backup audit conclusion

Current source shows explicit persistent-feature participants and fail-closed table/record ownership checks on both platforms. The important remaining issue is not simply missing participant registration: it is proving that platform-specific participant manifests, serialized snapshot shapes, validators and restore outcomes are semantically equivalent. Finance participant divergence is a concrete incompatibility risk; full cross-platform encrypted restore has not been demonstrated. Do not claim complete backup parity until G-13 through G-16 are closed with integrated tests.


### 9.15 — Integrated fixture execution-path assessment

**Status:** Partially addressed; full cross-platform semantic parity remains open.

- **Browser:** `tests/recovery-lifecycle.test.ts` now exercises a populated Vehicle/Driver assignment snapshot through production export, restore, IndexedDB close/reopen, `recoverBrowserRestoreTransactions()`, and re-export. It compares the normalized table contents against the pre-restore rollback baseline and verifies recovery idempotency. A separate test restores authoritative Work events and rebuilds the derived trip-history projection, preserving its ordered event-derived result. These are production storage functions, not mocked restore implementations.
- **Android:** The validation/checkpoint/replace/read-back/rollback body is now an internal `NativeBackupRestoreCoordinator.restore` called directly by `BackupPlugin.restoreSnapshot`. Its checkpoint transaction, replacement transaction, journal transitions, read-back integrity check, rollback path and error semantics retain the prior implementation. `NativeBackupRestoreCoordinatorTest` invokes that same production coordinator, closes the Room database, reopens a new Room handle, runs `NativeStartupRecovery.ensure`, and re-exports. It compares canonical owner-tagged records including participant, ID, serialized payload, schema version and updatedAt, and checks recovery idempotency.
- **Negative/recovery cases:** Browser and Android now reject Driver assignment references whose Vehicle is absent from the same snapshot. Both platforms exercise an unverified restore surviving storage reopen and being rolled back by startup recovery; browser additionally asserts that the second recovery is a no-op. Android now injects a failure at the production coordinator's post-replacement/pre-read-back boundary and asserts that the coordinator's own rollback restores the complete pre-restore Room baseline and records `rollback_complete`.
- **Native package interoperability:** The existing TypeScript/Kotlin encryption-v2 tests prove cryptographic package interoperability for a minimal one-record payload. They do not prove populated feature snapshot interoperability; the Finance manifest and payload incompatibilities in G-13/G-17 remain.

**Conclusion:** The Android production restore transaction now has a testable Room coordinator, and each platform has an integrated restore/reopen/recovery/re-export test. The current fixtures are not yet the same populated cross-platform semantic fixture: they cover Vehicle/Driver assignment records and Work event projection separately. Therefore they do not yet prove equality of Finance schedule/payment/prepayment/settlement lineage, Compliance renewal/review heads, Maintenance rate/accrual/correction heads, Business Expense reversal/correction-chain heads, Performance provenance, or Work intent/outbox and Log Book ordering across browser and Room.

**Required next closure:** Build one deterministic shared semantic fixture (or explicitly normalized platform variants) and compare participant inventory, source IDs, record revisions, cross-feature references, event ordering, correction-chain heads, effective dates and post-recovery exports on both platforms. Complete the shared populated semantic fixture and platform parity assertions listed above, then add a process-death-style Android interruption test at the post-replacement/pre-read-back boundary if it can be distinguished from the coordinator's caught-failure rollback. Preserve the existing production transaction semantics.

### 9.16 — Driver assignment Vehicle references are resolved against the snapshot

**Severity:** Medium–High for assignment integrity.  
**Status:** Existence validation addressed on both platforms; temporal/lifecycle policy remains open.

**Evidence:** Browser `apps/web/src/driver-records-backup.ts` resolves each assignment `vehicleId` against Vehicle records in the complete snapshot and rejects missing references with `driver_assignment_vehicle_reference_missing`. Android `NativeDriverRecordsBackup` receives all owner-tagged records, resolves the reference against the `vehicle-records` participant, and rejects the same dangling reference. Browser and Room tests cover the negative missing-Vehicle case; populated Vehicle/Driver assignment fixtures cover the positive case.

**Remaining closure:** Confirm canonical Vehicle identity validation is applied before reference acceptance, and define/test assignment interval consistency with Vehicle lifecycle and reassignment history. Do not silently delete or rewrite historical assignment references during restore.



### 9.17 — Shared semantic fixture contract seed

**Status:** Initial implementation committed; populated fixture and lifecycle execution remain open.

**Evidence:** `fixtures/semantic-backup-lifecycle-v1.json` is the single shared contract asset. Android instrumentation already includes the repository `fixtures/` directory as an androidTest asset source; `NativeBackupCoverageTest.sharedSemanticLifecycleFixtureDeclaresAllParityDomains` reads this file through the Android asset manager. The browser test `tests/semantic-backup-lifecycle-fixture.test.ts` reads the same file from the repository path. Both assert the seven requested domains, lifecycle stages (export, restore, database reopen, startup recovery, re-export) and normalized comparison dimensions (IDs, revisions, references, event ordering and correction-chain heads).

**Explicit limitation:** The current JSON is a contract seed, not yet a populated set of valid feature records. These tests prove both platforms consume the same contract file; they do not exercise feature validators, restore transactions, startup recovery or semantic equality for the requested Finance, Compliance, Maintenance, Business Expense, Performance, Work and Log Book records.

**Required next closure:** Populate the shared asset with valid records and lineage for every required domain; add browser and Room fixture loaders; execute the same semantic data through each production restore lifecycle; compare normalized exports and correction/event heads. Keep G-13 through G-18 open until those tests pass.


### 9.18 — PR #99 end-to-end collection, calculation, persistence and backup/restore proof

**Status:** Track A restore/recovery foundation implemented; Track B populated-fixture and semantic-parity execution remains outstanding.

**Owner contract:** [PR #99 End-to-End Data, Calculation, Persistence and Backup/Restore Contract](PR_99_END_TO_END_DATA_CALCULATION_PERSISTENCE_BACKUP_CONTRACT.md).  
**Evidence matrix:** [PR #99 Implementation Evidence Matrix](PR_99_IMPLEMENTATION_EVIDENCE_MATRIX.md).

**Track A — implemented foundation (reuse, do not repeat):** Browser IndexedDB and Android Room production restore paths; close/reopen and startup recovery; Room restore checkpoint/read-back/rollback; dangling-reference validation; interrupted-restore failure injection; shared fixture contract seed; and existing workflow atomicity, idempotency, pending-intent, process-death, outbox and stale-revision coverage. These are not new implementation tasks and equivalent tests must not be added.

**Track B — remaining work:** First complete **B0 data-collection entry-path and cross-cutting foundation audit** (see section 9.19 and the PR #99 contract). Inventory every supported form/action/device/import path and prove the real input-to-command-to-validator-to-authoritative-commit boundary, reusing existing assertions and adding only confirmed gaps. Map schema migration, integrity, offline/lifecycle, concurrency, time/device evidence, backup package security/compatibility, privacy and scale tests to their owner contracts. Then populate the shared synthetic fixture with schema-valid records for Vehicle/Driver dependencies, Finance, Compliance, Maintenance, Business Expenses, Performance, Work/Driver Workflow and Log Book. Add browser and Room fixture loaders/runners for that exact asset. Run it through the existing production export → restore → reopen → startup recovery → re-export paths. Recompute production calculations before/after restore and compare outputs/provenance. Compare normalized IDs, revisions, references, event order, pending intent/outbox state and correction heads. Add only direct PWA↔overlay visibility/stale-write or outbox-retry assertions that are confirmed missing by inspection; do not duplicate existing workflow tests.

**Architecture is fixed:** Browser-only PWA uses Dexie/IndexedDB; installed Android uses Room shared by Capacitor PWA/WebView and native overlay. No central database, Android dual-write or independent workflow store.

**Performance schema constraint:** persisted Performance records currently support `settings` and `pre_business_cost`. Provenance is generated by the calculation service and asserted as calculation output, not a persisted `source_provenance` record kind.

**Execution order:** Track B0 entry-path and cross-cutting audit → B1 populate fixture → B2 browser lifecycle → B3 Android Room lifecycle → B4 semantic/calculation parity → B5 only missing integration assertions → B6 focused tests, required CI and evidence closeout. Do not repeat Track A. Distinguish process death from full OS reboot; retain reboot as a physical-device gate if not already deterministically covered.



**Status:** Contract and ordered implementation plan added; execution not yet started.

**Owner contract:** [PR #99 End-to-End Data, Calculation, Persistence and Backup/Restore Contract](PR_99_END_TO_END_DATA_CALCULATION_PERSISTENCE_BACKUP_CONTRACT.md).

**Purpose:** Close the gap between isolated feature backup round-trips and a full proof that source facts collected through each runtime remain consistent through committed persistence, derived calculations/provenance, snapshot export, restore, database reopen and startup recovery.

**Runtime architecture is fixed:** browser-only PWA uses Dexie/IndexedDB as its authoritative store; installed Android uses Room as its sole authoritative store, shared by the Capacitor PWA/WebView and native overlay. Dexie and Room are platform alternatives, not two Android stores to synchronize. No central database or Android dual-write is authorized.

**Existing evidence to reuse:** the repository already contains browser workflow tests, Android workflow/service/restore instrumentation, Room backup participant coverage, per-domain browser and Android backup tests, and restore coordinator rollback/recovery tests. The audit must map exact assertions to each guarantee before adding tests. Existing passing coverage must not be duplicated.

**Remaining closure:** populate the shared synthetic semantic fixture with valid records and source lineage; run the same fixture through production browser and Room loaders and full restore lifecycle; recompute production calculations and compare values plus provenance; compare normalized records, revisions, references, event ordering, pending intents, outbox and correction heads; add only specifically missing cross-surface concurrency/reboot/failure tests; and record CI evidence and remaining physical-device gates.

**Important schema correction:** Performance persistence currently supports `settings` and `pre_business_cost` records. Provenance is generated by the Performance calculation service from source records and must be asserted as calculation output, not invented as a persisted `source_provenance` record kind.

**Initial evidence inventory:** [PR #99 Implementation Evidence Matrix](PR_99_IMPLEMENTATION_EVIDENCE_MATRIX.md) records existing test coverage and the specific direct cross-surface/reboot gaps found by source inspection. It deliberately classifies many workflow guarantees as already implemented and tested.

**Execution order:** baseline evidence inventory → valid shared fixture → browser lifecycle → Android Room lifecycle → failure/concurrency closure → cross-runtime calculation/semantic parity → CI and evidence closeout. PR remains draft and unmerged until user instruction.


### 9.19 — Data-collection entry paths are not yet proven as part of the PR #99 lifecycle

**Severity:** High — a restore proof is incomplete if source facts are only inserted through fixtures/repositories and the real app collection path is unverified.  
**Status:** Newly formalized required audit; coverage must be established from actual source and assertions, not inferred from feature-level tests.

**Gap:** The end-to-end contract previously described the data-collection stage generically, while Track B began with a populated fixture. That left a possible evidence gap between the real user/device entry path and the authoritative committed records. A schema-valid fixture proves record shape and validator acceptance, not that the screen/form/overlay correctly maps user input into the production command and persists the intended business fact.

**Required closure (Track B0, before B1):**
- Inventory every currently supported entry path by feature, surface, UI/action, command, validator, service/repository and authoritative owner.
- Classify each input as user-entered, device-captured, imported, or derived; do not assume every record kind has a UI.
- Audit Vehicle/Driver, Finance, Compliance, Maintenance, Fuel/CNG, Business Expenses, Work/Shift/odometer, Log Book, Performance settings/pre-business costs and relevant GPS/time/notification/service callbacks.
- Reuse exact existing tests where they prove the real boundary. Otherwise add targeted tests for field mapping, validation/rejection without partial writes, production command/service invocation, stable IDs/revisions/references, read-after-write and persistence after reload/reopen.
- Exercise offline, partial-draft/resume, cancellation, duplicate/retry, process interruption, GPS permission/location failure, timestamps/time-zone changes and 04:00/active-trip cases only where the owning feature contract promises or requires that behaviour.
- Verify calculations/projections consume committed source facts and retain source IDs/revisions/effective dates. Verify cross-surface visibility only where the workflow is exposed on both Android surfaces.
- Prefer data produced by entry-path tests as the semantic fixture input where deterministic; otherwise load the shared fixture through production validators and explain why direct UI entry is unsuitable.
- Report UI automation limitations as explicit manual/device acceptance gates. A repository-only test must not be described as UI proof.

**B0 exit:** every supported entry path is classified as already proven, partially proven, not proven or not applicable; every critical path has automated evidence through the real form/action-to-command-to-authoritative-commit boundary or a named manual/device gate. Only then proceed to populated fixture B1.

**No-duplicate rule:** this is an evidence audit, not permission to duplicate existing form, service, validation, persistence or workflow tests. A new test requires a specific uncovered assertion.



### 9.20 — Existing G-13 through G-24 findings reconciled into PR #99 execution plan

**Status:** Added to the PR #99 contract and evidence matrix. Cross-platform encrypted backup portability is now a binding architecture decision; implementation/test closure remains outstanding.

The PR #99 plan must not stop at a populated fixture and generic parity comparison. It must explicitly disposition each existing architecture finding:

- **G-13/G-14/G-17:** encrypted business backups MUST be cross-platform portable. Implement a canonical versioned wire format, canonical Finance participant, normalized Work/Log Book payloads and browser/Room adapters; prove populated encrypted restore in both directions, including clean/pre-populated destinations and failure safety. Platform-bound-only packages are not an acceptable final architecture.
- **G-15:** matching valid and invalid feature records and whole snapshots must produce equivalent browser/Android validator outcomes and stable error categories.
- **G-16/G-18:** integrated fixture must include all persistent owners, zero-record participants, cross-feature references, pending Work/outbox state, Log Book events and historical correction chains.
- **G-19:** assert Maintenance rate/effective date, daily-km source ID/revision, businessKm/personalKm, accrual amount, correction IDs/revisions and chain head.
- **G-20:** assert fuel and ordinary Business Expenses, Vehicle/Driver/trip-financial references, charge/reversal pairs, multiple correction revisions and dangling/mismatched-reference rejection.
- **G-21:** assert multiple Compliance renewal generations, early-overlap review/supersession, corrections and heads.
- **G-22:** assert Driver assignment reassignment, temporal intervals, Vehicle lifecycle references and missing Vehicle rejection.
- **G-23:** classify Performance recovery/provenance as durable or derived/transient; prove deterministic reconstruction if derived. Do not invent a persisted provenance record.
- **G-24:** assert pending, acknowledged, retried and failed Work intents/outbox, duplicate/replay boundaries, 04:00 transition and linked Log Book ordering through restore/recovery/re-export.
- **Backup exclusions:** prove credential-vault material, local restore checkpoints/journals and diagnostics remain excluded from business backup on both runtimes and retain their separate security/operational handling.

These are mapped to B0a (source/test audit), B0b (missing targeted tests and evidence update), B1 (fixture and validator parity), B2/B3 (native runtime lifecycles and cross-platform import/export), and B4 (semantic/calculation comparison). Reuse existing feature and transaction tests; add only the missing integrated assertions. No broad repeat of Track A is authorized.


### 9.21 — B0a first-pass entry-path and foundation test audit findings

**Source baseline:** `main` at `a99ea6f48b05d3df1e35a72266acdaa127c010d7` (2026-11-17).  
**Status:** B0a source/test/owner-contract inventory completed 2026-11-18 against main SHA a99ea6f48b05d3df1e35a72266acdaa127c010d7. The remaining tests and implementation dependencies are enumerated in PR #99 Implementation Evidence Matrix Sections 0D–0E. B0b is next.

The current repository has real rendered PWA Admin acceptance (`scripts/admin-form-browser-acceptance.mjs`), Android Room-backed WebView Admin acceptance (`AdminFormsCapacitorAcceptanceTest`), rendered Compliance and Maintenance correction acceptance, Performance browser acceptance, and a real Android overlay swipe/GPS/Room workflow acceptance. These are useful and must be reused, not duplicated. GPS requirements in this register refer to Work/Trip events only; Fuel GPS capture and locality enrichment were explicitly removed by owner decision.

The first pass identified the following missing or partial boundaries requiring final B0a confirmation and targeted B0b closure:

1. **Fuel/CNG:** the actual Work-mounted `FuelEntryPanel` and `FUEL_ENTRY_FORM_V1` are not exercised by a rendered PWA or Android WebView acceptance test. The Fuel branch of `createBusinessExpenseFormSubmissionHandler` was not directly tested at the initial audit baseline. Current owner direction explicitly excludes GPS and location enrichment from Fuel; acceptance must prove form mapping, offline submit, draft resume, and authoritative purchase persistence without geolocation.
2. **Work PWA UI:** Driver Workflow services have extensive persistence/recovery tests and the Android overlay has a real gesture/GPS/Room acceptance test, but no rendered PWA test has yet been identified that submits actual Work UI actions and verifies the committed result.
3. **Two-way Android surfaces:** the Capacitor bridge acceptance currently proves a saved trip-financial draft refresh, while the overlay acceptance proves overlay-originated event commit. Direct PWA→overlay and overlay→PWA committed Driver Workflow event/state/revision visibility, plus an actual stale-read N / overlay-commit N+1 / stale-PWA-reject interleaving, are not yet proven at the surface boundary.
4. **Android Admin WebView coverage:** existing acceptance creates Vehicle, Driver, Compliance, Loan, Platform Fee, Misc Expense and Maintenance records, but does not submit Fuel; does not complete the Finance payment/reversal/prepayment/settlement actions; does not submit Traffic Challan; does not exercise Performance target/pre-business-cost entry; and does not exercise Driver assignment/selection. PWA browser acceptance covers most of those Admin flows; add Android assertions only where platform-specific Room routing or actual entry boundary is not already proven elsewhere.
5. **Compliance renewal:** domain service tests cover immutable linked renewal and early overlap, but the current rendered Admin acceptance creates an initial Compliance record rather than submitting a renewal through the UI.
6. **Dexie schema migrations:** browser DB schema versions 1, 2, 3, 4 and 6 exist, but the inspected storage tests do not create historical Dexie databases and verify upgrade preservation/reopen/future-version behaviour. Room migration tests already cover ordered upgrade, rollback and unknown future version; reuse those.
7. **Canonical cross-platform encrypted backup:** current encryption tests establish TypeScript crypto correctness and Android-generated package decryption in TypeScript, while native tests self-decrypt native output. They do not establish TypeScript-generated package consumption by Android or full populated business snapshot restore in both directions. The canonical portable wire format is a required production implementation and integration-test gap.
8. **Validator parity / zero-record participants / complete owner graph:** browser and Android validators and backup participants are separately tested, but the same positive/negative fixture set and one integrated all-owner dataset (including zero-record participants, correction chains and cross-feature references) have not been shown to pass through both.
9. **Backup exclusion parity:** browser table coverage, Android internal-record filtering and secure vault tests exist; paired proof that credential-vault material, local recovery journals/checkpoints and diagnostics are excluded from business backup on both runtimes remains to be mapped to exact assertions.
10. **Full OS reboot:** process death/restart is covered. A complete OS reboot with pending workflow state is not proven by the process-restart test or boot-policy unit test; keep this as a physical-device acceptance gate unless a deterministic CI path exists.
11. **Scale/storage limits:** this first pass did not identify explicit large-snapshot, storage-quota or concurrent-write snapshot tests. B0a must inspect owner contracts and platform limits before deciding whether deterministic tests or documented operational gates are appropriate.

**Required next action:** complete the remaining B0a source/contract/test mapping, correct any stale evidence claims, then B0b adds only confirmed missing tests. Track A atomicity, idempotency, process recovery, restore rollback and existing feature suites are reused; do not rebuild them.


### 9.22 — Additional B0a findings: Fuel draft, rendered Work/Backup UI and platform entry parity

**Status:** Source-confirmed; retain the entry-path and UI test gaps below. Two earlier findings in this section were corrected after re-reading the current PR branch source.

1. **Fuel visible draft rehydration:** current `FuelEntryPanel.start()` calls `setValues({ ...next.values })`, so the previously claimed missing hydration line is not a current source defect. There is still no component-level test proving the persisted values, including partial-refill choice, visibly reappear after close/reopen/process restart. Add the focused regression test.

2. **Fuel entry contract:** detailed Section 2.2 of `FUEL_ENTRY_AND_BUSINESS_EXPENSE_CALCULATION_CONTRACT.md` lists odometer, partial-refill choice, price/kg and amount as driver-entered fields; pump quantity is not entered and is calculated. Current UI/form definition matches that detailed contract. Do not remove odometer or partial-refill based on the amount/price quantity derivation decision.

3. **Rendered Work PWA path:** DriverWorkflowPanel/useDriverWorkspace are the real PWA presentation/action path; service tests do not prove rendered controls invoke it correctly. Add one browser acceptance path for driver selection, odometer entry, shift/trip action, GPS evidence, committed event and read-after-reload. Reuse all existing service and Track A tests.

4. **PWA/overlay surface parity:** current bridge test proves financial working-copy invalidation only; overlay acceptance proves an overlay-originated workflow event. Add direct two-way committed event/state/revision visibility and a stale UI command interleaving. Existing shared Room store atomicity/idempotency tests are not to be repeated.

5. **Admin entry/readback parity:** the PWA Admin acceptance submits initial Compliance only; neither PWA nor Android UI acceptance submits a linked Compliance renewal. Add a renewal path on both supported surfaces and verify original immutability/new linkage after reload/reopen. Extend Android WebView acceptance for paths not currently submitted: Driver assignment/selection, Traffic Challan, Finance payment/reversal/prepayment/settlement, Performance target/pre-business cost and Fuel. Also assert all records created by the PWA Admin acceptance after reload and all Android submissions after Room reopen. Reuse existing PWA form submissions and avoid duplicating them.

6. **Rendered BackupPanel path:** CI's `backup-panel-browser-acceptance.mjs` already proves the PWA path with mocked Dropbox OAuth/API: Internet-off gating and reload persistence, connect, encrypted upload/download, recovery-key reveal, restore confirmation and checkpoint verification. The remaining UI gap is the Android native OAuth/secure-vault BackupPanel branch; inspect whether retention/disconnect and failure/rollback controls need additional focused assertions. Real Dropbox OAuth and remote delivery remain external acceptance.

7. **Backup exclusion and empty owners:** Browser code explicitly excludes checkpoints, credential vault, credential-vault metadata and diagnostics; Android filters local recovery checkpoint/journal records and stores keys/diagnostics outside business tables. Add direct paired export assertions. Native manifest test includes 13 participants with one Log Book row; add explicit zero-record owner count assertions and browser counterpart.

8. **Interop test scope:** the TypeScript test for Android-generated v2 package only decrypts and checks plaintext; it does not restore the snapshot. The native test creates/self-decrypts a package. Add TypeScript-generated package→Android and Android-generated package→browser production restore tests with the canonical dataset. The misleading TypeScript/native test title/comments have now been corrected; keep the evidence clear that those tests cover decryption/self-decryption only.

9. **Dexie schema upgrade:** `storage-migrations.test.ts` already adds historical v1/v4 fixtures, upgrade/preservation/reopen assertions and future v7 fail-closed coverage. The first CI run exposed a guard bug because `backendDB().version` is native IDB v60 while the app schema constant is logical Dexie v6. PR #99 corrected the guard to compare `backendDB().version / 10`; reuse the existing tests and verify CI rather than adding duplicates.

10. **Scale/concurrent snapshot:** existing export transaction boundaries and injected rollback tests are useful but do not establish practical maximum snapshot size, storage exhaustion behaviour or consistency during concurrent writes. Determine supported bounds from the backup contract, then add deterministic boundary tests or explicitly documented operational gates.

### 9.23 — Backup boundary and device-clock acceptance gaps

**Status:** Source-confirmed additional B0a items; included in the completed first-pass audit. Required tests/implementation remain in B0b and Track B.

- TypeScript encrypted-package parser/encryptor limit is 512 MiB; `backup-crypto.test.ts` proves inclusive-limit acceptance and first-byte-over rejection. Browser's 1,000,000-record guard is wired into snapshot creation/restore and tested by `backup-limits.test.ts`. Android restore coordinator already invokes the 1,000,000-record helper against the actual array before checkpoint mutation, but only after participant/per-record validation. Android `NativeSnapshotBuilder` export and the shared TypeScript encrypted-package manifest validator do not enforce the total count; the helper test also does not exercise the production coordinator/export path. See refined gap 9.37. Production `backup-runtime.ts` uses the same TypeScript encryptor/parser for browser and Android; native Room receives the already-decrypted snapshot, so a separate Android byte-size guard is not required on the current production path. Preserve this shared crypto path when implementing canonical payload adapters.
- Browser Dexie and Android Room snapshot exports are transactional, but there is no deterministic concurrent-writer test proving the exported package represents one consistent revision while a write races snapshot creation.
- Fuel GPS capture and location enrichment have been removed by explicit owner decision. The Fuel purchase schema has no location fields and generic Timeline enrichment has no Fuel-specific exception or integration. Generic Timeline enrichment remains a separate capability for GPS-backed Work events. There is no legacy Fuel location data to preserve.
- Device timezone is explicitly pinned to Asia/Kolkata for business dates and 04:00 logic, and process restart tests exist. A test for OS timezone change and a manual/device acceptance for wall-clock change while powered off are not evident. Exact elapsed time cannot be promised if the device clock is manually changed while off; surface uncertainty rather than fabricate it.
- Dropbox contract requires size/checksum/attachment completeness validation. Current code has package/record bounds and plaintext checksum; no binary attachment feature was found in the inspected source. Confirm current attachment ownership is empty or add its participant/manifest inventory before declaring backup completeness.
- Production Android backup uses the shared TypeScript `createEncryptedBackup`/`parseBackupPackage` path after/before native Room snapshot export/restore. The separate `NativeBackupV2Package.kt` helper is exercised by `NativeBackupV2PackageTest` and the TypeScript fixture test, but it is not the production BackupPanel path. Both tests' titles/comments were corrected to say they prove helper encryption/decryption only. Do not treat them as production Android package/restore proof; B2/B3 must exercise the actual shared runtime path and canonical payload adapters.

### 9.24 — Form registry exists; deeper conformance and component coverage remain

**Status:** Corrected against the current PR branch source on 2026-11-18.

`packages/application/src/form-definition-inventory.ts` defines `ALL_FORM_DEFINITIONS` with 19 forms: 14 Admin forms, two separately registered Performance forms, and three Work/Fuel forms. `tests/form-definition-inventory.test.ts` verifies unique IDs, positive versions, owner/purpose, one declared primary action, non-empty fields, unique field IDs, basic field types, and inclusion of the Performance/Work definitions. `shared-form-runtime.test.ts` contains detailed Admin requiredness/type/option and generic working-copy lifecycle assertions. `driver-form-definitions.test.ts` directly checks Fuel field shape and cancellation-fee validation. The Form Conformance Audit records existing PWA/Android overlay Work/Trip financial-form parity.

**Remaining gaps:**
- The registry test does not include malformed-definition negative fixtures or exhaustive requiredness/type/option assertions for separately registered Performance/Work definitions.
- A registry entry does not prove the actual screen uses it or that rendered values map correctly to the submission handler and authoritative service. Fuel has no direct Fuel branch test for `createBusinessExpenseFormSubmissionHandler` and no rendered PWA or Android WebView form-submit/resume acceptance.
- `FuelEntryPanel.start()` already hydrates visible state from the persisted working copy in current source; a component-level test is missing, not the source assignment itself.
- `presentation-accessibility-responsive.test.tsx` verifies application-shell responsiveness/accessibility, not form controls. No PWA form-specific keyboard/IME, narrow viewport, focus/scroll, touch-target and form-level accessibility acceptance was found.
- Existing Work/Trip Fare/Toll/Parking PWA/overlay form parity is documented and must be reused; do not duplicate it. The missing Work UI path is the separate shift/trip action-to-commit acceptance.

**Required closure:** add only the negative/field-conformance assertions that are not already covered; test Fuel form-to-handler-to-service and rendered resume/submit; add shared PWA form-control responsive/keyboard/focus/accessibility acceptance. Keep feature-specific validation in owning application services. Do not rebuild the form registry or repeat existing Work/Trip financial parity.

### 9.25 — Event-specific GPS acquisition is not proven for every Work transition

**Status:** Source-confirmed gap against LOCATION_AND_STATE_TIMING_CONTRACT.md.

Existing GPS tests prove the generic 50m/30s validator and browser provider's fresh-fix, expiry and transient-error behaviour. DriverWorkflowService tests exercise a generic capture provider mainly through shift_start; v2 tests cover the operational-day/odometer paths; Android overlay acceptance exercises trip_create. The required six-event matrix is not demonstrated: shift_start, shift_end, trip_create, start_ride, end_ride and cancel_ride must each acquire their own fresh GPS fix, preserve event ID and transition/fix timestamps, and never reuse another event's fix.

**Required closure:** Add a focused table-driven application/service test for the six event types and the missing native overlay event paths where the overlay exposes them. Include rapid successive events to prove ordering and per-event fix identity, plus a no-continuous-GPS assertion. Do not repeat generic GPS validator/provider tests or existing outbox/recovery suites.

### 9.26 — Network Access control UI and cross-surface policy propagation

**Status:** Source-confirmed partial coverage against NETWORK_ACCESS_CONTRACT.md.

NetworkGateway and tests/network.test.ts prove service-level policy gating. `backup-panel-browser-acceptance.mjs` is a CI-run rendered PWA test that toggles Internet Off/On, proves Dropbox connect is blocked while off, and verifies On survives reload. Android TimelineEnrichmentStoreTest verifies the Room worker defers derived work when the persisted policy is disabled. No equivalent Android WebView/Room UI test was found for persisted toggle state, cross-surface propagation without internet, process restart and paused work without losing local records.

**Required closure:** Reuse the existing PWA rendered toggle/Dropbox gating test. Add Android WebView/Room policy-control and cross-surface propagation assertion. Verify default-disabled state, off→on→off persistence, no external request while disabled, offline deferral, native Dropbox scheduling/restore confirmation and optional geocoding consent. Reuse NetworkGateway and worker tests; do not duplicate them.

### 9.27 — Required branch protection/ruleset state is not verifiable through current integration

**Status:** Not verified; GitHub API access to branch protection returned 403 Resource not accessible by integration. This does not prove that protection is absent.

The Architecture Foundation Contract requires architecture, web and Android checks to be required for main, with ordinary merge bypass disabled. The workflow file defines the jobs, but a green workflow alone does not prove repository rules enforce them.

**Required closure:** Repository owner/admin must inspect main branch protection/rulesets and confirm the architecture, web and android checks are required, stale/failed checks block merge, and ordinary bypass is disabled. Record the actual settings in the PR #99 evidence closeout. Do not claim this is verified from workflow YAML.

### 9.28 — Actor provenance, historical deletion enforcement and correction coverage

**Status:** Existing Business Event Reliability Audit findings remain open and must be reconciled in B0.

- **Actor provenance:** `RecordEnvelope.createdBy` and the active `FeatureRecordService` author resolver already exist. `apps/web/src/main.tsx` installs the resolver from `PersonIdentityService.currentActor()`, and `FeatureRecordService.create()` requires an active actor when that resolver is configured. Vehicle, Driver, Compliance, Maintenance, Finance Loan, Business Expense, Business Settings and Performance records use this path; `historical-correction.test.ts` asserts actor attribution for a feature record. Do not repeat this foundation or describe actor identity as wholly absent. The remaining source-confirmed gaps are that Finance payment, prepayment and settlement ledger/revision records are written directly with `compareAndSetMany` and carry source but no `createdBy`; `FeatureRecordService.update()` preserves original `createdBy` but does not resolve/store an updating actor (`updatedBy` is not part of `RecordEnvelope`); and TripFinancialService's current-author hook is optional. Work events carry driver/event identity under their own workflow contract. Add focused integration assertions for real Admin-created records and classify create/update actor semantics for direct Finance/Work paths under their owner contracts. Do not invent an `updatedBy` field or schema migration without the persistence/forgiving-entry owner contract deciding whether and how update attribution is retained.
- **Generic deletion:** RecordRepository exposes remove(id). RecordFormWorkingCopyRepository uses it for draft cleanup, while FeatureRecordService exposes create/update only. The complete production call-site audit for remove(id), deletedAt writes/reads and legacy soft-delete compatibility remains unfinished. Trace all call sites and prove historical business events cannot be removed by generic infrastructure; add a static/architecture guard or capability-scoped deletion API if needed.
- **Correction coverage:** HistoricalCorrectionService is append-only and tested for actor rules, stale chains, idempotency and Maintenance Expense pilot. Compliance correction and Finance reversal have domain paths. Do not assume this proves every domain's correction workflow. Work/Shift odometer correction/restatement rules remain subject to the Work contract's open questions; do not enable a generic path without owner policy and recalculation/provenance tests.

**Required closure:** complete the remove/deletedAt call-site and data compatibility audit; map actor provenance per record family, reusing the existing FeatureRecordService resolver and identifying direct-write exceptions; keep unavailable actor identity explicit; and list domain-specific correction/reversal owner contracts and tests. Historical deletion prevention and correction original-retention must be proven before end-to-end acceptance.

### 9.29 — Finance payment allocation policy is implemented but its owner contract remains unratified

**Status:** Contract governance blocker identified in B0a.

FINANCE_LOAN_PAYMENT_WORKFLOW_CONTRACT.md explicitly labels v1 allocation policy as proposed/not ratified. It proposes oldest-due-first, manual override, partial EMI allocations, unallocated credit treatment, schedule-version binding and reversal rules. The Finance service and UI have implementation/tests, but code and tests do not ratify a business policy. The Finance Loan Calculation Contract, Reduce Tenure Prepayment Contract and Settlement/Closure Contract are approved; the payment allocation proposal is not.

**Required closure:** obtain explicit owner ratification or revise the payment contract to the owner's approved policy before claiming the complete Finance payment path is contractually proven. Existing mechanical invariants (stable IDs, atomicity, idempotency, bounds, reversal integrity and backup lineage) should remain tested regardless. Do not silently change payment allocation behaviour or infer approval from implementation.

### 9.30 — Historical Business Event Reliability Audit has stale Fuel scope

**Status:** Documentation reconciliation required.

BUSINESS_EVENT_RELIABILITY_AUDIT.md section 4.11 and section 5 state that no Fuel feature/service/schema exists and Fuel is out of scope. That statement was accurate at its 2026-11-11 baseline but is superseded by the current FuelEntryPanel, FUEL_ENTRY_FORM_V1, Fuel purchase service/schema and FUEL_ENTRY_AND_BUSINESS_EXPENSE_CALCULATION_CONTRACT.md. Fuel GPS capture and Fuel-scoped locality enrichment have since been explicitly removed; the Fuel schema and backup contain no location fields or legacy compatibility handling. Generic Work/Trip GPS remains in scope.

**Required closure:** a dated supersession note has been added to the historical audit pointing to the current Fuel contract and PR #99 B0 evidence matrix. Retain the old baseline as history; current Fuel acceptance covers purchase capture, offline submission, draft recovery and IndexedDB persistence only, with no GPS or location enrichment.

### 9.31 — Generic Room/Dexie deletion capability is not namespace-scoped

**Status:** Source-confirmed capability gap; no current feature service deletion call was found in the scanned application/feature code, but the underlying plugin/upgrade boundary remains unrestricted.

Source scan of all 55 packages/application/src files and all 72 apps/web/src plus 76 packages/features production TypeScript/TSX files found direct RecordRepository.remove usage only for form working-copy cleanup and initial Admin bootstrap rollback. PersonIdentityAdapters uses the same generic remove for the newly created initial Admin person if PIN setup fails. No feature service exposes a delete operation; FeatureRecordService itself has no delete method. However:
- RecordRepository still exposes generic remove(id).
- RoomRecordRepository forwards it to the public RoomStorePlugin.remove method, which accepts any nonblank record ID and deletes it from Room.
- DexieRecordRepository exposes equivalent unrestricted remove.
- FeatureExtensionUpgradeTransaction passes a generic RecordRepository to migration handlers; RoomFeatureExtensionUpgradeTransaction stages arbitrary remove IDs and sends them to commitFeatureUpgradeBatch, whose native transaction validates revisions but does not validate feature ownership/namespace of delete IDs.
- No current production migration handler was found deleting business records, but the migration capability would permit it.

**Required closure:** replace generic deletion with capability-scoped operations (e.g. remove a form working copy by form/instance identity; rollback a newly bootstrapped identity by exact expected revision; delete only records in an explicitly declared feature migration namespace). Enforce ownership in both Dexie and Room, not only in UI/application callers. Add tests proving Finance, Compliance, Maintenance, Work/Driver Workflow, Log Book, historical correction and backup checkpoint records cannot be deleted by an unrelated feature migration or generic plugin call. Preserve atomic rollback and migration semantics.


### 9.32 — Specialized identity/correction/review entry flows sit outside the 19-form inventory

**Status:** Source-confirmed scope gap from the rendered-component inventory.

The 19-entry `ALL_FORM_DEFINITIONS` inventory covers the ordinary Admin, Performance and Work/Fuel forms. A source scan also found persisted entry/decision workflows outside that registry:
- `PersonIdentityPanel.tsx` has separate person enrollment and role-activation forms, plus driver↔person linking. These are security/identity workflows with `PersonIdentityService` and identity adapter tests; Android Admin WebView acceptance exercises enrollment and activation.
- `MaintenanceExpenseCorrection.tsx` is a specialized append-only correction form. The Maintenance correction pilot has strong PWA and Android WebView/Room acceptance; reuse that evidence and do not duplicate it.
- `ComplianceHistoricalCorrection.tsx` is a specialized field/reason correction editor with stable correction ID and chain-revision guards. Service-level correction tests and a presentation test for the entry point exist, but no rendered submit/readback acceptance was found.
- `AdminComplianceOverview.tsx` collects a reason and submits overlap-review decisions. Domain/service tests exist; the exact rendered reason→decision→persisted review path must be classified and evidenced.

These workflows may legitimately need specialized UX and must not be forced into an ordinary Save/Submit form if that would weaken security or correction semantics. However, the Form Architecture Contract requires every implemented form to be discoverable through the shared registry or an equivalent authoritative contract. B0 must record a narrow exception/owner contract for each specialized flow, covering field schema, actor/role, stable operation identity, validation, interruption/retry, immutable history and supported surfaces. PWA rendered acceptance already exercises Person Identity enrollment/activation, Compliance overlap review/correction and Maintenance correction; Android acceptance exercises Person Identity and Maintenance correction. Add only missing Android Compliance correction/overlap-review acceptance where supported; preserve the existing green PWA and Maintenance correction evidence.


### 9.33 — Shared form submission is not crash-safe after the domain commit

**Status:** Source-confirmed high-priority B0b gap; applies to shared Admin/Performance/Fuel forms unless a handler has a separate durable idempotency mechanism.

`SharedFormRuntime.complete()` currently validates the working copy, keeps an in-memory `submissions` Promise map for same-process duplicate taps, calls `submissionPort.submit(...)`, and only after that Promise resolves writes the working copy with `status: "submitted"`. The `FormWorkingCopy` type and repository allow `status: "pending"`, but `complete()` does not persist a pending intent before invoking the handler. Therefore a process death after the business record commits but before the working-copy status write leaves the persisted copy in `in_progress`/`saved`.

On reopen, `SharedFormRuntime.open()` returns that same operationId and copy. `FeatureRecordService.create()` uses `compareAndSet(id, null, record)` and throws `feature_record_already_exists:<id>` on replay rather than returning the original result. `FeatureRecordService.update()` commits with the expected revision; a retry after the first update commit sees a stale revision rather than returning the prior result. The in-memory Promise map is lost on process death. `FormWorkingCopy.operationId` is generated once per copy and `updateField()` preserves it across subsequent edits/saves, so a new logical save is not given a fresh idempotency key. In the Fuel handler, `occurredAt` and the derived businessDate are regenerated from `new Date()` on each invocation, and the handler uses `command.instanceId` as the record UUID; an ambiguous retry can therefore conflict even when the driver has not changed any entered values.

**Required closure:** introduce a durable form submission operation protocol. Persist a stable operation identity per logical save/submit, immutable submitted-payload identity and the first-submit timestamp before dispatch. Rotate to a new operation identity only after a successful save when the user starts a new edit/save cycle. Commit create/update domain mutations plus a durable submission receipt/working-copy completion atomically where the platform store allows it; otherwise make the handler/service replay-safe through a durable idempotency ledger keyed by operationId. A replay with the same operation and payload must return the original record/receipt and original timestamp exactly once; a different payload under the same operation must fail closed. Do not weaken generic duplicate-ID protection or rely on an in-memory cache.

**Required focused tests:**
- Handler fails before domain commit; retry commits once.
- Domain record commits but the response/working-copy completion is interrupted; simulate process death, reopen the same working copy and retry; return the same record ID, original timestamp/businessDate and receipt, with one persisted business record.
- Two concurrent submit taps with the same operation share one durable result.
- Same operationId with changed payload is rejected and does not mutate the original.
- After a successful save, a subsequent edit/save gets a new operation identity; replaying the previous operation returns its prior receipt and does not apply a second mutation.
- Update replay after the first revision commit returns the same resulting revision/receipt rather than a stale-revision error.
- Run the same commit/restart/retry contract against browser IndexedDB and Android Room, using representative Admin and Fuel handlers. Existing Track A Driver Workflow idempotency tests and generic SharedFormRuntime active-Promise tests are not substitutes for this form-specific proof.


### 9.34 — Save/Submit lifecycle contract conflicts with Admin form runtime

**Status:** Source-confirmed owner decision required; do not resolve by silently changing labels or code.

The approved `FORM_ARCHITECTURE_AND_BEHAVIOUR_CONTRACT.md` Sections 4–5 define **Save** as storing an editable draft only, without submitting/finalizing the business operation, and **Submit** as performing the intended business operation. The current implementation does something different:
- `SharedFormRuntime.save()` calls the same `complete(copy, "save")` path as Submit; that path invokes `submissionPort.submit(...)` and only then writes the working copy status as `saved`.
- `createAdminFormRuntimeV1` routes Admin `action: "save"` to handlers that create/update authoritative business records (Finance, Compliance, Maintenance, Platform Fee, Miscellaneous Expense, Traffic Challan and Performance settings).
- `shared-form-runtime.test.ts` currently codifies Save calling the submission handler, so the tests reflect implementation, not the written owner contract.
- Fuel uses `action: "submit"` and creates a Fuel purchase, which matches the written distinction.

**Required closure:** the owner must ratify one of two coherent models: (A) preserve Save=draft-only and Submit=business operation, then change the affected form definitions, visible primary labels, runtime action routing and tests; or (B) explicitly amend the owner contract to permit Save-as-business-record for named forms, with the resulting lifecycle state and editing policy declared per form. Do not assume all Admin forms share one exception. Once ratified, add tests proving draft Save never creates a business record, Submit does, and each form's post-save/post-submit editing policy is enforced.


### 9.35 — Dependency vulnerability report is present but unclassified

**Status:** CI source evidence; impact not yet determined.

The `npm install` step in CI reported **3 vulnerabilities: 1 moderate and 2 critical**. The install summary did not include package names, dependency paths, fixed versions, or production-versus-development reachability. This is not enough evidence to claim the app has three exploitable runtime vulnerabilities, but it is also not acceptable to ignore the finding for a reliability/security foundation.

**Required closure:** capture `npm audit --json` (or the repository's equivalent supported advisory report), identify direct/transitive package paths and whether each is bundled into production or only used in development/test tooling, remediate critical production dependencies, and record a time-bounded owner-approved exception for any unavoidable dev-only advisory. Add a repeatable CI check/report so newly introduced critical advisories are visible and cannot be silently treated as a green security posture.

### 9.36 — Current PR CI failure: Admin acceptance script size and incorrect navigation selector

**Status:** Confirmed from PR #99 CI run `44359614885` (merge commit `b15749ba40dd94241791c2ad327edcc948aafcc7`); not yet fixed.

- Architecture job failed because `scripts/admin-form-browser-acceptance.mjs` is 428 lines / 28,684 bytes, exceeding the enforced 400-line / 24,576-byte limit. The Fuel UI acceptance block was added to this already-large Admin acceptance script. Split Fuel acceptance into its own focused script rather than weakening the architecture gate.
- Web job failed in `scripts/admin-form-browser-acceptance.mjs:107`: it waits for a button named `Work`, but `ApplicationShell.tsx` defines the primary navigation label as `Drive` (screen identity `Drive`). The test should navigate using the actual accessible label `Drive`; do not rename the app navigation merely to satisfy the test.
- The Admin acceptance passed identity enrollment/activation, Business Setup and Vehicle creation before the selector timeout. The Fuel submit portion did not execute, and the separate Fuel script did not run because the workflow stops at the failed Admin script.
- Android was skipped by the integrated gate because architecture and web failed. Do not infer an Android regression or pass.

**Required closure:** extract the Fuel entry path into a separate rendered PWA acceptance script, keep the real vehicle prerequisite created through the Admin UI, correct the navigation selector to `Drive`, and add the focused script to CI. Run the new script and the full required CI; only then update the entry-path evidence status.

### 9.37 — Android record-count guard is late on restore and absent on export/package creation

**Status:** Source-confirmed partial enforcement gap; restore pre-mutation protection already exists.

NativeBackupRestoreCoordinator.restore() calls requireBackupRecordCountWithinLimit(records.length()) at line 247, after participant validation, per-record validation, revision checks and manifest-count equality, but before checkpoint creation or destination mutation. The earlier B0 note that the helper was not called by the coordinator was incorrect and is superseded by this finding. BackupSnapshotContract.validateManifest() only requires a non-negative count. NativeSnapshotBuilder does not guard export count. The TypeScript encrypted-package validateManifest() checks each count is a non-negative safe integer but does not sum the counts against MAX_BACKUP_RECORD_COUNT; therefore the Android export path can encrypt/package a snapshot over the shared 1,000,000-record limit and only reject it later on native restore. The existing BackupPackageLimitsTest tests the helper itself, not the production coordinator/export boundary.

**Required closure:** add a total-record-count assertion to the shared encrypted-package manifest validator used by both createEncryptedBackup and parseBackupPackage; guard NativeSnapshotBuilder export; move the actual Room record-array guard to immediately after reading the raw array and before participant/per-record validation; retain the existing pre-checkpoint restore guard. Add tests proving package creation rejects over-limit manifest totals, native export rejects over-limit snapshots, and native restore rejects an over-limit actual record array before checkpoint creation/destination mutation. Use an injectable lower test limit if constructing 1,000,001 real records would make instrumentation unsafe; separately retain the exact 1,000,000 helper boundary test.

### 9.38 — Android device-readiness prompt lacks rendered WebView/settings acceptance

**Status:** Source-confirmed UI integration gap.

`DeviceReadinessPolicyTest` covers the pure permission policy: precise location, overlay enablement, API-gated background location and notifications, and modern/legacy location-service checks. `DeviceReadinessPrompt.tsx` adds a user-facing Android WebView flow that auto-opens when required settings are missing, supports dismissal and re-check on focus/visibility return, distinguishes recommended settings, and opens the closest Android Settings screen through the native plugin. No rendered Android WebView acceptance was found for that prompt/plugin journey.

**Required closure:** add focused Android WebView acceptance for required permission missing→prompt, opening the relevant setting, returning/resume re-check, dismissal and re-open, recommended settings, and native settings-open failure messaging. Confirm optional settings do not block local Work data entry, while required precise location/overlay gates are enforced exactly as the device-readiness contract specifies. Reuse the existing pure policy tests.

### 9.39 — Backup creation has no plaintext-size preflight before hashing/encryption

**Status:** Source-confirmed memory-boundary gap.

MAX_BACKUP_PACKAGE_BYTES (512 MiB) is checked by serializeBackupPackage() after createEncryptedBackup() has already hashed and encrypted the plaintext. parseBackupPackage() rejects oversized serialized input before JSON parsing, but the creation path has no corresponding plaintext-size preflight. The Android runtime first builds a full Room snapshot and serializes it with JSON.stringify/TextEncoder; the browser snapshot path also materializes plaintext before encryption. A large plaintext can therefore consume substantial memory and crypto work before the final encrypted package is rejected, and base64/AES envelope overhead means a plaintext below 512 MiB can still create an over-limit package.

**Required closure:** establish a measured canonical plaintext cap that leaves room for encryption/base64/manifest overhead under the 512 MiB serialized-package cap and fits the supported Android memory budget. Enforce it before digest/encryption and as early as practical before full snapshot byte materialization. Add exact boundary and first-over rejection tests for both package creation and parse, plus representative peak-memory/time acceptance on browser and Android. Do not pick a lower mobile cap without documenting the supported device/storage target and benchmark evidence.

### 9.40 — Approved current operating scope: one configured vehicle and one configured driver

**Status:** Product-scope decision and authoritative resolver are implemented. The Admin-only operating-pair setup path removes routine Driver selection from Work. The first dependent workflow, Compliance, now resolves the operating Vehicle from the same repository snapshot at the application service boundary, rejects a caller-supplied different Vehicle, and exposes no routine Vehicle selector. Browser and Android rendered acceptance now assert the configured Vehicle is displayed and persisted. Compliance CI/integration verification is pending; Maintenance, Fuel, Finance, Business Expenses and Performance remain open.

**Source audit against the clarified resolver contract:** The current browser `resolveWorkDriverContext` in `packages/domain/src/work-driver-context.ts` uses first-match `find` lookups for selected Driver, assignment history and Vehicle. It validates the selected Driver and exactly one active assignment within that Driver's history, but it does not count all active Driver profiles, all active Vehicle profiles, or all current assignments globally. The Android `WorkDriverContextResolver` similarly validates the selected Driver, that driver's active assignment and referenced Vehicle, but does not enforce global one-active-Driver/one-active-Vehicle cardinality. The browser `WorkDriverSelectionService.selectDriver` remains a callable selection operation and is not yet constrained to one-time Admin setup/repair. These are source-inspected implementation gaps, not passing evidence. Do not treat the existing Work shift-start context check as the full operating-configuration resolver.
**B0b resolver implementation update:** The browser `resolveWorkDriverContext` and Android `WorkDriverContextResolver` enforce global active Vehicle/Driver cardinality, one global current assignment, selected-driver/pair matching, locked-shift rejection, assignment effective-time checks, and source revisions. Focused TypeScript and Android instrumentation coverage exists. The Admin setup path now refuses multiple active Drivers or Vehicles, assigns the sole active Vehicle automatically, closes stale current assignments while retaining their history, and writes the authoritative `work:selected-driver` record. The Work panel no longer offers a Driver selector; it blocks shift start when that canonical selection is absent. Admin configuration/lifecycle changes are guarded against active shifts. Browser acceptance verifies missing-config fail-closed behaviour, canonical selection, and selector-free Work; Android Room acceptance verifies the canonical selection and assignment records. This remains a partial B0b close. Compliance is now wired at the service command boundary and its routine Vehicle selector is removed; see the Compliance evidence below. Fuel, Maintenance, Finance, Business Expenses and Performance command boundaries and routine Vehicle selectors remain open. Final CI and the remaining dependent-workflow acceptance are still required.


The PR #99 end-to-end contract now defines the current operating configuration as exactly one active business Vehicle and exactly one active Driver selected for Work. The current application must resolve that pair automatically across Work, Fuel, Compliance, Maintenance, Finance, Business Expenses and Performance. Routine flows must not ask the user to select a vehicle or driver, manage assignments, or reassign a driver to another vehicle.

**Preserve:** stable Vehicle/Driver record IDs, feature ownership, revisions, explicit foreign references, backup validation and migration compatibility. Existing assignment-history schemas/readers may remain so older data is not discarded. They are not current workflow requirements and multi-entity assignment/reassignment scenarios are not required in the current semantic fixture.

**Contract/test changes committed:**
- PR #99 end-to-end contract Section 3.0 defines the one-vehicle/one-driver runtime rule, missing/ambiguous configuration behaviour, stable-reference policy and future fleet expansion boundary.
- The shared semantic fixture declares one configured Vehicle ID and one configured selected Driver ID; Work and Business Expense lineage explicitly carries those configured references.
- Browser fixture contract tests assert the exact cardinality, stable IDs, consistent reference requirements and deferred fleet status.
- Android shared-fixture instrumentation asserts the same configuration metadata.
- Browser Driver Records backup coverage proves a single active selected Work Driver is exported and retains the negative case rejecting multiple selected Work Drivers.

**Production corrections still required:**
1. **Implemented:** the normative resolver in contract Section 3.0.1 now validates global cardinality (one active Vehicle, one active Driver, one Work selection naming that Driver, and one current assignment connecting the pair) from an authoritative snapshot on Dexie and Room. It returns the versioned pair and source revisions and uses stable fail-closed categories. Focused browser/Android negative cases cover missing, ambiguous, mismatch, locked and effective-time states.
2. **Still required:** wire the resolver into application command boundaries for Work, Fuel, Compliance, Maintenance, Finance, Business Expenses and Performance. Work now consumes the canonical Admin-configured selection and no longer renders a routine Driver selector. Fuel, Compliance, Maintenance, Finance, Business Expenses and Performance still require automatic vehicle binding and removal of routine vehicle selectors. Admin remains the only setup/repair surface; no daily reassignment UI is retained.
3. Ensure all new and corrected vehicle-bound records, Work events, allocations and calculations reference the same resolved IDs and carry the resolved configuration revision through commit. Preserve historical references; never rewrite old records to the current pair.
4. **Partly implemented:** browser rendered acceptance now creates one Vehicle and Driver, verifies that Work blocks without the canonical selection, configures the operating pair in Admin, and asserts selector-free Work rendering. Android Room acceptance verifies that the Admin WebView writes the canonical selection and one current assignment. Still required: exercise all dependent vehicle-bound forms and Android overlay/Work read-after-write and reopen identity consistency, including absence of extra active profiles or assignments.
5. Add resolver negative cases for every missing/ambiguous/mismatched/locked/stale state, assert no partial business write, and prove equivalent stable result/error categories between Dexie and Room. Keep legacy assignment validator/backup tests as compatibility coverage only; do not interpret multi-entity histories as current product acceptance.

**Acceptance status:** Not closed by the fixture metadata tests alone. The live runtime/UI path and rendered PWA/Android assertions must pass before this requirement is marked implemented. Do not claim multi-fleet support; it requires a separate reviewed contract, explicit migration and dedicated acceptance.

