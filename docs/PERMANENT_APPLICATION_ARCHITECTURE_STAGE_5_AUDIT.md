# Permanent Application Architecture — Stage 5 Diagnostics and Change-Impact Audit

**Status:** Source audit complete; Stage 5 implementation is in progress on `feat/stage-5-diagnostics-impact-complete`.
**Baseline:** `main` at `fed3f6c240b1a60af7a329068014a80e6c7ad6ad` (Stage 4 merged and verified).
**Scope:** Feature registration/activation diagnostics, dependency and compatibility visibility, registered capability inventory, data-to-result execution traces, privacy-safe failure records, contract change-impact analysis, and developer/reference documentation.
**Non-scope:** New business features, replacement registries, new lifecycle/persistence/backup/recovery systems, remote telemetry, generic observability vendors, universal event bus, or a formula/automation engine.

## 1. Governing constraints

1. Extend the existing application-owned runtime registry and Stage 5 platform diagnostics. Do not create a second registry, lifecycle coordinator, or parallel diagnostic database.
2. Diagnostics are read-only and best-effort. A diagnostic failure must never block startup, feature activation, business execution, backup, restore, recovery, or upgrades.
3. Keep diagnostics local by default. No automatic upload, remote telemetry, GPS, business records, financial values, user names, credentials, tokens, raw exception text, or query/calculation payloads.
4. Use stable machine-readable codes and safe identifiers/versions. Human-readable descriptions must be derived from controlled templates, not raw external or feature-supplied text.
5. Trace source query → validation → calculation → published result using existing Stage 3 provenance. Do not re-run queries or calculations merely to collect diagnostics.
6. Contract impact analysis is a deterministic preflight report. It must not mutate declarations, activate features, apply migrations, write persistent state, or replace the live registry.
7. Preserve Stage 1–4 guarantees and Stage 5 persistence, backup/restore, migration/upgrade, recovery and lifecycle ownership.

## 2. Existing implementation evidence and classification

