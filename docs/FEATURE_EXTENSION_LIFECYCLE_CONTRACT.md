# Feature Extension Lifecycle and Compatibility Contract

Status: Stage 5 implementation contract. Runtime enforcement is implemented; final cross-platform CI verification is pending.

## Purpose

This contract makes extension lifecycle and upgrade compatibility explicit. It supplements the Feature Extension Architecture and Feature Module Contract; it does not introduce dynamic loading or a second runtime. Feature code remains statically linked and is composed before application startup.

## Lifecycle states

A registered feature has one lifecycle state:

- `enabled`: available to application workflows.
- `disabled`: unavailable for new feature operations; existing records remain intact and remain part of required business backups.
- `retired`: no longer available for application workflows. Retirement is not deletion and does not remove the feature's persistence, backup, restore, or historical compatibility obligations.

A missing lifecycle record means `enabled` for compatibility with existing installations. A stored lifecycle record is bound to the feature's contract version. A mismatch is stale state and must fail closed until explicitly reconciled.

## Permitted transitions

| From | Action | To | Required guard |
|---|---|---|---|
| enabled | disable | disabled | No active feature depends on the feature being disabled. |
| disabled | enable | enabled | Every declared dependency is enabled and its contract is compatible. |
| disabled | retire | retired | No non-retired registered feature depends on it; persistent retention contract remains valid. |

A retired feature cannot be re-enabled. Reintroducing a retired capability requires an explicit reviewed replacement or migration decision; it must not silently reuse retired state.

Lifecycle transitions are application operations. The pure core policy decides whether a transition is valid; the application coordinator must persist the resulting lifecycle record through the authoritative platform repository before reporting success. UI visibility alone is not lifecycle state.

## Data retention and backup

- Disablement and retirement never delete, rewrite, or exclude feature records.
- A persistent feature's required backup participant remains registered while its records are retained, including while its presentation is disabled or retired.
- Permanent deletion is not a lifecycle transition. It requires a separate explicitly confirmed domain/application operation, dependency resolution, a retention and recovery policy, and interruption/retry tests.
- A persistent feature cannot be downgraded to non-persistent as part of an extension upgrade.
- A persistent feature cannot drop or silently replace its backup participant identity.

## Extension upgrade compatibility

An upgrade is a preflighted, additive change to the same extension identity, owner, and public entry point. It must increase the extension version.

- Feature contract, integration, payload, calculation, input/output schema, persistent schema, and backup snapshot versions cannot decrease.
- A dependency change requires a feature contract version increase.
- Integration producer, consumer, event name, or payload changes require an integration version increase.
- Calculation input/output schema, unit, effective-date semantics, or rounding changes require a calculation version increase.
- Published integration and calculation IDs cannot be silently removed by an additive upgrade.
- Persistent schema increases require a complete migration chain from the previously deployed schema to the target schema. Existing migration registration and transaction-bound execution remain authoritative.
- Persistent-to-non-persistent downgrade and backup participant identity changes are rejected.
- Full registry validation remains mandatory after preflight, including dependency compatibility, migration registration, calculation fixtures, integration ownership, and backup/restore participation.

A version increase is not proof that changed executable behavior is safe. The corresponding migration, compatibility fixtures, and regression tests remain mandatory.

## Failure behavior

Invalid lifecycle state, stale contract state, unresolved dependents, incompatible versions, missing migration steps, or missing required persistence contracts fail closed. No partial registry or partially accepted transition may be exposed.

The application coordinator must persist lifecycle and upgrade state atomically with the authoritative store where possible. If a multi-store/platform operation cannot be atomic, it must use the existing checkpoint, recovery, and reconciliation contracts. An interrupted operation must leave the prior valid state recoverable.

## Implemented platform extension points

- Browser add-ons register executable backup participants through `registerBrowserFeatureBackupParticipant`. Each participant declares its persistent feature contract, namespaced record prefix, row validator, and optional whole-feature relationship validator. The existing IndexedDB snapshot transaction includes the namespaced records; unknown `feature:` namespaces fail closed.
- Android add-ons register equivalent Room participants through `NativeBackupCoverage.registerFeatureRecordParticipant`. Their adapter owns export, validation, clear, restore, namespace checks, and relationship validation against the shared Room records table. Unknown feature namespaces fail closed.
- The browser application update entry point is `upgradeInstalledBrowserFeatureExtension`. It selects the Dexie transaction adapter for browser storage and the staged Room transaction adapter on Android.
- Android Room applies staged migration writes, deletes, and installed-extension metadata in one transaction after checking every touched record's expected revision. A conflict aborts the batch; migration exceptions never publish the staged changes.
- The isolated add-on tests exercise clean-store restore, participant manifests, relationship validation, missing-adapter rejection, and retained records after disable/retire. The Work/Shift to Log Book end-to-end regression is exercised by the existing durable workflow restart/replay test.

## Mandatory persistent-feature onboarding acceptance

Before Stage 5 is complete, an isolated persistent test feature must exercise the real runtime and platform pathways:

1. Register the feature with an explicit schema, migration chain, backup participant, restore validator, and lifecycle contract.
2. Run the migration from a supported prior schema using the transaction-bound migration runner.
3. Write representative records through its authoritative repository.
4. Produce a backup containing the feature's records and required references.
5. Restore into a clean test store, validate the feature payload and relationships, and verify the restored records.
6. Inject migration and restore failures and prove source data/checkpoints remain recoverable.
7. Disable and retire the feature, then prove its records remain available to backup and restore.
8. Exercise a compatible additive upgrade and reject incompatible versions, incomplete migrations, missing participants, and unresolved dependents.
9. Run equivalent contract behavior against browser IndexedDB and Android Room adapters, while retaining their platform-specific storage implementations.
10. Run the existing integrated regression gates to prove Work/Shift and Log Book behavior remains unchanged.

A mocked backup participant or a test that bypasses the production registry, migration runner, or platform adapters does not satisfy this acceptance gate.

## Stage 5 completion rule

Stage 5 is complete only when lifecycle policy is enforced by the application coordinator, compatibility preflight is part of the actual upgrade path, persistent onboarding acceptance passes on both supported storage platforms, and the complete CI regression suite is green. A pure policy helper or green unit tests alone are insufficient.
