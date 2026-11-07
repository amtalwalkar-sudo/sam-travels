# Admin Capability Contracts — Slice 1

**Status:** Slice 1 contract proposal; review and CI required before persistent writes are enabled  
**Authority:** `ADMIN_FUNCTIONAL_SPECIFICATION.md`, `ADMIN_IMPLEMENTATION_PLAN.md`, and the existing feature, persistence, lifecycle, backup, transaction/recovery, and form contracts  
**Scope:** Stable ownership, record identity, public boundaries, and initial persistence/backup registration for the six Admin sections  
**Runtime/UI changes:** None in this document

This document turns the approved Admin ownership map into implementation contracts. It does not create an Admin database, change the shell, enable writes, or authorize unapproved business rules. Where an integration's actual source contract has not yet been audited, it is explicitly gated rather than guessed.

## 1. Capability inventory and stable identities

The following feature IDs are the canonical ownership IDs. Existing IDs are reused; new capabilities use the IDs recorded by the Slice 0 audit.

| Admin section | Feature ID | Public entry point | Contract version | Persistence |
|---|---|---|---:|---|
| Business setup | `business-settings` | `packages/features/business-settings/index.ts` | 1 | Persistent |
| Vehicle | `vehicle` | `packages/features/vehicle/index.ts` | 1 | Persistent |
| Driver | `driver-records` | `packages/features/driver-records/index.ts` | 1 | Persistent |
| Compliance | `compliance` | `packages/features/compliance/index.ts` | 1 | Persistent |
| Loan | `finance` | `packages/features/finance/index.ts` | 2 | Persistent |
| Maintenance | `maintenance` | `packages/features/maintenance/index.ts` | 1 | Persistent |
| Admin navigation/composition | `admin` | Existing built-in feature boundary | 1 | Non-persistent |

The existing `vehicle` and `finance` built-in definitions must be promoted in place to their persistent contracts; do not register duplicate feature IDs. The Finance feature contract version increases from 1 to 2 because its ownership/persistence declaration changes. The existing Loan calculation identity remains exactly `finance.loan-monthly-reducing-balance.v1`; this feature-contract version change does not change that calculation's version or output.

Business Settings, Driver Records, Compliance, and Maintenance are new bounded feature packages. Their manifests must be discovered by the existing deterministic static catalogue generator. No per-feature imports are added to the application composition root.

Admin is not a persistence owner. Its screens call capability public use cases and queries. Hiding, replacing, or rebuilding Admin presentation cannot change records or capability lifecycle.

## 2. Shared persistence profile for the first onboarding

### 2.1 Existing storage path

The initial Admin capabilities use the existing generic `records` table through feature-owned repository ports:

- Browser-only PWA: existing Dexie `records` table (database schema v6).
- Installed Android: existing Room `records` table (database schema v3).
- Android WebView continues to call the Room-backed native repository boundary; it must not write business records to IndexedDB.

No dedicated Room entity/table or new Dexie object store is introduced for this first onboarding. This is a deliberate reuse of the existing namespaced-record adapter path, not permission for presentation code to use the generic table directly. A future dedicated table requires a separate reviewed contract, Room/Dexie migration, backup adapter, and rollback tests.

### 2.2 Record identity and envelope

Each capability record uses the existing record-envelope v1 and a stable feature namespace:

| Owner | Record ID prefix |
|---|---|
| Business Settings | `feature:business-settings:` |
| Vehicle | `feature:vehicle:` |
| Driver Records | `feature:driver-records:` |
| Compliance | `feature:compliance:` |
| Finance Loan | `feature:finance:` |
| Maintenance | `feature:maintenance:` |

The suffix after the prefix is a stable, creation-time UUID. A singleton Business Settings record uses a fixed, documented singleton suffix; it is not regenerated on each edit. IDs are never derived from mutable labels, registration numbers, dates, or current UI selection.

Every stored envelope retains the existing required fields: `id`, envelope `schemaVersion: 1`, immutable `createdAt`, `updatedAt`, `source`, positive `revision`, and typed feature payload. Where applicable, `businessDate` is a separate ISO calendar date. Payload validation belongs to the owning capability and runs on create/update, typed reads, backup export, and restore.

