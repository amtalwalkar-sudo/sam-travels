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

The shared form runtime stores working copies in the runtime's authoritative record store, uses revision-aware writes, validates declared fields, and delegates submission to application-owned services. PWA and Android overlay paths exist for the inspected Work/Trip financial forms.

**Rating: Partial.** This supports consistent capture and recovery, but a working-copy or successful submission status is not a business verification status. A crash between domain submission and working-copy status update must remain safe through operation idempotency; exact coverage across every form and lifecycle remains to be audited.



## 4.7 Trips and driver activity

The approved Driver Workflow contract defines a manual, single-driver state machine: shift start, manual trip creation, start ride, end ride or cancel ride, and shift end. Trip creation and Start Ride are distinct events; GPS, motion or elapsed time must not create trips automatically. The Work/Trip integration contract snapshots the selected active driver, active assignment and active vehicle at shift start, then freezes that context into each trip at trip creation. Later Admin edits do not rewrite historical snapshots. The 04:00 Asia/Kolkata operational-day boundary is explicit and tests cover its persistence across a restart.

The workflow persists stable command/event IDs, expected state/revision, idempotency keys, pending intents, event-scoped GPS evidence and an outbox. The trip-history projection rebuilds from revision-ordered immutable events and deliberately preserves unmatched closes and overlapping trip anomalies as needs_attention rather than dropping them. GPS fixes are event-time location observations under the 50-metre/30-second policy; this is not continuous route tracking.

**Rating: Partial-to-verified for tested technical workflow.** The contracts, PWA parity fixture, Android instrumentation tests, restart/replay and trip-history tests provide substantial evidence for the implemented scenarios. Physical-device acceptance and the full lifecycle matrix remain outstanding. Importantly, the inspected event/trip context has transition GPS snapshots, not a continuous path or a per-trip odometer series. Shift odometer readings can support shift-level distance, but precise per-trip distance, route distance or trip fuel efficiency must not be inferred from transition GPS alone.

## 4.8 Driver, vehicle and assignment records

The inspected feature services use stable namespaced identities, strict payload validators, create-only duplicate protection, revision-checked updates, and feature-owned repositories. Vehicle registration identity is normalized before storage, preventing differently formatted duplicates. Driver identity is immutable on update. Assignment history is retained as a sequence of assignment periods; the service checks that driver and vehicle are active, prevents duplicate assignment IDs, enforces one active assignment, and checks chronological order when assigning/unassigning.

**Rating: Partial.** The core identity and relationship rules are explicit and covered by focused service tests. The feature record envelope records source channel (web, android, import, integration), but the inspected generic envelope does not itself identify the human actor. Driver identity can be represented in assignment/workflow data, but a complete actor-attribution and correction-history trace across Admin changes remains to be verified.

## 4.9 Maintenance records

The inspected Maintenance feature stores vehicle-linked service visits, itemized expenses, general vehicle expenses, odometer values, provider labels, next-service thresholds, and per-vehicle rate history. Visit totals are recalculated from integer-paise line items and validated against the stored total. Records require a known vehicle; date, amount, item identity, and rate-history ordering are validated. The service supports revision-checked edits and derives actual expense totals from visit and expense records.

**Rating: Partial.** The feature has meaningful structural validation and focused tests for edits, totals, separate general expenses, idempotent rate changes, vehicle relationships, and reminders. The provider/name/amount fields remain authorised business entries, not independently confirmed payments. Odometer readings are entered values; the inspected contract does not establish independent odometer evidence. PWA/Android form and backup parity, actor attribution, and complete correction audit remain to be traced.

## 4.10 Loans, payments, prepayments and settlements

The inspected Finance loan service stores loan details and versioned EMI schedule history in a revision-controlled loan aggregate. Schedule versions preserve calculation ID/version and inputs/outputs. Payment entries are maintained in a per-loan ledger with command identity, business date, amount, method, optional reference/note, schedule version, EMI allocations, unallocated credit, and committed status. The service validates allocations, prevents over-allocation, supports idempotent replay, and appends reversals rather than deleting original payment entries. Loan and payment ledger revisions are committed atomically for payment recording. Prepayment revisions preserve source, command, effective date, prior/current schedule versions, calculation inputs/outputs and expected revisions; settlement logic checks due EMI allocations and closes the loan atomically.

**Rating: Partial for technical integrity; authoritative by business policy.** The owner/admin-entered loan, payment, prepayment and settlement records are official business records after app validation. The method/reference fields are contextual evidence, not mandatory independent confirmation. The inspected service tests cover concurrent payment allocation, idempotency, reversal, prepayment schedule revisions, stale previews and settlement/closure. Android UI/bridge parity, actor attribution, backup/restore completeness and edit/correction history still need end-to-end verification.

## 4.11 Fuel capture inventory

