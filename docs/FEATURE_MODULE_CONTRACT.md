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

## Mandatory persistent-feature registry

Every feature that persists business data must have exactly one explicit registration. No persistent feature is exempt. Registration is a typed, versioned contract and must declare:
- Stable feature ID and public application entry point.
- Owned entities/repositories and schema version.
- Migration sequence from all supported prior versions.
- Required/optional dependencies and public integration contracts.
- Backup snapshot/export participation and required attachment/reference inventory.
- Restore compatibility, validation, and recovery participation.
- Lifecycle and deletion policy.
- Registration, migration, dependency, backup, restore, and failure-path tests.

A feature with missing or invalid registration must not be enabled for persistent writes. Duplicate IDs, missing dependencies, unsupported versions, absent migrations, or missing backup/restore declarations fail closed. The registry is metadata and coordination, not a replacement for feature-owned persistence or domain invariants.

## Feature lifecycle and data retention

- Hiding, disabling, or unregistering a feature's presentation never deletes or mutates its records.
- Disabled feature records remain included in normal business backups and are available to migration, restore, and recovery.
- Permanent deletion is a distinct, explicitly confirmed domain/application operation.
- Before deletion, resolve required dependents and reject the operation until dependencies are safely removed or migrated.
- Deletion has a defined scope, audit/recovery safeguards, and interruption/retry tests.
- Removing or replacing feature code requires a versioned data migration/retention plan; UI removal is never a deletion instruction.

## Complete backup and restore participation

Normal business backup includes all registered persistent business features and their required dependencies. Do not expose a user-facing omission option that can create an incomplete business backup.

The backup coordinator discovers participants through the validated registry. Each participant supplies versioned snapshot/export and restore-validation contracts, including relationships and attachments required to reconstruct its data. Do not rely on a separate manually maintained table allowlist that can drift.

Restore validates all required participants and dependencies before replacement, creates a recovery checkpoint, requires explicit confirmation, stages and validates the complete dataset, and commits or rolls back recoverably. Unknown required features, incompatible schemas, missing attachments, or broken relationships fail closed. Existing backup encryption formats remain compatible.

This is a required architecture contract; it does not assert that the current backup code already performs registry-driven discovery. Verify the actual snapshot and restore implementation before claiming completeness.

## Calculation ownership and integrations

Each calculation has one owning capability and a versioned contract recording its formula, units, precision/rounding, input sources, period semantics, inclusion/exclusion rules, missing-data behavior, output meaning, effective-date policy, and regression fixtures.

New feature data affects an existing calculation only through an explicitly approved, versioned integration contract. It must identify consumed data, mapping, timing/effective date, missing/disabled-feature behavior, and expected output effects. Until that integration is approved and tested, existing calculation behavior remains unchanged.

Calculations are owned by domain/application services, not forms or presentation components. Cross-feature inputs flow through public application contracts or published events, never direct reads/writes of another feature's private tables. Preserve actual values separately from estimates and schedules. Changes to historical calculation rules require an explicit, reviewed recalculation/migration policy.

Before implementing a new feature that affects existing metrics, inventory the current calculations, formulas, inputs, and consumers and add regression fixtures for unchanged behavior and approved changes.


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
- Verify a queued driver intent and its revision/state preconditions survive browser IndexedDB close/reopen and Android Room close/reopen; verify recovery records it exactly once.
- Verify native overlay and PWA command races cannot commit two events for one expected revision.
- On a physical Android device, test app process interruption while awaiting GPS, service restart, permission denial/regrant, GPS timeout/retry, offline launch, and device reboot. These lifecycle checks are a release acceptance gate; emulator CI alone does not establish them.
- Verify committed event, state projection, intent terminal status, and outbox record are atomic and consistent after interruption/relaunch.