The feature payload schema starts at version 1 for each owner. Do not confuse:
- record-envelope schema version;
- feature payload/schema version in the persistent feature contract;
- Room/Dexie physical database schema version; or
- backup participant snapshot version.

All six initial persistent feature contracts declare payload schema version 1, an empty migration chain from v1, and backup snapshot version 1. The existing Room v3 and Dexie v6 schemas therefore require no physical database migration for this first namespaced-record onboarding. This does not waive the requirement to add explicit, contiguous migrations for any later payload or physical schema change.

### 2.3 Persistent feature registration

Each persistent feature definition must declare:
- stable feature ID and contract version;
- `dataPolicy: "persistent"`;
- schema version 1;
- an explicit (initially empty) migration list;
- one stable, required backup participant ID and snapshot version 1;
- one stable, required restore-validator ID;
- lifecycle policy `disableRetainsData: true` and `removalRequiresMigration: true`.

Initial participant and validator identities:

| Feature ID | Required backup participant | Required restore validator |
|---|---|---|
| `business-settings` | `business-settings-records` | `business-settings-records-v1` |
| `vehicle` | `vehicle-records` | `vehicle-records-v1` |
| `driver-records` | `driver-records` | `driver-records-v1` |
| `compliance` | `compliance-records` | `compliance-records-v1` |
| `finance` | `finance-records` | `finance-records-v1` |
| `maintenance` | `maintenance-records` | `maintenance-records-v1` |

These IDs are immutable once records are shipped. A participant identity cannot be silently renamed or removed while its records are retained.

A declaration alone does not enable writes. Before a feature can be activated as persistent, its public entry point, repository adapter, payload validator, browser backup participant, Android Room participant, restore relationship validator, migration handler set, lifecycle policy, and required tests must all be registered and validated by the existing application runtime. Missing adapters or participants fail closed.

## 3. Capability-owned record contracts

The following are the v1 record families and application operations. Field meaning and product behaviour remain governed by the frozen Admin Functional Specification. These contracts do not authorize extra profile fields or new workflows.

### 3.1 Business Settings — `business-settings`

**Owned record:** one business-wide settings record containing only the approved business start date.

**Operations:** read business start date; set/update business start date.

**Invariants:**
- There is one authoritative business-wide value, not one per vehicle.
- The date is a valid ISO calendar date.
- Editing it does not mutate, re-date, or invalidate historical records.
- It is never used as a lower-bound date validator for Finance, Compliance, Maintenance, or other historical forms.

### 3.2 Vehicle — `vehicle`

**Owned record:** vehicle identity and approved descriptive fields: registration number, make, model, vehicle type, fuel type, year of manufacture, ownership, and active/inactive/sold lifecycle state.

**Operations:** create vehicle; read one/list vehicles; edit approved details; change active/inactive/sold status.

**Invariants:**
- Registration number is required and is the primary human-facing identity.
- Duplicate vehicle identity is rejected at the domain/application boundary, including concurrent/retried creates.
- Multiple active vehicles are supported.
- Inactive/sold vehicles and all linked history are retained.
- Vehicle does not embed Compliance, Loan, Driver assignment, or Maintenance records.
- Vehicle IDs are immutable and are the authoritative relationship key for vehicle-scoped capabilities.

The precise registration-number canonicalization policy (case, whitespace, and jurisdiction-specific punctuation) must be fixed with explicit positive/negative fixtures before duplicate protection is implemented; no normalization rule is inferred here.

### 3.3 Driver Records — `driver-records`

**Owned records:**
- Driver profile: approved driver name, licence number, licence expiry date, mobile number, and active/inactive state.
- Vehicle assignment: stable assignment ID, driver ID, vehicle ID, assignment start date/time, and optional closed/end date/time.

**Operations:** create/read/edit driver profile; assign driver to vehicle; reassign driver; list current and historical assignments; deactivate/reactivate driver under the approved retention rules.

**Invariants:**
- A driver has at most one active vehicle assignment at any instant.
- Reassignment closes the prior assignment and creates a new assignment; history is never overwritten.
- A vehicle may have successive drivers over time; no fleet dispatch or multi-driver tenancy is introduced.
- Existing trip/payment attribution is not rewritten by reassignment.
- Driver Records owns licence facts. Compliance may query them but cannot create a competing licence record.
- Work/Shift remains the sole authority for operational shift/trip state. Driver Records must not introduce a second operational driver or trip state machine.

