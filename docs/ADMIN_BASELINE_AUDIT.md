# Admin Baseline Audit

**Historical status:** Slice 0 pre-implementation baseline. The statement that runtime implementation had not started describes only the audited base below; it is not current project status. Current Admin implementation evidence is tracked in [Form Conformance Audit](FORM_CONFORMANCE_AUDIT.md) and [Admin Implementation Plan](ADMIN_IMPLEMENTATION_PLAN.md).
**Audited base:** `main` at `c9c3c096f96a5cf54ab995b252e831be4a168a24` (after Finance contract PR #28 and Admin plan PR #29).
**Purpose:** Record the actual capability owners and platform integration points before adding Admin persistence or UI.

This audit supplements `ADMIN_FUNCTIONAL_SPECIFICATION.md`, `ADMIN_IMPLEMENTATION_PLAN.md`, and the existing architecture and persistence contracts. It records repository facts; it does not introduce new product fields or authorize bypassing the ordered slices.

## 1. Existing feature inventory

The checked-in feature package inventory is:

| Package / feature | Current state | Audit conclusion |
|---|---|---|
| `work-shift` / feature ID `work` | Existing operational workflow; persistent | Keep as the only authority for shift, trip and operational driver state. |
| `logbook` / feature ID `logbook` | Existing package, manifest, public entry point and runtime extension; persistent | Reuse its public contracts for trip/event data. Do not duplicate trip history. |
| `finance` | Existing package, manifest, public entry point and runtime extension; currently non-persistent | Reuse for all Loan domain/application state and calculations. Loan calculation v1 is registered; no loan records or persistence are present. |
| `vehicle` | Built-in non-persistent feature placeholder; no feature package or manifest | Reuse this stable feature ID when implementing Vehicle. Do not create a second vehicle owner. |
| `performance` | Built-in non-persistent placeholder | Leave its existing ownership and calculations unchanged. |
| `admin` | Built-in non-persistent placeholder; no Admin capability package | Keep Admin as presentation/navigation composition, not a data owner. |
| `backup` | Built-in non-persistent placeholder; backup implementation is in its existing owning packages | Do not create a competing backup feature or storage path. |
| Business Settings | No existing feature package, manifest or registered feature ID found | New bounded owner required; proposed stable ID: `business-settings`. |
| Driver Records | No separate profile/assignment capability found | New bounded owner required; proposed stable ID: `driver-records`. Existing `work` driver workflow is not a substitute. |
| Compliance | No existing feature package or registered feature ID found | New bounded owner required; proposed stable ID: `compliance`. |
| Maintenance | No existing feature package or registered feature ID found | New bounded owner required; proposed stable ID: `maintenance`. |

The generated feature catalogue currently statically imports Finance and Log Book only. New capability manifests must be added through the existing feature discovery/generation workflow and public entry-point validation. No per-feature imports should be added to the application composition root.

## 2. Approved Admin-to-owner map

| Admin section | Owning capability | Existing/new status | Boundary |
|---|---|---|---|
| Business setup | Business Settings (`business-settings`) | New | Own only the approved business start date. It must not constrain historical record dates. |
| Vehicle | Vehicle (`vehicle`) | Reuse existing placeholder ID; package is new | Own vehicle identity, status and authoritative IDs. |
| Driver | Driver Records (`driver-records`) | New | Own driver profile, licence and assignment history. Integrate with Work via public contracts; do not create another shift/trip state machine. |
| Compliance | Compliance (`compliance`) | New | Own vehicle-scoped records, renewals, validity, gap/overlap and daily-cost rules. Driver remains the owner of licence data. |
| Loan | Finance (`finance`) | Existing | Finance owns all loan state, schedule, payment and calculation contracts. Admin is an access/presentation surface only. |
| Maintenance | Maintenance (`maintenance`) | New | Own visits, actual expense items, rate history and daily accrual. Consume trip distance through a public Log Book/Work contract. |

These IDs are the implementation-map recommendation based on the current registry inventory. Each new definition and dependency version must be validated in Slice 1 before persistent writes are enabled.

## 3. Persistence and migration starting points

### Android

- Room is the sole authoritative business store for the installed app.
- Current Room schema version is **3**; checked-in schema snapshots exist for versions 2 and 3.
- Current ordered migration chain is **1 → 2 → 3**. Version 2→3 introduced the separate `logbook_events` table and moved legacy event rows transactionally.
- Current Room entities are `records` and `logbook_events`. There are no Admin-specific Room entities or tables.
- The shared `records` table is a possible namespaced-record adapter path, not permission to bypass feature-owned repository/use-case contracts. A dedicated table, if selected by a feature contract, requires a Room schema increment, migration, schema snapshot and migration tests.

### Browser-only PWA

- IndexedDB/Dexie is the sole authoritative business store in browser-only runtime.
- Current Dexie schema version is **6**.
- Existing business tables include generic `records`, Work state/intents/events/outbox, and existing backup/recovery, credential and diagnostics stores.
- No Admin-specific business tables or feature records are present.
- Android WebView must continue to use Room-backed native repository APIs; it must not write a second business history to IndexedDB.

### Feature persistence registration

The core feature contract requires persistent owners to declare a complete schema version, contiguous migration chain, required backup participant, restore validator, and retention-safe lifecycle policy. A placeholder remains non-persistent until that complete contract is accepted.

Do not select a new physical table layout merely to make Admin UI work. Slice 1 must define each owner's entity and repository contracts and decide whether the existing generic record envelope or a dedicated table is appropriate. Any dedicated Room table must be mirrored by the browser adapter behind the same platform-neutral repository port.

## 4. Backup, restore and recovery integration points

- Browser snapshot support is in `packages/storage-browser/src/backup-snapshot.ts`. It validates the registered feature backup obligations and supports feature-owned namespaced record adapters through `registerBrowserFeatureBackupParticipant`.
- Android snapshot support is in `NativeBackupCoverage`; feature-owned namespaced Room-record adapters can be registered through `registerFeatureRecordParticipant`.
- Current built-in participants cover Platform records, Work driver state and Log Book events. No Admin capability participant is registered.
- Both platform paths validate feature-owned records and relationships before restore. Internal recovery/checkpoint stores remain outside ordinary business snapshots according to the existing contracts.
- Each persistent Admin owner must supply a real adapter/participant and restore validation before writes are enabled. Merely declaring a participant ID in a manifest is insufficient.

## 5. Application, integration and presentation boundaries

- The application composition root initializes the generated static feature catalogue and application-owned runtime registry before mounting React presentation.
- The application layer exposes stable form submission and feature lifecycle boundaries. Forms must submit through application use cases; they must not write directly to Room, Dexie or platform plugins.
- The framework-neutral shell contract is in `packages/presentation/src/shell-contracts.ts`; the current React shell is `apps/web/src/ui/ApplicationShell.tsx`.
- The current shell already has exactly four bottom destinations: Drive, Timeline, Performance and Admin, with a top-corner expandable Settings control. Do not add a fifth tab.
- Admin section expanders, vehicle context and the six section experiences are not implemented by the current shell. They belong in the replaceable Admin presentation layer after capability contracts are established.
- The shared form contract is `docs/FORM_ARCHITECTURE_AND_BEHAVIOUR_CONTRACT.md`; `packages/application/src/form-submission-port.ts` is the stable submission boundary. The existing generic form definition is presentation-only and is not a substitute for feature-owned validation.
- Cross-capability communication must use typed, versioned public application contracts. No deep imports, private table reads, or UI-to-database shortcuts.

## 6. Loan gate

Finance calculation contract v1 is now merged and registered as `finance.loan-monthly-reducing-balance.v1`. Its fixtures cover a standard positive-rate schedule and zero-interest final adjustment. The Finance package currently provides pure calculations and no loan persistence.

This does not authorize payment allocation, partial/overpayment semantics, reversal/correction, prepayment allocation/re-amortization, or early-settlement quotes. Those workflows remain blocked until their separate Finance-owned contracts are approved. No Loan runtime writes or UI assumptions are introduced by this audit.

## 7. Slice 0 exit assessment

| Gate | Finding |
|---|---|
| Admin specification and implementation plan merged | Complete (PRs #27, #29). |
| Finance Loan calculation contract merged | Complete (PR #28). |
| Existing capability IDs and package inventory inspected | Complete; map recorded above. |
| Android and browser persistence starting points inspected | Complete; Room v3 and Dexie v6 recorded above. |
| Backup/restore extension points and current participants inspected | Complete; no Admin participants exist yet. |
| Shared form submission and shell boundaries inspected | Complete; current four-tab shell can be retained while Admin presentation is replaced/additively extended. |
| Post-merge CI on audited `main` | At audit time, Web and architecture jobs passed; Android job was still in progress. Final Slice 0 acceptance requires the Android job to pass. |

**Next authorised work after Slice 0 acceptance:** Slice 1 capability contracts and persistent registration. Define the public feature IDs/versions, entity and repository ports, validation/invariants, migrations, backup/restore participants, lifecycle/deletion policy, transaction/recovery boundaries and focused tests. Persistent writes remain disabled until each owner passes its complete registration and acceptance gate.

Implementation then proceeds in the approved order: Business Settings + Vehicle; Driver Records; Compliance; Maintenance; Finance Loan only after its additional lifecycle contracts; then Admin presentation and integrated acceptance.
