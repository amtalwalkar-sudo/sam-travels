# Admin End-to-End Implementation Plan

**Status:** Approved implementation direction; execution proceeds through reviewed vertical slices  
**Product authority:** [Admin Functional Specification](ADMIN_FUNCTIONAL_SPECIFICATION.md)  
**Repository:** Sam Travels  
**Scope:** All six Admin sections and the Admin navigation/access experience

This plan is the separate implementation plan required by the frozen Admin specification. It authorizes implementation in the slices below. It does not authorize a catch-all Admin data module, a rewrite of stable foundations, or undocumented business rules.

## 1. Completion definition

Admin is complete only when all six approved sections are usable end to end, with their records and workflows owned by the correct capabilities, durable on the authoritative store for each runtime, included in backup/restore, recoverable after interruption, and accessible through the approved Admin presentation.

The six sections are:

1. Business setup
2. Vehicle
3. Driver
4. Compliance
5. Loan
6. Maintenance

Loan is one Admin section but its domain, lifecycle, calculations, and persistence are owned by Finance. Admin is an access/presentation surface, not a second finance ledger or calculation engine.

## Current implementation status and evidence boundary

The current web source contains an AdminWorkspace composition with entry points for Business setup, Vehicle, Driver, Compliance, Loan, and Maintenance. This confirms that an Admin workspace and section-level UI implementations exist; it does not, by itself, prove that every section is complete end to end.

Completion remains governed by the definition above: each section must use its owning capability, persist and reload through the authoritative platform store, participate in complete backup/restore and recovery, and pass the relevant workflow and failure-path tests. A rendered screen or form is not evidence of durable workflow completion.

The Admin workspace is a presentation/access surface. It is registered as a non-persistent Admin presentation contribution and mounted through the shared feature screen host. The single application composition root supplies an explicit, typed service dependency set to the Admin presentation; Admin screens must not call global application-service getters. Admin must not acquire business records, repositories, calculations, or a second service authority.

## 2. Non-negotiable architecture boundaries

- Preserve the existing application bootstrap, feature-extension registry, public feature entry points, Work/Shift and Log Book workflows, and existing persistence/recovery foundations.
- Admin is a presentation/navigation composition area. It must not own a catch-all set of business entities or private tables for all six sections.
- Each capability owns its domain entities, invariants, application use cases, repository ports, persistence adapters, migrations, calculations, and focused tests.
- Cross-capability communication uses typed, versioned public application contracts. No private-table access, cross-feature deep imports, or UI-to-database shortcuts.
- Forms are replaceable adapters over application use cases. They do not own validation authority, calculations, persistence, or recovery.
- Presentation, navigation, forms, and shell may be replaced without changing capability contracts, stable wiring, record identity, or persisted history.
- Installed Android uses Room as the sole authoritative business store. Browser-only PWA uses IndexedDB. Android WebView must not create a second writable business history in IndexedDB.
- Persistent writes remain disabled until the capability has a complete persistent-feature registration, migrations, backup/restore participation, restore validation, lifecycle/deletion policy, and failure-path tests.
- Every write is offline-capable, validated at the application boundary, idempotent where replayable, and committed through the established transaction/recovery boundary.
- Preserve historical records and stable IDs. No silent destructive reset, inferred payment, fabricated odometer reading, or retrospective rewrite of calculated history.
- Keep source files within the existing architecture gate (400 lines / 24 KB); do not weaken or duplicate CI enforcement.

## 3. Capability ownership map

| Admin section / concern | Owning capability | Admin responsibility | Explicit boundary |
|---|---|---|---|
| Business start date | Business Settings (new capability unless an existing public owner is found during baseline audit) | Present and edit the one approved business-wide date | Must not impose a lower bound on historical record dates |
| Vehicle records and selected-vehicle context | Vehicle | Present vehicle records and selection; pass authoritative vehicle IDs to use cases | Vehicle owns identity/status; selected UI context is not the persisted relationship |
| Driver records and vehicle assignments | Driver Records (bounded profile/assignment capability) | Present driver details, assignment, reassignment, and history | Must not create another Shift/Work or trip state machine; Work remains authoritative for operational lifecycle |
| Compliance records and renewals | Compliance | Present vehicle-scoped records, status, gaps/overlaps, renewals, and history | Compliance owns its records and calculation rules; licence expiry remains Driver-owned |
| Loan records and repayment workflows | Finance | Provide the Admin access point to Finance-owned loan use cases and projections | Finance owns all loan state, schedules, payment allocation, balances, and calculations; Admin must not implement formulas |
| Maintenance visits, expenses, and rate history | Maintenance | Present vehicle-scoped visits, expense items, reminders, rate, and history | Maintenance owns actual expenses and standard daily accrual; trip distance is consumed through a public contract |

