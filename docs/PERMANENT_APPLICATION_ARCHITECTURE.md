# Sam Travels — Permanent Application Architecture

**Status:** Approved and frozen scope; Stage 0 audit complete; implementation proceeds through the subsequent stage gates.  
**Approach:** Additive, incremental, backward-compatible architecture enhancement.  
**Foundation:** Existing Stage 5 remains authoritative for lifecycle and reliability.

## 1. Objective

Build permanent application architecture that makes features independently addable, connectable, modifiable, maintainable, and retireable. Correctly structured features should be discovered, validated, registered, connected through declared contracts, and made available to the application without unnecessary central-file wiring.

This is architecture itself—not a temporary bridge, patch, or disposable framework. The architecture automates integration; it does not invent or implement a feature's business behaviour.

## 2. Independent feature architecture

Each feature owns its business logic and rules, business data and persistence contracts, calculations and validations, published services/capabilities, and its screens/forms/UI contributions. Features communicate through explicit, stable, versioned contracts. They must not reach into another feature's private implementation, tables, UI, or adapters.

A feature may obtain information from multiple features, validate source completeness/freshness, execute its own business rules and calculations, and publish validated results without coupling itself to source internals.

## 3. Automatic feature integration

For correctly structured features, the platform should:
1. Discover feature declarations deterministically (prefer build-time discovery where practical; no arbitrary runtime code/file loader).
2. Read identity, version, ownership, capabilities, dependencies, data/service/calculation contracts, permissions, lifecycle requirements, and UI contributions.
3. Validate declarations, contract versions, ownership, duplicate IDs, dependency availability and cycles.
4. Register feature-owned services, rules, calculations and integrations.
5. Resolve dependencies and coordinate multi-source data through declared interfaces.
6. Validate input completeness, freshness, units and outputs; represent missing, stale, pending, unavailable and invalid states explicitly.
7. Register routes, screens, forms, actions and navigation contributions.
8. Make only fully valid contributions available; fail closed rather than exposing a partial registry.
9. Provide useful registration, dependency, execution and troubleshooting diagnostics.
10. Delegate persistence, backup/restore, migration, recovery, upgrades and lifecycle to Stage 5 mechanisms.

Feature discovery/registration must be controlled and inspectable. It does not mean arbitrary dynamic plugin loading or AI feature development.

## 4. Independent UI/UX architecture

The UI/UX architecture is itself modular and independently replaceable. Its logical responsibilities include:
- Application shell and composition.
- Navigation, routes, tabs and menus.
- Layout and viewport management.
- Design system, themes, typography, spacing and styling.
- Reusable UI components.
- Form presentation and interaction.
- UI state and interaction coordination.
- Feature-owned screens and presentation.

Each subsystem communicates through defined interfaces. The shell composes the application but does not own feature business logic. Forms remain independent of business rules and persistence. Features contribute UI through contracts and do not manipulate shell internals.

## 5. NON-NEGOTIABLE: unrestricted user-facing UI design

The architecture must not impose predefined or restrictive screens, layouts, visual styles, navigation structures or interaction designs.

The developer retains freedom to design, customise, replace or completely redesign the application shell, dashboards, screens, navigation, page layouts, forms, fields, tables, cards, controls, themes, colours, typography, spacing, animations, interactions and responsive behaviour.

Reusable components and design-system defaults are optional starting points, not mandatory designs. Completely custom screens/components must be supported when standard components do not meet the intended design.

Custom UI must integrate with feature contracts without requiring changes to business logic, data ownership, calculations or persistence.

**Acceptance test:** Completely redesign the user-facing shell and replace individual UI subsystems without rewriting feature business logic or disrupting persistence, calculations, lifecycle, or existing stable behaviour.

## 6. Application composition

A thin application composition layer connects feature modules, feature integration, independent UI/UX subsystems and Stage 5 mechanisms. It coordinates them without absorbing their responsibilities or creating unnecessary dependencies.

## 7. Stage 5 remains authoritative

Reuse and extend existing Stage 5 contracts, compatibility/versioning, registries, persistence, backup/restore, migrations/upgrades, recovery, lifecycle and regression enforcement. Do not create duplicate registries, lifecycle, migration, backup or recovery systems. Do not rewrite stable functionality just to adopt new terminology or folder structures.

## 8. Six architectural safeguards

1. **Clear ownership:** one clear owner for every responsibility; no overlapping ownership.
2. **Stable contracts and controlled changes:** compatibility and downstream impact checked before contract changes are activated.
3. **Failure isolation:** one feature/screen failure must not unnecessarily take down the application; errors are safe and diagnosable.
4. **UI composition rules:** features contribute through extension points and cannot manipulate global shell internals or other feature UI.
5. **Consistent UX without design restriction:** shared expectations for responsiveness, accessibility, validation, loading/empty/unavailable/error states and interaction conventions; these do not constrain custom design.
6. **Change-impact and regression protection:** identify affected modules/contracts/calculations/screens/data/tests and verify unchanged behaviour.