The current feature inventory contains no dedicated Fuel feature/service, fuel-specific schema, or fuel-specific application service/test suite. However, the Maintenance feature does provide a general vehicle-expense form with free-text expense name/description, amount, date, optional odometer and provider; a driver/admin could therefore record a fuel purchase as a generic vehicle expense. The inspected form does not capture fuel quantity/litres, unit price, fuel type per purchase, station, or a structured fuel transaction category. It should not be treated as a complete fuel ledger without explicit mapping and product approval.

**Rating: Partial for generic amount capture; Unknown for fuel-specific data readiness.** Fuel spend may be recorded as a generic expense, but fuel volume and purchase-level details needed for consumption, price-per-litre, mileage and fuel-efficiency analysis are not represented in the inspected schema. Do not infer them from expense amount or GPS.

## 4.12 Shared PWA and Capacitor application path

The inspected composition root uses one React application and one shared set of JavaScript application services/form definitions. At startup, Capacitor platform detection selects RoomRecordRepository for native Android or DexieRecordRepository for browser-only PWA. Both adapters implement the same repository interfaces; the shared application services and SharedFormRuntime operate above that boundary. Record source is set to web or android. The native Android overlay is a separate native Work/Trip presentation that uses the Room-backed driver/financial stores; it is not the general Admin form UI.

**Rating: Verified at architecture/composition level; Partial for end-to-end parity.** The same Admin forms and application service contracts are composed for PWA and Capacitor WebView, while the native overlay has specific Work/Trip forms. This substantially reduces business-rule drift, but the underlying storage adapters and native overlay paths remain different implementations and require equivalent acceptance tests per event type. A successful PWA test alone does not prove Android Room behaviour.



### Cross-platform coverage matrix — initial inventory

| Capability | Browser-only PWA | Capacitor WebView | Native Android overlay | Evidence inspected / remaining gap |
|---|---|---|---|---|
| Shared Admin forms and feature services | Shared React/JavaScript application and Dexie | Same React/JavaScript application and services, RoomRecordRepository bridge | Not the Admin presentation surface | Composition path verified. Full end-to-end Room-backed submission tests for every Admin feature remain to be mapped. |
| Shift/trip workflow | Browser workflow adapter + IndexedDB | Same shared application layer with Room-backed native storage | Native Kotlin workflow store + Room | Browser and Android tests use the shared parity fixture and cover selected interruption/reopen paths. Complete lifecycle and physical-device matrix remains. |
| Fare/toll/parking closeout | Shared form/service over Dexie | Shared form/service over Room | Native trip financial store over same Room database | Browser service tests, Android Room store tests, paired WebView/overlay visibility and selected backup tests exist. A single canonical PWA-vs-Android output comparison for all financial scenarios is not yet demonstrated. |
| Driver/vehicle/assignment | Shared feature services over Dexie | Shared feature services over Room | Admin form not in native overlay; data visible through Room | Service and backup validators exist on both storage implementations. Full platform submission parity remains. |
| Maintenance | Shared feature service/form over Dexie | Shared feature service/form over Room | Admin form not in native overlay | Service tests and browser/native backup validation exist. Full Android WebView form-submission/recovery acceptance remains. |
| Loans/payments/prepayments/settlements | Shared Finance services/forms over Dexie | Same JavaScript Finance services/forms over Room | Admin form not in native overlay | Service-level tests plus browser/native backup validators exist. Full Android Room-backed form submission and correction/recovery acceptance remains. |

The architecture reuses the same JavaScript business services for PWA and Capacitor WebView, which reduces duplicate business logic. It does not eliminate the need to test the Dexie and Room adapters separately. The native overlay is an additional Work/Trip client with its own Kotlin presentation/store paths; tests that prove two Room clients see the same record do not by themselves prove browser-to-Android equivalence.

## 4.13 Persistence, backup and recovery coverage

The browser repository performs compare-and-set batches inside a Dexie read/write transaction. The Android RoomStore plugin performs revision-checked writes and batches inside Room transactions. Android Room uses multi-instance invalidation for WebView/overlay clients. The inspected driver and completed-trip financial tests cover persistent Room reopen, paired WebView/overlay visibility, stale competing drafts, and native backup/restore. PWA tests cover IndexedDB reopen/recovery, and browser backup participants validate driver/assignment, vehicle, maintenance and finance relationships. Android backup participants and tests cover driver, vehicle, maintenance, loan/payment and prepayment records. These are useful safeguards against silent loss and malformed restores.

**Rating: Partial-to-verified for the tested storage and backup paths.** Automated tests demonstrate selected transaction, reopen, recovery, relationship validation and backup round trips. They do not prove every process-kill timing, Android OEM behaviour, browser eviction condition, live Dropbox connection, or physical-phone lifecycle. The user-facing backup and restore flows still need a complete cross-platform acceptance matrix.

