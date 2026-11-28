### 9.34 — Save/Submit lifecycle semantics

**Status:** Resolved by owner clarification on 2026-11-19; the owner contract and current runtime semantics are aligned.

The authoritative `FORM_ARCHITECTURE_AND_BEHAVIOUR_CONTRACT.md` §§4–7 defines Save and Submit as explicit business-record creation actions. Each form declares exactly one of those primary-action labels according to its workflow. Automatic in-progress preservation and draft resume are working-copy operations only; they do not create or update business records. Edit is a separate action and may update an existing record only where the owning feature permits it. Delete remains feature-policy-controlled.

The current `SharedFormRuntime.save()` and `submit()` both invoke the declared business submission port and then persist distinct truthful completion statuses (`saved` or `submitted`). Admin forms declare Save; Fuel declares Submit. The earlier draft-only interpretation is superseded by the owner's clarification and must not be reintroduced.

**Remaining evidence belongs to B0b / gap 9.33:** verify each registered form's declared primary action, post-save/post-submit editability and durable retry semantics. This is no longer an owner-decision blocker; do not change visible labels or runtime behaviour to implement draft-only Save.

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

### 9.29 — Finance payment allocation policy owner ratified

**Status: CLOSED by explicit owner ratification on 2026-11-22.**

The Finance Loan Payment Workflow Contract now labels v1 allocation policy as owner-approved normative policy and records the approval date and owner. The ratified rules cover oldest-due-first allocation, user-reviewed manual adjustment, partial EMI coverage, visible unallocated credit, immutable schedule-version/installment binding, and explicit reversal/correction semantics.

The contract is the approval evidence; implementation/tests remain responsible for mechanical correctness. This supersedes the unratified blocker wording in the earlier B0a audit. No additional policy inference or change is authorized.

### 9.30 — Historical Business Event Reliability Audit has stale Fuel scope

**Status:** Documentation reconciliation required.

BUSINESS_EVENT_RELIABILITY_AUDIT.md section 4.11 and section 5 state that no Fuel feature/service/schema exists and Fuel is out of scope. That statement was accurate at its 2026-11-11 baseline but is superseded by the current FuelEntryPanel, FUEL_ENTRY_FORM_V1, Fuel purchase service/schema and FUEL_ENTRY_AND_BUSINESS_EXPENSE_CALCULATION_CONTRACT.md. Fuel GPS capture and Fuel-scoped locality enrichment have since been explicitly removed; the Fuel schema and backup contain no location fields or legacy compatibility handling. Generic Work/Trip GPS remains in scope.

**Required closure:** a dated supersession note has been added to the historical audit pointing to the current Fuel contract and PR #99 B0 evidence matrix. Retain the old baseline as history; current Fuel acceptance covers purchase capture, offline submission, draft recovery and IndexedDB persistence only, with no GPS or location enrichment.

### 9.31 — Generic Room/Dexie deletion capability is scope-restricted

**Status: IMPLEMENTATION AND FOCUSED REGRESSION EVIDENCE ADDED; FINAL EXACT-HEAD CI PENDING.**

The production call-site audit found generic repository hard-delete was needed only for transient form working copies. Core now defines a shared transient-working-copy ID boundary; Dexie and Room enforce it at their generic delete adapters. Failed first-Admin bootstrap rollback no longer calls generic delete: it writes a revision-checked deletedAt tombstone. Browser and Room feature-extension migration adapters restrict staged deletes to feature:<featureId>:, and the native Room batch transaction independently validates the declared namespace before mutation.

Regression evidence: tests/record-form-working-copy.test.ts proves a protected Finance record survives a rejected generic delete; tests/person-identity-adapters.test.ts proves tombstone retention and projection exclusion; tests/feature-extension-upgrade-coordinator.test.ts and Android FeatureExtensionUpgradeTransactionTest.rejectsMigrationDeletionOutsideTheOwningFeatureNamespace prove feature ownership; Android RecordDeletionPolicyTest.onlyTransientFormWorkingCopiesCanUseGenericHardDelete covers protected domain ID classes. See implementation evidence matrix §9.54. Final required CI on PR #99 must pass before this item is marked verified.

### 9.32 — Specialized identity/correction/review entry flows have rendered acceptance coverage

**Status: IMPLEMENTATION AND FOCUSED REGRESSION EVIDENCE ADDED; FINAL EXACT-HEAD CI PENDING.**

The ordinary ALL_FORM_DEFINITIONS inventory is supplemented by narrow owning-contract evidence for specialized identity, correction and review workflows. Person Identity enrollment/activation is exercised in Android Admin WebView acceptance. Maintenance expense/visit correction is exercised in rendered Browser and Room-backed Android paths. Compliance historical correction and overlap review are exercised in rendered Browser acceptance; Android ComplianceCorrectionCapacitorAcceptanceTest now drives correction, linked renewal and the rendered overlap reason→confirm→Room persistence path through ComplianceOverlapReviewAcceptanceSupport. Trip Financial correction is exercised in the rendered PWA Work journey and Android Room-backed WebView acceptance through TripFinancialCorrectionAcceptanceSupport.

These are intentional specialized workflows, not omissions from the ordinary form registry. Their field/actor/operation identity, validation, retry, immutable history and supported-surface rules remain owned by the feature and shared correction contracts. Exact-head CI is pending; do not mark the evidence green until the final PR #99 run succeeds.

### 9.33 — Shared form submission must survive commit/completion interruption

**Status:** Addressed in PR #99. Actual Dexie and Room persistence recovery, the real Admin update handler, stale-operation replay protection, and the Admin/Performance command-boundary audit are now covered. PR-head CI run `44575792929` passed all required gates.

`SharedFormRuntime` persists the pending operation before dispatch, including the immutable payload fingerprint and first-submit timestamp. `FeatureRecordService` atomically commits feature records with operation receipts; a matching replay returns the original result/revision, while changed-payload reuse fails closed.

**Cross-adapter recovery evidence:**
- `tests/shared-form-dexie-recovery.test.ts` uses the production `SamTravelsDatabase`, `DexieRecordRepository`, `RecordFormWorkingCopyRepository`, and `SharedFormRuntime`. It commits the feature mutation, simulates interruption before working-copy completion, closes IndexedDB, creates a fresh Dexie database instance for the same database name, reopens the pending operation, and retries it. Coverage includes Admin Vehicle create, the real Admin Vehicle update route, and Fuel purchase submission through the production Business Expense handler.
- `android/app/src/androidTest/java/in/samtravels/app/LocalDatabaseTest.kt` adds `pendingAdminCreateUpdateAndFuelOperationsRecoverFromRoomAfterProcessRestart`. It uses the production Room database and native `compareAndSetStoredRecord` / `commitFeatureUpgradeBatch` transaction primitives, closes and reopens Room, verifies the pending working copy plus feature record and durable receipt, and completes the working copy from the recovered receipt. It covers Admin create, Admin update, and Fuel.

**Admin update and operation-identity evidence:**
- `createAdminFormRuntimeV1` accepts the real Vehicle service and durable working-copy repository at its composition boundary. The Dexie integration test runs the actual Admin Vehicle update handler, interrupts after the Vehicle record and operation receipt commit but before the working copy is marked saved, then reopens and retries. The update remains at revision 2 and the original receipt result is returned; no second mutation is applied.
- `tests/shared-form-runtime.test.ts` verifies Save → edit → Save rotates the operation ID. Replaying the prior saved operation is rejected as a stale revision and does not dispatch a second command.

**Admin and Performance handler audit:**
- All 14 Admin form definitions and both Performance Admin forms route through the shared submission runtime. Operation-aware feature services receive the operation ID, immutable payload fingerprint, and first-submit timestamp. The Admin routes cover Business Setup, Vehicle, Driver, Compliance, Maintenance visit/expense/rate, Loan details/payment/prepayment/settlement, Platform Fee, Miscellaneous Expense, and Traffic Challan. The separate Driver Fuel form also uses the shared runtime and passes the same operation identity and timestamp to Business Expenses.
- Loan Payment, Loan Prepayment, and Loan Settlement are deliberate domain-ledger exceptions to the generic feature receipt. Payment and settlement use the form operation ID as their durable ledger command ID; prepayment uses the current form operation ID as the preview/revision command ID. Their commit services validate replay identity/payload and now receive the original `submittedAt` as the ledger timestamp. Regression tests assert the timestamp for all three.
- Append-only historical corrections use `HistoricalCorrectionService`'s durable correction record and chain-head ledger keyed by correction ID; exact retries return the original correction and conflicting reuse fails closed. Loan payment reversal is protected by the payment ledger's command identity and one-reversal-per-payment rule.

The existing regression coverage continues to assert pending-before-dispatch, concurrent-call coalescing, changed-payload rejection, stable record identity/timestamp/business date, original update revision, and no duplicate business effects. The latest CI run `44575792929` passed Web (including the complete regression suite, build, and rendered PWA acceptance), Architecture, Android (including the Room instrumentation gate), and the Integrated regression gate.


### 9.35 — Dependency vulnerability report is present but unclassified

**Status:** CI source evidence; impact not yet determined.

The `npm install` step in CI reported **3 vulnerabilities: 1 moderate and 2 critical**. The install summary did not include package names, dependency paths, fixed versions, or production-versus-development reachability. This is not enough evidence to claim the app has three exploitable runtime vulnerabilities, but it is also not acceptable to ignore the finding for a reliability/security foundation.

