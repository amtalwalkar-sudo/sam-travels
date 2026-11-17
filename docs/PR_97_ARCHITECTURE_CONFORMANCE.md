# PR #97 Architecture and Calculation-Wiring Conformance Record

**Scope:** PR #97 architecture consolidation and calculation-wiring contract only.  
**Evidence baseline:** PR head `7a11dd7221381d058b991346bb8d40cd1a625061`.  
**Status:** Historical PR-head conformance record. PR #97 has since merged; the current post-merge and final-quality-pass status is recorded in section 10. The matrix deliberately distinguishes tested behaviour from claims that still need production-data or device evidence.

## 1. Responsibility map

| Responsibility | Current owner / boundary | Conformance note |
|---|---|---|
| Platform bootstrap and composition | `apps/web/src/main.tsx`, `apps/web/src/ui/App.tsx` | Composition root wires platform services and application runtimes; feature-specific Admin form dispatch has been moved to `apps/web/src/admin-form-runtime.ts`. |
| Work application orchestration | `packages/features/work/application/work-application-coordinator.ts`, `apps/web/src/work-application-runtime.ts` | Startup replay/reconciliation, committed-event delivery, Maintenance accrual, Log Book projection refresh and lifecycle resume are application-owned, not React-hook orchestration. |
| Work presentation | `packages/features/work/presentation` | Work screen and shell presentation are feature-owned. The web hook consumes the injected runtime and public Work feature API. |
| Trip-financial form application workflow | `packages/application/src/trip-financial-form-runtime.ts` and App composition/provider | Form runtime construction, working-copy operations and submission routing are outside React hooks. |
| Performance calculation policy | `packages/domain/src/performance-calculation-v1.ts` | Pure versioned calculation policy; no UI or platform persistence authority. |
| Performance calculation orchestration | `packages/application/src/performance-calculation-service.ts` | Reads typed feature-owned read models, validates cost-kind boundaries and source provenance, then invokes the domain calculation. |
| Performance global read fence | `packages/application/src/performance-calculation-snapshot-boundary.ts` | Optimistic before/after revision-vector fence over the shared application record repository. It is not a database transaction or MVCC snapshot. |
| Performance source adapters | `packages/features/performance` and feature-owned adapter packages | Adapters translate authoritative owner outputs into typed read models; source feature remains owner of the underlying records and correction rules. |
| Screen registration and shell | `PrimaryScreenComposition`, registered feature renderers and per-screen typed contexts | Production screens are composed through explicit contracts; rendered-PWA acceptance exercises actual production screen flows. |
| Browser persistence | Existing Dexie-backed `RecordRepository` | Remains the browser persistence authority. |
| Android persistence | Existing Room-backed repository wrapper and native presentation overlay | Room remains Android persistence authority; shared fixtures and Android instrumentation cover selected parity/recovery paths. |

## 2. Calculation and consumer evidence matrix