## 4.14 Provenance and actor attribution

The shared RecordEnvelope stores source channel (web, android, import, integration), creation/update timestamps, optional business date, revision, and payload. This is useful platform provenance, but it is not by itself an authenticated human-actor identity. Driver workflow commands carry driver context and origin surface; generic Admin feature records inspected so far do not consistently carry an explicit actor ID in their shared envelope. The responsible person may be implicit in the current app/account/session boundary, but that must be traced and verified before the advisor promises per-person accountability.

**Rating: Partial / Unknown by feature.** Platform/source provenance is present; complete human actor attribution and immutable correction history are not yet demonstrated for all business records. This is an audit gap, not authorization to add actor fields before checking the authentication/session and privacy contracts.

## 4.15 Finance contract governance

The implemented loan payment ledger supports payment allocation, unallocated credit, reversals and settlements. However, the inspected FINANCE_LOAN_PAYMENT_WORKFLOW_CONTRACT.md still labels its v1 allocation policy as a proposed draft that is not formally ratified. The implementation and its tests are therefore ahead of the normative policy status. This does not prove the code is wrong, but it is a contract-governance gap that must be reconciled before treating every payment-allocation behaviour as an approved business rule.

**Rating: Partial.** Preserve existing runtime behaviour during the audit; reconcile the implemented behaviour against the owner's approved Finance policy and update the contract through normal approval rather than silently assuming the draft is ratified.



## 4.16 Correction and historical revision retention

The shared FeatureRecordService update path reads the current record, checks expectedRevision, then compare-and-sets a replacement envelope with revision + 1. In the inspected generic path, the previous payload is not appended to a revision-history collection. This applies to feature records using this service, including Driver, Vehicle and Maintenance records. Loan detail updates preserve versioned EMI schedule calculations when their inputs change, but the loan detail record itself is still a current aggregate; Finance payments use an append-only ledger and explicit reversal entries. Driver workflow events are immutable and retained separately.

**Rating: Partial / traceability gap.** Revision checks prevent stale overwrites, but a revision counter alone does not let the advisor reconstruct every prior value or explain who changed it. The audit must determine whether any separate audit facility exists outside the inspected service. If not, decide which business records require append-only correction history and actor/reason attribution. Do not retrofit history into every feature indiscriminately before the retention, privacy, backup, and recovery implications are reviewed.

## 5. Authoritative business-entry policy and initial gaps

The owner has clarified that authorised driver/admin entries are authoritative business records. Fare agreement, customer collection, trip expenses, fuel, maintenance, and finance entries are not required to have independent third-party proof before being accepted into the business record or used in calculations.

The reliability requirement is therefore to establish that the entry:

- Came through an authorised capture path and, where applicable, identifies the responsible driver/admin.
- Passed the owning feature's field, money/date, identity, and relationship validation.
- Was committed to the authoritative local store and can be recovered/replayed safely.
- Was not silently overwritten by a duplicate or competing PWA/Android submission.
- Retains enough history to explain corrections, reversals, and the current value.

Optional corroboration (receipt/reference/payment reference) can add context, but it is not a gate. GPS is a separate system-observed location/time signal; it is not needed to prove a driver-entered fare or expense. The advisor may use authoritative, technically validated entries while being transparent that they are owner/driver-entered business records rather than independently confirmed third-party events.

The initial gap is not that independent corroboration is missing. The remaining audit must determine whether actor attribution, source channel, correction history, auditability, validation, platform parity, and recovery are sufficiently implemented for each feature. Do not add generic verification flags or demand external evidence as a shortcut.



### Initial intelligence eligibility matrix

This is an initial source-readiness assessment, not approval of new metrics or formulas.

