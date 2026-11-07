# Stage 5 — Diagnostics and change-impact reference

## Scope and safety

Stage 5 extends the existing runtime and local diagnostics. It does not add a second registry, event bus, lifecycle manager, persistence store, upgrade engine, remote telemetry service, or automatic migration path.

Diagnostic metadata is local and best-effort. Never record business records, financial values, GPS, source payloads, calculation inputs/outputs, snapshot tokens, credentials, raw exception messages, feature labels, or arbitrary feature-provided text. A diagnostic write must never change the result of the operation being observed.

## Runtime snapshot

Use `createRuntimeDiagnosticSnapshot(runtime)` from the core package to inspect a deterministic, read-only projection of feature declarations, activation state, dependency IDs, safe capability identities/versions, and stable failure codes. It deliberately excludes executable handlers, UI render functions, feature labels and data.

## Safe event contract

`createSafeDiagnosticEvent(...)` produces schema-versioned metadata with controlled stage, code and outcome values, normalized identifiers, timestamp and bounded duration. Persist only these event objects through the existing platform-local diagnostic adapters. Never upload them automatically.

## Change-impact preflight

`analyzeFeatureContractImpact(previous, proposed)` is a pure deterministic feature dependency-closure report. It reports changed declarations and direct/transitive dependents using only explicitly declared dependency edges. `analyzeFeatureExtensionUpgradeImpact(previous, next)` reports changes across extension identity, feature and persistence ownership, integrations, calculations, data queries and presentation contracts in one deterministic report. The upgrade validator also rejects silent removal of published data-query and presentation contracts. Neither report mutates declarations, executes migrations, activates features, or performs upgrades. Unknown relationships must remain unknown rather than inferred.

These reports are impact aids, not replacements for the authoritative extension-upgrade compatibility validator or transaction coordinator.

## Completion gate

Stage 5 is complete. PR #26 merged as `efe1abea10eb86491a644fa8b926746b6b344028`; PR run #907 and merged-main run #908 passed Architecture, the dedicated privacy/trace/platform/impact gate, Web regression/build, Android Gradle/unit/emulator reliability, and Integrated regression. The merged-main run published the release APK. Keep diagnostics local, bounded and best-effort; do not add remote upload or payload capture.
