# Feature Module and Extension Contract

## Purpose and product boundary

Sam Travels is a single-driver Driver Log Book + ERP. Modules represent the owner's work, vehicle, trips, records, and business operations. Do not add fleet dispatch, driver rosters, driver assignment, or multi-driver tenancy without an explicit product-scope decision.

## Module boundaries

Each feature module owns its typed domain entities, invariants, calculations, application use cases, repository interfaces, validation, and migrations for its data. Presentation components and forms are adapters over application use cases; they do not own calculations, persistence, or cross-feature business rules.

A module exposes a small, versioned public contract. Other modules interact through typed application services, commands, queries, and domain events—not by importing internal components, reaching into another module's tables, or mutating its state directly.

Initial feature areas:
- Work and Shift
- Log Book and Trips
- Finance
- Vehicle
- Performance
- Admin
- Backup and Recovery

These are product areas, not permission to build a generic fleet platform.

## Capability ownership

A capability is the unit of ownership and change. Its domain rules, use cases, repository/platform ports, adapters, presentation, and tests must be identifiable without searching through unrelated global files. Prefer the `packages/features/<capability>/` structure documented in [ARCHITECTURE.md](../ARCHITECTURE.md). Keep the current driver workflow stable while moving it incrementally; a directory migration is not a reason to rewrite working behaviour.

The capability's public entry point is its only supported cross-capability import surface. Internal files remain private implementation details. Shared core contains only concepts that are truly common and stable; it must not accumulate capability-specific logic.

## Add-on and change-isolation rules

- A new module or calculation must be registerable without rewriting stable modules.
- UI/UX, navigation, forms, and presentation can be replaced without changing domain rules or persistence contracts.
- A form can be redesigned or added without changing the module's stable application wiring.
- Calculations are domain-owned, pure where practical, versioned when historical outputs depend on their rules, and independently tested.
- Persistence changes remain behind repositories and explicit versioned migrations.
- Feature registration is explicit and typed; module dependencies are declared and checked. Avoid hidden global registries with unrestricted access.
- A module may add optional capabilities but cannot silently change another module's data, permissions, network behavior, or lifecycle state.
- Cross-module workflows use an application coordinator with explicit transaction boundaries and compensating/recovery behavior where a single database transaction cannot cover the workflow.
- No capability may import another capability's private UI, tables, persistence adapter, or platform implementation.
- No catch-all file may own unrelated capabilities. Split files by cohesive responsibility; avoid minified source and giant components/services/repositories.
- Keep source files at or below 400 lines and 24 KB. Exceptions require an explicit reviewed architecture decision and should be temporary.

## Shared platform contracts

Every module must:
1. Work offline by default; online behavior requires an explicitly registered capability through the network gateway.
2. Read/write through the runtime's authoritative repository (Room on Android; IndexedDB in browser-only PWA).
3. Use typed commands/queries and stable IDs; replayable commands must be idempotent.
4. Respect shared driver state and the PWA/native overlay coordinator; never create a second shift/trip state machine.
5. Avoid continuous GPS. Location can only be requested through the approved event-scoped location capability for the five defined lifecycle events.
6. Keep presentation responsive and move storage, location, and network work off the UI thread.
7. Preserve records through migrations, restore, and recovery; never silently clear or rewrite history.
8. Supply domain, repository, migration, UI, offline, and failure-path tests appropriate to the module.

## Forms and presentation

Forms are replaceable presentation adapters. They use shared typed field/value contracts and module validation/application services. Do not embed database writes or business calculations in form components. Input formatting, accessibility, responsive layout, and validation feedback belong to presentation; authoritative validation belongs to the domain/application boundary.

## Versioning and compatibility

- Public module contracts and persisted schemas have explicit versions.
- Breaking changes require migration notes, supported-version policy, and tests.
- Additive fields should have safe defaults or explicit absence semantics.
- Unknown fields/versions must not be silently misinterpreted.
- Module removal or replacement requires an explicit data-retention/migration decision; unregistering UI must not delete records.
- Architecture tests enforce dependency direction and prevent direct storage/network/platform bypasses.

## Acceptance checks

- Replace a module's UI without changing its domain tests or persisted records.
- Add a new form through the application contract without modifying unrelated forms.
- Add a calculation without changing existing stable module wiring.
- Verify modules cannot directly write another module's tables or bypass repositories/network gateway.
- Verify every module remains usable offline and has explicit recovery/migration tests.