| Contract surface | Current consumer / calculation path | Automated evidence | Status |
|---|---|---|---|
| Submitted trip revenue and cancellation fees | `PerformanceTripRevenueAdapterV1` → Performance revenue read model | `tests/performance-trip-revenue-adapter.test.ts`; missing trip context is surfaced as incomplete rather than silently treated as zero | Covered by focused regression |
| Fuel, platform fee, challan, toll/parking and miscellaneous operating costs | `PerformanceOperatingCostAdapterV1` → full-cost daily projection → Performance operating-cost read model | `tests/performance-operating-cost-adapter.test.ts`; full-cost breakeven duplicate toll/parking tests | Covered by focused regression; source completeness remains visible |
| Trip-paid vs standalone toll/parking duplicate suppression | Full-cost breakeven source projection; linked trip source is authoritative | `tests/full-cost-breakeven-service.test.ts`: matching standalone expense suppressed; reversing duplicate does not erase underlying trip obligation | Covered for stated fixture and reversal case |
| EMI and Compliance daily allocation | `PerformanceFixedCostAllocationAdapterV1` → separate EMI and Compliance read models | `tests/performance-fixed-cost-allocation-adapter.test.ts`; canonical daily rows include pre-business carry-forward | Covered by focused regression |
| Pre-business recovery | Performance domain recovery schedule receives manual entries only; EMI/Compliance carry-forward is already present in canonical daily rows | `tests/performance-calculation-service.test.ts`; fixed-cost adapter tests | Duplicate recovery path removed; manual recovery path covered |
| Source provenance and source revisions | Performance service validates source refs, revision conflicts and per-source identity stability | Operating-cost, trip-revenue, fixed-cost and service tests | Covered for captured read-model identities and refs |
| Global cross-source coherence | Shared record repository revision vector captured before preparation and after all source reads | `PerformanceCalculationSnapshotBoundaryV1`; service regression mutates a shared record during reads and expects `performance_global_source_snapshot_changed_during_calculation` | Optimistic fence covered; not atomic transaction isolation |
| Work 04:00 operational boundary | Work application/domain workflow and authoritative daily allocation | Shared PWA/Room fixture; active-trip deferral and interruption regression | Automated browser–Room parity gate passed |
| Personal distance between shifts | Daily distance allocation policy | Shared fixture: previous shift end 12,100 km, next shift start 12,125 km → 25 km personal, not business; PWA and Room consume same fixture | Automated parity covered |
| Work startup/retry/recovery | Work application coordinator, durable outbox and repository recovery | Browser IndexedDB reopen, outbox retry/idempotency and Android process-restart instrumentation | Automated regression gates passed |
| Offline Work and fuel entry | Browser Dexie and Android Room local persistence | PWA network-disabled shift/fuel tests; Android Room offline persistence test | Automated offline persistence covered |
| Backup/restore and correction history | Existing backup participants, restore checkpoint/rollback and correction records | Browser backup/restore reliability tests; Android Performance backup round-trip and Room reliability gate | Automated regression gates passed |
| Driver Target | Admin settings read model → Performance calculation | Target settings revision included in provenance; calendar-day proration tests and rendered-PWA Performance acceptance | Calculation/UI automation passed; policy authority remains the current versioned product contract |
| Cumulative Driver Target Passbook | Performance calculation → read-only daily cumulative Passbook view | `tests/performance-calculation-v1.test.ts`; `scripts/performance-screen-browser-acceptance.mjs` | Cumulative target, actual daily/cumulative surplus, ahead/behind, remaining target, recovery and source references covered |
| Active-driving-day distance | Immutable Work trip context + finalized daily-distance rows → Full-cost projection → daily/weekly/monthly history | `tests/full-cost-breakeven-contract-boundaries.test.ts`; shared PWA/Room fixture and `PerformanceActiveDrivingDayRoomParityTest` | Same-shift qualification, 04:00 context, zero-km active days, personal-km exclusion and incomplete-distance review covered |

## 3. Snapshot guarantee — exact boundary

The calculation captures a canonical identity vector of repository record IDs, revisions, update timestamps and deletion timestamps before any source adapter prepares its read model. It captures the vector again after all source reads. If the identities differ, calculation is rejected rather than publishing a result assembled across a detected concurrent write.

The guarantee is intentionally bounded:

- This is an **optimistic read fence**, not a database transaction, serializable isolation level, or true MVCC snapshot.
- It detects persistent revision-vector changes visible at the two capture points. It cannot claim stronger guarantees than the repository's revision semantics.
- Allocation provenance rows are excluded because the allocation report appends its own audit row while preparing the read-only projection; they are not calculation inputs.
- Per-source snapshot identities and the source ID/revision vector remain additional provenance checks; neither alone replaces the shared repository fence.
- A future requirement for strict atomic snapshot isolation must be implemented by the persistence abstraction (or a transactionally consistent read API) and tested on both Dexie and Room. It must not be inferred from this fence.

## 4. Work orchestration and presentation boundary

- The Work coordinator owns committed-event delivery, startup replay/reconciliation/resume, Maintenance daily accrual and Log Book projection refresh.
- The web composition root creates and injects the Work application runtime. React presentation hooks no longer construct the workflow/coordinator or own the orchestration sequence.
- The Work UI now imports operational-boundary helpers through the public `packages/features/work` API, not a private domain module path.
- Trip-financial form runtime is composition-root owned and injected; hooks bind to the runtime rather than constructing form services and directly orchestrating durable working-copy submission.
- The Admin form dispatcher is isolated in `apps/web/src/admin-form-runtime.ts`; this is a targeted bootstrap cohesion correction, not a broad Admin redesign.

## 5. Production screen and shell evidence boundary

The web CI acceptance runs the production PWA build and rendered screen flows for Maintenance correction, Compliance overlap review, all six replacement Admin sections, Admin form workflows and Performance calculations/dashboard. Architecture and screen-composition tests enforce typed screen contracts and shell separation.

This is stronger than testing only a synthetic screen fixture, but it is not a claim that every screen has been validated against a live production dataset or that the final visual design has received separate product-owner approval. CI proves the tested production components and controlled acceptance data paths.

