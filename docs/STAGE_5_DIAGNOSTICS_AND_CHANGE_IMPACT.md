# Stage 5 — Diagnostics and change-impact reference

## Scope and safety

Stage 5 extends the existing runtime and local diagnostics. It does not add a second registry, event bus, lifecycle manager, persistence store, upgrade engine, remote telemetry service, or automatic migration path.

Diagnostic metadata is local and best-effort. Never record business records, financial values, GPS, source payloads, calculation inputs/outputs, snapshot tokens, credentials, raw exception messages, feature labels, or arbitrary feature-provided text. A diagnostic write must never change the result of the operation being observed.

## Runtime snapshot

Use `createRuntimeDiagnosticSnapshot(runtime)` from the core package to inspect a deterministic, read-only projection of feature declarations, activation state, dependency IDs, safe capability identities/versions, and stable failure codes. It deliberately excludes executable handlers, UI render functions, feature labels and data.

## Safe event contract

`createSafeDiagnosticEvent(...)` produces schema-versioned metadata with controlled stage, code and outcome values, normalized identifiers, timestamp and bounded duration. Persist only these event objects through the existing platform-local diagnostic adapters. Never upload them automatically.

## Change-impact preflight

`analyzeFeatureContractImpact(previous, proposed)` is a pure deterministic dependency-closure report. It reports changed declarations and direct/transitive dependents using only explicitly declared dependency edges. It does not mutate declarations, execute migrations, activate features, or perform upgrades. Unknown relationships must remain unknown rather than inferred.

The report is an impact aid, not a replacement for the authoritative extension-upgrade compatibility validator or transaction coordinator.

## Completion gate

Stage 5 is not complete until correlated source-to-calculation traces, browser and Android local-store schema integration, full contract-surface compatibility findings, privacy/retention enforcement, focused failure-injection tests, and Architecture/Web/Android/Integrated CI all pass on the pull request and merged main.
