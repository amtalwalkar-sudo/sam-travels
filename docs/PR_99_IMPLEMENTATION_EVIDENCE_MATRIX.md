# PR #99 — Initial Implementation and Test Evidence Matrix

**Baseline inspected:** PR #99 branch `docs/repository-foundation-audit-gap-register`, head `be6498716d0a42728294d46d90afbe94b7dacdf8`.  
**Method:** GitHub source/test inspection; this document records test intent and assertions, not a claim that the latest CI run has passed.  
**Authority:** [PR #99 End-to-End Contract](PR_99_END_TO_END_DATA_CALCULATION_PERSISTENCE_BACKUP_CONTRACT.md).

## 1. Driver Workflow persistence and lifecycle

| Guarantee | Existing evidence inspected | What it actually proves | Initial assessment |
|---|---|---|---|
| Atomic completion | Android `DriverWorkflowStoreTest.completionAtomicallyWritesEventProjectionIntentAndOutbox`; `DriverWorkflowAtomicFailureTest.everyCompletionWriteFailureRollsBackTheWholeNativeTransitionAcrossReopen`; browser `transaction-recovery-guarantees.test.ts` | Event/Log Book, state revision, intent status and outbox commit together; injected write failures leave the prior authoritative state | Implemented and strongly tested |
| Duplicate command/completion idempotency | Android `DriverWorkflowStoreTest.duplicateCommandIsIdempotentButChangedPayloadIsRejected`, `replayedCompletionCannotDuplicateEventProjectionOrOutbox`, `committedTransitionReplayAfterRoomReopenCannotDuplicateEventOrOutbox`; browser `driver-workflow.test.ts`, `transaction-recovery-guarantees.test.ts` | Same identity/payload reuses prior outcome; changed payload is rejected; event, projection/revision and outbox are not duplicated | Implemented and tested |
| Stale competing writes | Android `DriverWorkflowStoreTest.competingPwaAndOverlayCommandsCannotBothQueueAtOneRevision`; browser `driver-workflow.test.ts` tests stale competing commands and simultaneous PWA/native enqueue | Competing commands at one expected revision cannot both enqueue/commit | Implemented and tested at coordinator/repository boundary |
| Pending intent after process termination | Android `DriverWorkflowProcessRestartTest.preparePendingWorkflowForProcessRestart` + `recoverPendingWorkflowAfterProcessRestart`; browser `driver-workflow.test.ts` IndexedDB close/reopen and `driver-workflow-parity.test.ts` | Android CI test uses separate instrumentation invocations and checks a changed PID, same DB path, pending intent and subsequent recovery; browser pending intent survives IndexedDB close/reopen | Implemented and tested; physical reboot remains distinct |
| Service recreation | Android `DriverWorkflowProcessRestartTest`, `DriverWorkflowParityInterruptionTest.nativeRestoreKeepsActiveShiftAndPendingIntentTogether`, service `START_STICKY` and recovery path | Process death/reopen and service startup recovery are covered at different levels | Partly proven; direct repeated service-recreation idempotency assertion should be mapped before adding anything |
| Outbox durability and replay | Android `DriverWorkflowOutboxTest.durableOutboxAcknowledgementSurvivesRoomReopenAndExcludesDeliveredEvents`; process-restart test asserts outbox count does not grow on replay; browser `driver-workflow.test.ts` acknowledgement and unacknowledged replay tests | Delivered acknowledgement survives Room reopen; pending browser delivery replays after restart; Android event/outbox count remains stable across replay after process death | Core behavior tested; Android undelivered receiver-retry across actual process death needs explicit confirmation |
| Cross-surface event visibility | Android store concurrency test; `DriverOverlayWorkflowAcceptanceTest.actualOverlaySwipeCommitsAttributedTripEventAfterGpsEvidence`; `DriverWorkflowCapacitorBridgeTest` exercises an actual Capacitor→WebView refresh, but for a financial draft | Overlay can commit to Room; Capacitor can refresh PWA from Room for another record type; both workflow clients use same store/database by code inspection | **Specific gap:** no test yet directly writes a Driver Workflow event through one Android surface and asserts the other surface reads the same committed event/state/revision |
| Stale state read/overwrite across actual PWA and overlay clients | Android competing-command store test and browser parity tests | Coordinator rejects stale revision at shared store boundary | **Specific gap:** no full surface-level interleaving test proving PWA reads revision N, overlay commits N+1, then PWA attempts its stale write and is rejected while both UIs converge to N+1 |
| Device reboot | `OverlayBootRestartPolicyTest` tests boot-start policy; process restart test proves process death but not a full OS reboot | Boot policy is tested, not a persisted active/pending workflow through an actual device reboot | **Not proven by current inspected tests.** Determine whether deterministic emulator reboot coverage is practical; otherwise retain physical-device acceptance separately |

## 2. Browser and Android data/backup coverage

| Area | Existing tests inspected | Existing proof | Remaining PR #99 gap |
|---|---|---|---|
| Browser snapshot consistency | `tests/backup-snapshot.test.ts` | Registered participants, all IndexedDB workflow tables at one transaction boundary, row-order-independent restore, checkpoint, read-back and rollback | Shared populated fixture must exercise these with all domains together |
| Browser restore/recovery | `tests/recovery-lifecycle.test.ts`, `tests/backup-restore-failure-recovery.test.ts` | IndexedDB close/reopen, startup rollback, projection rebuild, active shift plus pending intent restore, interrupted writes | No single all-domain fixture with calculation recomputation and provenance |
| Android Room participant coverage | `NativeBackupCoverageTest`, `NativeFinancePaymentBackupTest`, `NativeBusinessExpensesRoomBackupTest`, `NativeComplianceBackupTest`, `NativeMaintenanceBackupRoomTest`, `NativePerformanceBackupTest` | Individual Room participants export/restore and validate their owned records | Must run the same populated semantic dataset across all participants and compare normalized semantics |
| Android production restore | `NativeBackupRestoreCoordinatorTest`, `NativeBackupStartupRecoveryTest` | Production Room restore coordinator, close/reopen/startup recovery, injected post-replacement failure and rollback | Shared full-domain fixture must pass through this production path |
| Work and Log Book backup | `NativeBackupCoverageTest.featureTableBackupRoundTrip`; `DriverWorkflowParityInterruptionTest.nativeRestoreKeepsActiveShiftAndPendingIntentTogether` | Room backup includes driver state, pending intent, outbox, timeline enrichment and Log Book rows; restore preserves active shift/pending intent | Need one shared fixture that compares IDs/order/revisions and pending/outbox semantics after full restore lifecycle |
| Domain calculations | Existing Finance, Compliance, Maintenance, Business Expense and Performance calculation/service tests | Individual calculation rules are tested independently | Recompute the same fixture's calculations before and after restore on each runtime; compare output and source provenance |
| Cross-runtime semantic fixture | `tests/semantic-backup-lifecycle-fixture.test.ts`; `SharedSemanticBackupFixtureTest.sharedSemanticLifecycleFixtureDeclaresAllParityDomains` | Both platforms load the same JSON contract seed and assert domains/lifecycle/comparison keys | Fixture is not populated; loaders, production lifecycle execution and semantic equality are still absent |

## 3. Track A / Track B status and execution boundary

### Track A — Restore/recovery foundation

**Status: implemented; reuse existing evidence.**

The existing browser IndexedDB and Android Room production restore paths, reopen/startup recovery, rollback/failure injection, dangling-reference validation, and shared fixture contract seed form the Track A foundation. The workflow atomicity, idempotency, pending-intent, process-death, outbox and stale-revision tests listed above are also existing evidence.

Do not reimplement these mechanisms or add equivalent tests. Do not schedule isolated retesting of these cases. They will naturally execute in the final required CI run. If a Track B integration test exposes a concrete failure, investigate only that failing boundary.

### Track B — Populated fixture and end-to-end semantic parity

**Status: outstanding; this is the only active implementation track.**

1. Populate the shared fixture with schema-valid synthetic records for Vehicle/Driver dependencies, Finance, Compliance, Maintenance, Business Expenses, Performance, Work/Driver Workflow and Log Book.
2. Add the browser fixture loader/runner and execute the populated data through the existing production IndexedDB export → restore → reopen → startup recovery → re-export path.
3. Add the Room fixture loader/runner for the exact same fixture asset and execute it through the existing production Room restore coordinator and recovery path.
4. Recompute production calculations before and after restore on both runtimes; compare exact normalized outputs, effective-date inputs and source provenance.
5. Compare IDs, schema versions, revisions, references, event order, pending-intent/outbox identity and status, Log Book linkage, and correction-chain heads across browser and Room.
6. Add only missing direct integration assertions after confirming they are not already covered: PWA↔overlay Driver Workflow event/state visibility; actual surface-level stale-write interleaving; undelivered Android outbox retry after process death only if current assertions do not prove it.
7. Treat full OS reboot separately from process death. If not already covered and not deterministic in CI, record it as a physical-device gate; do not add a flaky duplicate test.
8. Run focused new tests, then the required CI once on the final PR head; update the evidence matrix and gap register.

**Track B exit:** one populated fixture passes through both existing production lifecycles, normalized semantic and calculation/provenance parity passes, genuinely missing integration assertions are covered or explicitly gated, and required CI is green.

## 4. No-duplicate-testing rule

- Existing passing Track A tests are evidence to reuse, not work to repeat.
- Do not create another test for atomicity, duplicate completion, pending-intent recovery, process death, service recreation, generic outbox durability, restore rollback or dangling references when the existing assertion already proves that behaviour.
- A new test requires a named acceptance assertion not already exercised by an existing test.
- Final CI naturally reruns the repository's required suite; that is the only broad rerun. Implementation work should use targeted new/changed tests first.

## 4. Scope guard

This matrix is an initial static audit. Test presence is not a CI result. Before marking any row complete, inspect the relevant assertion and confirm the test ran on the latest PR head. No new production architecture or feature behavior is authorized by this matrix.
