# Feature Extension Architecture

## Purpose

This is the implementation guide for the permanent Feature Extension Architecture. It builds on the existing feature, persistence, recovery, form, presentation, and shared-foundation contracts; it does not replace them or create a second runtime.

The architecture is intended to make new capabilities additive and reviewable. It is not a dynamic plugin loader and does not permit arbitrary runtime code loading. Feature code remains statically linked, typed, reviewed, and covered by CI.

## Extension package

A feature extension is one cohesive, versioned descriptor containing:
- A stable extension ID and extension version.
- The owning feature ID and its public `packages/features/<feature-id>/index.ts` entry point.
- A new feature definition when introducing a new feature; an existing feature may publish additive extensions without redefining its stable identity.
- The feature-owned versioned calculations.
- The feature-owned versioned cross-feature integrations.

The application layer owns runtime construction, validation, singleton lifecycle, and generic cross-feature event coordination. The outer application entry point statically composes feature extension descriptors and passes them to the application layer before mounting presentation. Feature packages publish descriptors only; they never initialize or own the global application registry. The application layer does not import feature packages, preserving explicit acyclic dependency direction.

Runtime bootstrap combines built-in features, optional new feature definitions, and extension contributions locally. It validates the complete feature graph, ownership of every contribution, integration dependencies, calculation regression fixtures, persistence contracts, and backup participants before returning one immutable registry. Any invalid contribution fails startup; no partial registry is exposed.

A calculation may only be contributed by its declared owner feature. An integration must involve its owning feature as producer or consumer. Cross-feature consumers still declare producer dependencies. Duplicate IDs, unknown owners, invalid versions, and non-public entry points fail closed. The runtime checks the canonical entry-point path, and the architecture CI gate verifies that the referenced public file actually exists in the checked-in feature package.

## Reusable feature scaffolding

Create a new feature package and its initial registry test from the checked-in templates:

```bash
npm run feature:create -- finance-insights "Finance Insights"
```

The generator creates:
- `packages/features/<feature-id>/index.ts` — the only supported public import surface.
- `packages/features/<feature-id>/runtime.ts` — a versioned feature definition and extension descriptor.
- `packages/features/<feature-id>/README.md` — the ownership and implementation checklist.
- `tests/features/<feature-id>.extension.test.ts` — a smoke test through the application-owned registry.

The generator validates a lowercase kebab-case ID and non-empty label, refuses to overwrite existing paths, and does not modify the application composition root. The generated feature is deliberately `non-persistent`; it cannot enable business writes. A feature that stores business data must first complete the full persistent-feature, migration, backup, restore, lifecycle, and adapter contracts. Add the descriptor to the outer composition root only after its contract and tests are ready. Templates are starting structure, not a substitute for feature-specific design or acceptance testing.

## Adding a new feature

1. Run the reusable feature scaffold generator and review all generated files.
2. Define the feature contract and explicit dependencies. Keep `non-persistent` only while the feature truly owns no persisted business data.
3. If the feature persists business data, provide the complete versioned persistence, migration, backup, restore, and lifecycle contract before enabling writes.
4. Keep domain rules and calculations in the feature's domain/application-owned implementation; keep forms and screens as replaceable adapters.
5. Publish one `FeatureExtensionDefinition` with its stable ID, version, owner, public entry point, feature definition, calculations, and integrations.
6. Add regression fixtures for every calculation and contract tests for every integration.
7. Export the descriptor from the feature's public entry point. The outer application composition root supplies it to the application-layer registry initializer; the feature must not initialize the global registry.
8. Do not add direct cross-feature imports or duplicate platform business logic.
9. Verify the feature through architecture, web, Android, migration, backup/restore, offline, recovery, and integrated regression gates as applicable.

## Adding a calculation to an existing feature

1. Identify the single owning feature and document the formula, inputs, units, rounding, effective-date semantics, missing-data behavior, and historical policy.
2. Implement the calculation as deterministic domain logic, independent of React, forms, storage, network, and Android.
3. Add a versioned calculation contract and mandatory expected-result fixtures, including boundary and invalid cases.
4. Publish it through an additive extension for the owning feature.
5. Integrate consumers only through explicitly versioned contracts. Existing metrics must retain their outputs unless an approved rule change explicitly says otherwise.
6. Preserve calculation ID, version, input/output schema versions, and effective date with results where historical provenance is required.

## Public feature API boundary

Every production consumer outside a feature package—including the application composition root, application services, and presentation—must import that feature through its package-level public entry point (`packages/features/<feature-id>` or its explicit `index.ts`). Private implementation modules such as `runtime.ts`, `projection.ts`, storage adapters, and internal domain files must not be imported directly from outside their owning feature. Imports between two different feature packages follow the same rule. Imports within one feature may use its private files.

The architecture CI gate resolves relative and aliased imports and rejects any external deep import into a feature package. This keeps implementation free to change without forcing unrelated consumers to change. A feature's public index is a deliberate compatibility surface; adding or removing an export is therefore a reviewed contract change.

## Isolation and compatibility

- A feature extension never edits another feature's private data or implementation.
- Shared core contains only stable cross-feature primitives, not feature-specific business rules.
- PWA and Android invoke the same domain/application calculation; only repository and platform adapters differ.
- Forms, presentation, and navigation may be replaced without changing calculation or persistence contracts.
- Persistent feature changes require explicit migrations and complete backup/restore participation.
- Historical rule changes require an explicit recalculation or preservation policy; never silently rewrite prior results.
- Extension removal is not data deletion. Persistent records remain protected by lifecycle, backup, and migration contracts.
- No mass directory move or unrelated refactor is justified solely to conform to this architecture.

## Verification and release claims

Automated CI must verify extension registration, duplicate/unknown IDs, dependency cycles, ownership boundaries, calculation fixtures, integration compatibility, public feature API imports, and existing regression suites. Persistent extensions additionally require migration and backup/restore compatibility tests.

A green CI run proves only the automated checks executed on that commit. Physical-device and live external-service acceptance remain separate release gates.
