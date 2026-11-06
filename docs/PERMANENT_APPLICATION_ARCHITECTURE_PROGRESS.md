# Permanent Application Architecture — Implementation Progress

**Frozen scope:** [PERMANENT_APPLICATION_ARCHITECTURE.md](PERMANENT_APPLICATION_ARCHITECTURE.md)  
**Baseline audit:** [PERMANENT_APPLICATION_ARCHITECTURE_AUDIT.md](PERMANENT_APPLICATION_ARCHITECTURE_AUDIT.md)

## Stage status

| Stage | Status | Evidence |
|---|---|---|
| Stage 0 — Repository audit and scope freeze | Complete | Frozen scope and evidence-based baseline audit merged to main in PR #19. |
| Stage 1 — Deterministic feature discovery and declarations | Implementation prepared; CI verification pending | Dedicated implementation PR; static catalogue, manifests, scaffold integration and tests. |
| Stage 2 — Dependency activation and failure isolation | Not started | Requires Stage 1 completion and separate activation-policy implementation. |
| Stage 3 — Multi-source data coordination | Not started | Reuse existing query/repository/calculation contracts; add only audited gaps. |
| Stage 4 — Independent UI/UX architecture and feature UI registration | Not started | Preserve unrestricted custom UI acceptance criterion. |
| Stage 5 — Diagnostics and change impact | Not started | Extend existing diagnostics and architecture checks. |
| Stage 6 — End-to-end verification and enforcement | Not started | Full cross-platform regression and architectural proof. |

## Stage 1 — Scope

Stage 1 introduces explicit feature manifests and deterministic build-time discovery. It does not change runtime activation policy, add a second registry, introduce runtime directory scanning, or implement dynamic code loading.

### Implemented in the Stage 1 change set

- `feature.manifest.json` declares manifest schema version, feature ID, canonical public entry point, and extension export name.
- `scripts/discover-features.mjs` discovers manifested feature packages in stable lexical order, validates manifest identity/path/export, and generates static imports.
- `apps/web/src/generated-feature-catalog.ts` is the generated, statically linked catalogue consumed by application bootstrap.
- `apps/web/src/main.tsx` initializes the existing application-owned runtime registry from the generated catalogue instead of manually importing each extension.
- `npm run feature:create` creates a manifest and regenerates the catalogue automatically.
- `npm run features:discover` regenerates the catalogue after a deliberate manual manifest edit.
- `npm run features:check` verifies the checked-in generated catalogue is current without modifying it.
- The architecture CI gate checks catalogue freshness.
- Tests cover sorted deterministic generation, safe manifest validation, required public exports, stale catalogue detection, and scaffold integration.

### Stage 1 safety boundaries

- Static imports only; no arbitrary runtime discovery, reflection, or dynamic loading.
- Existing typed extension/runtime registries remain authoritative.
- Existing complete-registry fail-closed validation remains unchanged.
- A malformed declaration fails discovery/CI; this stage does not implement granular optional-feature activation.
- Persistent feature rules, migrations, backup, restore, lifecycle, and recovery remain governed by Stage 5.

### Stage 1 completion gate

Stage 1 is complete only when the implementation PR's architecture, web tests/build, Android build/instrumentation and integrated regression checks pass, and the final merged-main checks are green. A prepared PR or a local source review alone is not completion evidence.

## Implementation discipline

Complete one stage at a time. Each stage must have a focused implementation, tests, CI evidence and progress update before the next stage begins. Do not onboard the first real business feature as part of this architecture project; use disposable fixtures only when required to prove contracts.
