# Stage 2 — Dependency Activation and Failure Isolation Audit

**Status:** Initial source audit complete; implementation work begins on this branch.  
**Baseline:** Stage 1 merged main, commit `4d4b2006887e2c919fed8d118c2762868975bb8e`.  
**Scope:** Additive runtime activation and isolation only. Stage 5 remains authoritative.

## Existing implementation verified

- `packages/core/src/features.ts` owns the built-in feature definitions, dependency types, persistent-feature contracts, strict registration, backup-participant derivation, and dependency-first startup ordering.
- `FeatureDependency` currently supports either a feature ID string or an object with `id` and `contractVersion`. There is no explicit optional-dependency marker.
- `registerFeatures` validates the combined catalogue as one unit. Missing dependencies, incompatible versions, cycles, duplicate feature IDs, invalid persistence contracts, and duplicate backup participant IDs throw and prevent the entire registry from being returned.
- `packages/core/src/runtime-registry.ts` constructs feature, extension, integration, calculation, startup-order, and backup-participant registries in one fail-closed bootstrap. A thrown validation error prevents all registry output.
- `registerFeatureIntegrations` verifies producer/consumer ownership and requires the consumer to declare a dependency on the producer at the producer's contract version.
- `registerCalculations` validates ownership, schemas, effective dates, rounding and regression cases before publishing calculation contracts.
- `registerBackupParticipants` derives every required participant from every persistent feature contract. This is important: activation status must not silently erase persistent-data ownership or omit backup/restore participants.
- `packages/application/src/runtime-registry.ts` owns the single application-wide runtime registry and initializes it before presentation. This remains the only global registry.
- `packages/application/src/feature-lifecycle-coordinator.ts` persists lifecycle state in the authoritative record repository. Its current lifecycle transitions do not mutate feature data or backup-participant registration.
- Stage 5 contracts already require persistent features to retain data on disable and require migration before removal.

## Gaps Stage 2 must address

1. No optional dependency descriptor or explicit unavailable-optional-dependency state.
2. Dependency validation and cycle detection are global fail-fast checks; there is no per-feature activation result or dependency-failure closure.
3. Runtime registration exposes no structured status/diagnostic for active, blocked, or rejected features.
4. Feature extension, integration, and calculation registration are currently assembled as global batches; failure isolation must ensure a bad contribution cannot leak a partial set or disable unrelated valid features.
5. The static catalogue and complete declaration set should remain inspectable. Isolating activation must not hide a malformed declaration or silently treat a failed required feature as healthy.
6. Persistent feature definitions and backup/restore participant ownership must remain complete and stable even when operational activation is blocked or disabled.

## Conservative implementation direction

- Keep deterministic Stage 1 discovery and static imports unchanged.
- Keep the application-owned registry as the sole registry.
- Introduce explicit dependency metadata for required versus optional relationships, with required as the backwards-compatible default.
- Separate declaration validation/activation planning from contribution publication. Compute a deterministic plan first; publish a feature's contributions only after its own declaration, required dependency closure, ownership checks, and contribution validation pass.
- Reject invalid features with stable diagnostic codes and useful feature/dependency identifiers. Block only features whose required dependency chain is unavailable; retain unrelated valid features.
- An absent optional dependency does not block activation, but its state is reported explicitly.
- Reject cycles before any affected feature contributions are published. Use deterministic dependency-first ordering.
- Keep persistent-data contracts and required backup participants registered from the complete validated ownership inventory; activation status must not redefine data ownership.
- Do not change disable/retire semantics or introduce new persistence, backup, restore, migration, upgrade, or recovery systems.
- Keep activation decisions deterministic and side-effect-free until the plan is validated. A contribution failure rejects that feature's contribution set atomically; it must not expose earlier contributions from that same feature.

## Required proof

- Valid dependency-first activation.
- Missing required dependency blocks only its dependent closure.
- Optional missing dependency is reported but does not block activation.
- Incompatible required contract blocks the dependent closure.
- Cycles are rejected before publication.
- Invalid extension/integration/calculation contribution leaves no partial contribution from its owning feature.
- An unrelated valid feature remains available after another feature is rejected.
- Diagnostics are deterministic and machine-readable.
- Persistent backup participant inventory remains complete for all declared persistent owners, including operationally blocked or disabled features.
- Existing lifecycle retention, clean-store restore, relationship validation, injected-failure recovery, upgrade and regression guarantees remain intact.

## Explicit non-goals

No second registry, runtime filesystem scanning, dynamic code loading, universal event bus, generic plugin marketplace, feature business implementation, UI shell redesign, or replacement Stage 5 lifecycle/persistence/backup/recovery mechanism.
