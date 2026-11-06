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

### Stage 2 implementation audit and completion gate

The source audit is recorded in [PERMANENT_APPLICATION_ARCHITECTURE_STAGE_2_AUDIT.md](PERMANENT_APPLICATION_ARCHITECTURE_STAGE_2_AUDIT.md). Initial implementation is on branch `feat/dependency-activation-isolation`:

- Added an explicit optional-dependency marker while preserving required-by-default dependency declarations.
- Added a deterministic activation planner that separates declaration validation from dependency resolution, reports active/blocked/rejected outcomes, records unavailable optional dependencies, detects cycles, and computes dependency-first order.
- Added focused planner tests for missing required dependencies, optional absence, incompatible versions, cycles, independent-feature isolation, deterministic ordering, invalid declarations, and persistent ownership visibility.
- The planner is not yet wired into the application runtime bootstrap. Contribution-level failure isolation and the full Stage 2 proof remain outstanding; no Stage 2 completion or CI claim is made.

The runtime integration slice is now implemented on this branch:

- The existing core runtime registry calls the activation planner and returns both the complete valid declaration inventory and the operationally active subset. The existing application bootstrap already calls this factory before presentation mounts, so no second application registry was introduced.
- Startup order is the planner's deterministic dependency-first order. Optional dependencies do not create required activation edges or startup-order cycles.
- Extension, integration and calculation contributions are grouped by feature owner, validated into temporary per-owner registries, and published only after the complete owner group passes. A failed group is withheld as a whole; independent owners remain available. Duplicate contribution identities across owners reject every conflicting owner rather than depending on declaration order.
- Persistent backup participants are derived from all valid persistent declarations, not only active features. Blocked persistent features therefore retain their required backup/restore participant; lifecycle disable/retire does not remove the participant inventory.
- The application lifecycle coordinator continues to receive the full feature declaration map, preserving Stage 5 lifecycle and retention rules.
- Regression coverage was added/updated for invalid declaration isolation, optional dependency behavior, contribution atomicity, unrelated-owner availability, persistent backup ownership while blocked, and backup ownership after disable/retire.

Verification is now pending through the repository CI workflow. Stage 2 is not complete until focused and full web, Android and integrated regression gates pass, and the restore/recovery/upgrade guarantees are confirmed unchanged.
## Implementation discipline

Complete one stage at a time. Each stage must have a focused implementation, tests, CI evidence and progress update before the next stage begins. Do not onboard the first real business feature as part of this architecture project; use disposable fixtures only when required to prove contracts.
