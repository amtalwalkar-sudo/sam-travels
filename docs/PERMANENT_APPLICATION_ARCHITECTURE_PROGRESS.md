# Permanent Application Architecture — Implementation Progress

**Frozen scope:** [PERMANENT_APPLICATION_ARCHITECTURE.md](PERMANENT_APPLICATION_ARCHITECTURE.md)  
**Baseline audit:** [PERMANENT_APPLICATION_ARCHITECTURE_AUDIT.md](PERMANENT_APPLICATION_ARCHITECTURE_AUDIT.md)

## Stage status

| Stage | Status | Evidence |
|---|---|---|
| Stage 0 — Repository audit and scope freeze | Complete | Frozen scope and evidence-based baseline audit merged to main in PR #19. |
| Stage 1 — Deterministic feature discovery and declarations | **Complete** | PR #20 merged by squash (merge commit `4d4b2006887e2c919fed8d118c2762868975bb8e`). CI run #839 / `42299197556`: architecture, web, Android and integrated regression jobs all passed. |
| Stage 2 — Dependency activation and failure isolation | **Complete** | PR #21 merged as `3f187ca43a6fe752f092a78df8b3cb655b4e8e74`; PR CI run #849 passed all architecture, web, Android and integrated gates. Post-merge main run #851 also succeeded. |
| Stage 3 — Cross-feature data orchestration and calculation framework | **Complete** | PR #22 merged as `952a11c08d48a5a34e1aae5d80e7b10d50dbe0cd`; merged-main CI run #868 passed Architecture, Web, Android and Integrated regression. |
| Stage 4 — Independent UI/UX architecture and feature UI registration | **Complete** | PR #24 merged as `9493b4d8ec039de7b9f469063cd92a254207346b`. Merged-main CI run #881 passed Architecture, Web, Android and Integrated regression. Clean-slate shell, four fixed bottom destinations, expandable Settings and unrestricted owner-scoped custom screens are in main. |
| Stage 5 — Diagnostics and change impact | **In progress — implementation and CI gates on branch** | Branch `feat/stage-5-diagnostics-impact-complete` now includes versioned safe events, a read-only runtime projection, correlated source-to-calculation traces, browser and Android local event adapters, deterministic dependency impact analysis, extension-upgrade impact reports across persistence/integration/calculation/query/presentation surfaces, focused tests, and a dedicated privacy/impact architecture gate. Cross-platform CI and merged-main verification remain outstanding. |
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

## Stage 3 — Cross-feature data orchestration and calculation framework

### Audited starting point

- Existing Stage 2 already stages feature-owned extensions, integrations and calculations atomically in the one application-owned runtime registry.
- Existing calculation contracts already enforce versions, input/output schema versions, business-effective dates, rounding policy, immutable inputs, and mandatory regression fixtures.
- Existing Timeline projection already accepts source snapshots and distinguishes available, pending, unavailable and invalid metrics. The missing capability was a reusable application-level multi-source query contract/coordinator with shared reporting context and source provenance.
- Existing Stage 5 persistence, lifecycle, backup/restore, recovery and upgrade mechanisms remain unchanged.

### Stage 3 implementation added on this branch

- Added typed feature-owned data query contracts with owner, contract version, output schema version, provider query and record validator.
- Added shared query context for date periods, effective dates, as-of timestamps and optional adapter-supported snapshot tokens.
- Added explicit source outcomes: available, pending, unavailable and invalid. Available snapshots carry completeness, freshness, observation time and optional snapshot token; no missing/incomplete source is silently converted to zero.
- Query records are validated and copied into deeply immutable JSON-shaped data before they cross the feature boundary.
- Added the query contribution to the existing extension declaration and the existing runtime registry. It is staged with that feature owner's other contributions; no second registry or independent lifecycle was created.
- Added an application-level `CrossFeatureDataCoordinator` that executes requested sources concurrently under the same reporting context, handles provider failure without exposing adapter details, checks cross-source snapshot consistency where tokens are supported, and retains source ownership/version/provenance.
- Added an orchestration path into the existing registered calculation executor. By default, calculations are blocked when any source is unavailable/invalid/pending, incomplete or not fresh. Explicit opt-ins can allow stale or incomplete sources; source status remains visible in the result.
- Calculation results carry the existing calculation/schema versions and effective date alongside the exact source query results and consistency classification.
- Added focused fixture tests for multiple owners, shared snapshot context, calculation provenance, incomplete/pending/unavailable/invalid states, provider failure, snapshot mismatch, invalid periods, and duplicate/missing query requests.
- Added a dedicated Stage 3 CI test gate before the existing Stage 2 and backup/recovery gates.

### Stage 3 boundaries

- No business feature has been onboarded; all new coverage uses disposable fixtures.
- No universal event bus, formula engine, cache, cross-feature direct table access, presentation/UI work, or replacement of existing calculation contracts was introduced.
- Query contracts are read-only coordination interfaces. Source adapters remain owned by their feature/platform boundaries.
- Stage 3 is not complete until focused tests, full web tests/build, architecture checks, Android build/emulator regression, integrated regression and merged-main CI all pass.

## Stage 3 — Verified completion evidence