The exact capability ID and package for Business Settings and Driver Records must be checked against the current main-branch package inventory before scaffolding. Reuse an existing public owner where one already exists; do not duplicate a capability under a new name.

Admin itself may expose a public presentation composition contract, but it does not become the persistence owner for the six sections.

## 4. Ordered implementation slices

Each slice is independently reviewable and testable. A later slice must not bypass a missing prerequisite from an earlier one.

### Slice 0 — Baseline and dependency gate

- Verify current main, required CI, generated feature catalogue, and architecture checks.
- Confirm PR #27 is merged (already complete).
- Merge Finance Loan Calculation Contract PR #28 only after its required checks pass and its calculation fixtures are reviewed.
- Audit existing package IDs, feature manifests, repository adapters, Room schema/migrations, IndexedDB schema/migrations, backup participants, form contracts, and shell composition before adding new owners.
- Record existing owners and exact migration starting points; do not infer them from product labels.

**Exit:** A checked-in implementation map agrees with the actual repository and no existing stable foundation needs replacement.

### Slice 1 — Capability contracts and persistence registration

For each persistent owner, define:
- Stable capability ID and public entry point.
- Entities, relationships, invariants, command/query contracts, and lifecycle.
- Schema version and explicit migration chain from every supported prior schema.
- Room and IndexedDB adapters implementing the same platform-neutral repository ports.
- Backup snapshot/export participation, attachment/reference inventory where relevant, restore validation, and recovery behavior.
- Transaction boundaries, idempotency, correction/deletion policy, and failure behavior.
- Domain, application, adapter, migration, backup/restore, offline, and recovery tests.

No capability enables business writes until the validated registry accepts its complete persistent contract.

### Slice 2 — Business Settings and Vehicle

Implement the approved business start date and vehicle lifecycle first because they establish business-wide and vehicle identity/context needed by later sections.

Vehicle behavior:
- Add, view, and edit vehicle records with the approved fields.
- Support multiple active vehicles.
- Enforce duplicate identity/registration protection at the domain/application boundary.
- Retain inactive/sold vehicles and their relationships/history.
- Expose selected vehicle context through the Admin presentation while every command carries an authoritative vehicle ID.

Business start date:
- Store only the approved business start date.
- Permit historical records before it; it is not a validation minimum.

**Exit:** Both capabilities persist/reload offline in Android and browser-only PWA, migrate safely, and round-trip through backup/restore tests.

### Slice 3 — Driver Records and assignments

- Implement driver profile fields and active/inactive lifecycle.
- Enforce at most one active vehicle assignment per driver.
- Reassignment closes the prior assignment and creates a new relationship; preserve assignment history.
- Keep driver-owned licence data in one source of truth.
- Integrate with the existing Work/Shift and Log Book public contracts only where required.
- Preserve historical trip/payment attribution and existing Work/Shift state semantics.
- Do not create fleet dispatch, fleet tenancy, multi-driver tenancy, driver rosters for dispatch, or a parallel operational workflow.

**Exit:** Assignment invariants are tested under duplicate, conflicting, retry, and historical-reassignment cases; existing driver workflow regression suites remain green.

### Slice 4 — Compliance

- Implement vehicle-scoped compliance records with admin-defined names, validity dates, total cost, and optional supporting document.
- Implement renewals as linked new records; never overwrite prior renewal history.
- Implement Valid / Expiring soon / Expired status.
- Detect validity gaps and overlaps without silently filling gaps or double-counting costs.
- Implement inclusive-day daily cost using the approved financial precision rules.
- Preserve traceability from daily totals to source records.
- Support historical corrections under the owning contract and retain records for inactive/sold vehicles.

Reminder delivery is a separate integration concern; do not claim reminders are delivered until a supported notification capability and its permission/offline behavior are implemented and tested.

**Exit:** Date boundaries, leap years, gap/overlap cases, missing documents, renewal history, correction, and per-vehicle totals have regression coverage.

### Slice 5 — Maintenance

- Implement maintenance visits with multiple editable expense items and a derived visit total.
- Implement general maintenance expenses separately from service visits.
- Keep actual maintenance expenses distinct from standard daily per-kilometre accrual.
- Implement per-vehicle default rate ₹2.50/km and editable rate.
- Consume daily kilometres only through the authoritative, versioned trip-distance public contract.
- Apply a saved rate change to new daily calculations from the save date; previously calculated daily accruals remain unchanged.
- Preserve rate history/provenance so every accrual can be explained.
- Implement optional odometer readings and date/km reminders without inventing missing readings.
- Retain history for inactive/sold vehicles.