| Area | Existing evidence on `main` | Classification | Gap |
|---|---|---|---|
| Feature discovery | `scripts/discover-features.mjs` emits a deterministic static catalogue and validates manifests/public entry points. | Already implemented | Discovery failures are build-time errors; there is no unified diagnostic snapshot connecting generated declarations to runtime state. |
| Activation and dependency diagnostics | `packages/core/src/feature-activation.ts` produces deterministic active/blocked/rejected results, optional-dependency state, stable diagnostic codes and dependency IDs. | Already implemented | No safe application-facing diagnostic projection/export; activation results are not retained in platform-local diagnostic history. |
| Contribution validation failures | `packages/core/src/runtime-registry.ts` stages extension, integration, calculation, data-query and presentation contributions per owner and exposes sorted `contributionFailures`. | Partially implemented | Failure code/message is not a complete public diagnostic contract; message text may originate from thrown validators, and the inventory is not exposed as a safe, consolidated diagnostic view. |
| Registered capabilities | The runtime registry exposes feature, extension, integration, calculation, data-query, presentation-screen and backup-participant registries. | Already implemented (runtime inventory); missing (diagnostic projection) | No read-only inventory snapshot that reports owner, identity, version/schema and availability without exposing executable handlers or payloads. |
| Cross-feature data provenance | `packages/core/src/feature-data.ts` records query/owner/version/schema, status, freshness, completeness, observation time, consistency and safe reason codes. | Already implemented | No correlated execution trace joining source collection, validation, calculation and final result; no consistent trace identity. |
| Calculation provenance | `packages/core/src/feature-contracts.ts` returns calculation ID, owner, rule/schema versions, effective date, unit and value. | Already implemented (result provenance) | The trace does not link the calculation to the exact collected query outcomes in one durable, inspectable trace record; value must not be copied into diagnostics. |
| Orchestration failure isolation | `packages/application/src/cross-feature-data-coordinator.ts` converts source exceptions and calculation exceptions to controlled unavailable/invalid reasons and preserves source outcomes. | Partially implemented | Errors are safely masked, but failure stages and correlation are not recorded; exceptions are intentionally swallowed without a diagnostic event. |
| Browser diagnostics | `packages/storage-browser/src/local-diagnostics.ts` stores up to 300 local failure-only records using enum allowlists; exports sanitized metadata; best-effort and no upload. | Partially implemented | Current vocabulary is limited to storage/workflow/recovery/backup. It cannot record discovery, activation, contribution validation, compatibility, query/calculation trace failures or impact analysis. |
| Android diagnostics | `LocalDiagnostics.kt` stores up to 200 sanitized local failure-only records; `DiagnosticsPlugin.kt` exposes export. | Partially implemented | Same narrow event vocabulary and no shared Stage 5 event schema/feature-contract context. Keep native storage/platform implementation separate. |
| Privacy controls | `docs/SECURITY_AND_COMPATIBILITY_CONTRACT.md` requires minimization, redaction and no unauthorized telemetry. Current diagnostic writers allowlist enum tokens and exclude payload/GPS. | Already implemented (policy and current local stores) | Extend the policy explicitly to feature IDs, contribution IDs, contract versions, correlation IDs, duration and trace retention; never persist raw exception messages or calculated values. |
| Upgrade compatibility | `packages/core/src/feature-compatibility.ts` performs side-effect-free extension upgrade preflight, checking identity, version monotonicity, dependency changes, persistence/migration chain, integrations and calculation contracts. | Partially implemented | It throws on first incompatibility rather than returning a complete affected-surface report. It does not analyze downstream dependents, query/screen contracts or explain impact paths. |
| Architecture enforcement | `scripts/check-architecture.mjs` checks dependency direction, public feature boundaries, cycles, platform boundaries, source size and required contracts. | Already implemented (static boundaries); missing (Stage 5 conformance) | No gate for diagnostic privacy, safe trace shape, diagnostic projection, impact-analysis determinism or documentation completeness. |
| Developer documentation | Feature extension, lifecycle, security, architecture and data contracts exist. | Partially implemented | No concise Stage 5 reference explaining how to inspect activation, registered capabilities, traces, failure codes and preflight contract changes. |

## 3. Required Stage 5 outcomes

1. **Unified diagnostic vocabulary:** define versioned, stable event categories/codes for discovery, activation, dependency/compatibility, contribution validation, source query, data validation, calculation, presentation mounting and upgrade preflight.
2. **Safe runtime snapshot:** provide a read-only projection of declarations, active/blocked/rejected states, dependency outcomes, published contribution identities/versions, and contribution failures. Never expose executable functions, private feature data or raw exceptions.
3. **Correlated execution trace:** provide a trace ID and ordered stage records linking query IDs/owners/versions/schema/status/freshness/consistency to calculation ID/owner/version/schema/effective date and final outcome. Do not include records, calculation input/output values, snapshot tokens, credentials or arbitrary feature text.
4. **Failure observability:** record controlled failure stage/code and recovery/availability outcome while preserving existing source isolation. Diagnostic write failure is swallowed and cannot change the operation result.
5. **Local platform integration:** extend the existing browser and Android local stores with compatible schema/version handling and bounded retention. Keep their platform-specific adapters; use a shared platform-neutral event contract and never introduce remote upload.
6. **Contract change-impact report:** compare previous and proposed declarations deterministically; report changed contracts, compatibility classification, directly and transitively affected dependent features, integrations, calculations, data queries, presentation contributions and persistent/migration implications where those relationships are declared. Return all findings rather than stopping at the first error.
7. **Documentation:** publish developer/reference guidance for reading diagnostics, interpreting stable codes, following a trace, reviewing a change-impact report, and respecting privacy and retention boundaries.
8. **Regression and enforcement:** test deterministic ordering, no payload leakage, bounded retention, platform parity of the event contract, source-to-result trace provenance, failure isolation, impact closure and side-effect-free preflight.

## 4. Proposed implementation slices

