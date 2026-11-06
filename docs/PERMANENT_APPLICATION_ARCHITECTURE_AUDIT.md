# Permanent Application Architecture — Stage 0 Audit

**Audit status:** Stage 0 complete; findings documented for review.  
**Audit base:** `main` at `c4a559bf901888fa3f69a9e4933fc7a6b4c5d182` (2026-11-06).  
**Scope document:** [Permanent Application Architecture](PERMANENT_APPLICATION_ARCHITECTURE.md).  
**Method:** Repository tree and source/contract inspection, test inventory, and latest merged-main CI evidence. No application source was changed during this audit.

## 1. Executive summary

The repository already contains a substantial permanent architecture foundation. Stage 5 is merged and its latest main-branch CI evidence is green. There are also existing feature-extension, feature-module, UI/UX shell, form, persistence, recovery, and enforcement contracts.

**Do not rebuild Stage 5 or replace the existing contracts.** The main genuine gaps for this approved enhancement are:
- Feature descriptors are typed and validated, but feature inclusion is still manually composed in the application entry point. The scaffold generator does not automatically make a new feature discoverable/registered.
- Dependency validation and ordering exist, but there is no general multi-source query/data orchestration contract for a feature that combines information from several features.
- Versioned calculations and event integrations exist, but calculation provenance/tracing and data completeness/freshness semantics are not consistently represented as a shared orchestration result.
- The UI/UX independence principles are documented and have a small framework-neutral shell/form contract, but the actual application still centralises screen composition, navigation rendering, screen selection and much of the UI in one React component. There is no general feature-owned screen/route/navigation contribution registry.
- UI replacement is not yet proven end-to-end. Existing tests validate shell/form descriptors, not replacement of actual shell/navigation/layout/form renderers while preserving application contracts.
- Diagnostics and static architecture enforcement exist, but there is no complete feature dependency/change-impact or source-to-calculation-to-UI trace.
- Failure isolation needs a deliberate policy: current runtime registry construction fails closed as one complete registry, while the approved architecture also requires unrelated features/screens not to fail unnecessarily when one optional feature is invalid or fails.

The correct implementation is therefore a **small additive integration layer and targeted UI architecture work**, reusing existing registries, contracts, lifecycle and platform adapters.

## 2. Repository baseline and evidence

### Repository baseline
- Repository: `amtalwalkar-sudo/sam-travels`
- Default branch: `main`
- Audited main commit: `c4a559bf901888fa3f69a9e4933fc7a6b4c5d182`
- Latest merged Stage 5 PR: #18, `feat: complete Stage 5 lifecycle and compatibility enforcement`.
- No open pull requests were present at the start of this work.

