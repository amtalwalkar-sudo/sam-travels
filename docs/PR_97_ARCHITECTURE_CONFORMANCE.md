# PR #97 Architecture and Calculation-Wiring Conformance Record

**Scope:** PR #97 architecture consolidation and calculation-wiring contract only.  
**Evidence baseline:** PR head `7a11dd7221381d058b991346bb8d40cd1a625061`.  
**Status:** Automated CI is green on this head. Architecture conformance is materially advanced; the matrix below deliberately distinguishes tested behaviour from claims that still need production-data or device evidence.

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
| Driver Target | Admin settings read model → Performance calculation | Target settings revision included in provenance; calendar-day prorated target tests and rendered-PWA Performance acceptance | Calculation/UI automation passed; policy authority remains the current versioned product contract |

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

### Exact-head automated result

- PR: [#97](https://github.com/amtalwalkar-sudo/sam-travels/pull/97)
- Head: `7a11dd7221381d058b991346bb8d40cd1a625061`
- Workflow run: [#44052752021](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/44052752021)
- Architecture: passed.
- Web: passed, including full regression suite, production build and rendered-PWA acceptance.
- Android: passed, including Gradle assembly, unit tests and required Room/workflow/backup reliability gate.
- Integrated regression gate: passed.
- Production geocoder verification: skipped by workflow configuration for this PR run; no production geocoder verification is claimed.
- Update-compatible signed APK from merged main: skipped because PR #97 remains unmerged.

### Explicitly not claimed complete

1. **Strict atomic snapshot isolation:** the implemented cross-source guard is optimistic, not transactional.
2. **Every downstream correction/reversal/effective-date permutation:** the matrix records named focused tests; it is not exhaustive proof for all historical production records or every combination of correction and restore.
3. **Production-data reconciliation:** controlled fixtures and rendered-PWA acceptance do not replace a real migrated-data audit.
4. **Physical-device acceptance:** intentionally deferred to the final phone-testing stage.
5. **Performance product-contract completion:** this architecture PR does not close separate outstanding Performance passbook, distance-summary, partial-period policy reconciliation or final UX approval items recorded in the Performance end-to-end audit.
6. **Further obsolete-path cleanup:** only remove after static dependency proof and replacement tests.

## 8. PR disposition

PR #97 remains **draft, open and unmerged**. Green CI establishes automated success on the exact head above; it does not authorize merging or waive the remaining acceptance gates.