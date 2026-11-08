# Sam Travels — Authority and Responsibility Allotment Map

**Status:** Governing architecture coordination map  
**Scope:** Feature ownership, authority boundaries, cross-feature integration, and implementation responsibility  
**Relationship to other contracts:** This map makes ownership and precedence explicit. It does not replace feature-specific product rules, technical contracts, or the Stage 5 lifecycle/reliability foundation.

## 1. Purpose

This document answers four questions for every capability:

1. Who owns the business meaning and rules?
2. Who may create or change authoritative records?
3. Which other capabilities may consume that information, and through what contract?
4. Which shared/platform layer supplies mechanics without taking over feature ownership?

The goal is additive integration. A new feature must be attachable without rewriting stable features, duplicating business rules, bypassing persistence/recovery, or forcing unrelated presentation changes.

This is an authority map, not permission to implement every listed capability. Product approval, implementation status, and release evidence remain separate.

## 2. Governing principles

1. **One authority per business responsibility.** Each entity, lifecycle, calculation, and decision has one declared owner. A consumer may display or use a value but does not become its owner.
2. **Source owns meaning; consumer owns its use.** The source feature validates and defines its data. A calculation or workflow consumer defines how it uses that data under an approved contract.
3. **Application coordinates; it does not absorb ownership.** Cross-feature use cases belong in an application coordinator with explicit dependencies, transaction boundaries, and recovery behavior. The coordinator must not become a catch-all business service.
4. **Public contracts only.** Cross-feature access uses typed commands, queries, capabilities, or versioned integration events through public feature entry points. No private table, component, repository adapter, or platform implementation access.
5. **Presentation is never authority.** Screens, forms, navigation, overlays, and UI state are replaceable adapters. They request commands and render authoritative projections.
6. **One durable store per runtime.** Browser-only PWA uses IndexedDB; installed Android uses Room. Android WebView and native overlay are clients of the same Room-backed authority, not competing stores.
7. **No silent side effects.** A feature cannot silently change another feature's data, permissions, lifecycle, calculations, or historical results.
8. **Version and recover every durable contract.** Persistent features require schema versions, migrations, backup/restore participation, lifecycle policy, and failure-path tests before writes are enabled.
9. **Fail closed at the right boundary.** Invalid required/core contracts block dependent operations. An optional feature failure should not disable unrelated capabilities; the precise activation/isolation policy remains a documented architecture gap to resolve without weakening required foundation checks.
10. **Do not build speculative infrastructure.** Reuse existing feature, extension, calculation, integration, persistence, and recovery mechanisms. No universal event bus, generic formula engine, dynamic plugin loader, microservices, or duplicate registries.

## 3. Authority precedence and conflict resolution

Use this order when documents or implementations disagree:

1. **Explicitly approved product decision** determines intended business behaviour and scope.
2. **The owning feature's product contract** records that behaviour for the capability.
3. **The owning technical contract** determines how that behaviour is safely implemented.
4. **Shared architecture and Stage 5 foundation contracts** govern cross-cutting guarantees and cannot be weakened by a feature specification.
5. **Implementation and tests** are evidence of delivery, not authority to redefine an approved rule.

A product decision may supersede an older generic product-scope restriction, but it does not waive technical safeguards. A technical conflict must be reconciled in the owning document; do not silently choose whichever implementation is easiest.

### Known reconciliations

- The approved Admin specification authorises bounded Driver profiles and Driver-to-Vehicle assignment history. This supersedes the older blanket prohibition in the Feature Module Contract; it does not authorise fleet dispatch, fleet tenancy, multiple concurrent driver shifts, or a second Work state machine. The Feature Module Contract must be read with this explicit scope exception.
- PR #57's merged Work/Driver lifecycle v2 and `WORK_DRIVER_TRIP_SNAPSHOT_INTEGRATION_CONTRACT.md` are the current implementation contracts for shift-start Driver/Vehicle context capture and trip-creation snapshots. The legacy Workflow V2 migration contract is retained as product/migration reference only; where its operational wording differs from the merged v2 contract or the current owner contracts, the current owner contract prevails. Preserve v1 history and pending-intent semantics; do not retrofit v2 meaning onto legacy events.
- The Feature Extension Architecture describes the intended static manifest catalogue and scaffold workflow, while the Stage 0 audit records gaps and earlier implementation evidence. Treat the audit as the implementation-status baseline until a fresh code/CI audit proves a gap closed. Documentation describing a target is not proof that runtime enforcement exists.

## 4. Capability authority and responsibility matrix