**Required closure:** capture `npm audit --json` (or the repository's equivalent supported advisory report), identify direct/transitive package paths and whether each is bundled into production or only used in development/test tooling, remediate critical production dependencies, and record a time-bounded owner-approved exception for any unavoidable dev-only advisory. Add a repeatable CI check/report so newly introduced critical advisories are visible and cannot be silently treated as a green security posture.

### 9.36 — Earlier Admin acceptance script-size and navigation failures resolved

**Status: RESOLVED IN THE CURRENT PR #99 BRANCH; FINAL EXACT-HEAD CI PENDING.**

The earlier run 44359614885 identified the oversized Admin browser acceptance script and the stale Work navigation selector. The Fuel journey is isolated in its own rendered acceptance script, the Admin navigation uses the actual accessible Drive label, and the Architecture/Web gates passed on PR #99 head 8a169bcee7c3fde4439e603ba3973d39cd587a91 in run 45897420220. Android and the remaining required gates were still running at the time of this record update; that run is not final evidence.

### 9.37 — Android record-count guard is late on restore and absent on export/package creation

**Status:** Source-confirmed partial enforcement gap; restore pre-mutation protection already exists.

NativeBackupRestoreCoordinator.restore() calls requireBackupRecordCountWithinLimit(records.length()) at line 247, after participant validation, per-record validation, revision checks and manifest-count equality, but before checkpoint creation or destination mutation. The earlier B0 note that the helper was not called by the coordinator was incorrect and is superseded by this finding. BackupSnapshotContract.validateManifest() only requires a non-negative count. NativeSnapshotBuilder does not guard export count. The TypeScript encrypted-package validateManifest() checks each count is a non-negative safe integer but does not sum the counts against MAX_BACKUP_RECORD_COUNT; therefore the Android export path can encrypt/package a snapshot over the shared 1,000,000-record limit and only reject it later on native restore. The existing BackupPackageLimitsTest tests the helper itself, not the production coordinator/export boundary.

**Required closure:** add a total-record-count assertion to the shared encrypted-package manifest validator used by both createEncryptedBackup and parseBackupPackage; guard NativeSnapshotBuilder export; move the actual Room record-array guard to immediately after reading the raw array and before participant/per-record validation; retain the existing pre-checkpoint restore guard. Add tests proving package creation rejects over-limit manifest totals, native export rejects over-limit snapshots, and native restore rejects an over-limit actual record array before checkpoint creation/destination mutation. Use an injectable lower test limit if constructing 1,000,001 real records would make instrumentation unsafe; separately retain the exact 1,000,000 helper boundary test.

### 9.38 — Android device-readiness prompt rendered acceptance added

**Status: IMPLEMENTATION AND FOCUSED REGRESSION EVIDENCE ADDED; FINAL EXACT-HEAD CI PENDING.**

Android DeviceReadinessWebViewAcceptanceTest now exercises the rendered Settings handoff, return to the app and fresh native readiness re-check. tests/device-readiness-prompt-behavior.test.ts covers focus/visibility refresh behaviour, and DeviceReadinessPolicyTest retains capability/API-level policy coverage. The user-facing flow remains non-blocking for optional settings and fail-closed only for required device capabilities. See matrix §9.54; final Android CI is pending.

### 9.39 — Backup creation has no plaintext-size preflight before hashing/encryption

**Status:** Source-confirmed memory-boundary gap.

MAX_BACKUP_PACKAGE_BYTES (512 MiB) is checked by serializeBackupPackage() after createEncryptedBackup() has already hashed and encrypted the plaintext. parseBackupPackage() rejects oversized serialized input before JSON parsing, but the creation path has no corresponding plaintext-size preflight. The Android runtime first builds a full Room snapshot and serializes it with JSON.stringify/TextEncoder; the browser snapshot path also materializes plaintext before encryption. A large plaintext can therefore consume substantial memory and crypto work before the final encrypted package is rejected, and base64/AES envelope overhead means a plaintext below 512 MiB can still create an over-limit package.

**Required closure:** establish a measured canonical plaintext cap that leaves room for encryption/base64/manifest overhead under the 512 MiB serialized-package cap and fits the supported Android memory budget. Enforce it before digest/encryption and as early as practical before full snapshot byte materialization. Add exact boundary and first-over rejection tests for both package creation and parse, plus representative peak-memory/time acceptance on browser and Android. Do not pick a lower mobile cap without documenting the supported device/storage target and benchmark evidence.

### 9.40 — Approved current operating scope: one configured vehicle and one configured driver

**Status: IMPLEMENTATION AND FOCUSED REGRESSION EVIDENCE INTEGRATED INTO PR #99; FINAL EXACT-HEAD CI PENDING.**

The authoritative resolver enforces global active Vehicle/Driver cardinality, one global current assignment, selected-driver/pair matching, locked-shift rejection, assignment effective-time checks and source revisions. Admin setup establishes the sole configured pair; routine Work no longer exposes a Driver selector. Compliance resolves the active Vehicle independently and does not require Work Driver selection or a Driver–Vehicle assignment. Finance, Business Expenses, Maintenance, Fuel and Performance production command boundaries revalidate operating context and reject stale context before write/read completion.

Browser and Android Room tests cover resolver success, missing/ambiguous/mismatched/locked/stale states, no-write behaviour and rendered setup/readback. This closes the earlier partial B0b operating-context wiring statements for the current one-Vehicle/one-Driver scope. Multi-vehicle/multi-driver/fleet workflows remain deferred and require a separate reviewed contract. See §9.52 and matrix §9.54.

### 9.41 — Six-layer business-rule evidence audit and Business Start Date contract conflict

**Status:** Six-layer audit added to `docs/PR_99_IMPLEMENTATION_EVIDENCE_MATRIX.md` Section 7 against PR #99 head `96449e62fdf19bdca776b004bc7d97782ffe658e`. Documentation commits are newer than that source-audit baseline; final CI and exact-head rerun remain pending. No row is marked fully proven.

The audit applies six independent gates to each owner-approved rule: explicit/consistent contract wording; correct production service/calculation; positive, negative and boundary tests; Browser–Room parity; and equivalent outcome after backup/restore/reopen/recovery, in addition to the owner-approved rule itself.

**Confirmed material conflict — Business Start Date allocation:**

- The checked-in `BUSINESS_START_DATE_COST_ALLOCATION_CONTRACT.md` §§2–4 specifies an aggregate pre-business pool recovered over a fixed 18 months, independent of Compliance validity and loan schedule end dates.
- The current production domain implementation does something different: `allocateComplianceCostV1()` distributes the complete Compliance amount from `max(validFrom, businessStartDate)` through the remaining inclusive `validTo`; `allocateScheduledEmisV1()` carries complete pre-start EMI amounts from Business Start Date through the remaining loan schedule horizon and allocates later instalments over their EMI periods.
- `tests/business-start-date-cost-allocation.test.ts` explicitly asserts remaining Compliance validity days, scheduled EMI periods, pre-business EMI carry-forward, settlement cutoff and prepayment schedule behaviour.
- Therefore contract, implementation and tests are not mutually consistent. This is not a test-only omission. Do not change the calculation to match the fixed 18-month text or rewrite the contract to match code until the owner-approved policy is reconciled and recorded.

**Other confirmed audit outcomes:**

1. Work odometer contract explicitly classifies an upward next-shift start-reading gap as personal km; daily business km remains shift end minus shift start. Work service/04:00 tests exist, but rendered PWA and direct two-way surface proof remain open, and the populated restore fixture is absent.
2. 04:00 pending/unallocated distance is explicitly excluded from published daily business km until confirmed rotation. The same transition is not yet exercised as populated semantic data through both restore/recovery paths.
3. Fuel owner contract explicitly retains odometer and partial-refill choice, derives quantity from amount/price per kg, includes partial purchase spend but excludes it as a full-tank checkpoint, and excludes GPS/location enrichment. PWA entry/draft evidence exists; Android Room submit/readback and populated full→partial→full restore calculation proof remain open.
4. Maintenance integration rejects a daily distance record unless all entries are allocated and unallocated km is zero. The shared fixture still needs effective-rate history, daily-km source ID/revision, business/personal split, accrual and correction lineage.
5. Compliance is Vehicle-owned only. The new application service uses `resolveOperatingVehicle()`, does not require Work Driver context, and rejects a mismatched Vehicle ID. Renewal UI/readback parity and populated multi-generation restore evidence remain open.
6. Reduce Tenure is enforced at the Finance application service preview boundary: any mode other than `reduce_tenure` is rejected, and `finance-loan-prepayment-service.test.ts` asserts that `reduce_emi` fails. The generic lower-level calculation still represents both modes; keep it behind the service boundary. Android Room transaction/readback and populated schedule/payment/prepayment/settlement restore proof remain open.
7. Breakeven/expense rules have individual calculation tests and PWA/partial Android Admin entry evidence. Android Challan and Performance target/pre-business entry/readback plus integrated same-record calculation restore parity remain open.
8. The shared semantic fixture remains `contract_seed_only`. Browser and Android tests currently validate its metadata and declared dimensions, not populated feature records through production export, restore, reopen, startup recovery, re-export and calculation/provenance comparison.

**Required closure:** resolve the Business Start Date owner-rule conflict first; then close the specifically listed entry/parity gaps and populate/run the shared semantic fixture. Upgrade evidence only after all six gates pass on the same final PR head. PR #99 remains draft and unmerged.


### 9.42 — Business Start Date 18-month pool rule clarified and implementation aligned

**Status:** Owner clarification received 2026-11-19. This section supersedes the Business Start Date conflict/blocker wording in §9.41 and the earlier audit baseline.

**Authoritative rule now confirmed:**

- Every eligible source amount whose authoritative business/effective date is before the Business Start Date contributes its full amount to one aggregate pre-business pool. Do not prorate an individual source according to remaining validity or schedule days.
- Recover the combined pool in 18 equal monthly instalments beginning on the Business Start Date. Monthly anniversaries are anchored to the original start day and clamped to month end where needed. Integer-paise residuals are distributed deterministically; each monthly instalment is distributed across its recovery-month days.
- Amounts dated on or after Business Start Date are not included in the pool. They continue under normal source-category monthly allocation.
- Compliance classification uses `validFrom`; a pre-start Compliance record contributes its full amount even if its validity extends beyond or expired before Business Start Date. Compliance effective on/after the start date continues across its actual inclusive validity period.
- Each complete EMI is classified by its scheduled due date. A due date before Business Start Date contributes the complete EMI amount to the pool, including when its normal allocation period would otherwise straddle the start date. Due dates on/after the start date continue on their normal EMI period. No principal/interest split is used.

**Implementation changes on PR #99:**

1. `allocateComplianceCostV1()` now routes the full pre-start Compliance amount into a pool-member source instead of allocating only the remaining validity days.
2. `allocateScheduledEmisV1()` now routes each complete pre-start scheduled EMI into the same pool-member set; post-start EMIs retain their normal due-date periods.
3. New `allocatePreBusinessCostPoolV1()` aggregates those members from all supported source categories and creates one 18-month daily recovery schedule. Original source IDs, revisions, source dates and amounts remain separately represented as pool members for lineage.
4. `BusinessStartDateCostAllocationService` applies the aggregation after collecting Compliance and Finance source rows and before building the report/provenance.
5. Calculation ID/version is bumped to v2 so the changed allocation semantics cannot collide with v1 provenance.
6. Domain tests now cover Compliance remaining-validity and expired cases, exact-start boundary, pre-start EMI whose period crosses Business Start Date, normal post-start EMI periods, combined Compliance+EMI aggregation, all 18 monthly instalments, paise residuals and month-end anchoring.

**Evidence status:** Contract and domain-level rule/tests are aligned. The shared Performance parity fixture has now been expanded with persisted manual, pre-start EMI (including its immutable loan revision and schedule version), and pre-start Compliance source envelopes. The Browser/Dexie test binds each pool member to its exact persisted source identity, revision and amount, then checks the aggregate 18-month recovery total, daily reconciliation, category attribution and calculation provenance. The Android Room instrumentation test stores the same fixture records, validates the envelopes, and independently checks the same source-to-recovery lineage and aggregate totals. The fixture now proves one ₹234.00 (23,400-paise) pool from manual, EMI and Compliance sources rather than a manual-only pool.

The populated pool now has production-path restore lifecycle coverage on both persistence platforms:

- **Browser/Dexie:** the parity test registers the real Vehicle, Compliance, Finance and Performance backup validators; exports the populated source set with the production snapshot exporter; creates, serializes, parses and decrypts the production recovery-key-only encrypted package; restores through the production restore function; verifies source IDs/revisions and all three pool-member amounts; calculates the Performance v1 result and provenance; marks/discards the verified checkpoint through production APIs; closes/reopens IndexedDB; invokes startup recovery; re-exports and compares the restored records; and recomputes the Performance result after reopen.
- **Android/Room:** the instrumentation test registers the real Vehicle, Compliance, Finance and Performance Room backup participants; builds the source package through the production snapshot builder; restores through the production Room restore coordinator; checks exact manual, loan schedule-version/installment and Compliance source lineage and the 23,400-paise pool; uses the same production checkpoint verify/discard operations as BackupPlugin; closes/reopens the file-backed Room database; runs the production startup-recovery gate; and compares the production re-export with the original source records. The shared Room parity test also validates the explicit owner participant for each persisted source.

The Browser test recomputes the Performance domain output from the restored source set and checks the 18-month schedule, daily reconciliation, provenance, lifetime cost/profit and target position. The Room instrumentation test verifies the same persisted inputs and the shared expected output vector, but does not yet drive the actual Android WebView Performance composition/screen from the restored Room repository. The production BusinessStartDateCostAllocationService + Performance composition root is therefore not yet proven end-to-end from one restored repository on both platforms. Both success and interrupted-restore startup paths now use this same populated three-source pool. The success path explicitly verifies/discards the checkpoint before close/reopen and confirms startup recovery leaves the imported source graph intact. The failure path leaves the restored pool unverified, closes/reopens the database, and asserts startup recovery restores the exact pre-restore destination baseline and records rollback_complete on both Browser and Room. Rendered mixed-pool Performance acceptance remains open.

**Disposition:** production export/restore/reopen/startup-gate/re-export source preservation is now exercised for the populated manual + EMI + Compliance pool on Browser and Room. Calculation/output parity is stronger but the complete six-layer composition and rendered-output gate remains **PARTIAL**. Do not promote the Business Start Date row to PROVEN until Android WebView Performance output is verified from the restored Room repository and the final-head CI passes.


**Android WebView acceptance and access-boundary correction:** The restored-Room acceptance now launches the actual MainActivity/Capacitor WebView over the restored Room repository, activates an Admin through the real identity UI, refreshes Performance for the restored reporting range, and asserts rendered period/lifetime totals, the combined 18-month recovery summary and manual/EMI/Compliance provenance. The first emulator run reached the actual calculation but exposed an architectural defect: Performance called the Admin-session-gated Compliance overview, so leaving Admin invalidated the actor required by a read-only report. ComplianceAnalysisService now keeps the Admin-gated getOverview() for Admin presentation and exposes a separate read-only getAllocationOverview() for the trusted Performance allocation projection. A regression test asserts that the Admin overview still fails without an active actor while the allocation projection remains readable and preserves corrected source data. The Business Start Date allocation service now consumes only that read-only projection. The Android acceptance and full CI rerun are pending; do not yet mark rendered output as proven.

**Performance aggregation clarification:** the Performance runtime now takes the pre-start Compliance and EMI source amounts from the fixed-cost allocation adapter, combines them with Admin's manual pre-business entries, and calls the shared 18-month recovery allocator once. It does not consume the fixed-cost adapter's separate pool daily rows for Performance; it consumes post-start Compliance/EMI daily allocations normally and attributes the shared recovery's source-level daily shares back to `compliance`, `emi`, and `manual` cost buckets. Source revisions and EMI schedule versions remain in provenance. This closes the calculation-layer one-pool requirement for those three source families; browser/Room parity and populated backup/restore remain open.



### 9.43 — PR #99 Stage 4 exact-head evidence closeout

**Status:** Subordinate Stage 4 evidence closeout is complete; this does not close the repository-wide architecture foundation register or establish whole-contract completion for PR #99.

The earlier §9.41 six-layer audit and §9.42 Performance acceptance notes are historical snapshots. Current evidence supersedes only the specific stale claims below:

1. **Business Start Date policy conflict:** superseded by the owner clarification and implementation alignment recorded in §9.42. The fixed 18-month aggregate pool is the current rule; do not repeat the superseded conflict as an active blocker.
2. **Restored-Room Performance composition:** the actual Android MainActivity/Capacitor WebView now reads the restored Room repository and verifies rendered period/lifetime totals, the combined 18-month recovery summary, and manual/EMI/Compliance provenance. The prior §9.42 statement that this rendered acceptance remained open is superseded by the passing `RestoredRoomPerformanceWebViewAcceptanceTest` in the Android job.
3. **Populated semantic restore lifecycle:** the 29-record shared graph is exercised through the TypeScript-produced encrypted package and Android production decrypt/Room restore, pre-populated destination replacement, normalized semantic comparison, Room close/reopen, startup recovery and re-export. The reverse Android-produced encrypted package → Browser/Dexie production restore remains covered by `tests/android-produced-backup-restore.test.ts`. This supersedes the older §9.41 statement that the fixture was only `contract_seed_only`; it does not imply the fixture includes Finance prepayment/settlement transaction lineage.
4. **Exact-head CI:** commit `68fa1233a7d84df0ef77c35e95b1a353085750c5`; [run 45034254979](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/45034254979). Architecture, Web, Android, Cross-platform encrypted backup restore and Integrated regression gate all succeeded. Optional Production geocoder verification was skipped.

**Still open / not converted to passes by this run:** the Finance prepayment/settlement fixture-lineage limitation; any entry-path or cross-platform correction/provenance row still marked PARTIAL in the current PR #99 evidence matrix; unresolved owner-contract or repository-wide architecture gaps; and the external/manual physical OEM, full-OS reboot and real Dropbox-account gates. Reassess each against its owning contract and exact evidence before changing its status.

PR #99 remains draft, open and unmerged. Whole-contract status remains **INCOMPLETE** until every applicable condition in PR #99 contract §1A is met or explicitly accepted as a scoped deferral by the owner.


**Exact-head validation correction:** Run 45034254979 is green on `68fa1233a7d84df0ef77c35e95b1a353085750c5`, before the Stage 4 documentation-only commits. Current PR head is `f2efeb74ff8a383d3d572d7acae3b668c51c8336`; no workflow run is currently associated with that SHA. Accordingly, the Stage 4 evidence reconciliation is complete but final exact-head CI remains pending. Do not cite run 45034254979 as validation of the later documentation head. The connector available in this session has no workflow-dispatch operation; CI must be started through the repository's manual workflow dispatch or a subsequent PR synchronization event.


### 9.44 — PR #99 Stage 6 whole-contract reconciliation — 2026-11-23

**Audit source head:** `34e01756922985ecfb1ba69a2b438d884efe7d8b`.  
**Exact-head CI at audit start:** [45154128872](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/45154128872), successful for Architecture, Web, Android, Cross-platform encrypted backup restore and Integrated regression; optional Production geocoder verification skipped.  
**Reconciliation status:** Whole contract **INCOMPLETE**. This entry supersedes stale execution-status wording in earlier audit snapshots only where it conflicts with the current PR #99 evidence matrix and execution plan. Historical findings remain preserved.

The current PR contains meaningful production restore and recovery improvements, including both encrypted restore directions for the existing populated graph, Room rollback/startup recovery, invalid-reference rejection, participant validation and workflow replay tests. These facts do not close the following whole-contract requirements:

1. **G-18 / shared fixture completeness:** the 29-record populated graph still lacks Finance prepayment and settlement transaction lineage. The Stage 1 fixture acceptance gate is not met.
2. **G-15 / G-16 / G-18 / cross-runtime completeness:** Browser/Dexie and Android/Room lifecycle tests cover the current graph, not every required owner-contract record, correction chain, event state and source revision. Stage 2 remains partial.
3. **G-19 through G-24 / integrated calculations:** domain-level tests cover important individual calculations and provenance. A complete same-source, same-revision, full correction/workflow graph has not been shown to produce equivalent calculations and provenance through both production restore/recovery paths. Stage 4 remains partial.
4. **G-11 / G-24 / surface workflow parity:** direct PWA-to-overlay and overlay-to-PWA committed Driver Workflow state/event/revision visibility, plus the stale-read N → overlay commit N+1 → stale PWA rejection/convergence sequence, remain explicit open requirements. Stage 3 remains partial.
5. **G-10 / backup completeness and G-37 / G-39:** participant/zero-record representation, paired exclusion proof, production snapshot consistency and Android production record-count/creation-boundary enforcement require exact normative-contract mapping and passing assertions. Existing malformed-input, rollback and participant tests prove important slices but do not by themselves close the complete Stage 5 gate.
6. **G-40 / operating configuration:** the canonical resolver and Compliance vehicle-only path are implemented, but automatic context binding for all dependent Fuel, Maintenance, Finance, Business Expense and Performance command boundaries remains to be demonstrated. Do not mark the one-pair operating contract fully wired based only on resolver unit tests or Compliance proof.
7. **G-19 / correction consumers:** correction-chain integrity and selected owner read models are tested, but remaining consumer-level recalculation and restored-source provenance must be reconciled feature by feature. Do not infer full correction closure from source immutability tests.

The earlier conversational declaration that Stage 5 was complete is superseded by the formal Stage 6 audit: Stage 5 has meaningful passing regression slices but no complete recorded exit-evidence matrix and remains **PARTIAL** until every applicable negative, boundary, interruption, exclusion and snapshot requirement is mapped and proven. The six-stage execution plan now records Stages 1–5 as incomplete/partial and Stage 6 as in progress and blocked; sequential stage gates must not be bypassed.

**External/manual gates retained, not counted as CI passes:** physical OEM/device certification and owner usability approval; full OS reboot where deterministic CI coverage is unavailable; and live Dropbox account authentication/upload/download/scheduled-backup/restore. Repository branch-protection/ruleset enforcement is also not established by the application CI run and remains a repository-administration verification item.

**Disposition:** Stage 6 reconciliation is recorded but final acceptance is **BLOCKED**. Resume at the earliest unmet sequential gate (Stage 1 shared fixture completion). PR #99 must remain open, draft and unmerged. Do not label the whole contract complete until all eight conditions in PR #99 contract §1A are satisfied.


### 9.46 — Stage 1 / Stage 2 evidence correction — 2026-11-23

The §9.44 finding that G-18's populated fixture was a 29-record graph without Finance prepayment/settlement lineage is superseded by the direct source and exact CI evidence recorded in PR #99 evidence matrix §9.45. At evidence head `e45823f09675ff4c8b8eceffad0e00faed68cbc2`, `fixtures/semantic-backup-lifecycle-v1.json` contains 46 actual records and declares the matching record count. Its Finance graph includes payment/reversal/replacement, a reduce-tenure prepayment revision, schedule-version-2 settlement with settlement cutoff/entry ID, and closed-loan state. The four named Web fixture inventory/calculation/validator tests passed; Android's populated Room lifecycle and validator matrix passed; the production Browser and Room restore/reopen/re-export paths and reverse Android→Browser encrypted restore passed in CI run [45165851554](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/45165851554).

**Disposition:** The specific shared-fixture-completeness blocker is **CLOSED for Stage 1**; the corresponding same-populated-graph production lifecycle gate is **CLOSED for Stage 2**, on the evidence scope above. Do not retain the stale 29-record/no-prepayment finding as a current gap. This does not close all of G-18 or the whole contract: direct PWA/Android overlay stale-write parity (Stage 3), broader consumer-level correction/recalculation proof (Stage 4), and complete negative/boundary/interruption requirement mapping (Stage 5) remain open and must be tracked against their own normative requirements. The whole-contract status remains **INCOMPLETE**.

The run validates only the evidence SHA above. The documentation reconciliation commits create a newer PR head, which requires fresh exact-head CI. PR #99 remains open, draft and unmerged.


### 9.47 — PR #99 Stage 4 acceptance and Stage 5 evidence reconciliation — 2026-11-25

This checkpoint reconciles the repository-wide register with the current PR #99 execution plan and implementation evidence matrix §§9.50–9.51. It supersedes earlier Stage 4/5 status descriptions in this register only for the scoped requirements and evidence stated here; historical audit findings remain preserved.

**Stage 4 — ACCEPTED (scoped stage exit).** The integrated 46-record Browser/Dexie and Android/Room calculation runner composes the production FullCostBreakevenService and PerformanceCalculationServiceV1, verifies paid Traffic Challan exclusion from operating breakeven and inclusion in full-cost breakeven, consumes the revisioned fixed daily Driver Target, and carries the exact historical Compliance correction through Business Start Date recovery allocation and Performance provenance. The complete calculation/provenance result is compared before backup and after production encrypted restore/reopen/recovery on both runtimes. Exact accepted implementation head: `f7b49970728a3991623c398f32630498a9f6cd58`; required CI run [45501365286](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/45501365286) passed Architecture, Web, Android, Cross-platform encrypted backup restore and Integrated regression gate.

**Stage 5 — IMPLEMENTATION AND REQUIREMENT-TO-TEST EVIDENCE COMPLETE; FINAL DOCUMENTATION-HEAD CI GATE PENDING.** The current evidence matrix §9.51 maps the applicable requirements to named Browser/Dexie and Android/Room assertions:
- malformed and truncated encrypted-package rejection before restore;
- pending Work intent replay after encrypted restore, with one committed business event and one outbox effect after close/reopen and retry/replay;
- consistent multi-table snapshot boundaries under concurrent writes;
- portable exclusion rules;
- zero-record participant handling, ownership and unknown-participant rejection;
- inclusive record/package count boundaries and rejection before destination mutation;
- dangling-reference, malformed-row and participant-mismatch rejection;
- interrupted restore rollback and startup recovery.

The evidence includes `tests/stage5-work-outbox-encrypted-restore.test.ts`, `tests/backup-crypto.test.ts`, `tests/backup-snapshot-consistency.test.ts`, `tests/backup-exclusions.test.ts`, `tests/semantic-backup-lifecycle-fixture-inventory.test.ts`, `tests/backup-snapshot.test.ts`, `tests/backup-limits.test.ts`, `tests/backup-invalid-reference-restore.test.ts`, `tests/backup-restore-failure-recovery.test.ts`, and the corresponding Android Room instrumentation tests listed in matrix §9.51.

Implementation-head CI run [45512816930](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/45512816930) passed the five required jobs on `d13a2862e2fd41e822d0781ce10b5eba81080252`. The subsequent documentation-updated PR head requires its own complete required CI run before Stage 5 is formally accepted. Do not treat a successful run on an earlier implementation or documentation head as validation of a later commit.

**Whole-contract status remains INCOMPLETE.** Stage 5 acceptance is a scoped execution-stage exit, not PR #99 whole-contract acceptance. Stage 6 reconciliation and any remaining owner-contract, operating-configuration, external/manual or repository-administration gates remain separately tracked. Physical OEM/device certification, nondeterministic full-OS reboot acceptance, live Dropbox account delivery and final owner visual approval are not CI passes.

PR #99 remains **OPEN · DRAFT · UNMERGED**. No merge or close is authorized by this checkpoint.


### 9.48 — PR #99 Stage 5 exact-head acceptance and Stage 6 audit — 2026-11-25

This addendum supersedes the Stage 5 documentation-head CI pending wording in §9.47. Earlier audit history remains preserved.

**Stage 5 — ACCEPTED (scoped exit).** Exact PR head ae59d7a77e079f31c9e14048c6dffbd0efb680ff; required CI [#45514874954](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/45514874954) completed successfully on that exact SHA. Architecture, Web, Android, Cross-platform encrypted backup restore and Integrated regression gate passed. Optional Production geocoder verification was skipped. The exact Browser/Dexie and Android/Room requirement mapping is in PR #99 implementation evidence matrix §9.51.

**Stage 6 — ACTIVE; whole-contract acceptance remains BLOCKED.** The current 46-record fixture, production Browser/Room lifecycle, same-record UI golden journeys, integrated calculation/provenance and Stage 5 negative/recovery evidence close the corresponding scoped stages. They do not close every supported entry path or owner-contract obligation in PR #99 §1A.

**Critical unresolved items carried forward from the current evidence matrix:**
- Fuel amount/price correction UI and immediate recalculation of derived quantity, full-to-full mileage, effective rate history, daily costs and Performance on both runtimes.
- Trip/fare correction and missing-trip insertion, preserving immutable Work events and linked fare/toll/parking lineage.
- Maintenance correction propagation into actual-expense and applicable downstream read models; current audit identifies getActualExpenseTotal() reading original values, and visit correction is not available in the audited path.
- Compliance correction/renewal readback and immediate consumer refresh across supported surfaces, including Android WebView where supported.
- Full §3.0.1 operating-pair context binding for Fuel, Maintenance, Finance, Business Expenses and Performance, plus stale-revision/no-write parity; the Compliance Vehicle-only resolver slice is not a substitute.
- Historical deletion/deletedAt call-site and compatibility audit; update-actor provenance where required; complete domain correction-authority mapping.
- Remaining rendered device-readiness handoff/return/recheck, Work event-specific GPS and form-definition/accessibility conformance required by the owning contracts.

**External/manual gates (not CI passes):** physical OEM/device certification and owner usability/visual approval; full OS reboot persistence where not deterministic in emulator CI; live Dropbox account authentication/upload/download/scheduled-backup/restore; repository branch-protection/ruleset verification.

No unapproved deferral is treated as accepted. Stage 6 is not accepted until each critical item is closed with named evidence or explicitly owner-accepted as a scoped deferral, all records agree, exact-final-head required CI passes, and PR metadata is verified. PR #99 remains open, draft and unmerged.


### 9.49 — PR #99 Stage 6 focused slice 1 implementation: Fuel correction — 2026-11-25

Stages 1–5 remain accepted and are not reopened. Stage 6 remains the sole active stage. The Fuel correction slice has implementation changes on the PR branch: the shared Work-screen Fuel panel now lists recorded purchases, offers append-only amount/price-per-kg corrections with a reason and correction history, and refreshes the corrected fuel projection, interval/rate history and daily expense readback. BusinessExpensesService.correctSource() now accepts the original target and chain revisions so an ambiguous retry can reuse the same correction intent.

Authored evidence: tests/fuel-purchase-correction-presentation.test.tsx; tests/business-expense-correction-retry.test.ts (retry revisions and corrected price/kg interval recalculation); and Android FuelCorrectionCapacitorAcceptanceTest.driverCorrectsFuelAmountThroughWebViewAndRoomReadModelsRefresh (rendered WebView over Room, immutable original, correction actor/chain and immediate daily readback).

**Status: IMPLEMENTATION ADDED; REQUIRED CI / TEST EXECUTION PENDING.** Do not count the Android instrumentation source or Browser test source as passing evidence until the final exact-head workflow reports success. This slice does not close the other six Stage 6 areas or whole-contract §1A.

### 9.50 — PR #99 Stage 6 focused slice 2: Maintenance correction and daily accrual evidence — 2026-11-26

**Status: IMPLEMENTATION AND FOCUSED REGRESSION EVIDENCE ADDED; FINAL EXACT-HEAD CI PENDING.** Maintenance correction, actual-expense projection and authoritative daily accrual are implemented and covered by Browser/Android tests on the single PR #99 branch. The earlier run 45819697235 validated an earlier standalone slice head and is historical only; it is not final validation of the current PR #99 head.

**Correction and actual-expense readback**
- MaintenanceService.listVehicleRecords() and getActualExpenseTotal() consume the feature-owned correction projection for Maintenance expenses (amountPaise) and service visits (totalPaise). Original records and itemised visit evidence remain immutable.
- Admin/Driver Maintenance presentation exposes append-only correction history for expense amounts and visit totals. Correction authority remains feature-policy-controlled; another Driver's record is rejected.
- tests/maintenance-service.test.ts proves corrected expense and visit values flow into actual-expense totals while original source records remain unchanged.
- scripts/maintenance-correction-browser-acceptance.mjs exercises both corrections through rendered PWA and asserts corrected actual-cost summary, original source values, Admin attribution, correction records and chain heads.
- Android MaintenanceCorrectionCapacitorAcceptanceTest / MaintenanceCorrectionAcceptanceFlow exercises the same correction forms over the Room-backed WebView, including Driver ownership restrictions, expense and visit corrections, immutable originals and Room backup/restore.

**Authoritative daily accrual**
- WorkApplicationCoordinatorV1 delivers committed Work events to accrueMaintenanceForCompletedWorkDay. Accrual is attempted only for a committed Workflow v2 shift_rotate event (the 04:00 operational boundary), not an ordinary shift end.
- Integration requires exactly one daily-business-kilometre record matching the outgoing shift and rotation event, an allocated contribution and zero unallocated business km. MaintenanceService independently validates the full daily record before persisting an accrual.
- Immutable daily accrual snapshots the daily-distance record ID/revision, confirmed business km, separate personal km/personal amount, and maintenance rate effective on that operational date. Its vehicle/date key and source-snapshot check make outbox replay idempotent.
- tests/maintenance-service.test.ts covers rate-history idempotency/effective dates, daily accrual idempotency, rate snapshot retention, automatic 04:00 rotation accrual, ordinary-shift-end exclusion and deferral while daily km remains unallocated.
- Browser backup coverage is in tests/maintenance-backup.test.ts. Android Room coverage is in NativeMaintenanceBackupRoomTest, including daily-km source revision, rate history, business/personal km split and immutable accrual.

All Maintenance changes and tests are consolidated in PR #99. The earlier standalone PR run is not evidence for the final PR #99 head; all five required CI gates must pass after the final documentation update.

### 9.51 — PR #99 Stage 6 focused slice 3: Compliance correction, renewal, overlap review and allocation readback — 2026-11-26

**Status: IMPLEMENTATION AND FOCUSED REGRESSION EVIDENCE ADDED; FINAL EXACT-HEAD CI PENDING.** Compliance correction, linked renewal, overlap review and date-scoped daily-cost readback have Browser and Room-backed Android acceptance. This does not by itself close the whole Stage 6 contract.

**Immutable renewal and correction policy**
- ComplianceService creates immutable Vehicle-owned validity records. A renewal links to an existing predecessor for the same vehicle and compliance item; early renewal preserves actual overlap and late renewal preserves actual uncovered gap. It never rewrites previous validity.
- New premium/amount changes use a linked renewal record. Historical corrections use a separate append-only chain and cannot change vehicle identity or renewedFromRecordId.
- ComplianceHistoricalCorrectionAdapter allows only approved historical fields such as totalCostPaise, validFrom and validTo. Source envelopes remain immutable and correction history retains Admin authority, reason, stale-chain checks and provenance.
- ComplianceAnalysisService projects valid correction chains into Admin overview and Performance allocation reads. Unconfirmed/stale same-item overlaps withhold aggregate cost; confirmed reviews are tied to exact source revisions.

**Readback and verification coverage**
- tests/compliance-service.test.ts verifies late linked renewal and preserved gap/validity.
- tests/compliance-domain.test.ts covers inclusive validity, gap/overlap analysis, exact rational daily allocation, overlap withholding, explicit confirmation and stale review revisions.
- tests/compliance-analysis-correction-projection.test.ts verifies corrected dates/premiums feed overview and Performance allocation reads and fails closed on corrupt correction chains.
- scripts/compliance-overview-browser-acceptance.mjs exercises rendered Admin PWA fleet coverage, vehicle filtering, source-revision review decisions, append-only corrections, daily-cost refresh, linked renewal and reload readback.
- Android ComplianceCorrectionCapacitorAcceptanceTest drives correction, linked renewal and the rendered Room-backed overlap reason→confirm→persist path, verifies original immutability, exact source-revision provenance, daily allocation release and backup/restore lineage.

All Compliance, Maintenance and trip/fare changes are consolidated on the existing PR #99 branch. No separate PR is the integration or merge plan. Final Architecture, Web/PWA, Android Room instrumentation, Cross-platform encrypted backup restore and Integrated regression jobs must pass on the final documentation-updated PR #99 head.

### 9.52 — Stage 6 operating-context audit closeout — 2026-11-26

**Status: IMPLEMENTATION AND FOCUSED REGRESSION EVIDENCE INTEGRATED INTO PR #99; FINAL EXACT-HEAD CI PENDING.**

**Production composition and resolver wiring**
- Browser production composition passes the operating-configuration resolver to Finance loan, Business Expenses, Maintenance, Compliance and Full-Cost Breakeven services. Performance is composed with its calculation runtime and Full-Cost Breakeven/cost-allocation dependencies.
- Android uses the same PWA bootstrap through Capacitor; the installed app has no separate divergent business composition root.
- Finance and Business Expenses revalidate operating context before command commits.
- Maintenance rate-history writes and daily-business-kilometre accrual writes revalidate operating context before creating records.
- The independent Full-Cost Breakeven distance projection captures operating/vehicle context before source reads and revalidates it before returning. A regression verifies capture ordering and rejection when context changes during the read.
- Compliance resolves the active Vehicle independently and does not require Work Driver selection or assignment.

These changes and tests are part of PR #99. The earlier run 45839459288 validated a prior operating-context slice head and is historical only, not final validation of the current PR #99 head. The final exact-head CI run remains pending. No separate PR is the integration/merge vehicle.

### 9.53 — PR #99 Stage 6 historical integrity, device/GPS and form audit closeout — 2026-11-26

**Status: IMPLEMENTATION AND FOCUSED REGRESSION EVIDENCE ADDED; FINAL EXACT-HEAD CI PENDING.** This addendum supersedes the unresolved Stage 6 bullets in §9.48 only where the same requirement is closed below. Stages 1–5 remain accepted and are not reopened.

**Historical integrity and provenance — closed at the audited repository/service boundaries**
- The current production call-site audit found that generic repository hard-delete is needed only for transient form working copies. Browser/Dexie and Room now enforce the same `__sam_travels_form_working_copy__:` boundary. Submitted Finance, Compliance, Maintenance, Business Expense, Work, Log Book and correction history cannot be hard-deleted through the generic repository API.
- First-Admin bootstrap rollback now writes a revision-checked `deletedAt` tombstone for the person identity instead of physically deleting the record. Active identity projections ignore the tombstone while historical identity remains available.
- Feature-extension migration transactions restrict staged deletes to the owning `feature:<featureId>:` namespace. The Room batch boundary independently validates the declared namespace before applying deletes.
- Record-envelope validation and regression coverage now explicitly include `updatedBy`, valid legacy `deletedAt`, malformed provenance and malformed tombstone timestamps. Existing Finance Admin actor attribution, Work event actor snapshots and domain correction actor/reason tests remain authoritative.
- Added Browser and Android tests for protected generic deletion, failed-bootstrap identity tombstones, feature-owned migration deletion and update-actor/deletedAt compatibility. See implementation evidence matrix §9.54.

**Trip financial correction and linked Work-event integrity**
- The existing append-only Trip Financial correction capability is now exercised through the rendered PWA journey and Android Room-backed WebView acceptance. The test corrects a submitted fare, verifies original amount/revision and correction actor/reason/before/after, checks corrected current readback, and proves the linked Work/GPS event JSON remains unchanged.
- The rendered PWA journey also exercises shift start/end, trip creation, Start ride, End ride and Cancel ride, with the second trip creation required by the state machine. Android historical trip backfill acceptance remains mapped in `HistoricalTripBackfillAcceptanceSupport`.
- Feature-specific correction policy remains subject to the shared Forgiving Data Entry/Historical Correction contract and the Driver Workflow owner contract; this evidence does not authorize editing Work/GPS/odometer source events or adding correction controls to unsupported surfaces.

**Device readiness, GPS and forms — focused contract assertions added**
- The Android WebView acceptance now follows the Location settings handoff, returns to the app, and verifies a fresh readiness query. The prompt's focus/visibility recheck behavior has a pure regression test; existing policy tests continue to cover optional/non-blocking capabilities.
- Browser GPS provider tests independently acquire/release a fresh fix for each of the six required Work event types. Android DriverWorkflowNativeGpsBridgeAcceptanceTest.sixSequentialCapacitorGpsCapturesUseIndependentNativeFixes verifies six independent native bridge requests and listener releases; DriverOverlayWorkflowAcceptanceTest.eachNativeOverlaySupportedTransitionAcquiresAndReleasesItsOwnGpsFix covers every action actually exposed by the overlay; DriverWorkflowV2Test verifies distinct persisted fixes across the complete six-event state transition matrix. The rendered PWA acceptance asserts seven independent GPS requests for its seven committed events.
- Fuel's obsolete location-evidence form field was removed; Fuel definition tests assert no quantity/location/GPS form field. Shared form definitions now reject malformed Select options and validate time values. Admin rendered acceptance checks 390px viewport fit, visible-control label association and keyboard focusability for every Admin section.

**Previously closed Stage 6 slices retained**
- Fuel correction/retry and immediate downstream rate/daily readback: §9.49.
- Maintenance expense/visit correction, actual-expense projection and authoritative 04:00 daily accrual: §9.50.
- Compliance correction, linked renewal, overlap review and date-scoped allocation readback: §9.51.
- One-Vehicle/one-Driver operating-context resolver wiring and stale-context no-write/read protection: §9.52.

**Eight-condition reconciliation and acceptance**
- Conditions 1–3 and 5 have named implementation/test evidence in §9.54 and the accepted Stage 1–5 records; final exact-head execution remains pending. Condition 4 remains open for Trip Financial correction owner ratification and the unclassified dependency/backup limits in §§9.35, 9.37 and 9.39.
- Condition 6 is reconciled across the four PR #99 project records and the updated PR description; final exact-head review remains pending.
- Condition 7 remains pending until all five required jobs pass on the final documentation-updated PR #99 head.
- Condition 8 is verified: PR #99 remains open, draft and unmerged. No new PR is opened and no merge is authorized.

**External/manual gates retained:** physical OEM/device certification; full OS reboot persistence where emulator coverage is not deterministic; live Dropbox account authentication/upload/download/scheduled-backup/restore; final owner visual/usability approval; and repository branch-protection/ruleset verification. These are not CI passes.

Do not declare whole-contract acceptance until the final exact-head workflow is green, the four project records and PR body agree, and every remaining owner-acceptance requirement is either explicitly approved or remains clearly open.


### 9.54 — PR #99 backup boundary and dependency advisory reconciliation — 2026-11-27

This addendum supersedes the earlier open implementation descriptions in §§9.35, 9.37 and 9.39 only to the extent stated below. It does not claim exact-head CI or whole-contract acceptance.

**§9.35 — Dependency vulnerability report**
- Required Web CI now captures `npm audit --json` and `npm audit --omit=dev --json` reports separately.
- The report prints package name, severity, direct/transitive status, affected range, dependency nodes, advisory details and fix availability; both JSON files are uploaded as a 30-day artifact.
- Critical production advisories fail the Web gate.
- Initial exact-head report classified three development-toolchain advisories: `@vitest/mocker` moderate, `tinypool` critical, and direct `vitest` critical. The production-only audit reported zero vulnerabilities. Vitest is upgraded to 5.1.2, and the Web gate now fails on moderate-or-higher advisories across the full dependency graph.
- **Disposition: remediation committed; exact-head re-audit pending.** The final report must confirm zero remaining advisories; no dev-only exception is being requested.

**§9.37 — Record-count enforcement**
- Browser manifest validation already totals participant counts against the shared one-million-record ceiling.
- Android Room export now checks raw exported rows before canonical interchange normalization and retains the post-normalization fence.
- Android encrypted-package creation totals manifest counts before digest/encryption.
- Android restore caps the raw record array before snapshot/manifest validation, participant traversal, checkpoint creation or destination mutation.
- Added focused instrumentation for native package creation and restore pre-mutation rejection using the injectable lower test limit.
- **Disposition: implementation and regression tests added; exact-head Android/Web CI pending.**

**§9.39 — Plaintext-size preflight**
- TypeScript package creation already validates plaintext size before digest/encryption.
- Android adds exact UTF-8 byte counting without allocating the encoded byte array, estimates GCM tag/base64/envelope overhead, and checks the limit in the Dropbox worker before byte-array materialization and again at the native package creation boundary.
- Added tests for multibyte UTF-8, inclusive size boundary and first byte over.
- **Disposition: preflight enforcement added; representative peak-memory/time acceptance remains open.** No lower Android cap is claimed without supported-device benchmark evidence.

**Trip Financial correction owner decision**
- Owner approval received 2026-11-27 for the existing append-only fare correction UX/schema: original fare and linked Work/GPS event remain immutable; correction stores before/after, reason, target/chain revisions and Admin actor; current fare projection refreshes. No permission to edit Work/GPS/odometer events is implied.
- This closes the owner-ratification dependency noted in §9.53; the implementation still requires exact-head CI.

The five required CI gates must pass on the final PR #99 head. PR #99 remains open, draft and unmerged; no new PR is to be opened. Physical device/OEM, live Dropbox account and owner visual approval remain separate manual gates.


### 9.55 — PR #99 current acceptance reconciliation — 2026-11-27

This addendum supersedes earlier PR #99 status summaries in this register only where updated below. Stages 1–5 remain accepted at their named exact heads; Stage 6 and whole-contract acceptance remain open.

**Evidence and implementation updates**
- Trip Financial correction owner approval was received 2026-11-27 for the existing append-only submitted-fare correction. The original fare and linked Work/GPS event remain immutable; correction provenance includes before/after values, reason, target/chain revisions and Admin actor.
- Room record-count fences now cover raw export before normalization, native package manifest totals before crypto, and raw restore records before validation/checkpoint mutation. Browser and Android boundary tests are authored.
- TypeScript encodeBackupSnapshot now counts exact UTF-8 bytes and checks GCM/base64/envelope size before allocating the encoded payload. Android scheduled Dropbox export counts UTF-8 bytes before byte-array allocation and repeats preflight at native package creation. Multibyte and first-over tests are authored. Representative peak-memory/time acceptance remains open.
- Vitest 5.1.2 and a moderate-or-higher full dependency graph audit gate are committed; the final dependency report must be inspected for zero remaining advisories.
- Android run #4933 on becec6809276d2a9af40af324b5b9088b478ca23 failed 8/181 instrumentation tests: seven Work WebView startup assertions and one overlay action availability assertion. A retryable startup-failure surface and page/accessibility diagnostics have been added. The Admin selector now clones labels and strips form controls so nested visible text is retained without matching selected option values. These do not count as passing evidence; root causes remain to be fixed from the next exact-head logs.

| PR #99 §1A condition | Current disposition |
|---|---|
| 1. Entry-path requirement mapping | **INCOMPLETE** — Stage 6 Android acceptance failures remain unresolved. |
| 2. PWA/Dexie and Android/Room compliance | **SCOPED CORE PROVEN; STAGE 6 ANDROID ACCEPTANCE PENDING**. |
| 3. Populated semantic/calculation/restore parity | **SCOPED CORE PROVEN; FINAL EXACT-HEAD REGRESSION PENDING**. |
| 4. Critical gaps closed or owner-accepted | **PARTIAL** — Trip Financial correction approved; dependency re-audit and backup performance evidence remain open. |
| 5. Negative/boundary/interruption/recovery | **STAGE 5 ACCEPTED; NEW BACKUP BOUNDARY TESTS PENDING EXACT-HEAD CI**. |
| 6. Four project records and PR description agree | **RECONCILED AT THIS CHECKPOINT**; recheck after final documentation commit. |
| 7. Five required CI jobs on exact final SHA | **PENDING** — Architecture, Web, Android, Cross-platform encrypted backup restore and Integrated regression gate. |
| 8. PR metadata | **VERIFIED OPEN · DRAFT · UNMERGED**. |

**Disposition:** Whole-contract acceptance remains **INCOMPLETE**. Do not merge or open a new PR. Physical OEM/device certification, full OS reboot where nondeterministic, live Dropbox account operations, owner visual approval and branch-protection/ruleset verification remain separate manual/administrative gates.

## 9.56 — PR #99 correction/recovery, backup boundary and §1A reconciliation — 2026-11-27
This checkpoint supersedes earlier status summaries only where the same PR #99 requirements are explicitly reassessed below. It aligns with end-to-end contract §1C, implementation evidence matrix §9.57 and whole-contract execution plan checkpoint.

- **Correction lineage and provenance:** restored semantic helpers assert stable source IDs/revisions, Maintenance/Compliance correction IDs and chain heads, daily-km allocation source ID/revision, and Performance source provenance. Fuel corrected interval/rate history and daily expense readback are recomputed from restored rows. Historical correction service test proves same-intent replay returns the original correction; UI retry test preserves original target/chain revisions. Browser/Android Work outbox restore/replay tests assert exactly-once effects after recreation. These are named assertions, not a claim of current-head CI pass.
- **Backup count/size:** Browser and Room count boundaries, pre-mutation rejection, exact multibyte UTF-8 counting, AES-GCM/base64/envelope preflight and first-over tests are implemented. Room export, package creation and raw restore check count before normalization/crypto/checkpoint. Representative peak-memory/time acceptance remains open.
- **Encrypted restore in both directions:** TypeScript-produced populated package → production Room restore/reopen/recompute is exercised by SharedSevenDomainBackupLifecycleTest; Android-produced package → production Dexie restore/reopen/re-export is exercised by tests/android-produced-backup-restore.test.ts through the cross-platform artifact workflow. Both directions must pass on the current integration head. A skipped cross-platform job is not evidence.
- **Interrupted restore:** Browser tests/backup-restore-failure-recovery.test.ts and Android NativeEncryptedRestoreInterruptionTestSupport verify pre-restore state recovery after injected failure. Keep rollback assertions intact.
- **Performance snapshot boundary:** restore transaction-control metadata is not a business calculation input. The source fence excludes only confirmed internal Room recovery checkpoint/journal ID prefixes plus calculation-owned allocation provenance records. Regression test proves business record revisions still invalidate the snapshot. This is not permission to exclude business source rows.
- **Dependency audit:** run #46018147927's inspected full and production audit artifacts each report zero vulnerabilities. This result is scoped to SHA e8e3170ef033c416ac1541d798251f9c5a08ec8c.
- **Current CI:** run #46018147927 on that SHA has Architecture and Web passed; Android was still running when this checkpoint was authored. Cross-platform restore and Integrated regression were not yet reported.
- **§1A status:** 1 INCOMPLETE; 2 SCOPED CORE PROVEN / current Stage 6 Android pending; 3 SCOPED CORE PROVEN / current cross-platform regression pending; 4 PARTIAL (Trip Financial owner-approved, dependency audit zero, count/size enforcement added, representative peak-memory/time evidence open); 5 Stage 5 accepted / new boundary execution pending; 6 RECONCILED by this checkpoint; 7 PENDING final exact-head five-job CI; 8 VERIFIED open/draft/unmerged.

External/manual or repository-administration gates remain physical OEM/device certification and owner visual/usability approval; full OS reboot where emulator coverage is nondeterministic; live Dropbox account authentication/upload/download/scheduled-backup/restore; and branch-protection/ruleset verification. These are not CI passes.

**Disposition:** whole-contract acceptance remains **INCOMPLETE**. PR #99 remains open, draft and unmerged.

## 9.57 — PR #99 Android correction interaction failure and retest — 2026-11-27
Run #46018147927 on e8e3170ef033c416ac1541d798251f9c5a08ec8c failed Android at ComplianceCorrectionCapacitorAcceptanceTest line 128. The rendered correction button was observed, but the one-shot WebView click evaluation returned false. The failure is not evidence of a Room exception or a business correction persistence failure. The Android step stopped before the later Maintenance, Settings-return, Performance parity and populated Room lifecycle phases. Cross-platform encrypted restore was skipped and Integrated regression failed because Android did not pass.

Fix commit 9a191aa123aedb8593129543a5a5ab97f850295b now polls for an enabled rendered button, dispatches the click once, and independently waits for the correction editor. It does not relax the editor-open assertion or any correction, source-revision, chain-head or backup assertion. Retest pending on push run #46020055556; a PR workflow and final exact-head five-job run are still required.

Correction/recovery and backup assertions remain mandatory as mapped in matrix §§9.57–9.58. Both encrypted restore directions must execute and pass; a skipped cross-platform restore job is not evidence. External/manual gates remain physical OEM/device certification, full OS reboot where nondeterministic, live Dropbox account operations, owner visual/usability approval and branch-protection/ruleset verification.

§1A status: 1 INCOMPLETE; 2 SCOPED CORE PROVEN / current Android pending; 3 SCOPED CORE PROVEN / both-direction restore pending; 4 PARTIAL (Trip Financial approved, dependency audit zero on e8, count/size enforcement implemented, representative backup performance evidence open); 5 Stage 5 accepted / new boundaries pending retest; 6 reconciled; 7 pending; 8 verified open/draft/unmerged. Whole-contract acceptance remains INCOMPLETE.


### 9.58 — PR #99 exact-head CI and backup integrity retest — 2026-11-27

Run [#46036999823](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/46036999823) passed on code SHA `deb211117283ac10cdfbc11d3486181404909ea3`. Required jobs: Architecture, Web, Android, Cross-platform encrypted backup restore, Integrated regression — all **success**. Production geocoder verification was **skipped** with `REQUIRE_PRODUCTION_GEOCODER=false` and is optional, not a required PR gate. Android instrumentation completed 178/178 with zero skipped; Web regression completed 825 passed and one skipped Android-produced-package test, which was separately executed and passed (1/1) in the required cross-platform job.

| §1A condition | Current disposition at deb211117283ac10cdfbc11d3486181404909ea3 |
|---|---|
| 1. Normative mapping and supported entry-path audit | **AUTOMATED ENTRY-PATH EVIDENCE PASSED** — rendered PWA and Android entry-path acceptance completed in the Web/Android jobs; detailed mapping remains in the evidence matrix and owning contracts. Physical-device/OEM checks remain separate manual gates. |
| 2. Independent Browser/Dexie and Android/Room authority | **SCOPED CORE PROVEN ON THIS SHA** — Web regression/rendered PWA and Android Room/WebView instrumentation passed; Android completed 178/178 instrumentation tests with zero skipped. |
| 3. Populated cross-runtime semantic/calculation/restore parity | **BOTH DIRECTIONS PASSED ON THIS SHA** — TypeScript-produced populated package restored through production Room lifecycle; Android-produced package restored through production Dexie (cross-platform job 1/1 passed); restored records/calculations/provenance were checked. |
| 4. Critical gaps closed or owner-accepted | **PARTIAL** — Trip Financial correction is owner-approved; full and production npm audit artifacts report zero vulnerabilities; record-count and UTF-8/envelope preflight enforcement and boundary tests passed. Representative peak-memory/time acceptance on supported browser and Android devices remains open; no lower device cap is assumed. |
| 5. Negative, boundary, interruption and recovery proof | **STAGE 5 ACCEPTED; CURRENT BOUNDARY/RESTORE REGRESSION PASSED** — count/size boundary tests, pre-mutation rejection, encrypted restore and interrupted-restore rollback assertions passed in the required Web/Android/cross-platform gates. No assertion was weakened. |
| 6. Evidence matrix, gap register, contract and PR description agree | **RECONCILIATION IN PROGRESS** — this checkpoint is being applied to all four project records and the PR description; verify after the final documentation update. |
| 7. Required CI on exact final PR head | **PASSED ON CODE SHA; FINAL DOCUMENTATION-HEAD RERUN REQUIRED** — all five required jobs passed in run #46036999823. Rerun after the five-record reconciliation commits so the final SHA itself is green. |
| 8. PR metadata | **VERIFIED OPEN · DRAFT · UNMERGED** — no merge or close is authorized. |

The required cross-platform job executed Android-produced populated encrypted package → production Dexie restore and passed 1/1. Android instrumentation completed 178/178 with zero skipped. Web regression completed 825 passed and one skipped test; that skipped Android-produced-package test ran separately in the required cross-platform job and passed. The full and production npm audit artifacts each contain zero vulnerabilities. No assertion was relaxed.

**Remaining critical gap:** representative peak-memory/time evidence for large snapshot creation/preflight on supported browser and Android devices. Do not equate the 512 MiB package-format ceiling with a device memory limit or choose a lower Android cap without a documented device target and measurements. External OEM/device, reboot, Dropbox, owner-visual and branch-protection gates remain manual/administrative.

**Disposition:** whole-contract acceptance remains **INCOMPLETE**; PR #99 remains open, draft and unmerged.


### 9.59 — PR #99 CI log privacy correction and final retest — 2026-11-27

**Current code SHA:** `21eee884b14e065c2e9c91aab2cd3a71e0a7cd73` (browser acceptance log-redaction change; required CI rerun pending).

**Privacy/logging audit finding and correction**
- The Stage 3 same-record journey previously wrote its complete calculation snapshot, provenance text and UI source IDs to CI stdout. Failure diagnostics in the Admin form and Performance browser acceptance scripts could also print raw dashboard text, form values, status text or HTML.
- Updated `scripts/stage3-browser-golden-journey.mjs`, `scripts/admin-form-browser-acceptance.mjs` and `scripts/performance-screen-browser-acceptance.mjs` to emit counts/boolean summaries only. Full before/after comparisons and provenance assertions remain in memory and unchanged; mismatch diagnostics report changed section/count summaries rather than source payloads or IDs.
- Source review confirms those three scripts no longer pass rendered text, values, raw IDs or full calculation objects to console logging. This is a targeted remediation; final CI on the resulting SHA and broader artifact/privacy review remain required. Do not claim historical workflow logs have been retroactively redacted.

**Latest completed evidence before this logging-only change**
- Run [#46036999823](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/46036999823) on `deb211117283ac10cdfbc11d3486181404909ea3`: Architecture, Web, Android, Cross-platform encrypted backup restore and Integrated regression all passed.
- Android instrumentation: 178/178, zero skipped. Web: 825 passed, one Android-package test skipped in the general suite; the mandatory cross-platform job executed that test separately and passed 1/1.
- TypeScript-produced populated package → production Room lifecycle passed; Android-produced populated package → production Dexie restore passed 1/1. Full and production npm audit artifacts each report zero vulnerabilities. The optional production geocoder job was skipped by explicit workflow configuration and is not a required PR gate.
- This run is not final validation of `21eee884b14e065c2e9c91aab2cd3a71e0a7cd73`; all required jobs must rerun after the logging changes and this documentation/PR-body reconciliation.

**§1A status**
| Condition | Disposition |
|---|---|
| 1. Normative mapping and entry-path audit | **AUTOMATED ENTRY-PATH EVIDENCE PASSED ON deb2111**; final-head rerun pending. Physical-device/OEM acceptance remains separate. |
| 2. Independent Browser/Dexie and Android/Room authority | **SCOPED CORE PROVEN ON deb2111**; final-head rerun pending. |
| 3. Populated cross-runtime semantic/calculation/restore parity | **BOTH ENCRYPTED DIRECTIONS PASSED ON deb2111**; final-head rerun pending. |
| 4. Critical gaps closed or owner-accepted | **PARTIAL** — Trip Financial correction owner-approved; dependency audits zero; count and UTF-8/envelope preflight tests passed. Representative large-snapshot peak-memory/time evidence remains open. Browser acceptance log redaction is committed but awaits CI. |
| 5. Negative, boundary, interruption and recovery proof | **PASSED ON deb2111** — count/size boundaries, pre-mutation rejection, encrypted restore and rollback assertions passed; final-head rerun pending. |
| 6. Evidence matrix, gap register, contract and PR description agree | **RECONCILIATION IN PROGRESS** — this update is being applied to all four project records and the PR body. |
| 7. Required CI on exact final PR head | **PENDING** — the previous code SHA passed all five required jobs; rerun after current code and docs changes is mandatory. |
| 8. PR metadata | **VERIFIED OPEN · DRAFT · UNMERGED**. |

**Repository administration observation:** branch metadata reports `main.protected=false`; the repository rulesets endpoint returned an empty list. The detailed branch-protection endpoint returned 403 to the connected GitHub integration, so an owner/admin must confirm the intended enforcement policy in repository settings. No settings were changed.

**Remaining external/manual gates:** supported physical-device/OEM certification; full OS reboot where emulator coverage is nondeterministic; live Dropbox account authentication/upload/download/scheduled-backup/restore; final owner visual/usability approval; and owner/admin confirmation of branch protection. These are not CI passes.

**Whole-contract disposition: INCOMPLETE. PR #99 remains OPEN · DRAFT · UNMERGED. No merge is authorized.**


## 2026-11-28 exact-head CI verification checkpoint

- **Code SHA tested:** `a17fb205250585e1cf5396212fbee80d88ea5e9c`.
- **Required five gates passed twice on this exact SHA:** runs [#46094959440](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/46094959440) and [#46094964520](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/46094964520) each completed successfully for Architecture, Web, Android, Cross-platform encrypted backup restore, and Integrated regression. Production geocoder verification was skipped by workflow configuration and is optional, not one of the five required gates.
- **Android repeatability:** both Android jobs passed the complete 178-test instrumentation suite with zero skipped. The isolated Compliance correction WebView, Maintenance correction WebView, Device Readiness return, Performance/Room parity, restored Room/WebView Performance, process-restart recovery and populated Room backup lifecycle steps passed. The overlay action/GPS lifecycle tests are included in the passing 178-test suite.
- **Browser/cross-runtime evidence:** Web regression reported 826 passed and one Android-produced-package test skipped in that suite; the required cross-platform job ran that Android-produced backup restore test separately and passed 1/1. TypeScript-produced populated package → production Room lifecycle and Android-produced populated package → production Dexie restore both passed. Full and production dependency audits reported zero vulnerabilities.
- **CI fixes validated:** Android overlay acceptance now locates its native window after the live status header replaces its initial text; the Compliance correction acceptance helper receives its WebView reader explicitly and reports control-presence diagnostics without exposing entered business values. No business assertion was weakened.
- **§1A status at this code SHA:** (1) normative mapping/entry-path audit remains mapped, with physical-device evidence still external; (2) independent Dexie/Room authority is scoped-core proven by the current Web/Android gates; (3) both populated encrypted restore directions and calculation/provenance parity passed; (4) **PARTIAL**—Trip Financial correction policy is owner-approved, dependency audits are clean, and count/size preflight boundary coverage passed, but representative large-snapshot peak-memory and execution-time acceptance remains open; (5) automated negative/boundary/interruption/recovery gates passed, while physical OEM/full-OS-reboot checks remain external; (6) this checkpoint is being reconciled across the four records and PR description; (7) all five gates passed on this code SHA, but a fresh run is required after the documentation-only commits; (8) PR remains open, draft and unmerged.
- **Remaining contract/release gates:** representative large-snapshot memory/time benchmarks on owner-confirmed supported browser and Android device classes; physical-device/OEM certification; full OS reboot persistence where emulator coverage is insufficient; live Dropbox account authentication, upload, download, scheduled backup and restore; owner visual/usability approval; and owner/admin confirmation of branch protection/rulesets. Current repository metadata previously showed `main.protected=false` and no rulesets; the detailed protection endpoint was not readable through the integration. No repository protection setting was changed.
- **Disposition:** whole contract remains **INCOMPLETE**. Do not treat two green CI runs as proof of the remaining benchmark or manual gates. PR #99 remains **OPEN · DRAFT · UNMERGED**; no merge is authorized.


## 2026-11-28 final-head CI, privacy and contract reconciliation

**Exact implementation/documentation base validated:** `aaad33fe74c15457040e3a5ca3e0db424317504f`.

**Required CI passed twice on this exact SHA:** runs [#46135791079](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/46135791079) and [#46135787306](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/46135787306). Each completed successfully for all five required gates: Architecture, Web, Android, Cross-platform encrypted backup restore, and Integrated regression. Optional Production geocoder verification was skipped by workflow configuration and is not one of the five required gates.

- **Android repeatability:** both runs completed the full 178/178 instrumentation suite with zero skipped. This includes the isolated Compliance correction WebView, Maintenance correction WebView, Device Readiness Settings-return, Performance/Room parity, restored Room/WebView Performance, process-restart recovery, populated Room backup lifecycle, and overlay GPS/transition lifecycle coverage.
- **Web:** both runs reported 826 passed and one Android-produced-package test skipped in the general Web suite. The required cross-platform job separately executed that Android-produced populated encrypted package → production Browser/Dexie restore test and passed 1/1 on both runs.
- **Restore direction and integrity:** the Android-produced → production Dexie direction passed 1/1 in each cross-platform job. The TypeScript-produced populated package → production Room lifecycle, including restore/reopen/recompute, passed in Android instrumentation. The integrated regression gate passed in both runs.
- **Audits and browser journeys:** full and production dependency audits reported zero vulnerabilities. Rendered Admin form conformance at 390px, Performance Admin/dashboard, Fuel entry/offline/draft resume, Work/Fuel/Performance same-record encrypted restore journey, seven-event Work journey and BackupPanel acceptance passed.
- **Overlay/Compliance test fixes:** overlay actions are held until startup pending-intent recovery settles; swipe dispatch is serialized before Room lookup; event-scoped GPS requests are deduplicated; the Android GPS fake is installed on the main thread before service creation. Compliance's controlled select acceptance now dispatches the native `change` event without a preceding `input` event that could reset React's controlled value. Both full Android runs passed without weakening business assertions.
- **Fuel location capture:** an explicit bounded deadline closes a durable location-capture placeholder if Android WebView never delivers a location callback. Fuel purchase submission remains non-blocking; the capture result is a timeout, not fabricated GPS evidence.
- **Diagnostic privacy:** failure-only Compliance assertions now use fixed/value-free status messages and booleans. Android's failure log filter excludes payload-bearing Capacitor/Room callback logs. This change does not retroactively remove payloads from older workflow logs; historical log retention remains a separate platform concern.

### §1A / Stage 6 disposition at this exact SHA

1. **Entry-path mapping and automated acceptance — scoped automated coverage passed twice.** Rendered Browser and Android entry paths for Admin, Fuel, Work, Performance, Compliance and Maintenance, correction/renewal and restore were exercised. Physical OEM/device acceptance remains external.
2. **Independent Dexie/Room authority, provenance and workflow — scoped core proven.** Current Android/Web and integrated acceptance passed; source records, correction lineage, Work/GPS immutability, allocation and Performance provenance assertions remain intact. This is not a claim of physical-device certification.
3. **Populated cross-runtime restore/calculation parity — both encrypted directions passed twice.** TypeScript-produced populated package → production Room and Android-produced populated package → production Dexie both executed successfully.
4. **Critical gaps — PARTIAL.** Dependency audits are clean and count/UTF-8/envelope preflight enforcement plus inclusive/first-over boundaries passed. Representative large-snapshot peak-memory and execution-time acceptance remains open; no device-memory limit is inferred from the package-format ceiling.
5. **Negative/boundary/interruption/recovery — automated evidence passed twice.** The 178-test Android suite and required Browser/cross-platform/integrated gates passed; rollback, idempotency, event-scoped GPS and restore recovery assertions were not weakened.
6. **Four-record and PR-description reconciliation — this checkpoint records the same scope/status in all four records and PR #99.** Recheck after this documentation commit.
7. **Exact-head required CI — passed twice on the SHA above.** Because this checkpoint changes the documentation head, rerun all five required gates on the new final SHA before treating that SHA as validated.
8. **PR metadata — OPEN · DRAFT · UNMERGED.** No merge is authorized.

### Remaining contract/release gates (not CI passes)

- **Large-snapshot benchmark:** measure peak memory and elapsed time for Browser and Android backup preflight/export/restore on owner-confirmed supported target classes. The repository has no normative minimum Android RAM/device class or supported-browser version recorded. CI emulator/headless-browser measurements may be reported as provisional only, not substituted for target acceptance.
- **Physical-device/OEM certification:** verify GPS, overlay, background restrictions, process death and lifecycle on the supported physical Android/OEM target.
- **Full OS reboot persistence:** verify on supported hardware where emulator coverage is insufficient.
- **Live Dropbox:** real account authentication, upload, download, scheduled backup and restore. Mocked OAuth/transport acceptance does not close this.
- **Owner visual/usability approval:** final Admin/Work/Performance/Backup flows.
- **Repository administration:** owner/admin confirmation of branch-protection/ruleset policy. Previously observed metadata showed `main.protected=false` and no rulesets; the detailed protection endpoint was not readable through the integration. No protection setting was changed.

**Whole-contract disposition remains INCOMPLETE.** Stages 1–5 remain accepted at their recorded exact heads; Stage 6 automated acceptance is now evidenced on this SHA but the whole-contract external/performance gates above remain open. PR #99 stays **OPEN · DRAFT · UNMERGED**. No new PR, merge, or scope expansion is authorized by this checkpoint.


## 2026-11-28 — cross-runtime GPS recovery ownership and repeated exact-head CI

**Validated implementation head:** `a1e4ab8313b84d64b80e82cd73dc2d0670c12a61`.

The overlay GPS duplicate-registration failure was traced to an ownership race, not an emulator flake: if WebView/Work initialization completed after a native overlay action was queued, PWA startup recovery could also resume the same `pending_location` intent and request a second GPS fix. The two runtime paths now filter by the durable command's `originSurface`:

- PWA `resumePendingBackground()` skips `native_overlay` intents; Android's `DriverOverlayService` owns their GPS recovery.
- Android overlay startup/retry recovery selects only `native_overlay` intents.
- Android overlay readiness still sees all pending intents, so a PWA-owned pending action continues to block a conflicting native transition.
- Browser restart recovery remains covered for PWA-owned intents; a new regression test proves PWA startup does not reacquire GPS for a native-overlay-owned intent.
- No business assertion was weakened. The test-only GPS fake now retains caller traces on failure, which exposed the competing `DriverWorkflowPlugin.requestReliableFix` path.

**All five required CI gates passed twice on this implementation head:**

- Run [#46146495179](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/46146495179): Architecture, Web, Android, Cross-platform encrypted backup restore, Integrated regression — all success.
- Run [#46146491507](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/46146491507): same five gates — all success.
- Android: 178/178 instrumentation tests, zero skipped, in each run. This includes Compliance and Maintenance correction WebView tests, overlay GPS/transition lifecycle, process restart/recovery, Room/Performance parity and populated Room backup lifecycle.
- Web: 827 passed, one skipped in each run. The Android-produced populated-package restore test skipped in the general Web suite was separately executed and passed 1/1 in each required cross-platform restore job.
- Both encrypted cross-runtime restore directions and the integrated regression gate passed in both runs. Full and production dependency audits reported zero vulnerabilities.
- Optional Production geocoder verification was skipped by workflow configuration; it is not one of the five required gates.

**This documentation reconciliation creates a new PR head.** The five required gates must run again on that documentation-updated SHA before that SHA is treated as the final validated head.

### Current contract disposition

- Automated calculation, persistence, backup/restore, recovery, correction lineage, 04:00 operational boundary and cross-runtime parity gates in scope for PR #99 have repeatable CI evidence on the implementation head above.
- Whole contract remains **INCOMPLETE** because external and target-device acceptance is still outstanding:
  1. Representative large-snapshot peak-memory and elapsed-time benchmarks for Browser and Android preflight/export/restore on owner-confirmed supported target classes. The repository still has no normative minimum Android RAM/device class or supported-browser version recorded.
  2. Physical Android/OEM certification for GPS, overlay, background restrictions, process death and lifecycle.
  3. Full OS reboot persistence on supported hardware where emulator evidence is insufficient.
  4. Live Dropbox account authentication, upload, download, scheduled backup and restore; mocked OAuth/transport tests do not close this.
  5. Owner visual/usability approval for Admin, Work, Performance and Backup flows.
  6. Owner/admin confirmation of branch-protection/ruleset policy. Previously observed repository metadata showed `main.protected=false` and no rulesets; the detailed protection endpoint was not accessible through the integration. No protection setting was changed.

PR #99 remains **OPEN · DRAFT · UNMERGED**. No merge is authorized by this checkpoint.


## 2026-11-28 — supported Android/browser benchmark baseline

The owner-confirmed benchmark target for the existing PR #99 large-snapshot gap is mainstream Android phones released in **2022 or later**, with a measurable floor of Android 12+, 64-bit ARM, and at least 4 GB installed physical RAM. Browser-only PWA target is Chrome for Android Stable (current plus two preceding major versions); installed Android target is Android System WebView Stable (current plus two preceding Chromium major versions).

**Owner-directed disposition:** Physical-device large-snapshot benchmarking is **SKIPPED for PR #99** because the owner has no computer and cannot use USB debugging. This is an explicit deferral, not a passed benchmark. CI emulator/headless-browser results may be recorded as provisional virtual regression data only and must not be described as physical-device evidence. The 512 MiB package ceiling is not a RAM budget. No product behavior or package boundary changes.

## 2026-11-28 — owner-directed benchmark deferral and exact-head CI checkpoint

- **Supported device target corrected:** mainstream Android devices released in **2022 or later**; measurable Android floor Android 12+, 64-bit ARM, and at least 4 GB installed physical RAM. Browser-only PWA target remains Chrome for Android Stable (current plus two preceding major versions); installed Android app target remains Android System WebView Stable (current plus two preceding Chromium major versions).
- **Physical large-snapshot benchmark:** **SKIPPED by owner direction**. The owner has no computer and cannot use USB debugging. This is neither a pass nor evidence of physical-device performance. No owner-side setup is required. CI emulator/headless-browser runs remain virtual regression evidence only.
- **Exact-head CI:** run [#5317](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/46151083944) on implementation/documentation SHA `1bbdb22eb6eec473cdbed58567704cd2e51680d5` completed successfully. All five required jobs passed: Architecture, Web, Android, Cross-platform encrypted backup restore, and Integrated regression. Optional Production geocoder verification was skipped by configuration and is not a required gate.
- **Remaining non-CI acceptance:** physical OEM/device certification (unless separately deferred by owner), full OS reboot persistence where emulator coverage is insufficient, live Dropbox account authentication/upload/download/scheduled backup/restore, owner visual/usability approval, and owner/admin confirmation of branch-protection/ruleset policy. These cannot be represented as completed by CI.
- **Disposition:** automated implementation and the five required CI gates are green on the SHA above. The whole contract remains **INCOMPLETE** while the listed external/manual acceptance decisions remain open. PR #99 stays **OPEN · DRAFT · UNMERGED**; no merge is authorized. This checkpoint supersedes older statements that the Android/browser target was undefined or that the physical benchmark was still awaiting owner setup.