The exact Driver Records ↔ Work public integration contract is an implementation gate: inspect the current Work public API and actual operational driver identity flow before defining any command/event payload. Do not deep-import Work internals or assume that an Admin assignment immediately changes an active shift.

### 3.4 Compliance — `compliance`

**Owned record:** vehicle-scoped compliance item with Admin-defined name, validity start/end dates, total cost in INR paise, optional supporting-document reference, and optional link to the prior record created by renewal.

**Operations:** create/read/edit compliance record; renew by creating a linked record; list history; query validity/gaps/overlaps and daily cost for a vehicle/date range.

**Invariants:**
- Valid-from and valid-to dates are inclusive and valid-to cannot precede valid-from.
- Renewal creates a new record linked to the previous record; it never overwrites the prior record or its cost/document history.
- Backdated and historical records are allowed.
- Gap detection reports uncovered dates; it never fills them automatically.
- Overlap detection warns about possible duplicate coverage. Any accepted overlap remains traceable to its source records and must not silently double-count.
- Daily cost uses full precision internally and the approved financial rounding/display policy; source-record breakdown remains available.
- Missing document is a valid explicit state, not a failed record.
- Compliance owns vehicle compliance records; Driver Records remains the owner of driver licence data.

The exact `Expiring soon` threshold and reminder delivery mechanism must follow the approved product decision and a supported notification capability; this contract does not invent a threshold or claim reminders are delivered. Compliance may consume a versioned, read-only Driver Records licence query only after that public query is defined and registered.

### 3.5 Finance Loan — `finance`

**Owned records:** vehicle-linked loan details and immutable calculation/schedule provenance. Finance remains the only owner of loan records, calculations, balances, and repayment workflows.

**Loan detail fields:** approved loan name, required lender name, optional loan account reference, original principal in INR paise, fixed annual interest rate in basis points, loan start date, tenure in months, first EMI date, and vehicle ID.

**Operations available under this base contract:** create/read/edit loan details; generate and view the original schedule through the exact registered calculation `finance.loan-monthly-reducing-balance.v1`; inspect schedule provenance and loan history.

**Calculation boundary:** use the merged Finance Calculation Contract v1 unchanged. Keep scheduled EMI separate from actual payments. Store the calculation ID/version, input/output schema versions, effective date, and the source inputs needed to explain the original schedule.

**Immutable schedule revision policy:**
- Every accepted loan-details revision that changes any calculation input (principal, fixed annual rate, loan start date, tenure, or first EMI date) creates a new immutable schedule version using the exact registered calculation version.
- A schedule version stores its own immutable input snapshot, calculation ID/version, input/output schema versions, effective date, complete calculated output, and creation provenance. It must be possible to explain and reproduce the historical schedule without reading the current loan details.
- The prior schedule version and its input snapshot are retained unchanged. Editing a loan never updates, deletes, or retroactively recalculates an earlier schedule.
- The loan projection identifies one current schedule version and exposes earlier versions as read-only history. Version identity and ordering are stable; retries of the same accepted edit must not create duplicate versions.
- A non-calculation detail edit does not create a new EMI schedule version. A calculation-input edit creates the new schedule and updates the current-version pointer atomically with the loan revision; failure leaves the prior loan revision and schedule current.
- Historical schedule versions are calculations only, not evidence of payment. They must not infer, create, reallocate, or change actual payment records.
- This policy governs original schedule revisions only. It does not authorize payment, prepayment, re-amortization, settlement, or closure workflows; those remain gated by their separate Finance contracts below.

**Explicitly gated workflows:** payment writes/allocation (including partial/overpayment, reversal/correction, duplicates, and payment-to-EMI allocation); prepayment allocation and reduce-tenure/reduce-EMI re-amortization; early-settlement quote and closure transitions. Each requires its own Finance-owned lifecycle/calculation contract and tests before the corresponding command or UI action is enabled. The presence of fields/actions in the product specification is not permission to invent those semantics.