- **5A — Diagnostic contracts and safe runtime projection:** define shared event/code types and versioning; add a pure read-only snapshot over the existing runtime registry and activation plan. Include safe owner/capability/version metadata only.
- **5B — Execution trace correlation:** extend the existing cross-feature coordinator with caller-supplied or generated correlation identity and ordered source/validation/calculation outcome spans. Preserve current result semantics and source provenance; never store data values or snapshot tokens in diagnostic records.
- **5C — Platform-local diagnostic integration:** extend existing browser/Android allowlists and bounded stores using additive schema evolution. Provide an explicit local export path already consistent with platform capabilities; no network telemetry.
- **5D — Contract impact analysis:** add a pure deterministic analyzer over previous/proposed runtime snapshots and declared dependency/contribution edges. Keep the existing upgrade validator and transaction coordinator authoritative; impact analysis is advisory/preflight and cannot apply upgrades.
- **5E — Enforcement and reference docs:** architecture/privacy checks, fixture tests, failure-injection and compatibility coverage, plus a concise developer guide. Run full web, Android and integrated regression.

Slices remain additive and should be independently testable. If an existing contract lacks a declared relationship, report the relationship as unknown/not declared rather than inventing a dependency edge.

## 5. Acceptance proof

- Activation/registration snapshot accurately reports active, blocked, rejected and contribution-failed owners without changing registry state.
- Capability inventory is deterministic and contains no executable implementation or feature-owned data.
- One orchestrated calculation trace links exact source query provenance to the registered calculation and final status.
- Missing, pending, unavailable, invalid, stale, incomplete, snapshot mismatch and calculation failure outcomes are distinguishable.
- Trace and diagnostic records contain only allowlisted metadata; tests prove absence of GPS, user/business/financial data, raw payloads, raw exception strings, credentials and snapshot tokens.
- Browser and Android diagnostic stores remain bounded, local-only, failure-safe and versioned; old records are read safely after schema evolution.
- Impact analysis reports direct and transitive affected owners and all known contribution surfaces in stable order, including breaking/incompatible findings, without mutating either snapshot or live runtime.
- Upgrade/migration/backup/recovery/lifecycle transaction semantics remain unchanged.
- Architecture, Web, Android and Integrated regression gates pass on the PR and merged main.

## 6. Explicit exclusions

- No remote telemetry, analytics service, crash-reporting vendor or automatic diagnostic upload.
- No second runtime registry, diagnostic database, event bus, lifecycle manager or upgrade engine.
- No raw exception strings, arbitrary feature-provided diagnostic messages, business records, financial values, GPS, credentials, tokens, calculation values or source payloads in diagnostic storage.
- No automatic contract migration, feature activation, rollback or upgrade as a side effect of impact analysis.
- No speculative graph edges where the architecture has no declared relationship.
- No real business feature onboarding and no AI-generated business logic.
- No physical-device usability claim from CI-only checks.

## 7. Review checkpoint

This audit classifies current capabilities and identifies the additive gaps for Stage 5. Review the proposed 5A–5E slices and safeguards before implementation. The intended result is better developer visibility and safer change planning—not more runtime complexity for ordinary feature authors.

## 9. Implementation update

The implementation branch now adds:
- A versioned, allowlisted core diagnostic event contract and safe runtime snapshot projection.
- Correlated source-query, data-validation, calculation and result trace metadata. Trace records omit source rows, calculation values and snapshot tokens; diagnostic writes are best-effort.
- Browser Dexie diagnostic schema version 6 with bounded shared-event persistence, and an Android local event adapter plus Capacitor recording method. Both remain local-only and bounded.
- A deterministic feature dependency impact report and an extension-upgrade surface report covering persistence, integrations, calculations, data queries and presentation screens. Upgrade preflight now also rejects silent removal of query and presentation contracts.
- A dedicated architecture CI check for privacy, trace shape, platform adapters, compatibility coverage and documentation, plus focused tests.

This update is not a completion declaration. Android build/instrumentation and all PR gates must pass, followed by merge and a green merged-main run. The existing authoritative upgrade transaction coordinator and persistence/backup/restore recovery paths remain in place; impact analysis is a read-only preflight aid.
