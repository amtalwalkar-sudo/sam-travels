# PR #99 — Whole-Contract Completion Execution Plan

**Status:** Approved execution sequence; whole contract remains **INCOMPLETE**.  
**PR:** [#99](https://github.com/amtalwalkar-sudo/sam-travels/pull/99)  
**Current operating scope:** One configured active Vehicle and one configured active Driver.  
**Scope rule:** This plan organizes work already required by the PR #99 end-to-end contract and its referenced owner contracts. It does not authorize new product scope.

## 1. Current position — subordinate four-stage closeout tracker

The original four-stage closeout tracker is complete. It is subordinate to, and does not replace, the whole-contract definition of done in §1A of [PR_99_END_TO_END_DATA_CALCULATION_PERSISTENCE_BACKUP_CONTRACT.md](PR_99_END_TO_END_DATA_CALCULATION_PERSISTENCE_BACKUP_CONTRACT.md).

| Original stage | Workstream | Status | Evidence / qualification |
|---|---|---|---|
| 1 | Finance Admin actor attribution | **COMPLETE** | Implementation and regression/CI evidence are recorded in the PR #99 implementation evidence matrix. |
| 2 | Finance payment-allocation policy | **COMPLETE** | Owner approval dated 2026-11-22 and implementation/regression/CI evidence are recorded in the Finance owner contract and PR #99 evidence matrix. |
| 3 | Reverse encrypted restore and semantic parity | **COMPLETE** | Both directions are covered: TypeScript-produced encrypted package → Android production decrypt/Room restore, and Android-produced encrypted package → Browser/Dexie production restore. The populated 29-record graph is compared through the production lifecycle. The known Finance prepayment/settlement fixture-lineage limitation remains a whole-contract gap; Stage 3 completion does not imply all-domain fixture completeness. |
| 4 | Evidence and CI closeout | **COMPLETE** | Exact-head run [45035534802](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/45035534802) passed on commit `c40dd84c6f218d34d65e156fb27510809955aab9`. Required jobs passed: Architecture, Web, Android, Cross-platform encrypted backup restore, and Integrated regression gate. Optional Production geocoder verification was skipped. |

**Important head-validation rule:** Run 45035534802 proves the four-stage closeout at the exact head shown above. This execution-plan documentation commit will create a newer PR head; therefore the final whole-contract closeout must run and record required CI again on the exact final head. Do not represent run 45035534802 as validation of a later commit.

The PR remains **open, draft and unmerged**. Four-stage completion and green CI do not satisfy the whole-contract definition of done.

## 2. Remaining whole-contract execution — six sequential stages

Execute these stages in order. Only one stage may be active at a time. Each stage must pass its own acceptance gate and have its evidence recorded before the next stage begins.

### Stage 1 — Complete the shared populated semantic fixture

**Purpose:** Make the shared synthetic fixture sufficiently populated and schema-valid to represent the contract-required business lifecycle, rather than relying on metadata declarations or a partial record graph.

**Work, limited to existing contract requirements:**
- Extend the existing fixture and its validators; preserve stable IDs and existing useful coverage.
- Include the configured single Vehicle/Driver pair and the required linked records for Finance, Compliance, Maintenance, Fuel/Business Expenses, Performance, Work/Shift, Driver Workflow and Log Book.
- Include the contract-required Finance payment, reversal, prepayment, revised schedule and settlement/closure lineage. The shared 46-record fixture now contains the required Finance payment, reversal, prepayment, revised schedule, settlement and closed-loan lineage; its inventory and validator evidence is recorded in the Stage 1 revalidation checkpoint.
- Include required effective-dated rates, daily-kilometre source/revision links, renewal generations, correction chains, fuel full/partial/full history, calculation source references, and pending/retry/recovery workflow states.
- Validate schema, participant ownership, references, revisions, event ordering and the required zero-record participant representation.

**Acceptance gate:** The fixture contains the required schema-valid records and relationships for every applicable owner-contract dimension. Validators reject malformed, dangling, mismatched or wrongly owned records. The fixture's declared coverage matches its actual contents.

**Exit evidence:** Named fixture and validator tests, with a concise record/participant coverage inventory. Do not claim production restore or calculation proof from fixture validation alone.

### Stage 2 — Run the populated fixture through production Browser and Android backup/restore lifecycles

**Purpose:** Prove that the same populated semantic data survives the actual production persistence, encrypted backup/restore, reopen and recovery paths.

**Work:**
- Run the shared records through Browser/Dexie production export, encrypted package handling, restore, database close/reopen, startup recovery, recomputation and re-export.
- Run the same records through Android/Room production export, encrypted package handling, restore, database close/reopen, startup recovery, recomputation and re-export.
- Exercise clean and pre-populated destinations where required by the contract.
- Retain both restore directions and extend the existing populated lifecycle tests rather than creating parallel duplicate harnesses.
- Compare normalized source records, stable IDs, revisions, references, event ordering, pending/outbox state, correction-chain heads, calculations and provenance.

**Acceptance gate:** Both runtime paths preserve the same contract-required semantic state and lineage after restore/reopen/recovery/re-export. Cross-runtime comparisons pass in both directions. No fixture limitation is hidden by a narrower test subset.

**Exit evidence:** Named production-path Browser and Android lifecycle tests, semantic comparison assertions, and exact CI results.

### Stage 3 — Complete UI-originated lifecycle and cross-surface parity

**Purpose:** Prove that supported user-entered records traverse the real UI/action-to-command boundary and remain consistent across the supported surfaces.

**Work:**
- Reuse existing rendered PWA and Android Admin/Fuel acceptance; do not rebuild already-proven entry paths.
- Retain the already-proven direct two-way PWA ↔ Android overlay committed Driver Workflow event/state/revision visibility and stale-write rejection as closed; the exact rendered instrumentation assertion is recorded in the Stage 3 evidence revalidation below.
- Prove the stale-write interleaving: PWA reads revision N, overlay commits N+1, stale PWA write is rejected, and both surfaces converge on the authoritative state.
- Verify any remaining contract-required Admin/Fuel form recovery and durable retry/idempotency cases on Dexie and Room, including stable operation identity, payload fingerprint and first-submit timestamp.
- Verify pending Android outbox recovery after process death only where existing assertions do not already prove it.
- Build a compact same-record golden journey per runtime: create representative records through actual UI boundaries, run dependent production calculations, and carry those same record IDs into the production encrypted backup/restore lifecycle.

**Acceptance gate:** Real UI-created records commit once, are visible from the other required surface, reject stale writes, recover safely after interruption, and remain the same records through calculations and backup/restore.

**Exit evidence:** Named rendered/browser and Android WebView/overlay acceptance tests plus same-record identity and revision assertions.

### Stage 4 — Complete calculation and correction lineage proof

**Purpose:** Prove that the contract's business calculations and permitted correction effects remain correct and reproducible from the same populated source data.

**Work:**
- Work: previous-end-to-next-start odometer gap remains personal km; only confirmed allocated business km is published; 04:00 deferral, active-trip deferral, retry and duplicate-rotation behaviour remain correct.
- Maintenance: accrual uses only fully allocated business km and the rate effective on the operational date; preserve immutable source/rate snapshots and exclude personal km.
- Compliance and EMI: apply the owner-approved Business Start Date aggregate pre-business pool and 18-month recovery rule, with complete EMI amounts and deterministic paise residuals.
- Finance: prepayment reduces tenure only; regular EMI amount and due dates remain unchanged, while the final instalment date may move earlier; preserve payment, reversal and settlement lineage.
- Fuel and Business Expenses: derive quantity from amount/price per kg; partial purchases count as spend but not full-tank mileage checkpoints; verify full-to-full mileage and dependent cost calculations.
- Performance: operating breakeven excludes Traffic Challans; full-cost breakeven includes the contracted expense categories; Driver Target remains a fixed daily rupee amount.
- Corrections: retain original records and append-only correction provenance; verify only the downstream projections and recalculations required by each owning contract.

**Acceptance gate:** Each required calculation is checked from the populated source records, and the same source revisions produce equivalent outputs and provenance across Browser and Android before and after restore. Do not treat isolated unit tests as proof of the integrated lifecycle.

**Exit evidence:** Named domain, integration and parity tests with explicit input-source IDs/revisions and expected output assertions.

### Stage 5 — Close remaining backup/restore negative, boundary and interruption requirements

**Purpose:** Close only applicable safeguards required by this contract and its referenced owner contracts that are not already proven by existing tests.

**Work:**
- Invalid/incompatible data is rejected without corrupting the destination.
- Interrupted restore preserves or recovers the original destination according to the restore contract.
- Cross-feature references and participant ownership are validated.
- Pending workflow/outbox records survive restore/recovery without duplicate business effects.
- Required consistent-snapshot and participant-inventory behaviour is asserted, including zero-record participants and exclusions, where required by the backup contract.
- Portable manifest, schema-version and validator-parity assertions are included only where normative contract clauses require them.

**Acceptance gate:** Every applicable negative, boundary and interruption requirement has a named passing assertion. Failed restore leaves a valid, recoverable destination. Existing rollback, dangling-reference, idempotency and recovery tests are reused where they already prove the requirement.

**Exit evidence:** Requirement-to-test mapping and passing negative/boundary/recovery test results. Do not add generic stress, arbitrary size caps or unrelated performance testing.

### Stage 6 — Whole-contract evidence reconciliation and final acceptance

**Purpose:** Establish completion against the whole contract, not merely completion of the six execution stages.

**Work:**
- Map every applicable normative requirement in this contract and referenced owner contracts to implementation and exact evidence.
- Reconcile the implementation evidence matrix, repository-wide gap register, this plan and the PR description; supersede stale findings without deleting valid historical context.
- Classify each item accurately as proven, incomplete, or an explicitly owner-accepted scoped deferral. Keep physical OEM certification, full OS reboot where not deterministic in CI, and real Dropbox account delivery as external/manual gates unless actually executed.
- Verify every critical item has named assertions and exact evidence; distinguish source inspection from passing runtime tests.
- Run required CI after all final implementation and documentation changes and record the exact final head SHA, run URL and required job outcomes.
- Verify PR #99 remains open, draft and unmerged unless the owner separately authorizes merge.

**Acceptance gate:** All eight whole-contract conditions in §1A of the end-to-end contract are satisfied. No applicable critical requirement remains open, partial or unproven. Required CI is green on the exact final PR head. External/manual gates are disclosed accurately and are not falsely marked passed.

**Exit evidence:** Completed requirement/evidence matrix, reconciled gap register, exact-final-head CI record, external-gate disposition and verified PR metadata.

## 3. Run discipline and change control

For each stage, use this exact sequence:

1. **Inspect:** Read the relevant normative clauses, current implementation and existing tests at the current PR head.
2. **Gap list:** Identify only the missing contract-required assertions or implementation. Cite existing evidence for items already proven.
3. **Focused implementation:** Change only files needed to close that stage. Do not start later stages in parallel.
4. **Targeted verification:** Run the narrow tests first; fix failures before proceeding.
5. **Required CI:** Run the applicable PR checks and inspect job-level outcomes on the resulting head.
6. **Evidence update:** Record exact test names/assertions, commit SHA, run URL and any limitations in the evidence matrix/gap register.
7. **Stage gate:** Advance only after the stage's acceptance gate is met.

If a test fails, remain in the active stage, diagnose and fix it, and rerun. If existing tests already prove a requirement, record them instead of duplicating them. If an apparent gap is ambiguous, inspect the owning contract before changing code. Any item outside the existing PR #99 contract is excluded unless the owner explicitly changes scope.

## 4. Explicit exclusions

This plan does not authorize:
- Multi-vehicle, multi-driver or fleet workflows.
- New product features or unrelated UI redesign.
- Broad architecture refactors unrelated to a normative PR #99 requirement.
- Duplicate tests or generic stress/performance programmes not required by contract.
- Treating a green stage CI run as whole-contract completion.
- Merging or closing PR #99 before whole-contract acceptance and explicit owner authorization.

## 5. Current status — reconciled 2026-11-25

- Original four-stage closeout tracker: **COMPLETE** (subordinate only).
- Stage 1 — shared populated semantic fixture: **COMPLETE — EVIDENCED**. The 46-record shared fixture contains Finance payment/reversal/prepayment/revised-schedule/settlement/closed-loan lineage, linked records across the applicable domains, correction chains, Work recovery states and zero-record participant policy. Inventory, calculation and validator-parity evidence is recorded in the Stage 1 revalidation checkpoint and implementation evidence matrix.
- Stage 2 — production Browser/Dexie and Android/Room lifecycle: **COMPLETE — EVIDENCED**. The populated graph passes production encrypted export/restore/reopen/recovery/re-export in both runtimes and both cross-runtime import directions, with normalized source records, participant ownership, pending Work/outbox state, correction lineage and calculation/provenance comparisons.
- Stage 3 — UI-originated lifecycle and cross-surface parity: **COMPLETE — EVIDENCED** on head `289d06255fa4d7bf80e5b53217a6cdf8aab5c560`; required CI [4398](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/45478433937) passed Architecture, Web, Android, Cross-platform encrypted backup restore and Integrated regression gate. The Stage 3 revalidation addendum records Admin/Fuel post-commit recovery, same-record PWA/Android golden journeys and two-way overlay workflow parity.
- Stage 4 — calculation and correction lineage: **ACCEPTED** on exact head `f7b49970728a3991623c398f32630498a9f6cd58`; required CI [#45501365286](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/45501365286) passed Architecture, Web, Android, Cross-platform encrypted backup restore and Integrated regression gate. The integrated populated-fixture runner proves Performance/full-cost composition, Traffic Challan classification, fixed Driver Target, corrected Compliance recovery-pool lineage and complete calculation/provenance parity before and after restore.
- Stage 5 — backup/restore negative, boundary and interruption proof: **IMPLEMENTATION AND EVIDENCE COMPLETE — DOCUMENTATION-HEAD CI PENDING**. Direct malformed/truncated package rejection, encrypted Work pending-intent replay after restore on Browser and Android, exactly-once event/outbox effects, exclusions, zero-record participants, consistent snapshots, count boundaries, dangling-reference rejection and rollback/recovery are mapped to named tests in the Stage 5 checkpoint below and evidence matrix §9.51. The implementation head `d13a2862e2fd41e822d0781ce10b5eba81080252` passed required CI [#45512816930](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/45512816930); this documentation update creates a newer head and must itself pass the same required gates before Stage 5 is formally accepted on the final PR head.
- Stage 6 — whole-contract reconciliation and final acceptance: **NOT STARTED / BLOCKED**. Passing Stages 1–5 does not by itself satisfy the separate whole-contract §1A definition of done; residual owner-contract, entry-path and external/manual release items remain recorded in the evidence matrix and gap register.
- Whole-contract status: **INCOMPLETE**.
- PR #99: **OPEN · DRAFT · UNMERGED**.

Stages 1–5 have passed their scoped implementation/evidence gates; Stage 5's final acceptance is gated only on required CI for this documentation-updated exact head. Stage 6 and unrelated whole-contract work are not being started or broadened by this Stage 5 closeout. Do not infer whole-contract completion from these stage exits or green CI.

### Stage 6 reconciliation checkpoint — 2026-11-23

The reconciliation baseline was PR head `34e01756922985ecfb1ba69a2b438d884efe7d8b`, with successful required CI run [45154128872](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/45154128872). That run is not evidence for later documentation commits. The required final-head run remains pending.

The Stage 6 audit found that the six-stage status had not been maintained in this plan and that the Stage 5 completion statement had not been accompanied by a complete exit-evidence mapping. The evidence matrix now records the exact limitation: the populated graph does not include Finance prepayment/settlement transaction lineage; the cross-surface PWA/overlay stale-write proof remains open; and backup exclusion, zero-record participant and snapshot-boundary assertions still need requirement-level reconciliation.

**Stage 6 is not accepted as complete.** The §1A gate remains blocked by the unmet Stage 1–5 acceptance requirements. Return to Stage 1 and complete its fixture/validator gate before claiming Stage 2–5 completion. Retain physical OEM/device certification, full OS reboot where nondeterministic, live Dropbox account delivery and final owner visual approval as external/manual gates; do not imply they passed CI.


### Stage 1 and Stage 2 evidence revalidation — 2026-11-23

**Evidence head:** `e45823f09675ff4c8b8eceffad0e00faed68cbc2`; required CI [45165851554](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/45165851554) completed successfully on that exact SHA. This revalidation supersedes the earlier Stage 6 audit's stale 29-record fixture assertion. The actual shared fixture at that head is `fixtures/semantic-backup-lifecycle-v1.json`, with `recordCount: 46` and 46 actual records.

**Stage 1 — COMPLETE:** `tests/semantic-backup-lifecycle-fixture.test.ts` (6 passing tests), `tests/semantic-backup-lifecycle-fixture-inventory.test.ts` (3), `tests/semantic-backup-lifecycle-fixture-calculations.test.ts` (1), and `tests/semantic-backup-lifecycle-fixture-validator-parity.test.ts` (2) passed. The inventory verifies Finance payment → reversal/replacement → prepayment reduce-tenure revision → settlement on schedule version 2 → closed-loan state; Compliance renewal generations and superseding overlap review; effective-dated Maintenance rates and accrual source revisions; Fuel full/partial/full checkpoints and corrections; expenses and trip closeout references; Work intents/outbox/boundary states; correction-chain heads; and the registered zero-record participant policy. Browser validator parity accepts the valid graph and rejects the fixture's malformed, dangling, wrong-owner, broken-correction-head, malformed-revision and duplicate-identity mutations. Android's corresponding production validator matrix and Room lifecycle test also passed in the same run.

**Stage 2 — COMPLETE:** `tests/semantic-backup-lifecycle-fixture.test.ts` exercises production Browser/Dexie export, encrypted restore, verification, database reopen, startup recovery and re-export using the populated graph and checks restored calculation/provenance. Android `SharedSevenDomainBackupLifecycleTest.sharedSevenDomainFixtureSurvivesProductionRoomRestoreReopenAndReexport` imports the TypeScript-produced encrypted package through the production Room coordinator, verifies canonical records, participants and source lineage after restore/reopen, runs the production calculation bundle over Room-read records, and publishes an Android-produced package. `tests/android-produced-backup-restore.test.ts` restores that Android-produced package through the production Browser/Dexie path and compares normalized canonical state after reopen/re-export. The exact-head workflow's Android and cross-platform encrypted-restore jobs passed.

**Stage 3 remains active:** The direct two-way PWA/Android overlay workflow visibility and stale-write interleaving are not proven by the fixture or restore tests. Stage 4 and Stage 5 remain separate acceptance gates; the passing Stage 2 calculation assertions do not waive their broader requirements.

**Head discipline:** run 45165851554 validates only `e45823f09675ff4c8b8eceffad0e00faed68cbc2`. The evidence/documentation update itself requires a new exact-head CI run before this revalidation checkpoint is treated as current-head green.


### Stage 3 evidence revalidation — cross-surface Driver Workflow — 2026-11-23

**Status: PARTIAL — one previously listed blocker is now closed; the Stage 3 acceptance gate remains open.**

The earlier Stage 3 wording that described direct PWA ↔ overlay event/state/revision visibility and stale-write convergence as missing was stale. The current branch contains and the required Android instrumentation suite executes:

- `DriverWorkflowCrossSurfaceEventParityTest.pwaCommittedTripCreationRefreshesOverlayAndOverlayRideStartRefreshesPWA` (`android/app/src/androidTest/java/in/samtravels/app/DriverWorkflowCrossSurfaceEventParityTest.kt`).
  - Starts from a rendered PWA Drive workspace and a shared Room-backed overlay fixture.
  - Commits a PWA-originated `trip_create` through the real Capacitor DriverWorkflow plugin; asserts the PWA renders “Going To Pickup”, Room state is `going_to_pickup` at revision 2, and the overlay refreshes to the same committed state/revision.
  - Performs the overlay’s real “Swipe to Start trip” action, completes its GPS-backed `start_ride` command, and asserts Room advances once to `trip_active` revision 3 with the event origins preserved (`pwa`, then `native_overlay`).
  - Asserts the PWA observes the overlay’s committed “Trip Active” state.
  - Submits a stale PWA `start_ride` command based on `going_to_pickup` revision 2 after the overlay committed revision 3; asserts rejection, no additional durable intent/event, authoritative Room revision remains 3, and PWA remains converged.
- `DriverWorkflowStaleWriteInterleavingTest.stalePwaWriteAfterOverlayCommitIsRejectedAndAuthoritativeRevisionWins` provides a narrower deterministic Room-store interleaving assertion; it is supplementary, not a substitute for the rendered cross-surface test.
- `DriverWorkflowProcessRestartTest.preparePendingWorkflowForProcessRestart` / `recoverPendingWorkflowAfterProcessRestart` separately exercise pending intent durability, startup recovery, completion and replay idempotency across forced target/instrumentation process stops.
- The exact-head CI run [45168382085](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/45168382085) passed the Android job, including the required instrumentation gate. Its workflow excludes only the explicitly invoked special-case instrumentation classes from the broad suite; the cross-surface parity class remains in that suite.

**Still required for Stage 3 acceptance:** a same-record golden journey for each authoritative runtime. Records must be created through actual supported UI/action boundaries, their dependent production calculations must be evaluated from those committed records, and the same stable record IDs/revisions must then be exported/restored through the production encrypted backup lifecycle and asserted after reopen/recovery. Existing rendered Work, Admin, Fuel, Performance and BackupPanel acceptances run as separate scripts/contexts and therefore do not yet establish this continuous identity chain. Also reconcile the precise Admin/Fuel draft recovery and durable retry/idempotency clauses against existing Dexie and Room assertions before claiming them complete.

Do not mark Stage 3 complete based on the cross-surface test alone. Stages 4–6 remain unaccepted and the whole contract remains INCOMPLETE.


### Stage 3 evidence reconciliation — 2026-11-23 (green CI does not close the gate)

**Latest tested implementation head:** `c303557199b47ddafc8a15ad92c1642b1f84fc70`. Required CI run [45222283438](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/45222283438) passed on that exact SHA: Architecture, Web, Android, Cross-platform encrypted backup restore and Integrated regression gate. Optional Production geocoder verification was skipped. The evidence-matrix reconciliation is recorded in `docs/PR_99_IMPLEMENTATION_EVIDENCE_MATRIX.md`.

**Covered by named passing assertions:**
- Durable shared-form submission primitives are implemented: `SharedFormRuntime` persists pending intent with operation ID, payload fingerprint and submittedAt before dispatch; the business-expense adapter passes these values to the feature service; `FeatureRecordService` atomically stores the business record and operation receipt and replays the original result for matching identity. Component tests cover pending-intent recreation, concurrent taps, changed-payload rejection, create/update receipt replay, and Android Room atomic receipt persistence/reopen with original timestamp.
- PWA Fuel working-copy draft persists and visibly resumes after page reload; full and partial purchases are committed offline and read back from IndexedDB. This is draft-recovery coverage, not process-death retry of a submission whose business record committed but whose working-copy completion did not.
- PWA Admin/Performance rendered submissions and Performance dashboard/provenance rendering are covered, but not as one continuous same-record encrypted backup/restore journey.
- Android `AdminEntryPathAuditCapacitorAcceptanceTest` and `Stage3AndroidUiBackupAcceptance.assertPerformanceAndRestore` now carry rendered Admin-created Vehicle/Fuel and dependent record IDs through Performance refresh and production encrypted Room restore; removed identities are restored and canonical record equality is asserted. The helper does not yet assert a captured calculation output/provenance fingerprint tied to those exact UI-created sources before and after restore.
- The rendered PWA↔Android overlay stale-write interleaving and two-way committed workflow state/revision convergence are covered by `DriverWorkflowCrossSurfaceEventParityTest.pwaCommittedTripCreationRefreshesOverlayAndOverlayRideStartRefreshesPWA`.
- Android pending Work outbox process-restart/replay recovery is covered by `DriverWorkflowProcessRestartTest.preparePendingWorkflowForProcessRestart` and `recoverPendingWorkflowAfterProcessRestart`; this does not establish shared Admin/Fuel form-submit retry semantics.

**Acceptance blockers still open:**
1. The durable shared-form protocol primitives and their component-level tests exist, but there is no integrated fault-injection test for the critical boundary after the feature record+receipt atomic commit succeeds and before the working-copy completion marker is written. Add one connected `SharedFormRuntime → form handler → FeatureRecordService → durable working-copy repository` retry test that recreates the runtime, replays the same operation and proves the original record/receipt, revision and first-submit timestamp are returned exactly once; conflicting payload reuse must fail closed. Prove representative Admin and Fuel cases on Browser/Dexie and Android/Room.
2. The PWA golden journey remains split across independent scripts/browser contexts. No one lifecycle creates representative records through the rendered PWA, calculates from those exact committed record IDs, then uses production encrypted backup/restore/reopen and asserts those same identities and calculation provenance.
3. Android same-record identity survives encrypted restore, but calculation output/provenance linked to the exact UI-created source IDs is not captured and compared across the restore boundary.
4. Android WebView/Room Fuel draft recovery is not established by the current UI test. The Room receipt test proves atomic persistence and reopen, but not the full rendered form/runtime retry after a post-commit interruption.

**Stage disposition: ACTIVE — NOT ACCEPTED.** The above are explicit contract-required proof gaps. Complete the durable shared-form submit/retry protocol and tests, the PWA same-record golden journey, and Android calculation/provenance assertions. Then rerun required CI on the exact resulting PR head and reconcile the evidence matrix before advancing to Stage 4. Do not close Stage 3 or start Stage 4 merely because run 45222283438 is green.


### Stage 3 evidence revalidation — same-record lifecycle and submit recovery — 2026-11-25

**Disposition on implementation head `098bc5624f5004137f564a4e3c906cdbb54463a5`: acceptance assertions are now present and passed in required CI run [4396](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/45475014220).** This supersedes the 2026-11-23 Stage 3 blocker list above, which predates the integrated recovery and golden-journey assertions. The evidence-reconciliation documentation commit requires a fresh exact-head CI run before Stage 3 is formally closed.

**Admin/Fuel post-commit recovery — Browser/Dexie:**
- `tests/shared-form-dexie-recovery.test.ts` — `reopens and replays an Admin Vehicle create after the feature commit`, `reopens and replays an Admin Vehicle update without applying revision twice`, `reopens and replays Fuel purchase submission using the same Dexie operation receipt`, and `reopens and replays an Admin Platform Fee create after the Dexie feature commit but before working-copy completion`.
- These inject failure at the working-copy completion write after the authoritative feature record/receipt commit, close and reopen the same Dexie database, recreate the runtime/handler, replay the pending operation, and assert one record/receipt, unchanged revision/envelope and original submission timestamp where applicable. Existing `shared-form-runtime-recovery.test.ts` and `feature-record-service.test.ts` retain the stable operation identity, payload fingerprint, changed-payload fail-closed and receipt replay assertions.

**Admin/Fuel post-commit recovery — Android/Room:**
- `AdminEntryPathAuditCapacitorAcceptanceTest` invokes `Stage3AdminFuelRecoveryAcceptance.recoverAdminAndFuel`.
- `AdminEntryPathAuditTestSupport.assertPlatformFeePostCommitRecovery` arms the Room working-copy completion fault, proves the Platform Fee record and receipt committed once, recreates the Activity/WebView, recovers the pending Admin form and replays the original receipt; it asserts one unchanged record, one receipt and a completed working copy.
- `AdminEntryPathAuditTestSupport.assertFuelDraftAndPostCommitRecovery` first proves a draft survives Activity/WebView recreation without submission, then injects the post-commit completion failure, recreates the Activity/WebView, replays the pending Fuel operation and asserts one unchanged Fuel record, one receipt, preserved first-submit timestamp and completed working copy.

**Same-record PWA journey:**
- CI runs `scripts/fuel-entry-browser-acceptance.mjs`, which invokes `assertBrowserWorkDistanceThroughUi` and `assertBrowserFuelPerformanceAndBackupJourney` from `scripts/stage3-browser-golden-journey.mjs`.
- `assertBrowserStage3GoldenJourney` captures the rendered production Performance dashboard and provenance, snapshots the actual UI-created source IDs/revisions/schema/payload, creates a production v2 encrypted Browser backup, removes a UI-created record, restores through `restoreBackupForCurrentRuntime`, and asserts canonical source-record equality and identity restoration. It refreshes Performance and asserts the dashboard output and provenance are unchanged. The enclosing journey additionally checks the UI-created Fuel purchases are the expected calculation sources and that the opening full-tank baseline is not incorrectly treated as interval spend.

**Same-record Android journey:**
- `AdminEntryPathAuditCapacitorAcceptanceTest` invokes `Stage3AdminFuelRecoveryAcceptance.assertPerformanceAndRestore`, which delegates to `Stage3AndroidUiBackupAcceptance.assertPerformanceAndRestore`.
- The rendered Android WebView Performance screen is refreshed from the UI-created Vehicle/Fuel/Admin expense records. The test captures dashboard plus provenance, asserts a calculation ID and the exact Fuel/Admin source IDs, creates the v2 encrypted package from the Room snapshot, removes the UI-created Vehicle and dependent records, and restores through `NativeBackupRestoreCoordinator.restoreEncrypted` (the coordinator used by the production BackupPlugin restore path). It compares canonical records, asserts the same IDs are restored, refreshes the rendered Performance calculation and requires the complete dashboard/provenance snapshot to equal the pre-restore snapshot.

**Cross-surface workflow parity remains covered:** `DriverWorkflowCrossSurfaceEventParityTest.pwaCommittedTripCreationRefreshesOverlayAndOverlayRideStartRefreshesPWA` proves PWA/overlay event, state and revision convergence and stale-write rejection; `DriverWorkflowProcessRestartTest.preparePendingWorkflowForProcessRestart` / `recoverPendingWorkflowAfterProcessRestart` proves pending Work outbox recovery and replay idempotency.

**Exact-head CI evidence:** run [4396](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/45475014220) passed Architecture, Web (including rendered PWA golden journey), Android (including Admin/Fuel recovery and Android same-record journey), Cross-platform encrypted backup restore and Integrated regression gate on the SHA above. Optional Production geocoder verification was skipped. No physical OEM certification, full OS reboot certification or live Dropbox account delivery is claimed by this CI run.

**Stage 3 gate:** the previously open Admin/Fuel recovery, same-record PWA journey and Android calculation/provenance comparison now have named production-path assertions. Stage 3 may be marked COMPLETE only after required CI passes on the exact documentation-reconciled PR head. Stages 4, 5 and 6 remain separate sequential acceptance gates; whole-contract status remains INCOMPLETE.


### Stage 4 audit and evidence checkpoint — 2026-11-25

**Stage 3 exit:** Stage 3 is accepted on exact head `289d06255fa4d7bf80e5b53217a6cdf8aab5c560`, required CI run [4398](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/45478433937). PR #99 remains open, draft and unmerged.

**Stage 4 integrated work completed on the current branch (final exact-head CI pending):**
- `tests/helpers/semantic-fixture-calculation-parity.ts` runs owning production domain calculators over records read from the platform repository: Fuel full-to-full intervals/rate history and daily expense totals; Maintenance daily accruals from fully allocated Work km and effective-dated rate history; Finance original and prepayment reamortization schedules; corrected Compliance daily allocation; Work daily business/personal/unallocated boundary rows; and source/correction provenance.
- `tests/semantic-backup-lifecycle-fixture.test.ts` calculates before Browser/Dexie encrypted export and again after production restore, close/reopen and recovery; the complete returned calculation/provenance object is compared exactly.
- Android `SharedSevenDomainBackupLifecycleTest.sharedSevenDomainFixtureSurvivesProductionRoomRestoreReopenAndReexport` runs the same compiled production calculation bundle against Room-read records before backup and after production encrypted restore, close/reopen and recovery; the complete returned calculation/provenance object is compared exactly.
- The runner applies the fixture's valid Fuel and Compliance correction chains to the owning calculations. It also calls `createMaintenanceExpenseCorrectionAdapter` / `projectMaintenanceExpenseRecords` and asserts the corrected Maintenance expense value, chain revision and correction-record references while preserving the original expense record.
- `tests/helpers/assert-restored-domain-calculation-parity.ts` asserts the fixture's exact Work allocation rows, corrected Compliance amount, Maintenance correction projection, Maintenance accruals, Fuel cost history, Finance prepayment schedule and provenance resolution.

**Existing domain/application tests reused:** Work `driver-workflow-v2.test.ts` (04:00 operational date, active-trip deferral, odometer chaining/rollback, one-time rotation); Maintenance `maintenance-service.test.ts` (effective-date rate, fully allocated-only accrual, 04:00 completion and boundary withholding); Business Start Date `business-start-date-cost-allocation-service.test.ts` (corrected Compliance premium, correction references, EMI schedule, settlement cutoff and deterministic provenance); Finance `finance-loan-prepayment-service.test.ts` (fixed EMI/reduced tenure, earlier final due date, due-EMI guard and concurrency); Fuel/expenses `business-expenses-calculations.test.ts` (full/partial/full checkpoints, incomplete interval, weighted rate, paid challan/platform fee and reversal); Full-cost `full-cost-breakeven-service.test.ts` (per-vehicle fuel/maintenance/dated costs/annual allocation and withheld unallocated distance); Performance `performance-calculation-service.test.ts` (18-month pre-business pool, snapshot consistency, corrected trip revenue, revisioned fixed Driver Target).

**Only remaining Stage 4 evidence gaps identified:**
1. The shared 46-record calculation bundle does not yet invoke the production `PerformanceCalculationServiceV1` / `FullCostBreakevenService` composition on that same graph. The current full fixture proves its source-domain calculations, while the Performance service and full-cost service assertions use separate focused fixtures. Add one integrated same-source assertion for operating breakeven (Traffic Challans excluded), full-cost breakeven (Traffic Challans included), and the fixed daily Driver Target; capture exact source IDs/revisions and compare the complete Performance result/provenance before and after Browser and Android restore.
2. The populated fixture's Compliance correction is applied to daily Compliance calculation, and focused allocation tests prove correction references and a corrected-premium pool input separately. Still join that exact historical correction chain to the production Business Start Date allocation and Performance recovery pool on the same populated graph, asserting the corrected source amount is counted once, the original remains immutable, and the correction refs survive restore.
3. No additional Work retry assertion is currently outstanding: `driver-workflow-v2.test.ts` covers active-trip 04:00 deferral and one-time rotation; `maintenance-service.test.ts` proves completed-boundary accrual and idempotent replay, while the populated runner proves the still-pending contribution remains unallocated and is withheld from accrual.

**Stage 4 disposition: ACTIVE — NOT ACCEPTED.** These are the remaining contract-specific integrated assertions, not a request for generic stress tests or a broad rewrite. Close them, update the evidence matrix with exact test names/assertions, then run all required CI on the exact resulting PR head. Only after that may Stage 4 be accepted and Stage 5 begin.


### Stage 4 integrated calculation closure — 2026-11-25 (exact-head CI gate)

The two Stage 4 implementation gaps identified in the preceding checkpoint now have integrated assertions in the shared calculation bundle. The exact resulting PR head must still pass every required CI job before Stage 4 is accepted.

- tests/helpers/semantic-fixture-calculation-parity.ts now composes the production FullCostBreakevenService and createPerformanceCalculationServiceV1 over the populated fixture's repository-read Work, Maintenance, Fuel, business-expense, Finance, Performance and trip-financial records. It returns the full-cost daily/period output and provenance plus the complete Performance period, daily rows, recovery rows, target snapshot, completeness and source provenance.
- The same runner asserts that the normal operating expense classification excludes paid Traffic Challans while the full-cost classification and production full-cost breakeven include them. The populated fixture's paid challan is included; the unpaid challan remains an unrecognized obligation. It also asserts the revisioned Admin Driver Target is consumed by Performance.
- The exact Compliance source feature:compliance:123e4567-e89b-42d3-a456-426614174010 is projected through its stored compliance-fix-1 correction chain into the production BusinessStartDateCostAllocationService pre-business pool. The original record remains at 365000 paise; the corrected allocation is 366000 paise and is allocated once over the 18-month recovery window from the Business Start Date. The separate renewal/overlap chain remains in the populated graph; this focused recovery assertion isolates the corrected historical source, while the existing Compliance overlap tests continue to cover withholding decisions.
- PerformanceFixedCostAllocationAdapterV1 now carries the allocation report's correction references into the pre-business recovery input. The recovery daily rows, Performance provenance and passbook source references preserve those append-only correction identities instead of retaining only the immutable Compliance source ID/revision.
- tests/helpers/assert-restored-domain-calculation-parity.ts asserts the challan classification, full-cost and Performance outputs, fixed target, corrected Compliance pool amount, immutable original source and correction references. tests/performance-calculation-service.test.ts also checks recovery-row and Performance provenance references.
- Browser/Dexie tests/semantic-backup-lifecycle-fixture.test.ts and Android/Room SharedSevenDomainBackupLifecycleTest.sharedSevenDomainFixtureSurvivesProductionRoomRestoreReopenAndReexport execute the same compiled bundle before backup and after production encrypted restore, reopen and recovery, then compare the complete returned calculation/provenance object.

**Stage 4 disposition:** IMPLEMENTATION/EVIDENCE COMPLETE — PENDING REQUIRED CI ON THE EXACT RESULTING HEAD. Stage 4 is accepted only if Architecture, Web, Android, Cross-platform encrypted backup restore and Integrated regression gate all pass on that same head. Stage 5 has not started and must remain gated until that exact-head CI result is green.


### Stage 5 negative, boundary and interruption evidence — 2026-11-25

**Scope:** This checkpoint closes only Stage 5 requirements already stated in the end-to-end contract and referenced owner contracts. Existing tests are reused where they already prove a clause; no generic stress programme, unrelated product change or additional feature scope is introduced.

| Contract requirement | Browser/Dexie evidence | Android/Room evidence |
|---|---|---|
| Malformed, truncated and unauthenticated encrypted packages are rejected before restore mutation | `tests/backup-crypto.test.ts`, test `rejects malformed and truncated serialized packages before restore`: malformed JSON, truncated serialized bytes, invalid UTF-8, missing payload envelope and authenticated rejection of truncated ciphertext. | `NativeBackupV2PackageTest.rejectsMalformedAndTruncatedEncryptedPackagesBeforeRestore`: malformed JSON, missing payload, truncated ciphertext and invalid-length nonce rejection. Existing tamper/wrong-key assertions remain in `NativeBackupV2PackageTest.nativeDecryptsSharedRecoveryOnlyPackageAndRejectsTampering`. |
| Pending Work intent survives encrypted restore/reopen and replay commits one business effect | `tests/stage5-work-outbox-encrypted-restore.test.ts`, test `restores a pending intent, commits it once, and replays the outbox once`: production v2 encrypted backup and restore, checkpoint verification, database close/reopen, startup pending-intent completion, one event, one outbox row, durable acknowledgement and eventId-deduplicated integration effect after service recreation/replay. | `NativeBackupWorkRestoreReplayTest.pendingWorkIntentSurvivesEncryptedRestoreAndCreatesOneEventAndOutboxEffect`: Room production encrypted restore coordinator, checkpoint verification, Room close/reopen/startup recovery, pending intent reactivation/completion and duplicate completion; asserts one Log Book event and one outbox row for the pending command, then replays/acknowledges by eventId and proves exactly one consumer effect. |
| Snapshot and manifest represent one committed multi-table boundary under concurrent writes | `tests/backup-snapshot-consistency.test.ts`, test `captures all tables from one committed boundary while a writer updates both`: a concurrent writer changes the record and driver-state tables while export is held inside its read transaction; snapshot contains the before-state for both and the database contains the after-state. | `NativeBackupSnapshotConsistencyTest.snapshotAndManifestShareOneRoomTransactionBoundaryDuringConcurrentWrite`: Room writer is blocked by the snapshot transaction; the package contains the before-state of both platform record and Log Book event while Room contains the committed after-state. |
| Local identity, credentials and recovery material are excluded from portable exports | `tests/backup-exclusions.test.ts`, test `excludes local credentials, diagnostics, recovery material and non-portable person identity from portable snapshots`; Work selected-driver state required for portable operational restore is retained. | `NativeBackupExclusionTest.portableSnapshotExcludesRoomLocalIdentityAndRestoreRecoveryRows`; Android-local person/driver-link bindings and recovery rows are excluded/preserved according to the Room restore contract. |
| Zero-record participants and participant ownership are handled deterministically | `tests/semantic-backup-lifecycle-fixture-inventory.test.ts` validates the declared zero-record participant policy; `tests/backup-snapshot.test.ts` covers participant manifest, owner and snapshot-version drift and fail-closed unregistered records. | `SharedSemanticBackupFixtureTest.emptyRegisteredParticipantsAreAcceptedAndUnknownOwnersAreRejected` and `restoringEmptyParticipantsClearsTheirPreviouslyStoredRows`; `NativeBackupCoverageTest.rejectsUnknownParticipantAndDuplicateRows` and participant-manifest/version tests. |
| Record/package count boundaries are enforced before mutation | `tests/backup-limits.test.ts` and `tests/backup-crypto.test.ts` cover inclusive limits, first-record-over rejection and package byte bounds. | `BackupPackageLimitsTest` and `NativeBackupRecordLimitAcceptanceTest.productionSnapshotBuilderRejectsOverLimitExport` / `productionRestoreRejectsRawRecordCountBeforeValidationOrCheckpoint`. |
| Dangling references, malformed rows and participant mismatch are rejected without damaging destination | `tests/backup-invalid-reference-restore.test.ts`, `tests/backup-restore-failure-recovery.test.ts` and `tests/backup-snapshot.test.ts` cover authenticated dangling-reference rejection before checkpoint, malformed-row rejection, participant mismatch and clean rollback. | `NativeBackupRestoreCoordinatorTest.driverAssignmentWithDanglingVehicleIsRejectedBeforeRestoreMutation`, `rejectsDanglingVehicleReferencesAcrossComplianceMaintenanceAndBusinessExpenses`, and `NativeBackupCoverageTest` ownership/duplicate/unknown-owner rejection assertions. |
| Interrupted replacement and startup recovery preserve the pre-restore destination | `tests/backup-restore-failure-recovery.test.ts` covers interrupted table replacement and recovery to the pre-restore snapshot; `tests/backup-snapshot.test.ts` covers retained checkpoint verification and rollback. | `BackupRestoreTransactionFailureTest.injectedFailureDuringReplacementRollsBackTheRoomTransaction`, `preRestoreCheckpointSurvivesRoomRestartAndRestoresAuthoritativeRecords`, and `NativeBackupRestoreCoordinatorTest.productionRestoreReopenRecoveryAndReexportPreservePreRestoreGraph`. |

**Stage 5 implementation-head CI:** [Run #45512816930](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/45512816930) passed on exact implementation head `d13a2862e2fd41e822d0781ce10b5eba81080252`: Architecture, Web (including rendered PWA acceptance), Android (including the required Room/workflow/backup reliability instrumentation gate), Cross-platform encrypted backup restore and Integrated regression gate. Optional Production geocoder verification was skipped. This run validates the Stage 5 implementation and tests; it does not validate the documentation commit being made now.

**Stage 5 disposition:** Implementation and requirement-to-test evidence are complete. Formal Stage 5 acceptance on the final PR head is conditional on all required jobs passing on the documentation-updated exact head. PR #99 remains open, draft and unmerged. Stage 6 and whole-contract acceptance remain separate and are not claimed here.
