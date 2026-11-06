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

Runtime bootstrap combines built-in features, optional new feature definitions, and extension contributions locally. It validates the complete feature graph, ownership of every contribution, integration dependencies, calculation regression fixtures, persistence contracts, and backup participants before returning one immutable registry. Any invalid contribution fails startup; no partial registry is exposed.

A calculation may only be contributed by its declared owner feature. An integration must involve its owning feature as producer or consumer. Cross-feature consumers still declare producer dependencies. Duplicate IDs, unknown owners, invalid versions, and non-public entry points fail closed. The runtime checks the canonical entry-point path, and the architecture CI gate verifies that the referenced public file actually exists in the checked-in feature package.

## Adding a new feature

1. Create `packages/features/<feature-id>/` with a public `index.ts`.
2. Keep domain rules and calculations in the feature's domain/application-owned implementation; keep forms and screens as replaceable adapters.
3. Define the feature contract and explicit dependencies. Use `non-persistent` only while the feature truly owns no persisted business data.
4. If the feature persists business data, provide the complete versioned persistence, migration, backup, restore, and lifecycle contract before enabling writes.
5. Publish one `FeatureExtensionDefinition` with its stable ID, version, owner, public entry point, feature definition, calculations, and integrations.
6. Add regression fixtures for every calculation and contract tests for every integration.
7. Register the extension at application bootstrap. Do not add direct cross-feature imports or duplicate platform business logic.
8. Verify the feature through architecture, web, Android, migration, backup/restore, offline, recovery, and integrated regression gates as applicable.

## Adding a calculation to an existing feature

1. Identify the single owning feature and document the formula, inputs, units, rounding, effective-date semantics, missing-data behavior, and historical policy.
2. Implement the calculation as deterministic domain logic, independent of React, forms, storage, network, and Android.
3. Add a versioned calculation contract and mandatory expected-result fixtures, including boundary and invalid cases.
4. Publish it through an additive extension for the owning feature.
5. Integrate consumers only through explicitly versioned contracts. Existing metrics must retain their outputs unless an approved rule change explicitly says otherwise.
6. Preserve calculation ID, version, input/output schema versions, and effective date with results where historical provenance is required.

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

Automated CI must verify extension registration, duplicate/unknown IDs, dependency cycles, ownership boundaries, calculation fixtures, integration compatibility, and existing regression suites. Persistent extensions additionally require migration and backup/restore compatibility tests.

A green CI run proves only the automated checks executed on that commit. Physical-device and live external-service acceptance remain separate release gates.