**Exit:** Item totals, accruals, effective-date changes, historical immutability, reminders, offline writes, and trip-distance integration are covered by regression and failure-path tests.

### Slice 6 — Finance Loan lifecycle

Prerequisite: PR #28's Finance-owned calculation contract v1 is merged and its required CI checks pass.

- Keep Loan data and calculations in Finance; Admin calls only Finance public use cases and queries.
- Implement loan create/view/edit/history and the original fixed-rate schedule using the exact registered calculation ID/version.
- Implement repayment schedule projection and separate actual payment records; never treat a scheduled EMI as proof of payment.
- Define and approve payment lifecycle semantics (due, paid, partial, overpayment, reversal/correction, duplicate payment, and allocation) before enabling payment writes.
- Define and approve prepayment timing/allocation and re-amortization choices before implementing either reduce-tenure or reduce-EMI behavior.
- Define and approve early-settlement/closure calculation and transition semantics before enabling closure quotes or final settlement workflows.
- Preserve the original schedule and all schedule versions/effects needed to explain changes.
- Preserve closed loan history and vehicle relationships.

The base EMI/amortization v1 contract does not authorize payment allocation, prepayment re-amortization, broken-period interest, lender-specific day-count conventions, or early-settlement quotes. These are explicit Finance-owned contract slices, not assumptions to be filled in by Admin.

**Exit:** Loan records, schedule, payments, prepayments, and closure are complete only when each enabled workflow has its own approved contract, persistence/recovery tests, and integrated Admin access.

### Slice 7 — Admin presentation and shell integration

- Preserve exactly four bottom destinations: Drive, Timeline, Performance, Admin.
- Keep the settings icon in the upper corner as an expandable control; do not create a fifth bottom tab.
- Present the six Admin sections as a compact expandable list, with only one section expanded at a time.
- Keep the selected vehicle prominent and persistent throughout vehicle-specific sections.
- Business Settings remains business-wide and does not require vehicle selection.
- Use replaceable form definitions and presentation adapters over the stable public application contracts.
- Keep the Admin shell decoupled from form implementations, persistence adapters, and calculation code.
- Do not carry forward an existing presentation merely for compatibility if it conflicts with the approved shell; preserve the proven application/data foundations instead.

**Exit:** Navigation, forms, and presentation can be changed independently without altering domain/application tests, persisted records, or public contracts.

### Slice 8 — Integrated acceptance and release gate

- Full web/TypeScript, architecture, generated-feature-catalogue, and Android build/test suites.
- Room migration tests from every supported prior version and IndexedDB migration tests.
- Backup completeness, attachment/reference inventory, restore preflight, checkpoint-before-replacement, verification, and rollback tests with every new persistent participant.
- Offline create/edit/read/reload tests for each section.
- Interruption, duplicate command, retry, transaction failure, and recovery tests for every state-changing workflow.
- Cross-feature contract tests for vehicle context, driver assignment, trip-distance consumption, and Finance-owned Loan operations.
- Regression tests proving Drive/Work, Timeline, Performance, GPS, and existing recovery behavior are unchanged.
- Physical-device acceptance remains separate from automated CI and must be reported separately.

**Completion:** All six sections meet their product acceptance criteria, every persistent owner is registered and backed up, all enabled workflows are recoverable, and the full CI/release gate is green.

## 5. Explicitly out of scope

- A catch-all Admin database or parallel Admin finance ledger.
- Fleet dispatch, fleet tenancy, multi-driver tenancy, or a second Work/Shift/trip state machine.
- Unapproved business profile fields, currency settings, working-day settings, or extra business setup fields.
- Unapproved financial transaction categories or general-ledger calculations.
- Lender-specific interest conventions, fees, taxes, or variable rates outside an approved versioned contract.
- Rewriting stable application foundations or mass-moving existing packages solely for stylistic consistency.
- Replacing Room/IndexedDB ownership, backup/restore, or recovery mechanisms.

## 6. PR and merge discipline

- Keep this plan documentation-only.
- Deliver runtime work in small vertical PRs aligned to the slices above.
- Each PR states its exact capability owner, changed contracts, migration/backup impact, tests run, CI result, and remaining gates.
- Do not merge a runtime slice with failing required checks or unresolved data-loss/recovery risks.
- Do not describe Admin as complete while any of the six sections or their required persistence/backup/recovery workflows remain unimplemented.
