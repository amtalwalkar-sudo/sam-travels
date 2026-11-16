# Sam Travels System Blueprint

**Status:** Documentation architecture overview for the approved single-driver product.  
**Authority:** This blueprint explains the system and its boundaries. It does not replace product specifications, calculation contracts, persistence contracts, platform contracts, or acceptance gates.  
**Navigation:** Start at the [Contract and Documentation Index](CONTRACT_INDEX.md) or the [Documentation Catalog](DOCUMENTATION_CATALOG.md).

## 1. Product in one paragraph

Sam Travels is an offline-first, single-driver Driver Log Book and business-operations application. It supports the operational Drive/Work workflow, trip records, vehicle and business expenses, finance/compliance/maintenance records, reporting and administration. It runs as a browser PWA and as an installed Android application. The Android WebView and native surfaces share one authoritative Room-backed application state; a browser-only PWA uses IndexedDB. The product is not a fleet-dispatch or multi-driver tenancy system.

## 2. System at a glance

```text
User
 |
 v
Presentation
  Application shell / navigation
  Replaceable feature screens / forms / components
  Presentation models / transient UI state
 |
 | typed queries and approved actions
 v
Application
  Use cases / command-query orchestration
  Cross-capability coordination
  Lifecycle and recovery gates
 |
 | ports / public capability contracts
 v
Domain and calculation owners
  Business invariants / state transitions
  Authoritative calculations / validation
  Effective dates / units / rounding / provenance
 |
 | repository and integration ports
 v
Authoritative persistence and reliability
  Browser-only PWA: IndexedDB
  Installed Android: Room
  Transactions / idempotency / outbox / recovery
  Backup / restore / schema migration
 |
 v
Platform and external adapters
  Browser / Capacitor / Kotlin Android
  GPS / native overlay / network gateway / Dropbox
```

Dependencies point inward. Domain and calculation owners do not depend on React, browser storage, Room, Capacitor, Android APIs, or external SDKs. Presentation does not reach directly into repositories, tables, native plugins, or another feature's private implementation.

## 3. Six documentation areas

The six areas are navigation and ownership groupings, not six runtime packages and not a mandate to move every existing file into a new directory.

1. **Product and business rules** — approved scope, user workflows, operational rules, and feature behaviour.
2. **Calculation foundation** — calculation ownership, formulas, inputs, outputs, effective dates, rounding, provenance, dependencies, and historical treatment.
3. **Application architecture** — domain/application boundaries, capability contracts, composition, persistence, platform adapters, lifecycle, security, and recovery.
4. **UI/UX architecture** — shell, navigation, screen contracts, forms, components, presentation state, and platform presentation parity.
5. **Quality and release** — automated tests, architecture enforcement, CI, migration/backup verification, Android builds, and acceptance.
6. **Historical records and references** — audits, progress snapshots, completed phases, proposals, design artifacts, and service setup references.

The [Documentation Catalog](DOCUMENTATION_CATALOG.md) assigns every tracked Markdown document one primary navigation area and explains its role. A document's category does not itself grant authority.

## 4. Business and calculation authority

Every business rule has one owning product/feature contract. Every calculation has one named calculation owner. A calculation contract must identify, where applicable:

- Stable calculation identity and version.
- Owner and intended consumers.
- Input records, source authority, units and eligibility.
- Effective-date and operational-date semantics.
- Inclusion/exclusion rules and treatment of missing, stale, partial or unavailable inputs.
- Formula, precision, rounding and currency.
- Output meaning, period and aggregation behaviour.
- Historical reproducibility, correction/restatement policy and provenance.
- Idempotency and persistence expectations for materialized results.
- Regression fixtures and downstream impact.

Source features own the meaning and validation of source facts. The calculation owner owns the formula and output meaning. Consumers such as Performance compose approved outputs; they do not silently reproduce a source owner's calculation.

A calculation flow should be traceable end to end:

```text
Source fact / schedule
  -> source validation and effective-date interpretation
  -> owning calculation
  -> versioned result + provenance
  -> application query / projection
  -> screen or report
```

The [Calculation Authority and Application Wiring Audit](CALCULATION_AUTHORITY_AND_APPLICATION_WIRING_AUDIT_V1.md) records known wiring gaps and policy conflicts. Those findings are not automatically approved policy changes.

## 5. Application responsibility boundaries

