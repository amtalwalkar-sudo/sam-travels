# Business-Event Reliability Audit

**Audit ID:** ST-BUSINESS-EVENT-RELIABILITY  
**Status:** In progress — baseline architecture and evidence-model review  
**Baseline branch:** `main`  
**Baseline commit:** `f766725fc9f8c1d94aa1aa5c99a0596eccec4539`  
**Baseline date:** 2026-11-11  
**Related integrated work:** [PR #69](https://github.com/amtalwalkar-sudo/sam-travels/pull/69) (merged)  
**Product authority:** [Intelligent Business Advisor Vision](INTELLIGENT_BUSINESS_ADVISOR_VISION.md)  
**Implementation authorization:** This audit authorizes inspection and documentation only. It does not authorize a new verification data model, business-rule changes, or runtime implementation.

## 1. Purpose

Determine whether Sam Travels captures business activity reliably across browser-only PWA and installed Capacitor Android, and whether captured records can support trustworthy business conclusions.

This audit distinguishes two questions:

1. **Application reliability:** Was the information captured, durably committed, recovered, and presented consistently?
2. **Business-event reliability:** Does the information adequately represent what happened in the real business, given its source and corroborating evidence?

Passing the first does not automatically pass the second. A durable owner-entered amount remains an assertion unless the event-specific evidence standard supports a stronger conclusion.

## 2. Evidence and rating vocabulary

### 2.1 Business-event evidence states — approved product vocabulary

- **Authoritative business record:** an entry made by an authorised driver or admin is the official business record under the owner's stated operating policy. It is accepted for business records and calculations without requiring independent evidence.
- **Technically validated:** the app has validated required fields, permitted values, identity/relationships, revision/duplicate rules, and durable commit. This describes application integrity, not independent proof of the real-world event.
- **Independently corroborated (optional):** a separate evidence source supports the entry. This is useful when available, but is not a prerequisite for accepting an authorised driver/admin entry.
- **Conflicting:** the app or a reviewer has identified a material conflict between business records or optional evidence that requires resolution.
- **Unknown / not captured:** the app has no sufficient authorised entry or usable information for the requested conclusion.

Do not label an authorised driver/admin entry as merely untrusted or provisional because independent evidence is absent. Do not claim that the app independently confirmed a real-world payment or expense unless a genuinely separate source exists. Missing optional evidence does not make the authoritative business record invalid. These labels are descriptive, not an automatic status ladder. No confidence score is approved by this audit.

### 2.2 Audit result labels

- **Verified:** the named behaviour is supported by inspected implementation and relevant automated evidence at the baseline.
- **Partial:** some requirements are supported, but material paths, platform coverage, or acceptance remain incomplete.
- **Failed:** inspected evidence demonstrates a contract violation or incorrect result.
- **Unknown:** evidence has not yet been inspected or is insufficient.

A test passing is evidence only for the scenario it executes. CI, emulator, physical-device, and real-world business evidence must remain distinct.

## 3. Baseline and scope

PR #69 was merged into main at baseline commit `f766725fc9f8c1d94aa1aa5c99a0596eccec4539`. Its PR description explicitly says its integrated acceptance scope was not yet all complete and defers physical-phone acceptance. The baseline main CI run [#42991386321](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/42991386321) completed successfully with web, architecture, Android, production geocoder verification, and integrated regression jobs.

This establishes successful execution of those automated jobs, not proof of all lifecycle combinations, physical-device behaviour, live business evidence, or every real-world event.

### In-scope surfaces and paths

- Browser-only PWA with IndexedDB/Dexie authority.
- Installed Capacitor Android WebView with Room authority.
- Native Android driver overlay sharing the Android Room/application boundary.
- Shared driver command, GPS evidence, trip financial closeout, and shared-form submission paths.
- Persistence, recovery, backup participation, and platform parity relevant to captured records.

### Explicitly not accepted as complete by this baseline

- Physical Android phone/OEM lifecycle acceptance.
- PWA real-browser lifecycle matrix beyond automated tests inspected.
- Live Dropbox account acceptance.
- Optional independent corroboration of fares, collections, expenses, fuel purchases, or maintenance events.
- A generic production event-verification state. The approved policy is authoritative authorised entry plus technical validation; optional corroboration is separate.

## 4. Architecture and capture findings

### 4.1 Authoritative storage by runtime

| Runtime/surface | Authority | Baseline finding |
|---|---|---|
| Browser-only PWA | IndexedDB/Dexie | **Verified at architecture level.** Browser adapter uses Dexie and shared repository interfaces. |
| Installed Android WebView | Room | **Verified at architecture level.** Native plugin routes business reads/writes through Room-backed APIs. |
| Native Android overlay | Same Room-backed application/store boundary | **Verified at architecture level.** Overlay uses native workflow/financial stores; it is not a second business database. |
| Dropbox | Backup destination | Not a live business-record authority. Live account acceptance remains separate. |

The current browser database declares schema version 6. Its business/workflow tables include `records`, `driverState`, `driverIntents`, `driverEvents`, and `driverOutbox`; checkpoint, credential-vault, and diagnostics tables are separate participants/areas with their own policy.

The current Android Room database is schema version 3 and declares two entities/tables: `records` and `logbook_events`. Work/Trip driver events are written to `logbook_events`; driver state, intents, outbox, and feature records use the `records` table. The Room migration 2→3 moves legacy `driver-event:` rows into `logbook_events`.

**Documentation discrepancy:** the older [Reliability Audit](RELIABILITY_AUDIT.md) describes an earlier baseline in which Android had one Room table and the browser had five business tables. That audit explicitly targets PR #6 and is historical. Its table inventory must not be reused as current schema evidence. Preserve it as history; this audit is the current baseline record.

### 4.2 Driver event capture and GPS evidence

The inspected PWA and Android paths use event-scoped GPS acquisition, not continuous tracking. The shared `gps-event-fix-v1` policy requires valid coordinates, horizontal accuracy no worse than 50 metres, a fix within 30 seconds of the original transition time, and rejects future fixes beyond the defined tolerance.

The Android `DriverWorkflowPlugin` obtains a bounded location request and the browser `BrowserEventLocationProvider` samples browser geolocation until an acceptable fix or the deadline. The original transition time and actual fix time are distinct. A pending intent is persisted before acquisition; event, GPS evidence, state projection/revision, terminal intent status, and outbox are committed through the authoritative transaction boundary.

**Rating: Partial.** Automated policy and recovery paths exist, but GPS is location/time evidence only. It does not establish the commercial truth of a trip, fare, payment, or collection. Physical-device GPS and lifecycle acceptance remains deferred.

### 4.3 Driver workflow persistence and replay

Inspected code shows stable command/event identity, idempotency keys, expected state/revision checks, durable pending intents, atomic completion, outbox replay, and separate PWA/Android adapters. Browser and Android tests cover representative interruption/reopen, duplicate/replay, stale/conflicting transition, and failure-boundary scenarios. The current main CI Android job includes the required Room/workflow/backup reliability gate.

**Rating: Partial-to-verified for the tested technical paths.** The inspected contract and tests provide meaningful evidence, but they do not establish every possible lifecycle/process/OS combination or physical-device acceptance. The complete test inventory and gaps will be enumerated in the next audit pass.

### 4.4 Trip financial capture

The inspected shared definitions distinguish completed-ride Fare (required, explicit zero valid) from optional Toll/Parking with independent payer selections. Cancellation Fee is a separate required closeout, with explicit zero valid and no Toll/Parking fields. Values are represented in integer paise and trip-linked obligations are created at the driver transition boundary. Application services validate and use revision-aware/idempotent submission; the Android overlay has corresponding Room-backed submission stores and instrumented tests.

**Rating: Partial for capture integrity; authoritative by business policy.** The driver/admin-entered amounts are the official business records and must be accepted for business calculations after technical validation. The app does not independently confirm customer payment or third-party expense settlement, but that is not a prerequisite under the owner's policy. Optional corroborating references may be retained if useful; absence of those references must not downgrade an authorised entry.

### 4.6 Shared forms and working copies

The shared form runtime stores working copies in the runtime's authoritative record store, uses revision-aware writes, validates declared fields, distinguishes Save from Submit, supports definition-scoped draft discovery/resume, and delegates submission to application-owned services. The current Form Conformance Audit reports Business Setup, Vehicle, Driver, Compliance, Maintenance, Loan details, Loan payment, prepayment and settlement Admin forms migrated to the shared runtime and CI-verified on the web application. Because Capacitor WebView loads the same React/JavaScript application and services, these forms use the same presentation and business-service code with RoomRecordRepository instead of Dexie. The native Android overlay is a separate Work/Trip client; cancellation-fee and completed-ride Fare/Toll/Parking forms use shared working-copy envelopes and idempotent submissions in Room.

The Form Conformance Audit also records attached overlay presentation/submission tests, live Capacitor plugin → WebView listener → React workspace refresh coverage, paired-client draft conflicts, and selected minimize/restore/recovery tests. It remains explicitly Partial: not every transition/surface/lifecycle combination is covered, and physical-device acceptance is deferred.

**Rating: Partial-to-verified for migrated form mechanics and tested Work/Trip slices.** Shared mechanics and selected end-to-end paths are strongly evidenced. The remaining gap is not that Admin forms have separate Android business logic; it is the completeness of Room-backed form acceptance, platform lifecycle combinations, actor attribution, and correction history. A working-copy or successful submission status is still not an independent record-history or actor audit.



## 4.7 Trips and driver activity

The approved Driver Workflow contract defines a manual, single-driver state machine: shift start, manual trip creation, start ride, end ride or cancel ride, and shift end. Trip creation and Start Ride are distinct events; GPS, motion or elapsed time must not create trips automatically. The Work/Trip integration contract snapshots the selected active driver, active assignment and active vehicle at shift start, then freezes that context into each trip at trip creation. Later Admin edits do not rewrite historical snapshots. The 04:00 Asia/Kolkata operational-day boundary is explicit and tests cover its persistence across a restart.

The workflow persists stable command/event IDs, expected state/revision, idempotency keys, pending intents, event-scoped GPS evidence and an outbox. The trip-history projection rebuilds from revision-ordered immutable events and deliberately preserves unmatched closes and overlapping trip anomalies as needs_attention rather than dropping them. GPS fixes are event-time location observations under the 50-metre/30-second policy; this is not continuous route tracking.

**Rating: Partial-to-verified for tested technical workflow.** The contracts, PWA parity fixture, Android instrumentation tests, restart/replay and trip-history tests provide substantial evidence for the implemented scenarios. Physical-device acceptance and the full lifecycle matrix remain outstanding. Importantly, the inspected event/trip context has transition GPS snapshots, not a continuous path or a per-trip odometer series. Shift odometer readings can support shift-level distance, but precise per-trip distance, route distance or trip fuel efficiency must not be inferred from transition GPS alone.

## 4.8 Driver, vehicle and assignment records

The inspected feature services use stable namespaced identities, strict payload validators, create-only duplicate protection, revision-checked updates, and feature-owned repositories. Vehicle registration identity is normalized before storage, preventing differently formatted duplicates. Driver identity is immutable on update. Assignment history is retained as a sequence of assignment periods; the service checks that driver and vehicle are active, prevents duplicate assignment IDs, enforces one active assignment, and checks chronological order when assigning/unassigning.

**Rating: Partial.** The core identity and relationship rules are explicit and covered by focused service tests. The feature record envelope records source channel (web, android, import, integration), but the inspected generic envelope does not itself identify the human actor. Driver identity can be represented in assignment/workflow data, but a complete actor-attribution and correction-history trace across Admin changes remains to be verified.

## 4.9 Maintenance records

The inspected Maintenance feature stores vehicle-linked service visits, itemized expenses, general vehicle expenses, odometer values, provider labels, next-service thresholds, and per-vehicle rate history. Visit totals are recalculated from integer-paise line items and validated against the stored total. Records require a known vehicle; date, amount, item identity, and rate-history ordering are validated. Submitted visits and expenses are now immutable: the previously exposed revision-checked edit service operations were removed, while per-vehicle rate history continues to append effective-dated entries.

**Rating: Partial.** Structural validation and focused tests cover totals, separate general expenses, idempotent rate changes, vehicle relationships and reminders; a new focused test asserts submitted record immutability. The provider/name/amount fields remain authorised business entries, not independently confirmed payments. Odometer readings are entered values; the inspected contract does not establish independent odometer evidence. PWA/Capacitor field-by-field persistence acceptance and actor attribution remain to be traced.

## 4.10 Loans, payments, prepayments and settlements

The Finance loan service stores the saved loan details and original deterministic EMI schedule as a revision-controlled aggregate. Saved loan details are now immutable: the Admin edit affordance was removed and the service update operation rejects mutation. Payment entries are maintained in a per-loan ledger with command identity, business date, amount, method, optional reference/note, schedule version, EMI allocations, unallocated credit, and committed status. The service validates allocations, prevents over-allocation, supports idempotent replay, and appends reversals rather than deleting original payment entries. Loan and payment ledger revisions are committed atomically for payment recording. Prepayment revisions preserve source, command, effective date, prior/current schedule versions, calculation inputs/outputs and expected revisions; settlement logic checks due EMI allocations and closes the loan atomically.

**Rating: Partial for technical integrity; authoritative by business policy.** The owner/admin-entered loan, payment, prepayment and settlement records are official business records after app validation. The method/reference fields are contextual evidence, not mandatory independent confirmation. The inspected service tests cover concurrent payment allocation, idempotency, reversal, prepayment schedule revisions, stale previews and settlement/closure; updated tests assert saved loan details cannot be edited. Android UI/bridge parity, actor attribution and complete backup/restore acceptance remain to be verified.

## 4.11 Fuel capture inventory

The current feature inventory contains no dedicated Fuel feature/service or fuel-specific schema. The owner has explicitly confirmed that Fuel records have not been added and are out of scope for this audit. The generic Maintenance vehicle-expense form is not to be repurposed as a Fuel ledger without separate product approval.

**Rating: Out of scope.** Fuel-specific data readiness and calculations are not audit defects and must not be inferred from generic expenses or GPS.

## 4.12 Shared PWA and Capacitor application path

The inspected composition root uses one React application and one shared set of JavaScript application services/form definitions. At startup, Capacitor platform detection selects RoomRecordRepository for native Android or DexieRecordRepository for browser-only PWA. Both adapters implement the same repository interfaces; the shared application services and SharedFormRuntime operate above that boundary. Record source is set to web or android. The native Android overlay is a separate native Work/Trip presentation that uses the Room-backed driver/financial stores; it is not the general Admin form UI.

**Rating: Verified at architecture/composition level; Partial for end-to-end parity.** The same Admin forms and application service contracts are composed for PWA and Capacitor WebView, while the native overlay has specific Work/Trip forms. This substantially reduces business-rule drift, but the underlying storage adapters and native overlay paths remain different implementations and require equivalent acceptance tests per event type. A successful PWA test alone does not prove Android Room behaviour.



### Cross-platform coverage matrix — initial inventory

| Capability | Browser-only PWA | Capacitor WebView | Native Android overlay | Evidence inspected / remaining gap |
|---|---|---|---|---|
| Shared Admin forms and feature services | Shared React/JavaScript application, SharedFormRuntime and Dexie | Same React/JavaScript application, SharedFormRuntime and services, RoomRecordRepository bridge | Not the Admin presentation surface | Form Conformance Audit reports current Admin forms migrated and web-CI verified. Same JS path is used in WebView; per-feature Room-backed end-to-end/lifecycle acceptance remains partial. |
| Shift/trip workflow | Browser workflow adapter + IndexedDB | Same shared application layer with Room-backed native storage | Native Kotlin workflow store + Room | Browser and Android tests use the shared parity fixture and cover selected interruption/reopen/process-death paths. Complete lifecycle and physical-device matrix remains. |
| Fare/toll/parking closeout | Shared form/service over Dexie | Shared form/service over Room | Native trip financial store over same Room database | Browser service tests, Android Room store tests, attached overlay form tests, live Capacitor bridge refresh and paired WebView/overlay visibility exist. A complete differential PWA-vs-Android field-by-field scenario matrix is not demonstrated. |
| Driver/vehicle/assignment | Shared feature services/forms over Dexie | Same feature services/forms over Room | Admin form not in native overlay; records visible through Room | Service tests and browser/native backup validators exist. Room-backed form path uses shared JS; complete per-feature Android lifecycle acceptance remains. |
| Maintenance | Shared feature service/form over Dexie | Same shared feature service/form over Room | Admin form not in native overlay | Service tests and browser/native backup validation exist; physical-device and full lifecycle acceptance remain. |
| Loans/payments/prepayments/settlements | Shared Finance services/forms over Dexie | Same JavaScript Finance services/forms over Room | Admin form not in native overlay | Service-level tests plus browser/native backup validators exist; full Room-backed lifecycle and correction acceptance remains partial. |

The architecture reuses the same JavaScript business services and form definitions for PWA and Capacitor WebView, which reduces duplicate business logic. It does not eliminate the need to test the Dexie and Room adapters separately. The native overlay is an additional Work/Trip client with its own Kotlin presentation/store paths; tests that prove two Room clients see the same record do not by themselves prove browser-to-Android equivalence. See [Form Conformance Audit](FORM_CONFORMANCE_AUDIT.md) for the current detailed form implementation/acceptance record; this audit records the data-reliability implications rather than replacing that contract audit.

### Canonical field-level parity matrix — shared PWA/Capacitor WebView definitions

These are the shared JavaScript form field IDs in the current definitions. The PWA and Capacitor WebView consume the same definitions and validation/service code, so their JS-level field sets are identical. This confirms schema/form-definition parity, **not** complete Dexie-versus-Room persistence parity; the latter remains an acceptance gap.

| Form / event | Canonical field IDs (business inputs; internal IDs/revisions omitted) | PWA vs Capacitor WebView | Acceptance status |
|---|---|---|---|
| Business Setup | `businessStartDate` | Same shared form/service | JS-level field parity verified; update/history impact is configuration-level and still under assessment. |
| Vehicle | `registrationNumber`, `make`, `model`, `vehicleType`, `fuelType`, `yearOfManufacture`, `ownership`, `lifecycleState` | Same shared form/service | JS-level field parity verified; normalized identity and backup validation exist; full adapter differential acceptance partial. |
| Driver profile | `name`, `licenceNumber`, `licenceExpiryDate`, `mobileNumber`, `lifecycleState`, `selectedForWork` | Same shared form/service | JS-level field parity verified; selected Work driver/assignment invariants and backup validation exist; full adapter differential acceptance partial. |
| Compliance | `vehicleId`, `complianceName`, `validFrom`, `validTo`, `totalCostPaise`, `supportingDocumentRef`, `renewedFromRecordId` | Same shared form/service | JS-level field parity verified; renewal appends linked record; browser/native participant validation exists; complete lifecycle acceptance partial. |
| Maintenance visit | `vehicleId`, `maintenanceDate`, `maintenanceType`, `description`, `itemsJson`, `odometerKm`, `provider`, `nextServiceDate`, `nextServiceKm` | Same shared form/service | JS-level field parity verified; total recomputation and immutability tests exist; adapter differential acceptance partial. |
| Maintenance expense | `vehicleId`, `expenseDate`, `expenseName`, `description`, `amountPaise`, `odometerKm`, `provider` | Same shared form/service | JS-level field parity verified; submitted records immutable; adapter differential acceptance partial. |
| Maintenance rate | `vehicleId`, `ratePaisePerKm` (service adds effective date, command identity and source) | Same shared form/service | JS-level field parity verified; append-only effective-date history/idempotency tested. |
| Loan details | `vehicleId`, `loanName`, `lenderName`, `loanAccountReference`, `principalPaise`, `annualInterestRateBasisPoints`, `loanStartDate`, `tenureMonths`, `firstEmiDate` | Same shared form/service | JS-level field parity verified; saved details immutable; adapter differential acceptance partial. |
| Loan payment | `loanId`, `businessDate`, `amountPaise`, `method`, `scheduleVersion`, `allocationsJson`, `reference`, `note` | Same shared form/service | JS-level field parity verified; ledger allocation/idempotency tests exist; adapter differential acceptance partial. |
| Loan prepayment | `loanId`, `businessDate`, `amountPaise`, `mode` (preview payload is service-generated) | Same shared form/service | JS-level field parity verified; schedule preview/revision tests exist; adapter differential acceptance partial. |
| Loan settlement | `loanId`, `businessDate`, `method`, `reference` (preview payload is service-generated) | Same shared form/service | JS-level field parity verified; closure/ledger tests exist; adapter differential acceptance partial. |
| Trip cancellation fee | `tripId`, `cancellationFeePaise` | Shared PWA/WebView form/service; native overlay has its own Kotlin form/store | Canonical field IDs and integer-paise semantics are shared; Room bridge/backup tests exist; full differential payload acceptance partial. |
| Completed-trip Fare/Toll/Parking | `tripId`, `farePaise`, `tollPaise`, `tollPayer`, `parkingPaise`, `parkingPayer` | Shared PWA/WebView form/service; native overlay has its own Kotlin form/store | Same named business inputs are reflected in overlay contracts; paired Room surface and stale-submission tests exist; exhaustive PWA-vs-native field/value differential acceptance remains partial. |

Optional Toll/Parking amounts and payer fields are conditionally applicable; Fare and Cancellation Fee are integer-paise authoritative entries. No separate customer-collection field is present or required by owner policy.

## 4.13 Persistence, backup and recovery coverage

The browser repository performs compare-and-set batches inside a Dexie read/write transaction. The Android RoomStore plugin performs revision-checked writes and batches inside Room transactions. Android Room uses multi-instance invalidation for WebView/overlay clients. The inspected driver and completed-trip financial tests cover persistent Room reopen, paired WebView/overlay visibility, stale competing drafts, and native backup/restore. PWA tests cover IndexedDB reopen/recovery, and browser backup participants validate Business Setup, driver/assignment, vehicle, Compliance renewal links, Maintenance and Finance relationships. Android backup participants and tests cover driver, vehicle, Compliance, Maintenance, loan/payment and prepayment records. These are useful safeguards against silent loss and malformed restores.

Additional inspected acceptance tests materially strengthen the baseline:

- The Android process-restart instrumentation test is designed to run preparation and recovery in separate instrumentation invocations, with target/test packages force-stopped between them. This tests actual process death and startup recovery on the CI emulator, not only closing/reopening a Room instance.
- The Capacitor bridge instrumentation test exercises a Room-backed native overlay draft update through the actual Capacitor plugin, WebView listener and rendered React workspace refresh. It verifies the UI refresh path, not only database visibility.
- The Android trip-financial store test verifies persistent Room reopen, native backup/restore, WebView/overlay shared Room visibility, and stale overlay submission not overwriting a newer WebView draft.
- The PWA driver workflow tests exercise IndexedDB reopen, pending-intent recovery, event/outbox replay and state consistency. The PWA backup recovery tests inject interrupted export/restore failures and verify rollback/current-data preservation.
- PWA and Android driver workflow tests independently execute the same shared parity fixture. This is useful cross-platform contract evidence, though it is not a single live differential test that runs both platform adapters against the same captured operation and compares every persisted field.

The Android process-death evidence is emulator instrumentation only; it does not replace physical-device/OEM testing. The Capacitor bridge test covers a completed-trip financial working-copy refresh, not every Admin form or every financial submission path.

**Rating: Partial-to-verified for the tested storage and backup paths.** Automated tests demonstrate selected transaction, reopen, recovery, relationship validation and backup round trips. They do not prove every process-kill timing, Android OEM behaviour, browser eviction condition, live Dropbox connection, or physical-phone lifecycle. The user-facing backup and restore flows still need a complete cross-platform acceptance matrix.

### Backup/restore failure acceptance matrix — evidence-based status

| Scenario | PWA (Dexie) | Capacitor/Android (Room) | Status / remaining acceptance |
|---|---|---|---|
| Snapshot consistency, record counts, participant ownership and schema validation | Transaction-bound snapshot and participant validators; persistence and backup tests | Room snapshot builder, participant manifest and validation in BackupPlugin/NativeBackupCoverage | Automated contract coverage exists; complete per-feature relationship edge cases remain partial. |
| Encrypted package creation and recovery-key/passphrase decryption | Shared encryption package and crypto tests | Shared package through native Backup plugin and Android key vault | Crypto round-trip, wrong-key and tamper tests exist; end-to-end Dropbox upload/download with live OAuth is not CI-verified. |
| Restore requires explicit confirmation and decrypts/validates before mutating store | Enforced in browser restore API; tests reject unconfirmed and malformed snapshots | Enforced in native BackupPlugin; validates package/manifest/records before checkpoint/replace | Contract verified by implementation and tests; UI acceptance across live connected accounts remains partial. |
| Pre-replacement recovery checkpoint and replace | Browser checkpoint, transactional replacement and rollback | Room snapshot checkpoint plus restore journal/checkpoint rows | Implemented; PWA checkpoint retention and native plugin flow covered by selected tests. |
| Injected restore failure during record replacement | PWA backup snapshot tests inject interrupted feature restore and verify original dataset recovered | NativeBackupCoverageTest injects failure during feature-owned Room replacement and verifies rollback | Automated failure-injection evidence exists for both stores; exact every-phase interruption is not covered. |
| Process death during restore / startup reconciliation | Pending browser checkpoints are recovered on startup; browser interruption tests cover restore rollback | Native startup gate reconciles unverified restore journals; separate process-death tests exist for Work, but not every restore journal phase | Partial: restore-specific force-stop-at-each-phase acceptance remains outstanding. |
| Post-restore full data verification | Snapshot equality and counts verified before checkpoint status advances | Canonical records/counts compared after Room replacement | Implemented; adversarial per-feature/large-data acceptance remains partial. |
| User-initiated rollback after a restore | Browser checkpoint rollback and rollback verification tests | Native BackupPlugin rollback checkpoint operation | Implementation exists; native end-to-end UI rollback acceptance remains partial. |
| Mark restored workspace verified and discard checkpoint | Browser state machine requires verified before discard; tests cover lifecycle | Native journal status guard requires restored_unverified then verified before discard | Implementation and selected tests exist; end-to-end UI test across Android process restart remains partial. |
| Dropbox history/upload/download and OAuth | PWA app-open manual backup; no reliable browser background scheduling | OAuth bridge, encrypted upload/download and best-effort daily WorkManager schedule | No live Dropbox account integration CI or physical Android scheduler/OEM acceptance; user-visible workflow remains partially accepted. |
| Network interruption, token expiry/revocation, quota, battery policy, browser eviction | Manual PWA workflow and credential vault paths exist | Native OAuth and best-effort scheduler paths exist | Not fully failure-injected across platform and external-service conditions; requires controlled acceptance, not code inference. |

This matrix shows meaningful rollback/recovery safeguards, but “complete” acceptance is not yet met. The remaining test gap is concentrated in restore-specific process-kill timing, live Dropbox/network/token conditions, and physical Android scheduler/OEM behaviour—not in the existence of a checkpoint/rollback mechanism.

## 4.14 Provenance and actor attribution

The shared RecordEnvelope stores source channel (web, android, import, integration), creation/update timestamps, optional business date, revision, and payload. This is platform provenance, not necessarily authenticated human identity. Driver workflow events carry driver context; generic Admin feature records inspected so far do not consistently carry an explicit actor ID in the envelope. The audit must trace the existing authenticated account/session boundary and determine what actor attribution is already available before proposing any new fields.

**Rating: Partial / Unknown by feature.** For the narrow correction exception below, actor identity and correction reason must be traceable. Do not add generic actor fields until the authentication/session and privacy contracts have been checked.

## 4.15 Finance contract governance

The implemented loan payment ledger supports payment allocation, unallocated credit, reversals and settlements. However, the inspected FINANCE_LOAN_PAYMENT_WORKFLOW_CONTRACT.md still labels its v1 allocation policy as a proposed draft that is not formally ratified. The implementation and its tests are therefore ahead of the normative policy status. This does not prove the code is wrong, but it is a contract-governance gap that must be reconciled before treating every payment-allocation behaviour as an approved business rule.

**Rating: Partial.** Preserve existing runtime behaviour during the audit; reconcile the implemented behaviour against the owner's approved Finance policy and update the contract through normal approval rather than silently assuming the draft is ratified.

## 4.16 Historical record immutability and permitted driver corrections

Owner-approved operating rule clarified during this audit:

- Historical business records must not be edited or deleted in a way that silently changes history.
- The only permitted edit exception is correction of a driver-entered mistake.
- A correction must preserve the prior value and a trace of the correction; it must not erase the original entry or its business-event identity.
- Reversal workflows that append a compensating entry and retain the original (for example, Finance payment reversal) are not deletion and should remain available where contractually approved.
- Setup/profile changes may be assessed separately when they do not rewrite historical snapshots or transaction records; do not confuse these with editing historical business events.

The shared FeatureRecordService update path reads the current record, checks expectedRevision, then compare-and-sets a replacement envelope with revision + 1; the generic path itself does not append prior payloads to a revision-history collection. The audit confirmed that MaintenanceService exposed editVisit/editExpense operations for submitted visit/expense records despite no history-edit UI. Those service methods have now been removed and the focused service test updated to assert immutable records. The Loan Admin UI exposed an Edit details affordance and FinanceLoanService accepted saved-loan updates; both the UI affordance and service mutation behavior have now been disabled, with tests asserting the immutable loan record. Driver and Vehicle Admin profile edits update only the master/profile record; existing contracts snapshot driver/vehicle context into shifts/trips, so later profile changes do not rewrite prior snapshots. These are safe for past trip history, though they affect future context. Finance payments remain append-only with explicit reversal entries; driver workflow events remain immutable.

**Rating: Partial — historical edit paths in Maintenance and Loan details fixed; broader mutation/deletion compatibility audit remains.** Revision checks prevent stale writes but do not preserve old values. Next, inventory every remaining UI affordance and service/API mutation route, distinguish setup/profile maintenance from historical business-event editing, and preserve only the driver-entry correction exception. No delete path for historical business records is permitted. Any permitted correction path must be tested for original-value retention, actor attribution, reason, idempotency, and backup/restore.

### User-facing mutation surface inventory (inspected paths)

- **Work/Trip:** the inspected driver-facing workflow and financial closeout screens expose submit/transition actions, not edit/delete actions for completed business events. In-progress form drafts remain editable under the shared form contract; that is not a submitted historical record.
- **Timeline:** the registered Timeline presentation is read-only; no edit/delete control was found in the inspected screen.
- **Vehicle and Driver Admin profiles:** Edit controls remain for master/profile records. The Work/Trip contracts snapshot vehicle/driver context at shift/trip boundaries, so profile edits do not rewrite prior trip snapshots. These are not historical event corrections.
- **Business Setup:** the business-start-date singleton can be updated as configuration. The inspected form contract explicitly leaves Finance/Compliance historical dates independent of this setting; no business-event rewrite path was found in the inspected composition.
- **Compliance:** renewal is recorded as a new linked record; the service documents and enforces immutable prior coverage.
- **Maintenance:** no history edit UI was found; the underlying visit/expense edit service operations have now been removed.
- **Loan details:** the saved-record edit affordance and service update behavior have now been disabled. The shared form submission handler also rejects legacy drafts carrying `_recordRevision`, preventing hidden edit wiring from mutating or accidentally duplicating a saved loan.
- **Finance payment reversal:** reversal is an appended compensating ledger entry that retains the original payment, not deletion.
- **Infrastructure deletion:** repository `remove` and feature-upgrade batch-delete operations exist for storage cleanup, working-copy lifecycle, restore/reset, and migration coordination. These are not user-facing business-record delete controls; each call site's target ownership still needs verification.
- **Legacy envelope marker:** `RecordEnvelope.deletedAt` remains an optional accepted field and the historical Dexie schema retains a deletedAt index. No setter/consumer was identified in the inspected source paths. Do not remove it from the schema until legacy-data compatibility and all consumers are exhaustively verified.

This inventory is limited to the inspected Work, registered Timeline, and Admin surfaces/services. The permitted driver-entry correction path itself is not implemented or acceptance-verified yet; do not silently enable post-submit editing until its append-only correction semantics, actor/reason trace, and recovery behaviour are designed and tested.

## 5. Authoritative business-entry policy and initial gaps

The owner has clarified that authorised driver/admin entries are authoritative business records. Driver-entered Fare, Toll, Parking and Cancellation Fee amounts are accepted as authoritative business entries after technical validation; independent third-party proof is not required. There is no separate customer-collection feature, and fuel records have not been implemented. Customer-collection-specific and fuel-record-specific calculations are explicitly out of scope for this audit; do not report those intentionally absent features as defects.

The reliability requirement is therefore to establish that the entry:

- Came through an authorised capture path and, where applicable, identifies the responsible driver/admin.
- Passed the owning feature's field, money/date, identity, and relationship validation.
- Was committed to the authoritative local store and can be recovered/replayed safely.
- Was not silently overwritten by a duplicate or competing PWA/Android submission.
- Retains enough history to explain corrections, reversals, and the current value.

Optional corroboration (receipt/reference/payment reference) can add context, but it is not a gate. GPS is a separate system-observed location/time signal; it is not needed to prove a driver-entered fare or expense. The advisor may use authoritative, technically validated entries while being transparent that they are owner/driver-entered business records rather than independently confirmed third-party events.

The initial gap is not that independent corroboration is missing. The remaining audit must determine whether actor attribution, source channel, correction history, auditability, validation, platform parity, and recovery are sufficiently implemented for each feature. Do not add generic verification flags or demand external evidence as a shortcut.



### Initial intelligence eligibility matrix

This is an initial source-readiness assessment for existing captured records only. It does not approve new metrics or formulas. Customer-collection and fuel-specific measures are excluded because those features/data are intentionally absent.

| Business question / measure | Current source | Initial eligibility | Limitation to disclose |
|---|---|---|---|
| Trip count and trip duration | Immutable Work events and transition timestamps | **Eligible for tested, internally consistent trip records** | Unmatched/overlapping events must remain visible as needs-attention; physical-device timing acceptance remains separate. |
| Recorded trip Fare | Required completed-trip Fare entry | **Eligible as authoritative recorded Fare** | It represents the entered fare amount; no separate collection feature exists. |
| Customer charge including Toll/Parking | Fare plus customer-paid Toll/Parking payer fields | **Eligible as recorded customer charge** | This is a calculated charge, not a separate collection record. |
| Recorded driver Toll/Parking expense | Trip-linked amount and payer fields | **Eligible as authoritative recorded expense** | Accepted as driver-entered business entry; third-party settlement proof is not required. |
| Recorded Cancellation Fee | Required cancellation-fee entry | **Eligible as authoritative recorded Cancellation Fee** | Explicit zero is valid; this is not Fare and does not create a completed ride. |
| Maintenance cost by vehicle | Vehicle-linked visits and general expense records | **Eligible as recorded maintenance expense** | Values are authoritative entries after validation; submitted visit/expense edits have been disabled. No independent payment proof is required. |
| Scheduled EMI and amortization | Versioned loan calculation schedule | **Eligible as deterministic schedule output** | It is an app calculation from entered loan inputs, not a lender statement. |
| Recorded Fare totals by period/vehicle | Submitted completed-trip Fare entries | **Eligible as authoritative recorded Fare totals** | Label as recorded Fare, not cash collected or net income. |
| Compliance cost by vehicle/coverage type | Vehicle-linked immutable Compliance records and cost | **Eligible as recorded compliance expense** | Amount/date are authoritative entries, not independently confirmed payments. |
| EMI payment status / paid amount by installment | Payment ledger allocations linked to schedule version and installment number | **Conditionally eligible from recorded allocations** | Unallocated credit is not an EMI payment; reversals must be netted and allocation policy contract reconciled. |
| Total recorded loan payments net of reversals | Append-only payment ledger, settlement entries and reversal entries | **Eligible as recorded Finance totals** | This reflects entries in the app ledger; actual lender posting is not independently checked.
| Recorded loan payments / reversals | Finance payment ledger and allocations | **Eligible as recorded Finance history** | Payment method/reference is entered context; actual lender posting is not independently checked. Payment-allocation policy contract remains proposed/unratified. |
| Prepayment impact on EMI schedule/interest/tenure | Immutable prepayment revisions with deterministic inputs/outputs | **Eligible as app-calculated prepayment impact** | Depends on the recorded base loan schedule and prepayment entries; not lender-confirmed. |
| Final settlement amount and loan closure | Append-only settlement entry plus closed loan lifecycle state | **Eligible as recorded settlement/closure** | Settlement amount is the app's computed/recorded amount; external lender closure confirmation is not represented.
| Remaining scheduled loan obligations | Schedule versions plus payment/prepayment history | **Conditionally eligible as app-calculated position** | Must be labelled calculated from recorded entries, not lender-confirmed outstanding balance; reconcile contract status first. |
| Fuel volume, fuel spend by fuel category, price/litre, consumption or fuel efficiency | No dedicated fuel records | **Out of scope for this audit** | Fuel capture has not been implemented; do not infer fuel from free-text expenses. |
| Customer collection amount/status | No separate collection feature | **Out of scope for this audit** | Fare is authoritative as entered, but there is no separate collection event/field. |
| Whole-vehicle profitability | Would require approved metric definition and presently absent fuel/collection-specific records | **Out of scope for this audit's current-record eligibility pass** | Do not claim complete vehicle profitability from partial totals. |

The advisor may provide scoped insights from eligible inputs, but must state the scope and avoid presenting incomplete subtotals as net profit.
## 6. Remaining audit work

| Work item | Scope | Status |
|---|---|---|
| A. Architecture and authority map | Trace PWA, Android WebView, overlay, shared application services, adapters and durable stores | Partial — shared React/services and Dexie/Room split verified; remaining feature map and actor provenance remain |
| B. Driver workflow evidence | Trips, shift transitions, GPS, event identity, context, recovery and history | Partial — state machine, immutable snapshots, event GPS, parity/restart and anomaly-preserving history inspected; per-trip distance and physical acceptance remain limited |
| C. Financial business events | Fare, Toll, Parking, Cancellation Fee, Maintenance, Loans, payments, prepayments and settlements | Partial — current authoritative entries and Finance history inventoried; separate collection and fuel-specific records are intentionally out of scope, not defects |
| D. Form capture quality | Definitions, validation, draft persistence, submission idempotency, permitted driver-entry correction and history retention | Partial — shared runtime and selected forms verified; submitted Maintenance/Loan edits disabled; complete correction-path and actor/reason acceptance remains |
| E. Cross-platform equivalence | Equivalent PWA, Capacitor WebView and native overlay operations and canonical outputs | Partial — shared React/application path, Dexie/Room split, driver parity fixture and selected financial tests exist; full field-by-field per-event differential matrix remains |
| F. Durability and recovery | Failure injection, process recreation, migrations, backup/restore and replay | Partial — selected Dexie/Room transaction, process-restart, backup round-trip and injected browser restore-failure tests inspected; full acceptance matrix across platforms and lifecycle combinations remains |
| G. Record policy and provenance | Authoritative entry policy, actor attribution, correction retention, and deletion-path audit | Partial — two mutation paths fixed; profile/config updates are distinct from historical events; actor attribution remains unresolved; internal repository deletion and legacy deletedAt compatibility need complete call-site/data review |
| H. Intelligence eligibility | Existing-record data sufficiency, deterministic calculation inputs/outputs and traceability | Partial — initial eligibility matrix is complete for the in-scope record types; Finance payment-allocation contract governance and final source-to-metric trace remain |

## 7. Audit rules and next sequence

1. Finish the mutation-path and source-of-truth inventory across all in-scope feature records, including user-facing controls and service/API paths.
2. For each in-scope business event, record capture surface, authoritative command/service, authoritative store, required fields, source/provenance, recovery, correction path, and calculation eligibility.
3. Build equivalent PWA/Capacitor fixtures for high-value events and compare canonical business outputs field by field, not merely UI success.
4. Confirm authorised driver/admin entries are authoritative and technically validated for fields, identity, relationships, revisions, and durable commits.
5. Verify the permitted driver-entry correction semantics: original retained, correction actor/reason traced, idempotent, and recoverable. Do not enable post-submit edit until this is verified.
6. Complete the failure/recovery and backup/restore acceptance matrix across PWA, Capacitor Room-backed WebView, and native overlay where applicable.
7. Finish source-to-calculation eligibility trace for existing records and reconcile the Finance payment-allocation contract status. Separate customer collection and fuel features remain out of scope.
8. Only after evidence and product-owner approval, implement the smallest validated remaining gaps.
9. Keep physical-device and real-world operational acceptance distinct from CI/emulator evidence.

Do not weaken existing transaction, persistence, privacy, GPS, form, or platform acceptance contracts to satisfy this audit. Do not change business rules or calculations as part of evidence classification without separate approval.

## 8. Change history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-11-11 | Initial baseline architecture and business-event evidence review at main commit `f766725`. |
| 0.2 | 2026-11-11 | Clarify owner policy: authorised driver/admin entries are authoritative; technical validation is distinct from optional independent corroboration. Add driver/vehicle, maintenance and finance feature inventory findings. |
| 0.3 | 2026-11-11 | Trace shared PWA/Capacitor composition, Dexie/Room transaction paths, selected backup/restore tests, actor provenance gap, and Finance payment-contract governance mismatch. |
| 0.4 | 2026-11-11 | Identify that Work/Trip stores Fare but no separate customer-collection record in the inspected schema; distinguish generic Maintenance expense capture from a dedicated Fuel ledger. |
| 0.5 | 2026-11-11 | Extend Trips/driver activity review: immutable driver/vehicle snapshots, event GPS, manual state machine, anomaly-preserving history, and limits on per-trip distance inference. |
| 0.6 | 2026-11-11 | Identify that generic feature updates increment revisions but replace the prior payload; contrast this with immutable Work events and append-only Finance payment/reversal history. |
| 0.7 | 2026-11-11 | Add the initial PWA, Capacitor WebView, and native overlay coverage matrix; distinguish shared business services from storage-adapter and cross-client acceptance evidence. |
| 0.8 | 2026-11-11 | Add an initial intelligence eligibility matrix separating recorded Fare from collection, generic fuel spend from structured fuel data, and schedule calculations from lender-confirmed balances. |
| 0.9 | 2026-11-11 | Deepen recovery/parity evidence: confirm Android force-stop process-restart test, actual Capacitor bridge-to-rendered-workspace test, Room paired-surface financial tests, and PWA failure-injected backup recovery. |
| 1.0 | 2026-11-11 | Reconcile the feature inventory with the current Form Conformance Audit: all current Admin forms use the shared runtime; the same React/JavaScript path runs in Capacitor WebView, while the native overlay is a separate Work/Trip client. |
| 1.1 | 2026-11-11 | Clarify historical immutability policy and scope exclusions; remove submitted Maintenance visit/expense edits and saved Loan details edit UI/service behavior, with focused tests. |
| 1.2 | 2026-11-11 | Inventory user-facing Work/Timeline/Admin mutation surfaces; distinguish profile/config updates and append-only reversals from historical edits; note legacy deletedAt and internal repository removal compatibility items. |
| 1.3 | 2026-11-11 | Remove hidden Loan edit submission wiring; reject legacy loan edit drafts; clarify that Driver/Vehicle profile changes do not rewrite trip snapshots. |
| 1.4 | 2026-11-11 | Expand calculation eligibility for recorded Fare totals, compliance costs, EMI allocations, payment totals, prepayment impact, and settlement/closure; keep customer collection and fuel excluded. |
| 1.5 | 2026-11-11 | Add evidence-based PWA/Room backup and restore failure matrix; distinguish injected rollback tests from outstanding restore-phase process-death, live Dropbox and physical scheduler acceptance. |

**Current conclusion:** Sam Travels has a substantial local-first capture foundation. Authorised driver/admin entries are authoritative by business policy; the audit must verify technical integrity, actor attribution, the permitted driver-entry correction path, platform parity and recovery. Separate customer collection and fuel records are intentionally absent and excluded from this audit. Independent third-party corroboration is optional, not a condition for business acceptance. The full reliability audit remains in progress.