## 9. Supporting requirements (within existing architecture)

- Explicit data/calculation input/output contracts, units, precision/rounding, effective dates and historical reproducibility where required.
- Explicit missing/stale/incomplete/unavailable/invalid states; no silent coercion of unknown values to zero or complete-looking outputs.
- Direct service/query contracts and change notifications only where useful; no mandatory universal event bus.
- Feature-appropriate offline behaviour, local operation, synchronization and conflict handling.
- Declared permissions enforced by platform boundaries.
- Efficient queries and selective recalculation; caching/optimization only when justified.
- Feature disable/retire must not silently delete business data or break dependents; use Stage 5 lifecycle/recovery.
- Progressive complexity: simple features remain simple; advanced capabilities are required only when genuinely needed.
- Diagnostics should trace source → validation → calculation → published result/UI where relevant, while respecting privacy.

## 10. Explicit exclusions

Do not introduce microservices/distributed architecture, a universal event bus, generic formula engine, universal UI generation engine, separate plugin marketplace, duplicate global registries, sophisticated visual dependency editor, premature optimization frameworks, replacement lifecycle/backup/migration/recovery systems, or AI-based feature development/business-rule invention.

## 11. Implementation stages

### Stage 0 — Existing architecture audit
Audit merged Stage 5, registries/contracts/manifests, feature discovery/registration, dependency resolution, cross-feature communication/data access, calculations/validation, UI shell and subsystem boundaries, persistence/backup/restore/upgrades/recovery, tests and CI. Classify every requirement as **Already implemented**, **Partially implemented**, **Missing and necessary**, or **Not necessary currently**. Produce architecture inventory, dependency map, gap analysis, risk assessment and exact gap-based implementation plan. **No implementation before audit findings are reviewed.**

### Stage 1 — Feature discovery and declarations
Define/confirm standard feature structure, manifests, identity/version/ownership/capability/dependency/data/service/calculation/UI declarations; integrate existing registration; deterministic discovery/validation; reject invalid/duplicate declarations.

### Stage 2 — Dependency resolution and registration
Resolve dependencies; check contract compatibility; detect missing/circular dependencies; determine activation order; register services/rules/calculations; prevent partial activation; expose status.

### Stage 3 — Data coordination and business execution
Define data access contracts; coordinate multi-feature queries; support effective dates/reporting periods; validate completeness/freshness; execute feature-owned rules/calculations; validate inputs/outputs; handle unavailable/invalid data; publish validated results; preserve historical accuracy where required.

### Stage 4 — Independent UI/UX architecture and integration
Establish shell boundaries; define navigation/layout/design-system/component/form/UI-state contracts; separate form presentation from business rules/persistence; define feature screen/navigation contribution contracts; integrate registration with composition; prove custom UI freedom and preserve stable screens.

### Stage 5 — Diagnostics and maintainability
Expose feature registration/activation, dependencies/compatibility, published services/calculations, relevant data-to-result traces, failures, contract change impact, privacy-safe logs/errors and developer/reference documentation.

### Stage 6 — End-to-end verification and enforcement
Add conformance tests for discovery, registration, dependency resolution, multi-source data, calculations, feature UI, independent UI replacement and complete shell redesign, failure isolation, Stage 5 persistence/backup/restore/migration/recovery/upgrade integration, regression suites and web/Android/integrated CI.

A disposable test fixture/reference extension may prove integration. The first real business feature remains out of scope.

## 12. Implementation rules

- No broad rewrite, duplicate infrastructure, replacement of working Stage 5 mechanisms or unrelated feature changes.
- Each stage leaves working, tested code; changes are isolated and incremental.
- Run relevant tests/regression checks after each stage; resolve failures before proceeding.
- Preserve existing data and behaviour.
- Update architecture documentation with implementation.
- Do not onboard the first real business feature.
- Do not claim completion without CI evidence.

## 13. Final acceptance criteria

1. Correctly structured features are discovered and registered.
2. Dependencies resolve through stable contracts.
3. Features can consume multiple independent sources without internal coupling.
4. Business logic/calculations remain feature-owned and validated.
5. Validated results reach the UI.
6. Feature screens/navigation integrate automatically.
7. The shell can be completely redesigned without rewriting feature business logic.
8. Navigation, layout, design system, components and forms evolve independently.
9. The developer has unrestricted freedom to create custom user-facing interfaces.
10. Custom UI does not require changes to business logic or persistence.
11. Failures are isolated and diagnosable.
12. Change impact is identifiable.
13. Stage 5 remains authoritative for lifecycle, persistence, backup, recovery and upgrades.
14. Existing stable functionality remains operational.
15. Web, Android and integrated CI verification pass.

## 14. Permanent architectural principle

**Features own their functionality. UI subsystems own their presentation responsibilities. The integration layer connects them through contracts. The application composition layer brings them together. Stage 5 protects lifecycle and data. The developer has complete freedom over user-facing design.**

The platform handles necessary integration complexity without making feature development or UI customisation unnecessarily complicated.