| Capability / layer | Owns (authoritative) | May consume | Must not own or do |
|---|---|---|---|
| **Platform / shared core** | Stable IDs and shared value types; contract primitives; runtime registry mechanics; migration runner mechanics; shared diagnostics interfaces | Feature declarations and platform adapter capabilities | Feature-specific business rules, calculations, records, or workflow state |
| **Work / Shift** | Active shift lifecycle; one active driver and one vehicle per shift; shift odometer readings; personal/business distance derivation; operational shift rotation and its recovery | Admin Driver/Assignment and Vehicle public queries at shift start; event-scoped location capability | Driver profiles, assignment history, vehicle master data, trip Fare rules, loan/compliance/maintenance records |
| **Driver operational workflow coordinator** | Single authoritative driver action state machine and ordered command/revision policy across PWA and Android; pending operational intents and their recovery | Work/Shift, Log Book/Trips, location, Admin assignment and Vehicle contracts | A second state machine in UI, overlay, Timeline, or Admin; direct cross-feature table writes |
| **Log Book / Trips** | Trip-history domain records/projections; trip-linked Fare, Toll, Parking and Cancellation Fee records and their entry invariants, subject to approved workflow transaction boundaries | Committed Work workflow events and immutable trip context; Finance/Performance read contracts where approved | Shift ownership, active driver selection, Admin assignment history, loan accounting, duplicated Work transitions |
| **Vehicle** | Vehicle identity, profile, lifecycle (active/inactive/sold), canonical registration identity | Admin vehicle selection and assignment use cases; Work shift-start validation | Driver profile, assignment history, shift lifecycle, vehicle-specific Compliance/Loan/Maintenance record ownership |
| **Admin / Driver Records** | Driver profile and lifecycle; driver-owned licence/contact details | Vehicle public API; Compliance read-only licence-expiry information; Work selection/eligibility queries | Work shift/trip state, duplicated licence records in Compliance, direct writes to Vehicle or Work private storage |
| **Admin / Driver Assignment** | Assignment identity, effective period, assignment history, reassignment rules; one active vehicle assignment per driver | Driver and Vehicle public contracts; Work validates the selected active assignment when a shift starts | Active shift lifecycle; trip history; retroactive mutation of captured operational context |
| **Compliance** | Compliance item records, validity periods, renewal links/history, supporting-document references, gap/overlap evaluation and its owned cost calculation | Selected Vehicle context; Driver licence-expiry read contract when relevant | Vehicle master data, Driver licence source records, Work state, or a second copy of compliance records |
| **Maintenance** | Maintenance records, service history, maintenance-specific cost/interval rules when approved | Selected Vehicle context; approved odometer/usage read contract | Vehicle master data, Work odometer writes, Finance loan/payment records |
| **Finance** | Loan records; EMI/amortization contract; payment, prepayment, settlement and closure records and their financial lifecycle once implemented | Vehicle identity; approved payment source and allocation contracts; Compliance/Maintenance cost data only through explicit approved calculations | Admin-owned vehicle/driver records, trip lifecycle, UI-owned calculations, or an unapproved general ledger/transaction model |
| **Performance** | Performance/reporting presentation and any explicitly assigned derived metric contract; reporting-period selection and result composition | Versioned public queries/calculations from Work, Log Book, Finance, Compliance, Maintenance and Vehicle | Source transactions, duplicate formulas, private-table reads, or silent changes to a source feature's accounting meaning |
| **Timeline** | Read-only chronological history; Asia/Kolkata calendar grouping; logical-shift presentation; date/week navigation; display projection and explicitly approved presentation-level summaries | Versioned public queries/contracts or published events from Work/Shift, Driver Workflow, Log Book/Trips and other approved source owners; application coordination | Shift/trip lifecycle, operational state machines, source records, odometer/GPS/financial authority, source-owned calculations, private-table reads, or duplicate persistence |
| **Backup / Recovery foundation** | Snapshot coordination, checkpoint/restore lifecycle, compatibility validation, recovery gates, cross-feature backup completeness | Registered persistent-feature participants and their versioned serializers/validators | Owning feature business records, inventing missing data, or bypassing participant-owned validation |
| **Application composition / integration layer** | Runtime construction, validated dependency graph, application-level orchestration, command/query routing, cross-feature transaction coordination and event delivery mechanics | Public feature descriptors, services, queries, commands, integrations and platform ports | Owning business rules, acting as a universal data store, exposing private feature internals, or creating duplicate registries |
| **Shared form foundation** | Reusable form mechanics: field state, presentation, accessibility, input handling, feedback, draft/recovery integration | Feature-owned form definitions and application submission ports | Business acceptance rules, calculations, direct persistence, feature lifecycle transitions |
| **UI shell / presentation** | Navigation, screen composition, layouts, interaction and visual design; presentation state | Registered feature screen contributions and typed application actions/queries | Business authority, durable state, permissions, calculations, direct database/platform access |

### Specific operational ownership split

The driver workflow needs a deliberate split rather than two competing owners:

- Work/Shift owns shift lifecycle, active shift context, odometer and logical shift rotation.
- The shared Driver Operational Workflow is the sole command/transition authority for the driver-facing shift/trip action sequence and ordered revision handling across surfaces.
- Log Book consumes committed workflow events and owns trip-history/financial-entry domain records and projections under explicit contracts.
- The durable Work event log remains replay authority for operational transitions. Timeline and other read models are projections, never command authority.

This split must be represented by public application contracts and atomic transaction coordination; it must not be implemented as separate competing state machines.

## 5. Approved operational context and snapshot authority

For each active shift:

- Exactly one Driver and one Vehicle are selected before shift start.
- The Driver and Vehicle cannot change during that active shift, including a logical 04:00 rotation.
- A Driver or Vehicle cannot belong to more than one active shift at a time.
- Admin owns the Driver profile, Vehicle owns the Vehicle profile, and Admin/Driver Assignment owns assignment history.
- Work validates eligibility at shift start and captures immutable context.
- Each trip creation captures the active shift ID, Driver ID, Vehicle ID, assignment ID, and operational date. Later Admin edits or reassignment must not rewrite that trip context.
- A newly inactive Driver or Vehicle blocks the next eligible shift start; it does not rewrite an already active or historical shift.

The exact transaction boundary for validating and snapshotting these cross-feature records must be implemented through the authoritative runtime store and public repository/application ports. A preflight-only UI check is insufficient.

## 6. Calculation authority and reporting allocation

Every calculation must have exactly one declared owner, a stable ID, a version, an effective-date policy, units, precision/rounding, input contract, missing-data behaviour, historical-result policy and regression fixtures.

- Source features own the meaning and validation of source values.
- The calculation owner owns the formula, inclusion/exclusion rules and output meaning.
- Performance consumes versioned outputs and composes the requested period. It does not silently recalculate another feature's formula.
- When Performance itself owns a derived metric, it must declare its source contracts and versioned calculation definition.
- A new feature can affect an existing metric only through an explicitly approved versioned integration with before/after regression fixtures.
- Actual transactions, schedules, estimates and derived values remain distinct.

For the approved trip financial semantics:
- Log Book owns Fare, Toll, Parking and Cancellation Fee records and their trip-entry invariants.
- Cancellation Fee is a separate income category and is included in daily income and approved Performance total income.
- Customer-paid Toll/Parking are pass-through amounts, not income or driver expenses.
- Driver-paid Toll/Parking are driver expenses in the approved trip-level calculation.
- Finance owns loan EMI/amortization and loan repayment calculations.
- Compliance owns the daily compliance cost calculation for its records.
- Performance consumes these contracts only where an approved metric defines that input.

## 7. Cross-feature integration contract

A cross-feature interaction must declare:

- Stable integration or query ID and contract version.
- Producer/source owner and consumer/using owner.
- Public entry points and required/optional dependencies.
- Exact fields/events consumed, identity and effective-time semantics.
- Validation and completeness/freshness requirements.
- Missing, disabled, stale, pending and invalid-data behaviour.
- Transaction boundary, idempotency key and retry/recovery policy for writes.
- Output meaning and expected downstream effects.
- Compatibility and historical-data policy.
- Contract, failure-path and regression tests.

Choose the narrowest suitable mechanism:

1. **Command** — request a state-changing operation from its owning capability.
2. **Query** — request read-only information from the owning capability.
3. **Versioned domain integration/event** — notify a declared consumer of a committed source fact.
4. **Application coordinator** — orchestrate a workflow involving multiple owners, with explicit atomicity or recoverable compensation.

Do not add a general-purpose event bus or allow consumers to reach into source storage.

## 8. Persistent feature onboarding and allotment sequence

Before a new feature can write business data:

1. Name its owner and bounded product responsibility; identify overlapping existing capabilities.
2. Declare its stable feature ID, version, public entry point, manifest and extension descriptor.
3. Declare required/optional dependencies and public integration/query contracts.
4. Define domain entities, invariants, commands, queries and lifecycle/state machines.
5. Assign every calculation to one owner and define regression fixtures.
6. Define repository ports and platform adapters: IndexedDB for browser-only PWA and Room for installed Android.
7. Define schema version, migrations from every supported version, idempotency and transaction boundaries.
8. Register complete backup/restore participation, references/attachments, lifecycle and deletion policy.
9. Add presentation/form/screen contributions as replaceable adapters, without adding business logic.
10. Add domain, application, adapter, migration, backup/restore, offline, failure-injection, architecture and cross-surface parity tests.
11. Validate the complete registry and dependencies before enabling writes.
12. Record actual CI/device evidence separately from design approval.

A generated non-persistent scaffold is not permission to persist business records. A feature with incomplete persistent registration must remain unavailable for business writes.

## 9. Change-impact and approval rules

Before changing an existing contract, identify:

- Owning capability and public contract/version.
- Source records and persistence schemas affected.
- Producers, consumers, dependencies and application coordinators.
- Calculations and historical outputs affected.
- Forms, screens, navigation and native overlay surfaces affected.
- Migrations, backups, restores, recovery and deletion implications.
- Tests and CI jobs required to prove unchanged behaviour and the approved change.

The change must be implemented by the owner of the affected responsibility. Consumers should need only a compatible public-contract update. Cross-feature changes are coordinated in one integrated change set where practical, not split into many speculative PRs.

## 10. Known gaps and reconciliation queue

The Driver scope wording and v2 operational-context reconciliation above are documented as resolved references; they are not acceptance claims for runtime behaviour. The remaining items below are not silently treated as completed:

1. **Driver scope wording:** update the Feature Module Contract to reflect the explicit bounded Admin Driver/Assignment approval.
2. **Workflow snapshot contract:** reconcile the older trip-start-only snapshot contract with Workflow V2's separate trip creation and Start Ride events and the approved one-shift/one-driver/one-vehicle context.
3. **Feature discovery evidence:** reconcile the static manifest/catalogue implementation claims with the Stage 0 audit and prove the current checked-in generator/catalogue/CI behaviour.
4. **Failure isolation:** define core-required, optional feature, and dependent-feature activation behaviour so an optional feature failure does not disable unrelated features while invalid required contracts still fail closed.
5. **Multi-source data orchestration:** add only the missing typed query/coordinator contract for period/effective-date consistency, source completeness/freshness and explicit unavailable states.
6. **UI contribution registration:** add feature-owned screen/navigation contributions and replaceable composition without turning the shell into a business owner.
7. **Calculation provenance/change impact:** trace source records → validation → calculation version → published result → presentation, with privacy-safe diagnostics.
8. **Runtime status verification:** current documents describe both target contracts and implementation findings. Re-audit source and CI before marking any item complete.

The existing Stage 5 persistence, backup, migration, restore, recovery and lifecycle mechanisms remain authoritative. Do not create replacements for them.

## 11. Verification requirements

The architecture is accepted only when tests demonstrate:

- One owner for each business entity, lifecycle and calculation.
- Public API-only cross-feature access and enforced dependency direction.
- A feature can be added without editing unrelated feature internals.
- Invalid ownership, duplicate IDs, missing dependencies, cycles and incompatible versions fail closed.
- Optional feature failure isolation follows the approved activation policy.
- Persistent feature registration is complete before writes are enabled.
- Browser IndexedDB and Android Room enforce equivalent logical contracts without Android dual writes.
- Multi-feature queries preserve identity, effective date/period, completeness and unavailable states.
- PWA and Android surfaces invoke the same application commands and calculations.
- Backup, restore, migration, interruption and recovery preserve all registered feature records and relationships.
- Replacing the shell, screen renderer or form presentation does not change business rules or persisted records.
- Calculation regression fixtures prove unchanged and intentionally changed outputs.
- Change-impact evidence identifies affected consumers, calculations, screens, data and tests.
- Physical-device acceptance is recorded separately from emulator/CI evidence where required.

## 12. Governing references

- [Permanent Application Architecture](PERMANENT_APPLICATION_ARCHITECTURE.md)
- [Permanent Application Architecture — Stage 0 Audit](PERMANENT_APPLICATION_ARCHITECTURE_AUDIT.md)
- [Architecture Foundation Contract](ARCHITECTURE_FOUNDATION_CONTRACT.md)
- [Feature Module and Extension Contract](FEATURE_MODULE_CONTRACT.md)
- [Feature Extension Architecture](FEATURE_EXTENSION_ARCHITECTURE.md)
- [Admin Functional Specification](ADMIN_FUNCTIONAL_SPECIFICATION.md)
- [Workflow V2 Migration and Integration Contract](AUTHORITATIVE_WORKFLOW_V2_MIGRATION_AND_INTEGRATION.md)
- [Work Driver Trip Snapshot Integration Contract](WORK_DRIVER_TRIP_SNAPSHOT_INTEGRATION_CONTRACT.md) — subject to the reconciliation in Section 10
- [Transaction and Recovery Contract](TRANSACTION_AND_RECOVERY_CONTRACT.md)
- [Form Architecture and Behaviour Contract](FORM_ARCHITECTURE_AND_BEHAVIOUR_CONTRACT.md)
- [UI/UX Shell Foundation Contract](UI_UX_SHELL_FOUNDATION_CONTRACT.md)
- [Finance and Performance Calculation Approval](FINANCE_PERFORMANCE_CALCULATION_APPROVAL.md)

If this map conflicts with a detailed owner contract, resolve the conflict by updating the appropriate owner document through review. Do not use this map to bypass technical safeguards or invent unapproved product behaviour.