### 3.6 Maintenance — `maintenance`

**Owned records:**
- Service visit with date, Admin-defined type, description, one or more editable expense items, derived visit total, optional odometer, provider, and optional next-service date/km.
- General maintenance expense with date, Admin-defined type/name, description, amount, and optional odometer/provider.
- Per-vehicle maintenance-rate history, beginning at ₹2.50/km (250 paise/km) for each new vehicle.
- Daily standard-maintenance accrual records with the rate and distance provenance used for each date.

**Operations:** create/read/edit service visit and expense; read/edit vehicle rate; list rate history and daily accrual history; query actual expenses separately from standard daily accrual.

**Invariants:**
- Visit total is derived from its item amounts; it is not an independently editable competing amount.
- Actual bill/service expenses remain separate from standard daily per-kilometre accrual.
- Rate changes apply to new daily calculations from the save business date; previously calculated daily accrual records are immutable.
- A vehicle's rate never affects another vehicle.
- Missing odometer readings remain absent.
- Inactive/sold vehicles retain all maintenance and accrual history.

The authoritative per-vehicle daily-distance source and its exact public query/event payload must be audited in Log Book/Work before accrual execution is enabled. Maintenance must not read another feature's tables or derive distance from presentation/Timeline projections. Until that contract is registered, rate/history records may be designed, but no daily accrual may be reported as complete.

## 4. Cross-capability dependency and reference rules

The initial required feature dependencies are:

| Consumer | Required dependency | Reason |
|---|---|---|
| Driver Records | Vehicle v1 | Assignment references must resolve to an authoritative vehicle. |
| Compliance | Vehicle v1 | Every compliance record is vehicle-scoped. |
| Finance | Vehicle v1 | Every loan record is vehicle-scoped. |
| Maintenance | Vehicle v1 | Visits, expenses, rates, and accruals are vehicle-scoped. |
| Maintenance | Log Book v1 | Required public distance source; execution remains gated until the exact query/event contract is audited and registered. |
| Admin | None for data ownership | Admin is presentation composition and uses public feature entry points. |

Compliance-to-Driver Records licence visibility is a read-only optional integration, not a second owner. Driver Records-to-Work operational synchronization is not defined until the Work API audit described above. No cross-feature direct repository/table access is allowed.

Every vehicle-scoped command carries the authoritative `vehicleId`; selected UI context is only a convenience. The owning use case validates that the referenced vehicle exists and that the operation is permitted for its lifecycle state. Changing selected vehicle never changes the vehicle ID on an existing record.

## 5. Multi-record transaction and recovery obligations

The following operations change multiple related records and therefore require one authoritative atomic transaction (Room on Android; Dexie transaction in browser-only PWA), or an explicitly journalled/recoverable coordinator if a single-store transaction cannot cover the operation:

- Driver reassignment: close previous active assignment and create the new assignment as one indivisible business effect.
- Compliance renewal: create the new linked renewal record without mutating the prior record; the link and new record must commit together.
- Maintenance visit save/edit: visit header, expense items, and derived total must commit together.
- Maintenance rate change/accrual: rate history and the new effective-date state must not be published separately from their authoritative commit.
- Any loan payment/prepayment/closure workflow, when separately authorized, must commit its Finance-owned records and schedule effects under its own Finance contract.

Stable command IDs/idempotency keys are required for replayable state-changing operations. Duplicate delivery must return the prior durable outcome, not duplicate records. Failed transactions must expose no partial completion. Recovery preserves the prior valid dataset and makes pending/needs-attention states explicit. Corrections and deletions follow each owner's explicit retention/lifecycle policy; unregistering or hiding presentation never deletes records.

The current generic record repository surface must not be treated as proof that every multi-record transaction is already implemented. Before enabling each operation, audit and bind the actual Room and Dexie transaction adapters and failure-injection tests to the capability repository port.

## 6. Backup, restore, and participant acceptance

Each participant owns only its namespace and validates:
- every row has the correct feature prefix and participant owner;
- record envelope and payload schema are supported;
- stable IDs are unique within the participant;
- all required same-feature relationships resolve (driver assignments, compliance renewals, maintenance visit items, rate/accrual provenance, and Finance schedule provenance);
- cross-feature references resolve against the complete staged snapshot (for example vehicle IDs), without reaching into another feature's private tables;
- missing required references, unsupported versions, duplicate IDs, malformed money/date values, or unknown feature namespaces fail closed before replacement.