- **Domain:** owns business entities, invariants, state transitions and pure business calculations.
- **Application:** owns use-case orchestration, command/query boundaries, cross-capability workflows and lifecycle gates.
- **Ports/contracts:** describe the capabilities required without naming concrete adapters.
- **Persistence adapters:** implement repository contracts for the active runtime; they do not own business meaning.
- **Platform adapters:** provide browser/Android capabilities behind typed interfaces.
- **Integrations:** provide external transport such as Dropbox or optional enrichment through explicit network and security policy.
- **Composition root:** constructs and connects validated modules. It must not become a second owner of feature rules.

One capability owns each business entity and lifecycle. Cross-capability access uses explicit public commands, queries, committed events or application coordinators. No direct private-table access or duplicate state machines.

## 6. Persistence, transactions and recovery

There is one authoritative local business store per runtime:

- Browser-only PWA: IndexedDB.
- Installed Android: Room, shared by WebView and native Android surfaces.

A write is durable only after the authoritative repository confirms its commit. Multi-record transitions, their state projection/revision, terminal status and same-store outbox work must follow the transaction contract. External effects are recoverable, idempotent work; transport is at-least-once, not exactly-once.

Recovery reconstructs from durable authoritative state, preserves original identities and idempotency keys, and never fabricates missing evidence or silently discards records. Backup/restore, migrations and reset follow their dedicated contracts.

## 7. Replaceable UI/UX

The UI/UX system is an outer presentation layer. Its responsibilities are independently replaceable:

- Application shell and global composition.
- Navigation and destination registration.
- Individual feature screens.
- Within-screen layout, visual components and styling.
- Forms and input presentation.
- Presentation models, formatting and transient state.
- Interaction adapters that dispatch approved application actions.

A visual redesign or replacement of an existing screen must not change business rules, calculations, durable data, repository ownership, recovery or unrelated screens. A genuinely new business capability still requires an approved domain/application contract.

A screen receives a presentation-ready model and a narrow set of approved actions/queries. It must not receive unrestricted calculation services or database/native access. Shell replacement, individual screen replacement and within-screen visual replacement each require production-level integration tests.

## 8. Cross-platform consistency

PWA and Android may have different presentation and platform adapters, but they must preserve the same approved business semantics and calculation contracts. Android native overlay and WebView are two clients of one Room-backed application state, not separate driver workflows. Browser-only PWA uses IndexedDB behind the same logical repository/application contracts.

Platform-specific differences are permitted only where a platform capability genuinely differs; those differences must be explicit and tested. CI evidence, emulator evidence, physical-device acceptance and live third-party account acceptance are distinct.

## 9. Documentation authority and change control

Use the [Contract and Documentation Index](CONTRACT_INDEX.md) to locate the normative owner. Use the [Documentation Catalog](DOCUMENTATION_CATALOG.md) to understand the role and navigation category of every Markdown file.

Precedence:

1. Explicitly approved product decision determines intended product behaviour.
2. The owning product/feature contract records the approved behaviour.
3. The owning technical contract governs safe implementation.
4. Shared architecture, persistence, transaction, security and platform safeguards remain mandatory.
5. Implementation, tests and audits provide evidence; they do not silently redefine policy.

When a rule changes, update its owner first, then update impacted consumers, catalog/index references, tests and change-impact evidence. Do not duplicate a rule in this blueprint.

## 10. Refactoring entry criteria

Application refactoring must not begin until:

- The six-area catalog and authority index are complete and links validate.
- Each relevant product rule and calculation has one clear owner.
- Known policy conflicts are explicitly decided or explicitly held unchanged.
- Source-to-calculation-to-consumer wiring has been inventoried.
- The application and presentation boundaries are documented and acceptance tests are agreed.
- Historical and current implementation status are distinguished.
- Documentation CI and repository CI pass on the exact documentation baseline.

The implementation strategy remains one consolidated architecture implementation PR after the documentation/decision phase. This blueprint does not authorize code changes by itself.

## 11. Detailed owner contracts

The [Contract and Documentation Index](CONTRACT_INDEX.md) is the authoritative navigation for detailed contracts. In particular:

- Product and workflow rules: Driver Workflow, Work/Shift Odometer, Fuel/Business Expense, Finance, Compliance and Admin product contracts.
- Calculations: Business Start Date Allocation, Breakeven/Driver Target, Finance Loan Calculation, Fuel/Business Expense and the approved feature calculation owners.
- Architecture: Architecture Foundation, Feature Module, Local Persistence, Persistence Schema, Transaction and Recovery, Application Lifecycle, Platform and Security contracts.
- Presentation: UI/UX Shell Foundation, Form Architecture, Admin Presentation Replacement, Driver Overlay and Timeline presentation contracts.
- Verification: Architecture Enforcement, Platform Acceptance, Android Device Readiness, Form Conformance and feature-specific audits.
