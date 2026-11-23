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
- Include the contract-required Finance payment, reversal, prepayment, revised schedule and settlement/closure lineage. The current 29-record graph's missing prepayment/settlement transaction lineage is an explicit gap.
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
- Close direct two-way PWA ↔ Android overlay committed Driver Workflow event/state/revision visibility.
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

## 5. Current status — reconciled 2026-11-23

- Original four-stage closeout tracker: **COMPLETE** (subordinate only).
- Stage 1 — shared populated semantic fixture: **COMPLETE — EVIDENCED**. The current shared fixture contains 46 records and the Finance payment/reversal/prepayment revision/settlement/closed-loan lineage, all-domain source links, correction chains, Work recovery states and zero-record participant policy. Inventory, lineage, calculation and validator-parity tests passed on baseline head `e45823f09675ff4c8b8eceffad0e00faed68cbc2` (run [45165851554](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/45165851554)).
- Stage 2 — production Browser/Dexie and Android/Room lifecycle: **COMPLETE — EVIDENCED**. The same populated graph passes Browser production export/encrypted restore/reopen/re-export, Android Room production restore/reopen/re-export, TypeScript→Room import and Android→Browser import. Normalized records/participants, pending Work/outbox state, correction lineage and production calculation/provenance checks pass in the same exact-head CI run.
- Stage 3 — UI-originated lifecycle and cross-surface parity: **ACTIVE — PARTIAL**. Direct two-way PWA ↔ Android overlay committed Driver Workflow event/state/revision visibility and the stale-read N → overlay commit N+1 → stale PWA rejection/convergence interleaving remain open.
- Stage 4 — calculation and correction lineage: **NOT YET ACCEPTED**. Stage 2 proves fixture-backed calculations at the restore boundary, but the broader whole-contract consumer/recalculation and same-source provenance requirements still require their own Stage 4 reconciliation.
- Stage 5 — backup/restore negative, boundary and interruption proof: **NOT YET ACCEPTED**. Existing rollback, invalid-reference, participant and replay tests prove important slices; the complete requirement-to-test map, including backup exclusions, zero-record participants and snapshot/record-count boundaries, remains to be closed.
- Stage 6 — whole-contract reconciliation and final acceptance: **BLOCKED** until Stages 3–5 and all eight §1A conditions are satisfied.
- Whole-contract status: **INCOMPLETE**.
- PR #99: **OPEN · DRAFT · UNMERGED**.

The active implementation gate is now Stage 3, the earliest unmet sequential stage. Stage 1 and Stage 2 are accepted only for the evidence and exact head recorded above; the documentation reconciliation creates a newer head and requires a fresh exact-head CI run. Do not infer whole-contract completion from these stage exits or green CI.


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