| Business question / measure | Current source | Initial eligibility | Limitation to disclose |
|---|---|---|---|
| Trip count and trip duration | Immutable Work events and transition timestamps | **Eligible for tested, internally consistent trip records** | Unmatched/overlapping events must remain visible as needs-attention; physical-device timing acceptance remains separate. |
| Recorded trip Fare | Required completed-trip Fare entry | **Eligible as authoritative recorded Fare** | Do not rename it customer cash collected. |
| Actual customer collection | No separate trip collection amount/status found | **Not eligible as a distinct measure yet** | A Fare entry alone cannot answer how much was collected or whether it was partial/unpaid. |
| Customer charge including Toll/Parking | Fare plus customer-paid Toll/Parking payer fields | **Eligible as recorded customer charge** | This is a calculated charge, not proof of collection. |
| Recorded driver Toll/Parking expense | Trip-linked amount and payer fields | **Eligible as authoritative recorded expense** | Does not separately capture whether a third party was paid; accepted as business entry under owner policy. |
| Fuel spend | Generic Maintenance expense with free-text name | **Conditionally usable after explicit category mapping** | Free text is not a stable fuel category; do not infer from description heuristics without an approved mapping. |
| Fuel volume, price per litre, consumption | No dedicated fuel purchase schema found | **Not eligible** | No structured litres/quantity or unit price in inspected form. |
| Trip distance / fuel efficiency | Event GPS snapshots and shift odometer requirements | **Not eligible per trip from current GPS path alone** | Transition fixes are not a route trace; shift odometer does not allocate kilometres to individual trips. |
| Maintenance cost by vehicle | Vehicle-linked visits and general expense records | **Eligible as recorded maintenance expense** | Provider, amount and odometer remain authorised entries; prior edits are not retained by generic revision history. |
| Scheduled EMI and amortization | Versioned loan calculation schedule | **Eligible as deterministic schedule output** | It is an app calculation from entered loan inputs, not a lender statement. |
| Recorded loan payments / reversals | Finance payment ledger and allocations | **Eligible as recorded Finance history** | Payment method/reference is entered context; actual lender posting is not independently checked. Payment-allocation policy contract remains proposed/unratified. |
| Remaining scheduled loan obligations | Schedule versions plus payment/prepayment history | **Conditionally eligible as app-calculated position** | Must be labelled calculated from recorded entries, not lender-confirmed outstanding balance; reconcile contract status first. |
| Whole-vehicle profitability | Fare, expenses, fuel and distance sources | **Not yet reliably eligible as a complete measure** | Separate collection, structured fuel and trip-level distance are missing or incomplete. |

The advisor may still provide partial insights from eligible inputs, but it must state the scope (for example, recorded Fare less recorded driver-paid Toll/Parking before Fuel), rather than present an incomplete subtotal as net profit.

## 6. Remaining audit work

| Work item | Scope | Status |
|---|---|---|
| A. Architecture and authority map | Trace PWA, Android WebView, overlay, shared application services, adapters and durable stores | Partial — shared React/services and Dexie/Room split verified; remaining feature map and actor provenance remain |
| B. Driver workflow evidence | Trips, shift transitions, GPS, event identity, context, recovery and history | Partial — state machine, immutable snapshots, event GPS, parity/restart and anomaly-preserving history inspected; per-trip distance and physical acceptance remain limited |
| C. Financial business events | Fare, collections, toll, parking, fuel, maintenance, loans, payments, prepayments and settlements | Partial — Fare/toll/parking, generic expense (possible fuel spend), Maintenance and Finance inspected; distinct trip collection and structured fuel data are gaps |
| D. Form capture quality | Definitions, validation, draft persistence, submission idempotency, correction/audit history | Partial — shared runtime and selected financial forms inspected; every feature form and correction/history path not yet inventoried |
| E. Cross-platform equivalence | Equivalent PWA and Android operations and canonical outputs | Partial — shared application path, driver parity fixture, paired Room surfaces, and selected financial tests exist; full per-domain PWA/Capacitor matrix remains |
| F. Durability and recovery | Failure injection, process recreation, migrations, backup/restore and replay | Partial — Dexie/Room atomic paths and selected browser/native reopen, backup and restore tests inspected; physical-device and full cloud acceptance remain |
| G. Evidence/corroboration model | Authorised source policy, actor attribution, optional corroboration, conflict and correction provenance | Partial — owner policy clarified; source channel exists, generic feature updates overwrite prior payloads, and complete actor/history tracing remains open |
| H. Intelligence eligibility | Per-metric data sufficiency, source states, partial totals and traceability | Unknown — requires candidate metric/source mapping |

## 7. Audit rules and next sequence

1. Finish the feature-by-feature source-of-truth map before changing code.
2. For each business event, record capture surface, authoritative command/service, authoritative store, required fields, source/provenance, recovery, correction path, corroboration sources, and intelligence eligibility.
3. Build equivalent PWA/Android fixtures for each high-value event and compare canonical business outputs, not merely UI success.
4. Confirm that each feature treats authorised driver/admin entries as authoritative and technically validates fields, identity, relationships, revisions, and commits.
5. Map optional corroboration separately; do not make it a prerequisite unless the owner approves a specific exception.
6. Complete the fuel capture path inventory and trace actor attribution, corrections, history, and backup/restore across all financial domains.
7. Build equivalent PWA/Android fixtures for high-value events and compare canonical business outputs, not merely UI success.
8. Only after the audit and product-owner approval, create focused technical contracts and implement the smallest validated gaps.
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

**Current conclusion:** Sam Travels has a substantial local-first capture foundation. Authorised driver/admin entries are authoritative by business policy; the audit must verify technical integrity, actor attribution, correction history, platform parity and recovery. Independent third-party corroboration is optional, not a condition for business acceptance. The full reliability audit remains in progress.