The existing browser `registerBrowserFeatureBackupParticipant` and Android `NativeBackupCoverage.registerFeatureRecordParticipant` hooks are the intended extension points. Both must be wired from the validated runtime registration to real feature-owned validators/adapters. The participant manifest must be derived from the complete persistent feature registry, not maintained as a second manual allowlist.

Restore continues to use the existing complete-snapshot validation, checkpoint-before-replacement, transactional/staged replacement, read-back verification, and rollback recovery. Disable/retire never removes a required participant while records remain.

No new business data is written until export and restore both round-trip each owner through the real production registry and platform adapter on browser IndexedDB and Android Room.

## 7. Implementation gates and explicitly unresolved contracts

The following are required before the relevant writes or workflows are enabled:

1. **Registry wiring audit:** verify how built-in Finance/Vehicle definitions are contributed and how new manifests become feature definitions. Promote existing IDs exactly once; do not add duplicate built-ins.
2. **Repository adapter audit:** trace the current generic record service from application use case through browser IndexedDB and Android Room/native bridge. Confirm typed reads, revision-checked writes, and transaction support.
3. **Backup wiring audit:** register each owner with both real adapters and validators; verify complete participant manifests and namespace ownership on both platforms.
4. **Driver/Work integration:** inspect current Work driver identity and define only the necessary public contract; no second state machine.
5. **Maintenance/Log Book integration:** inspect committed trip records and date/distance projection; define a versioned vehicle/day distance contract and missing/pending/complete semantics.
6. **Compliance expiry policy:** confirm the exact Expiring soon boundary and notification authorization before enabling that behavior.
7. **Loan lifecycle:** define separate Finance contracts for payments, prepayments/re-amortization, and closure before those workflows are implemented.
8. **Atomic multi-record ports:** demonstrate real Room and Dexie atomic operations and interruption/failure tests for the listed multi-record workflows.
9. **Historical dates:** all applicable date validators must permit dates before Business Start Date, subject only to each record's own domain rules.

## 8. Acceptance checklist for Slice 1

- [ ] Feature IDs, owners, versions, and dependency graph match the audited repository and have no duplicate declarations.
- [ ] Finance and Vehicle built-in placeholders are promoted in place, with Finance's feature contract compatibility reviewed.
- [ ] Every persistent owner declares schema v1, migration chain, participant ID/version, restore validator, and lifecycle policy.
- [ ] Each capability has a typed public entry point; external consumers import only that entry point.
- [ ] Domain payload validators and application command/query contracts are defined and tested.
- [ ] Namespaced records use the existing record envelope and generic Room/Dexie `records` tables; no parallel database is introduced.
- [ ] Browser and Android backup participants are wired to the validated feature registry and validate their complete owned records and relationships.
- [ ] Cross-feature references are validated against staged data through public contracts, not private table reads.
- [ ] Multi-record transaction boundaries and recovery/failure tests are demonstrated on both platforms.
- [ ] Negative tests prove duplicate IDs, missing participants, wrong namespaces, broken relationships, unsupported versions, stale revisions, and partial transaction failures are rejected.
- [ ] Full architecture, Web, Android, and integrated regression CI passes on the exact PR commit.

Persistent writes remain disabled until every applicable acceptance item for the owner is complete. A green documentation-only PR does not satisfy runtime acceptance.

## 9. Explicit non-goals

- No catch-all Admin feature/database or Admin-owned loan ledger.
- No UI, shell, form, navigation, theme, or presentation implementation in this slice.
- No dedicated Room/Dexie tables or physical schema changes in the initial namespaced-record path.
- No second Work/Shift/trip state machine, dispatch, fleet tenancy, or multi-driver tenancy.
- No unapproved fields or inferred business rules.
- No payment/prepayment/settlement behavior ahead of Finance-owned contracts.
- No daily maintenance accrual ahead of the audited public trip-distance source.
- No automatic reminders or notification delivery claim without an approved, tested capability.
