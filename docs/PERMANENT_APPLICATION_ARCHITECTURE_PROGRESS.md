# Permanent Application Architecture — Implementation Progress

**Frozen scope:** [PERMANENT_APPLICATION_ARCHITECTURE.md](PERMANENT_APPLICATION_ARCHITECTURE.md)  
**Baseline audit:** [PERMANENT_APPLICATION_ARCHITECTURE_AUDIT.md](PERMANENT_APPLICATION_ARCHITECTURE_AUDIT.md)

## Stage status

| Stage | Status | Evidence |
|---|---|---|
| Stage 0 — Repository audit and scope freeze | Complete | Frozen scope and evidence-based baseline audit merged to main in PR #19. |
| Stage 1 — Deterministic feature discovery and declarations | **Complete** | PR #20 merged by squash (merge commit `4d4b2006887e2c919fed8d118c2762868975bb8e`). CI run #839 / `42299197556`: architecture, web, Android and integrated regression jobs all passed. |
| Stage 2 — Dependency activation and failure isolation | **In progress** | Stage 1 merged; implementation audit of runtime dependency validation, activation/registration, failure handling and Stage 5 integration is beginning. |
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

## Stage 1 — Verified completion evidence

- PR [#20 — deterministic build-time feature discovery](https://github.com/amtalwalkar-sudo/sam-travels/pull/20) was merged by squash.
- Verified PR head: `3bf45fd9bcc60ff803ad87320e16fc06558bd70b`.
- Merged commit: `4d4b2006887e2c919fed8d118c2762868975bb8e`.
- GitHub Actions run #839 / ID `42299197556`: architecture, web regression/build, Android, and integrated regression jobs all completed successfully.
- Android passed Gradle debug/debug-test/release assembly, unit tests, and the required Room/workflow/backup reliability gate. The PR-only “publish unsigned release APK from merged main” step was skipped by workflow design, not failed.
- A post-merge main verification remains a distinct check and will be recorded if/when the workflow produces it.

## Stage 2 — Dependency activation and failure isolation

Stage 2 is additive and reuses the Stage 1 generated catalogue and existing application-owned Stage 5 runtime registry. It must not introduce a second registry, replacement lifecycle, or parallel persistence/backup/recovery path.

### Activation policy

- Validate declarations and the dependency graph before exposing any feature contribution.
- Reject an invalid feature with an actionable diagnostic; never partially register it.
- Activate a feature only when required dependencies and contract versions validate.
- Block dependents when a required dependency is missing, invalid, incompatible, or inactive.
- Keep unrelated valid features eligible for activation; an optional feature failure must not silently disable unrelated features.
- Optional dependencies may be absent without blocking the declaring feature, but their unavailable state must remain explicit and diagnosable.
- Reject dependency cycles before activation.
- Use deterministic, dependency-first activation order.
- A failed activation leaves that feature's contributions unavailable and must not corrupt unrelated valid registrations.
- Preserve Stage 5 data ownership, backup/restore participant integrity, migrations, recovery checkpoints, upgrades, disablement and retirement semantics.

### Stage 2 — Dependency activation and contribution isolation — complete

Implementation is merged into `main` through [PR #21](https://github.com/amtalwalkar-sudo/sam-travels/pull/21).

- Added optional dependency declarations while preserving required-by-default behavior.
- Integrated deterministic feature activation into the existing application-owned runtime registry. The runtime retains the full valid feature declaration inventory separately from the operationally active subset.
- Activation reports active, blocked and rejected outcomes with stable machine-readable diagnostics; required dependency failures propagate to dependents, optional dependency absence remains explicit, cycles are rejected, and startup order is deterministic and dependency-first.
- Extension, integration and calculation contributions are staged per feature owner and published atomically. A failing owner group is withheld in full, duplicate contribution identities are rejected deterministically, and unrelated valid owners remain available.
- Backup/restore participants are derived from all valid persistent declarations, including blocked owners. The lifecycle coordinator continues to use the full declaration inventory, so disable/retire does not discard persistent ownership or backup participation.
- No second registry or replacement Stage 5 lifecycle, persistence, backup, restore, recovery or upgrade mechanism was introduced.

**Merged commit:** `3f187ca43a6fe752f092a78df8b3cb655b4e8e74`

**CI proof:** [PR workflow run #849](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/42303475095), for head `e1d2b9f9d6f728bf00fdd5b3340a9d0fe1e6acfa), completed successfully. Architecture, focused Stage 2 tests, backup/recovery reliability tests, the full web suite (210 tests across 37 files), TypeScript/web build, Android build and emulator regression gate, and the integrated regression gate all passed.

Stage 2 is complete. Continue with Stage 3 — cross-feature data orchestration and calculation framework — without replacing the registry or lifecycle contracts established here.
## Implementation discipline

Complete one stage at a time. Each stage must have a focused implementation, tests, CI evidence and progress update before the next stage begins. Do not onboard the first real business feature as part of this architecture project; use disposable fixtures only when required to prove contracts.