- PR [#22 — cross-feature data orchestration and calculation provenance](https://github.com/amtalwalkar-sudo/sam-travels/pull/22) was squash-merged.
- Merged commit: `952a11c08d48a5a34e1aae5d80e7b10d50dbe0cd`.
- Merged-main workflow run [#868](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/42308456833) completed successfully on that exact commit.
- All four merged-main jobs passed: Architecture, Web, Android and Integrated regression.
- The Web job passed the Stage 3 coordinator gate, Stage 2 activation/isolation gate, offline/backup reliability gate, complete web regression suite and production build.
- The Android job passed Gradle assembly/unit tests, Android reliability/emulator gate and published the unsigned release APK from merged main.
- Stage 3 is complete. No real business feature was onboarded; Stage 5 lifecycle, persistence, backup/restore, recovery and upgrade mechanisms remain authoritative and unchanged.

## Stage 4 — Independent UI/UX architecture and feature UI registration

### Entry gate and approved design decision

Stage 3 merged-main CI is green. Stage 4 implementation was delivered in PR #24 and is merged and verified on main. The approved presentation requirement is **unrestricted custom feature UI**: a feature may supply a completely custom screen, layout, visual system, and interaction experience. The architecture defines safe integration and lifecycle boundaries; it must not constrain features to predefined screen templates or force a shared visual design system. The shell and individual presentation subsystems must remain replaceable independently of feature business logic and data contracts.

### Audit approved; implementation delivered

The evidence-based starting audit is recorded in [PERMANENT_APPLICATION_ARCHITECTURE_STAGE_4_AUDIT.md](PERMANENT_APPLICATION_ARCHITECTURE_STAGE_4_AUDIT.md). The product owner reviewed and approved the findings, then explicitly approved a clean-slate presentation replacement. The former shell and presentation are disposable; application/data contracts and Stage 5 foundations remain authoritative. Stage 4 is complete. The clean-slate presentation implementation and merged-main CI evidence are recorded below.

## Implementation discipline

Complete one stage at a time. Each stage must have a focused implementation, tests, CI evidence and progress update before the next stage begins. Do not onboard the first real business feature as part of this architecture project; use disposable fixtures only when required to prove contracts.


### Stage 4 — implementation evidence (PR #24)

- Implementation PR: [#24 — clean-slate presentation shell and custom screen registration](https://github.com/amtalwalkar-sudo/sam-travels/pull/24).
- Replaced the previous shell composition with an independently replaceable application shell. The shell owns the fixed four-item bottom navigation (Drive, Timeline, Performance, Admin) and an expandable upper-corner Settings drawer; Settings is not a primary destination.
- Kept existing Drive/Timeline workflows and application-owned actions in the application composition. The shell receives screen content and settings content through explicit props.
- Added a framework-neutral, versioned, owner-scoped custom screen contribution contract. The contribution is registered in the existing feature extension/runtime registry and published atomically with the owning feature's other contributions. No parallel registry or React dependency was added to core.
- Added a custom feature screen host with owner/screen-level render failure containment. Two structurally different fixture renderers prove that the contract does not impose a template or visual system.
- Added tests for custom renderer freedom, immutable registration, invalid ownership, duplicate identities, owner-group isolation, and the exact four approved primary destinations.
- Reconciled the previous UI/UX shell contract with the approved clean-slate decision. The old presentation implementation is disposable; application/data/lifecycle/Stage 5 guarantees remain authoritative.
- PR workflow run [#877](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/42313471031) passed all four jobs: Architecture, Web, Android and Integrated regression. The Web job passed all 223 tests and production build; Android build and required emulator/reliability gate passed.
- No real business feature was onboarded. Physical-device usability remains unclaimed.


### Stage 4 — merged-main completion evidence

- [PR #24](https://github.com/amtalwalkar-sudo/sam-travels/pull/24) merged to main as `9493b4d8ec039de7b9f469063cd92a254207346b`.
- Merged-main workflow [#881](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/42314701276) passed all four jobs on that exact commit: Architecture, Web, Android and Integrated regression.
- The merged Web job passed all 223 tests and the production build. Android Gradle assembly/unit tests and the required emulator/reliability gate passed; the workflow also published the unsigned release APK from merged main.
- Stage 4 is complete. No real business feature was onboarded, and no physical-device usability claim is made. Stage 5 remains the next stage.


## Stage 5 — Diagnostics and change impact

### Entry gate

Stage 4 is complete and merged to main. PR #24 merged as `9493b4d8ec039de7b9f469063cd92a254207346b`; merged-main CI run [#881](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/42314701276) passed Architecture, Web, Android and Integrated regression on that exact commit. The current main branch has since advanced to `fed3f6c240b1a60af7a329068014a80e6c7ad6ad` with a successful CI run.

### Stage 5 audit — complete; implementation underway

- Audit: [PERMANENT_APPLICATION_ARCHITECTURE_STAGE_5_AUDIT.md](PERMANENT_APPLICATION_ARCHITECTURE_STAGE_5_AUDIT.md).
- Confirmed existing foundations: deterministic feature activation diagnostics; contribution failure inventory; registered capability registries; Stage 3 query and calculation provenance; privacy-safe bounded browser/Android local diagnostics; pairwise extension-upgrade compatibility preflight.
- Identified gaps: no unified safe diagnostic snapshot, no correlated source-to-result execution trace, narrow local diagnostic vocabulary, no complete downstream contract impact report, and no focused Stage 5 developer/reference guide or CI privacy/impact checks.
- Implemented on the Stage 5 branch: 5A versioned safe events and runtime projection; 5B correlated query-to-calculation traces; 5C bounded browser/Android local event persistence; 5D deterministic feature dependency and extension-surface impact reports; 5E a dedicated CI privacy/trace/platform/impact checker and reference documentation.
- Safeguards: local-only diagnostics, no raw exceptions/payloads/GPS/financial values/credentials, no new registry or event bus, no upgrade side effects, and no inferred undeclared dependency edges.
- Remaining completion evidence: focused Stage 5 tests, complete Web build/regression, Android build and local diagnostics integration tests, integrated CI, merge, and a fresh green merged-main run. No completion or merge claim is made until these gates pass.