### CI evidence on audited main
Workflow run [#834](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/42283721346) for the audited main commit completed successfully:
- Architecture — success.
- Web regression/build — success.
- Android build, unit/instrumentation gates and release APK publication — success.
- Integrated regression gate — success.

This is automated CI evidence for the audited commit. It does not prove physical-device usability, live Dropbox acceptance, or acceptance of the new architecture requirements.

### Key existing documents inspected
- `ARCHITECTURE.md`
- `DEVELOPMENT_PLAN.md`
- `DATA_CONTRACT.md`
- `docs/FEATURE_EXTENSION_ARCHITECTURE.md`
- `docs/FEATURE_MODULE_CONTRACT.md`
- `docs/FEATURE_EXTENSION_LIFECYCLE_CONTRACT.md`
- `docs/ARCHITECTURE_FOUNDATION_CONTRACT.md`
- `docs/SHARED_FOUNDATION_ENFORCEMENT_CONTRACT.md`
- `docs/ARCHITECTURE_ENFORCEMENT.md`
- `docs/UI_UX_SHELL_FOUNDATION_CONTRACT.md`
- `docs/FORM_ARCHITECTURE_AND_BEHAVIOUR_CONTRACT.md)

### Key source/test evidence inspected
- `packages/core/src/features.ts`
- `packages/core/src/feature-extension.ts`
- `packages/core/src/feature-contracts.ts`
- `packages/core/src/runtime-registry.ts`
- `packages/application/src/runtime-registry.ts`
- `packages/application/src/feature-extension-upgrade-coordinator.ts`
- `packages/application/src/feature-lifecycle-coordinator.ts`
- `packages/presentation/src/shell-contracts.ts`
- `packages/application/src/form-submission-port.ts`
- `apps/web/src/main.tsx`
- `apps/web/src/feature-extension-upgrade.ts`
- `apps/web/src/room-feature-extension-upgrade.ts`
- `apps/web/src/ui/App.tsx`
- `apps/web/src/ui/styles.css`
- `scripts/check-architecture.mjs`
- `scripts/create-feature.mjs`
- `templates/feature/*`
- Feature, lifecycle, upgrade, backup, presentation and architecture tests under `tests/` and Android instrumentation tests.

## 3. Requirement-by-requirement gap matrix

Status meanings:
- **Already implemented:** working mechanism and supporting tests/evidence exist in the audited repository.
- **Partially implemented:** a contract or mechanism exists, but the full approved outcome is not yet delivered/proven.
- **Missing and necessary:** no adequate shared mechanism was found for the approved outcome.
- **Not necessary currently:** explicitly defer unless a real feature demonstrates the need.

| Requirement | Audit status | Evidence and finding |
|---|---|---|
| Feature ownership and module boundaries | Already implemented | Feature Module Contract defines ownership, public entry points and no private cross-feature access. |
| Typed feature definitions and persistent/non-persistent declarations | Already implemented | `FeatureDefinition` and persistent feature contracts in `packages/core/src/features.ts`. |
| Versioned extension descriptors | Already implemented | `FeatureExtensionDefinition` has identity, version, owner, public entry point, feature, integration and calculation contributions. |
| Deterministic feature discovery / no dynamic loading | Partially implemented | Static descriptors are validated, but no build-time catalogue discovery exists. Existing architecture intentionally rejects arbitrary runtime code loading. |
| Automatic feature inclusion without central-file edits | Missing and necessary | `apps/web/src/main.tsx` manually supplies `[LOGBOOK_FEATURE_EXTENSION]`; scaffold instructions still tell the developer to add the descriptor to the composition root. |
| Dependency validation, compatibility and cycle detection | Already implemented | Feature definitions validate missing dependencies, contract versions and cycles; startup order is resolved dependency-first. |
| Feature registration and immutable registries | Already implemented | Core runtime constructs feature, extension, integration, calculation and backup participant registries; application owns singleton initialization before UI mount. |
| Cross-feature event/integration contracts | Already implemented | Versioned producer/consumer integration contracts validate payloads, event identity and consumer dependency. Work-to-Log Book is an existing production example. |
| General cross-feature query/service contracts | Partially implemented | Application services and explicit contracts exist, but no general feature-owned query/data-provider model was found for arbitrary multi-source reads. |
| Multi-source data orchestration | Missing and necessary | No shared coordinator was found to compose multiple source queries with a common reporting period/effective date, consistent snapshot policy, source completeness/freshness and explicit unavailable states. |
| Versioned calculation registry and rounding | Already implemented | Calculation contracts define owner, versions, unit, effective-date field, rounding and mandatory regression fixtures; runtime executes registered versions. |
| Calculation input/output provenance and end-to-end trace | Partially implemented | Contracts validate inputs/fixtures and execution is versioned, but a shared trace from source records through validation/calculation to published/UI result is not present. |
| Missing/stale/incomplete/unavailable value semantics | Partially implemented | Shared foundation/data contracts describe these semantics, but no common multi-source orchestration result currently enforces them end-to-end. |
| Feature lifecycle, disable/retire retention | Already implemented | Lifecycle coordinator and tests cover valid transitions, dependency guards and record retention. |
| Persistent feature backup/restore participation | Already implemented | Feature-owned browser and Android participant extension points, relationship validators, namespace checks and restore tests exist. |
| Installed extension upgrade transaction path | Already implemented | Application upgrade coordinator, browser IndexedDB adapter and staged Room adapter exist; Android Room applies staged writes/deletes and installed metadata atomically with revision guards. |
| Stage 5 backup/migration/recovery/upgrade regression | Already implemented | Dedicated tests and latest merged-main CI jobs pass; retain the existing foundation and extend only when new gaps are demonstrated. |
| Independent presentation boundary from business/persistence | Already implemented at contract level | UI/UX shell contract explicitly separates presentation, business logic, persistence, recovery and application actions. Architecture gate prohibits direct persistence/platform imports from presentation. |
| Framework-neutral shell/form contracts | Partially implemented | `shell-contracts.ts` defines shell navigation and form descriptors. Current contract is narrow; it does not yet provide full independently replaceable screen/layout/renderer composition. |
| Actual independent shell/navigation implementation | Missing and necessary | `apps/web/src/ui/App.tsx` currently owns screen selection, navigation rendering, screen composition and substantial screen UI. Navigation destinations are statically declared there. |
| Feature-owned screen/route/navigation contributions | Missing and necessary | Feature descriptors do not currently publish screen/route contributions into a shared UI registry. |
| Independent layout/design-system/component/form subsystems | Partially implemented | Strong normative UI/UX and form contracts exist, but actual renderer/component/layout implementation and enforcement are not demonstrated as independently replaceable. |
| Unrestricted custom user-facing UI | Partially implemented | Existing UI contract permits replaceable shell, specialised screen layouts and form renderer replacement. The new frozen architecture document now makes unrestricted custom design a non-negotiable acceptance criterion; current implementation/tests do not yet prove it. |
| Form business/presentation separation | Partially implemented | Form contract and `FormSubmissionPort` separate submission from persistence/business logic. Presentation form definition exists, but end-to-end form renderer replacement and full form conformance need audit/implementation evidence. Do not create a second form framework. |
| Application composition and registry initialization before UI | Already implemented | `apps/web/src/main.tsx` initializes the application runtime and lifecycle repository before mounting React. |
| Architecture dependency/public-entry/size enforcement | Already implemented, with limits | `check-architecture.mjs` checks import direction, feature public entry points, cycles, persistence access, Kotlin boundaries and source-size limits. It does not enforce every UI subsystem boundary or dynamic screen contribution. |
| Diagnostics and local failure reporting | Partially implemented | Local diagnostics exist, but there is no full feature-registration/dependency/consumer/change-impact view or calculation trace. |
| Change-impact analysis | Missing and necessary | Existing checks detect prohibited imports/cycles but do not report downstream consumers, affected screens/calculations/data migrations/tests for a proposed contract change. |
| Failure isolation | Partially implemented; policy reconciliation required | Invalid runtime definitions currently fail complete registry construction. The approved goal also requires optional feature/screen failures not to disable unrelated functionality. Define core-required vs optional-feature activation and dependent blocking before implementing this slice. |
| Feature-level permission declarations | Partially implemented | Platform/security/network contracts exist, but the extension descriptor does not yet declare a general feature permission capability. Implement only the minimum required by actual feature access; do not build a speculative permission framework. |
| Offline-first and platform data authority | Already implemented as shared foundation | Room is authoritative on installed Android; IndexedDB is authoritative for browser-only PWA; shared offline/network/persistence contracts exist. Per-feature data freshness/offline availability still needs to be expressed by the data orchestration contracts. |
| Performance/scalability controls | Not necessary currently beyond basic design | Existing mobile-first architecture and source-size/query discipline are present. Defer generic caching, orchestration optimization and elaborate profiling until actual data volume/performance needs justify them. |
| Universal event bus / formula engine / UI generator / marketplace | Not necessary currently | Explicitly excluded by the frozen scope. |

## 4. Important audit findings

### 4.1 Discovery must remain statically safe

The existing Feature Extension Architecture explicitly says this is not a dynamic plugin loader. Keep that rule.

The smallest compatible solution to the missing automatic inclusion is to investigate a deterministic build-time feature catalogue/manifest generation approach. Generated output should be statically linked and validated by CI. Do not introduce arbitrary runtime directory scanning, reflection, or dynamic code loading.

### 4.2 Dependency resolution is not the same as data orchestration

The current dependency graph correctly answers which feature contracts are required and in what order to initialise them. The event integration registry correctly validates producer/consumer event messages.

Neither is a general multi-source read coordinator. A feature that needs (for example) Work, Log Book, Finance and Vehicle data for a selected date range still needs an explicit, typed query/orchestration contract. Add only that missing capability; reuse existing repositories, use cases and calculation contracts.

### 4.3 UI/UX contracts are ahead of the current UI implementation

The existing UI/UX contract already states that the shell is replaceable and that shell, navigation, components, forms, design tokens and global feedback are separate responsibilities. The form contract also establishes a shared form foundation with feature-owned business meaning.

The current React application does not yet realise all those boundaries: `App.tsx` declares navigation, renders the shell, selects screens and contains substantial screen-specific UI. The CSS file is a broad shared stylesheet. The shell/form contract tests prove descriptor validation and compatible form submission, not a complete runtime renderer replacement.

Stage 4 must therefore be an implementation and proof of the already-approved UI contracts plus the newly frozen unrestricted-custom-design criterion—not a redesign of the current product UI. The current product contract lists Drive, Timeline, Performance and Admin as the approved primary destinations; their visual presentation and arrangement must remain freely redesignable. Any change to the actual product destination set remains subject to product-scope approval under the existing product contract.

### 4.4 Failure isolation needs a precise activation policy

The registry currently validates the whole definition set and returns no registry if any contribution is invalid. That is a strong fail-closed guarantee, but it can conflict with the requirement that an optional feature failure not unnecessarily disable unrelated features.

Before changing runtime behaviour, define a minimal policy:
- Platform/core required contracts remain startup-critical.
- An invalid optional feature is not activated.
- Features depending on that feature are blocked with a clear reason.
- Unrelated valid features remain available where the existing runtime can safely support that state.
- No invalid or partial contribution is exposed.

Do not weaken Stage 5's data/lifecycle guarantees to achieve this. This policy needs a focused design review during the relevant implementation stage.

### 4.5 Do not create a second form system

The repository already has a detailed approved form contract and a stable application submission port. Reuse them. The new work should make renderers and UI components replaceable and prove custom form layouts without creating another form registry, persistence path, validation authority or form framework.

## 5. Recommended gap-based implementation plan

This is the approved seven-stage plan, narrowed to audited gaps.

### Stage 0 — Audit and scope documentation
**Complete in this work branch.** Frozen architecture scope documented; repository audit and gap matrix recorded. No runtime code changes.

### Stage 1 — Deterministic discovery and feature declarations
- Reuse `FeatureDefinition`, `FeatureExtensionDefinition` and the existing runtime registry.
- Add only the smallest build-time manifest/catalogue generation needed to remove manual per-feature composition-root edits.
- Keep static linking and CI validation; no runtime dynamic loading.
- Extend scaffold and tests so adding a valid feature updates the catalogue through the supported workflow.
- Preserve fail-closed validation and stable public entry points.

### Stage 2 — Dependency activation and registration policy
- Reuse existing dependency/version/cycle checks and startup ordering.
- Add only missing activation-state/diagnostic behaviour.
- Resolve the required-core versus optional-feature failure-isolation policy before implementation.
- Do not replace registries or lifecycle coordination.

### Stage 3 — Multi-source data coordination
- Define typed feature query/provider contracts.
- Add a small coordinator for multiple declared source queries.
- Carry selected reporting periods/effective dates and consistent snapshot semantics where supported.
- Preserve source completeness, freshness, unavailable and invalid status.
- Feed validated data into existing feature-owned calculation contracts.
- Add provenance/trace information only sufficient to explain source → validation → calculation → result.

### Stage 4 — UI/UX independence and feature UI registration
- Refactor the central React shell incrementally behind existing presentation contracts.
- Add only necessary screen/route/navigation contribution registration.
- Separate shell, navigation rendering, layout, design tokens, reusable components, form renderer and UI state responsibilities.
- Keep feature screens and business logic independent.
- Allow custom renderers and fully custom screen compositions; reusable UI is optional.
- Prove shell, navigation, layouts, forms and components can be replaced behind stable contracts without changing feature business logic, persistence or lifecycle.
- Preserve the existing approved product destinations unless product scope is separately changed.

### Stage 5 — Diagnostics and change impact
- Extend existing local diagnostics and architecture checks.
- Show registered/blocked features, declared dependencies and published contributions.
- Identify direct consumers/affected screens/calculations/contracts/tests for changes.
- Provide useful source-to-result calculation traces.
- Avoid a visual dependency editor or a large observability platform.

### Stage 6 — End-to-end verification and CI enforcement
- Verify discovery/catalogue generation and invalid feature rejection.
- Verify dependency/activation/failure-isolation policy.
- Verify multi-source queries and calculation correctness.
- Verify feature screen registration and complete custom shell/UI replacement.
- Verify existing Stage 5 backup/restore/migration/recovery/upgrade behaviour remains unchanged.
- Run web, Android, architecture and integrated regression gates.
- Use a disposable test fixture/reference extension only; do not onboard the first real business feature.

## 6. Risk and scope controls

| Risk | Control |
|---|---|
| Rebuilding Stage 5 | Treat the existing contracts and implementation as authoritative; add only proven gaps. |
| Over-engineering discovery | Build-time catalogue generation, static linking, no runtime plugin loader. |
| Creating a generic orchestration framework | Start with typed query contracts and one focused coordinator; add capabilities only when tests require them. |
| UI framework lock-in | Contracts define integration, not appearance; custom screens/renderers remain permitted. |
| Breaking stable UI/product decisions | Preserve current behaviour and approved destination set; separate visual freedom from product-scope changes. |
| Whole-app failure from optional feature | Define core-required/optional activation and dependent blocking before implementing isolation. |
| Hidden cross-feature coupling | Public entry points, typed contracts, dependency checks and traceable data sources. |
| Regression/data loss | Reuse Stage 5 transactions, backup/restore, migrations, checkpoints and existing CI gates. |

## 7. Stage 0 outcome and next gate

**Stage 0 audit is complete.** The frozen specification and this audit report are committed on the dedicated documentation branch. No runtime implementation has been started.

The audit confirms that the enhancement is not a rebuild. The principal implementation work is:
1. deterministic build-time feature catalogue/discovery;
2. a focused multi-source query/data coordination contract;
3. actual modular UI composition and feature UI registration, with unrestricted custom design;
4. bounded diagnostics/change impact and explicit optional-feature failure isolation;
5. end-to-end tests proving these capabilities while retaining Stage 5.

**Next stage:** Stage 1 may begin after the user reviews this Stage 0 report. No real business feature onboarding is included.
