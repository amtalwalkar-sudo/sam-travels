# __FEATURE_LABEL__

Feature ID: `__FEATURE_ID__`

## Ownership

Keep this capability's domain rules, application use cases, repository ports, validation, calculations, and integrations within this feature boundary. Export only supported contracts from `index.ts`. Keep UI, forms, and platform storage adapters outside the domain implementation.

## Before enabling writes

This scaffold is deliberately registered as `non-persistent`. Do not change it to `persistent` until the feature has its complete versioned persistence contract, authoritative repository adapter(s), migration chain, required backup participant, restore validator, lifecycle policy, and failure-path tests. A UI form is not permission to persist data.

## Additive implementation checklist

- [ ] Define feature invariants, stable IDs, dependencies, and public application contract.
- [ ] Add domain/application use cases without importing UI or platform storage.
- [ ] Add versioned calculations with units, rounding, effective-date semantics, invalid-input behavior, and regression fixtures.
- [ ] Add versioned integrations with explicit producer/consumer ownership and payload validation.
- [ ] If persistent: complete migration, backup, restore, lifecycle, and offline/recovery contracts before enabling writes.
- [ ] Add PWA and Android adapters that call the same business implementation.
- [ ] Compose `__FEATURE_CONST___FEATURE_EXTENSION` in the outer application entry point.
- [ ] Run architecture, web, Android, migration, backup/restore, offline, recovery, and integrated regression gates as applicable.

Do not import another feature's private files or tables. Cross-feature use must go through public contracts. Do not create a second global registry; the application composition root supplies descriptors to the application-owned registry.