## 6. Obsolete-path deletion evidence

- `src/domain/driver/workflow.ts` and its isolated test were removed after the repository-wide source import scan showed the remaining Work consumers use the feature-owned workflow implementation.
- `scripts/check-architecture.mjs` now parses source import/export/dynamic-import/require references and fails if the retired `src/domain/driver/workflow` module is reintroduced as a dependency.
- The Work hook's remaining private domain imports were moved to the public Work feature API.
- No additional legacy candidate is declared dead or deleted solely from its name or local import absence. Further removals require repository-wide dependency proof and replacement coverage.

## 7. CI evidence and remaining gates

### Exact-head automated result — 2026-11-17

- PR: [#97](https://github.com/amtalwalkar-sudo/sam-travels/pull/97)
- Exact head: `0f198be0d796a67521ea5d6763bac3d949f33718`
- Workflow run: [#44095766482](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/44095766482)
- Architecture: passed.
- Web: passed, including full regression suite, production build, rendered-PWA Performance acceptance, Maintenance correction acceptance, Compliance browser acceptance, and Admin form/section acceptance.
- Android: passed, including Gradle debug/release assembly, Android unit tests, emulator-backed Room/workflow/backup reliability gate, focused GPS lifecycle threading test, and Room schema publication.
- Integrated regression gate: passed.
- Production geocoder verification: skipped by workflow configuration; no production geocoder verification is claimed.
- Debug-signed APK for physical phone testing: successfully published by the Android job. Physical-device acceptance itself remains deferred.
- Update-compatible signed APK from merged main: skipped at the time of this pre-merge PR-head check. This is historical; see section 10 for post-merge release evidence.

### Explicitly not claimed complete

1. **Strict atomic snapshot isolation:** the implemented cross-source guard is optimistic, not transactional.
2. **Every downstream correction/reversal/effective-date permutation:** the matrix records named focused tests; it is not exhaustive proof for all historical production records or every combination of correction and restore.
3. **Production-data reconciliation:** controlled fixtures and rendered-PWA acceptance do not replace a real migrated-data audit.
4. **Physical-device acceptance:** intentionally deferred to the final phone-testing stage.
5. **Performance product acceptance:** cumulative Passbook and active-driving-day distance implementation gates are closed by the approved addendum and current regressions. Separate product-owner approval of final visual composition remains open; calendar-day partial-period target semantics are resolved by the approved Passbook addendum.
6. **Further obsolete-path cleanup:** only remove after static dependency proof and replacement tests.
7. **Migrated production-data audit:** deterministic source/correction/effective-date fixtures do not replace a record-by-record reconciliation of any deployed production dataset.

## 8. PR disposition

At the time of this historical PR-head check, PR #97 was **draft, open and unmerged**. It was subsequently merged as `a15acb791a2e452a3bb84e271ab7b0e27c73500c`; this historical status is superseded by section 10. Green CI does not waive the remaining acceptance gates.

## 9. Passbook, distance and exact-head verification follow-up — 2026-11-17

The approved `docs/PERFORMANCE_PASSBOOK_AND_ACTIVE_DRIVING_DAY_ADDENDUM_V1.md` is now implemented on this PR branch:

- The cumulative Passbook starts on the actual Business Start Date, includes every operational date through the selected end date, and exposes daily/cumulative surplus, prorated cumulative target, ahead/behind position, remaining target and source IDs/revisions. Its aggregate reconciles to the same calculation's lifetime profit and target.
- Daily Passbook regression checks each row's cumulative arithmetic and calendar-day target against the shared target-proration function. Recovery coverage includes mid-month start, month-end clamping, leap day, the exclusive 18-month end and later-surplus recovery.
- Active-driving-day classification requires immutable trip context for the same Work shift and operational date. A finalized distance row must contain that same shift; otherwise the distance remains incomplete/review-required. Confirmed personal kilometres are excluded, and zero-kilometre active days remain in the denominator.
- Daily, ISO-week and calendar-month distance summaries and averages are rendered by the Performance screen. The shared PWA/Room fixture is exercised by the browser and Android Room-backed acceptance paths.
- Maintenance visit/repair expense corrections are reprojected from the immutable original plus their full correction chain and validated through browser and native backup/restore. Their correction IDs/revisions remain traceable in the Maintenance owner projection. They are deliberately not added as a second Performance Maintenance cost: the frozen Performance cost remains the confirmed per-kilometre accrual unless a separate accounting decision changes that boundary.

The follow-up test commit adds the explicit leap-year recovery and per-day Passbook reconciliation assertions. The final exact-head workflow run `#44095766482` passed Architecture, Web, Android and Integrated regression on `0f198be0d796a67521ea5d6763bac3d949f33718`; see section 7 for the complete job evidence.

The remaining non-implementation gates at that historical checkpoint were: a migrated production-data inventory/reconciliation was not available as a repository fixture, physical-phone acceptance was deferred to the agreed final testing stage, and final visual composition remained subject to product-owner approval. PR #97 later merged; see section 10 for the current state.

## Subsequent documentation-head verification — 2026-11-17

The documentation reconciliation at PR head `29e21174f682e8de1ef3a605f5b8cdc6fdd9d800` was independently verified by [workflow run #44098341486](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/44098341486). Architecture, Web, Android and Integrated regression all completed successfully. The Android Room/workflow/backup reliability gate and debug-signed phone-test APK publication passed. Production geocoder verification was skipped by workflow configuration; physical-device acceptance remains deferred. This commit contained documentation changes only; the code-bearing implementation and its full test evidence remain recorded separately above.


## 10. Post-merge status and final software-quality pass — 2026-11-17

### Merged delivery state

- PR #96 (documentation baseline) is merged. Its merge commit is `b54181330e4e89d1f25b2e1e56a40b8264f19014`.
- PR #97 (architecture and calculation-foundation implementation) is merged. Its merge commit is `a15acb791a2e452a3bb84e271ab7b0e27c73500c`.
- The current `main` baseline at the start of this quality pass is `b54181330e4e89d1f25b2e1e56a40b8264f19014`. The PR #96 documentation merge is a child of the PR #97 merge; it does not change the code-bearing implementation.

### Exact-main CI evidence

- Main commit `a15acb791a2e452a3bb84e271ab7b0e27c73500c` passed Architecture, Web, Android, Production geocoder verification and Integrated regression in [workflow run #44107617073](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/44107617073).
- The subsequent documentation merge commit `b54181330e4e89d1f25b2e1e56a40b8264f19014` passed Architecture and Web but failed Android in [workflow run #44110381218](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/44110381218). The sole reported instrumentation failure was `MaintenanceCorrectionCapacitorAcceptanceTest` at the `Driver form` assertion. The Integrated regression gate failed downstream because Android was red. Production geocoder verification was skipped because its job depends on the Android job. The debug-signed APK artifact was published; update-compatible signed and unsigned release APK steps were skipped after the Android failure.
- Investigation found a test synchronization gap: the UI writes the “Correction appended” status before awaiting the post-save history refresh and clearing its busy state. The test proceeded to the next role/action after observing the status, without first waiting for the correction control to become enabled. The final-quality branch now waits for the enabled control and scopes actions to the Maintenance history section. It preserves the driver-own-record, cross-driver rejection, correction-chain, and restore assertions. This is a test determinism correction, not a product-policy change; its acceptance depends on the final branch CI result.

### Data and correction-chain evidence

- Repository-level correction evidence includes the append-only `HistoricalCorrectionService`, atomic correction-plus-chain-head compare-and-set, immutable original records, browser IndexedDB correction/restore tests, and Android Room correction/backup acceptance tests. The failing main-run test reached and passed its Admin correction append and original-record immutability assertions, then failed before the Driver form, later driver-chain, cross-driver rejection and restore assertions in that same test could execute.
- A deterministic fixture or CI result is not a record-by-record audit of a deployed production dataset. No deployed production-data export is present in this repository evidence or connected to this review; production-data reconciliation therefore remains **open / not evidenced**. Do not mark it complete from fixtures.
- The Performance calculation snapshot boundary remains an optimistic revision-drift fence, not strict transactional/MVCC snapshot isolation. This limitation is explicit and is not upgraded by this quality pass.

### Integration and release gates

- Production geocoder: passed on the preceding merged-main commit in run #44107617073; skipped on `b541813` in run #44110381218 because Android failed. It must pass again on the final merged-main push before claiming final-main production verification.
- Dropbox: automated tests use controlled/mock integration paths. Real app registration, OAuth/account authorization, upload/download/history, revocation and real restore remain owner-run acceptance in [Phase 6 Manual Acceptance](PHASE_6_MANUAL_ACCEPTANCE.md).
- Android physical-device/OEM acceptance remains explicitly deferred by the owner. Emulator CI is not physical-phone acceptance.
- Final Performance visual composition approval remains a separate product-owner milestone; no redesign is implied by this pass.
- Final release APK/signing verification remains dependent on a successful post-merge main workflow. The current failed main run did not execute the release APK publication steps.
