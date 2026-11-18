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

## 3. Initial gap decisions

Do not rebuild the existing transaction, idempotency, pending-intent, process-death or backup rollback mechanisms merely to create new tests.

The next implementation work is limited to:

1. Populate the shared fixture with valid synthetic domain records and actual lineage supported by current schemas.
2. Add browser and Room fixture loaders/runners that use production validators/participants and the production restore path.
3. Run full export → restore → close/reopen → startup recovery → re-export on each platform.
4. Recompute production calculations before and after restore; compare exact values, effective-date inputs and source provenance.
5. Add the missing direct Android PWA/overlay Driver Workflow visibility and stale-write interleaving test.
6. Add only the specifically uncovered Android outbox process-restart replay assertion if the existing test runner does not already prove it.
7. Determine whether full OS reboot can be deterministically exercised in CI; do not label process death as reboot proof.

## 4. Scope guard

This matrix is an initial static audit. Test presence is not a CI result. Before marking any row complete, inspect the relevant assertion and confirm the test ran on the latest PR head. No new production architecture or feature behavior is authorized by this matrix.
