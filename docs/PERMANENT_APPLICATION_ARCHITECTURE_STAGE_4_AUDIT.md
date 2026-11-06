# Permanent Application Architecture — Stage 4 Presentation Audit

**Status:** Implementation delivered in PR #24; PR CI passed. Merged-main verification remains the final completion gate.  
**Baseline:** `main` at `952a11c08d48a5a34e1aae5d80e7b10d50dbe0cd` (Stage 3 merged-main CI run #868 succeeded).  
**Scope:** Independent application shell, unrestricted custom feature presentation, screen/navigation contributions, presentation composition and verification.  
**Non-scope:** Business feature onboarding, business rules/calculations, persistence redesign, platform lifecycle redesign, Stage 5 replacement, final visual redesign.

## 1. Governing decisions

1. A feature may provide a completely custom screen and interaction experience. No predefined screen-template requirement or mandatory design system may restrict that freedom.
2. The architecture provides stable, versioned integration boundaries, ownership, activation/failure isolation and lifecycle-safe mounting; it does not dictate how a feature looks or how its custom interaction flow works.
3. Shell, navigation presentation, screen composition, design tokens, components, form renderers and global feedback remain independently replaceable.
4. Feature presentation must use approved application contracts and authoritative runtime state/actions. It must not access another feature's private implementation, persistence tables, native plugins or adapters.
5. The existing Stage 1 discovery catalogue, Stage 2 activation/atomic contribution publication, Stage 3 data coordination and the single application-owned runtime registry remain authoritative.
6. Stage 5 persistence, backup/restore, migration/upgrade, recovery and lifecycle ownership must remain unchanged.
7. Use disposable fixture features only. Do not onboard a real business feature or introduce AI-generated business behaviour.

## 2. Existing evidence and classification

| Area | Evidence on baseline | Classification | Finding |
|---|---|---|---|
| Presentation foundation contract | `docs/UI_UX_SHELL_FOUNDATION_CONTRACT.md` defines shell, navigation, component, form, state, accessibility, platform and replacement principles. | Already implemented (contract only) | The approved foundation is extensive; implementation and enforcement are explicitly separate. |
| Unrestricted custom UI policy | `docs/PERMANENT_APPLICATION_ARCHITECTURE.md` section 5 permits complete redesign/custom screens; shell contract permits specialised layouts and explicit screen contracts. | Already implemented (policy only) | Preserve and make executable; do not weaken into template-based rendering. |
| Framework-neutral shell metadata | `packages/presentation/src/shell-contracts.ts` exports `defineApplicationShell` and `ShellNavigationItem`. | Partially implemented | It validates identity, initial destination and navigation metadata, but does not define a custom screen mounting/rendering contract or replaceable shell adapter boundary. |
| Presentation form metadata | Same file exports a fixed field-kind `PresentationFormDefinition`. | Partially implemented | It validates a simple form description, but form data/submission ownership belongs to `FEATURE_MODULE_CONTRACT.md`; Stage 4 must not create a competing form framework or treat this schema as a limit on custom screens. |
| Feature presentation declarations | `FeatureExtensionDefinition` currently publishes feature, integrations, calculations and data queries; no screen/navigation/presentation contribution is present. | Missing and necessary | Add a versioned, owner-scoped presentation contribution through the existing extension declaration and atomic activation pipeline, not a new registry. |
| Runtime presentation registry | `packages/application/src/runtime-registry.ts` owns the single runtime registry and lifecycle coordinator; current registry exposes no presentation contribution inventory. | Missing and necessary | Extend existing registration/activation publication with typed presentation metadata and owner isolation. Do not create a parallel global registry or lifecycle. |
| Application shell composition | `apps/web/src/ui/App.tsx` owns the current navigation metadata, active-screen state, header, screen switch and much of the Drive UI in one React component. | Partially implemented | Shell and screen content are coupled in the current composition; separate shell adapter and screen host while retaining existing workflow state/actions. |
| Feature UI isolation | Current UI imports feature-owned work-shift and logbook APIs through a workspace hook; feature extension public entry points and architecture import checks exist. | Partially implemented | Application services may consume feature public contracts, but presentation must not import feature-private modules or bypass the application layer. Add explicit dependency checks for presentation-to-feature and shell boundaries. |
| Navigation policy | Existing shell contract defines navigation items as screen/label/icon; approved product contract fixes the primary destinations as Drive, Timeline, Performance and Admin. | Partially implemented | Preserve the four approved primary destinations. Feature-contributed nested routes/actions may be composed only within approved ownership and must not silently add/replace primary destinations without product approval. |
| Custom screen and interaction freedom | No feature-owned screen contribution/mount adapter or fixture proving a custom component can be mounted exists. | Missing and necessary | Prove at least two substantially different custom fixture presentations can be mounted through the same stable host contract without template conversion. |
| Forms and application actions | `FormSubmissionPort` separates submission from rendering; `FEATURE_MODULE_CONTRACT.md` owns form/data/application boundaries. | Already implemented (application boundary); partially implemented (renderer replacement) | Reuse the existing submission port and feature contract. Do not move validation/business acceptance/persistence into presentation. |
| Authoritative lifecycle and blocked states | `main.tsx` initializes the runtime registry and lifecycle repository before mounting React; lifecycle/action gates live outside presentation. | Already implemented (ownership); partially implemented (presentation states) | The shell must present authoritative startup/recovery/blocked state and never infer readiness or enable actions independently. |
| Platform presentation split | Existing UI is React PWA; native Android overlay is implemented separately in Kotlin and platform contracts. | Already implemented (ownership boundary) | Keep PWA and native overlay independently appropriate; do not force Android native surfaces into React abstractions or duplicate business state. |
| Accessibility, responsive layout, privacy, localisation and feedback | Detailed requirements exist in the shell foundation contract; no Stage 4-specific automated presentation gate is present in the current CI workflow. | Partially implemented | Add verifiable automated checks incrementally and state limitations; do not claim physical-device usability from CI. |
| CI enforcement | Existing architecture gate checks dependency direction, feature public entry points, runtime registry ownership and generated catalogue freshness. | Partially implemented | Extend the existing gate and workflow with presentation ownership, contribution registration, replaceability and fixture tests. |

## 3. Required Stage 4 outcomes

1. **Contract:** define versioned, owner-scoped feature presentation contributions that can identify custom screens, navigation metadata and interaction entry points without imposing a screen template or styling vocabulary.
2. **Custom renderer freedom:** support a feature-supplied custom component/renderer through an explicit host/mount contract. The shell must not inspect or reshape its internal layout or interactions.
3. **Existing registry integration:** stage presentation contributions with the feature owner's other contributions and publish them atomically through the existing activation path. A failed owner's presentation contribution must not partially publish or disrupt unrelated owners.
4. **Replaceable shell:** separate navigation destination identity/registration from navigation controls and separate screen hosting from shell rendering. Demonstrate a replacement shell consuming the same registered contributions.
5. **Application boundary:** presentation requests actions through application-owned ports and consumes typed view state; it does not own domain rules, calculation, persistence, backup, recovery or platform policy.
6. **Failure handling:** isolate screen render/mount failures at the owner/screen boundary, expose safe diagnostics and preserve the rest of the shell. Do not turn render failure into silent success or data loss.
7. **Lifecycle correctness:** retain authoritative startup, recovery, migration, blocked and action-gating states; no UI-owned shadow lifecycle.
8. **Fixtures:** use at least two deliberately different custom screen fixtures (for example, a dense data-oriented screen and a highly composed interactive screen) to prove the host contract is not template-bound.
9. **Regression:** preserve the four approved primary destinations and existing Drive workflow, forms/application submission semantics, Stage 2 activation behaviour, Stage 3 data contracts, Stage 5 persistence/recovery and Android-native ownership.
10. **Enforcement:** extend existing architecture/CI gates; add focused contract, registry, composition and failure-isolation tests plus full web, Android and integrated regression.

## 4. Proposed implementation slices

- **4A — Contract and ownership:** refine presentation contracts; add feature-owned presentation contribution declarations and immutable metadata; document versioning, ownership and compatibility. No UI redesign.
- **4B — Registry integration:** stage/publish presentation contributions in the existing feature activation pipeline; test duplicate IDs, invalid ownership, blocked/failed owner isolation and deterministic ordering.
- **4C — Replaceable shell host:** extract shell composition and a renderer-neutral screen host adapter; retain the existing four destinations and Drive workflow behaviour. No visual redesign.
- **4D — Custom presentation fixtures:** register and mount two structurally different custom screens; prove the shell does not constrain their internal UI or interactions and that shell replacement leaves contributions intact.
- **4E — Resilience and enforcement:** add per-screen failure containment, diagnostics, architecture rules, accessibility/responsive contract checks and CI gates; run full regression.

Each slice must be independently reviewed and tested. The stage is complete only after all required CI jobs pass on the PR and merged main. Physical-device acceptance remains separate and is not claimed by emulator/CI evidence.

## 5. Explicit exclusions and safeguards

- No predefined screen-template catalogue as a required rendering model.
- No mandatory visual theme, design system, component library or CSS framework for feature-owned custom screens.
- No universal UI generation engine, low-code form engine or speculative plugin marketplace.
- No new presentation registry parallel to the existing application-owned feature runtime registry.
- No direct feature-to-feature UI imports or cross-feature private state access.
- No business logic, calculations, domain validation, persistence, backup/restore, recovery or migration in presentation code.
- No changes to Stage 5 ownership or guarantees.
- No real business feature onboarding and no AI development of business features.
- No claim that automated tests establish physical-device usability or full accessibility acceptance.

## 6. Review checkpoint and approved clean-slate adjustment

The product owner reviewed the audit and explicitly approved discarding the existing presentation completely while retaining proven application and data foundations. Stage 4 implementation is authorized.

The final shell requirement is exactly four bottom destinations in this order: Drive, Timeline, Performance, Admin, plus an expandable Settings gear in the upper corner (not a fifth bottom destination). The old visual shell, screen composition, navigation controls, styling and UI abstractions are disposable. Existing application workflows, contracts, business semantics, lifecycle, persistence, backup/restore, recovery, upgrades and platform ownership are not disposable.

The unrestricted custom-screen requirement remains: no predefined screen templates, mandatory design system or imposed feature visual language. Update the former UI/UX shell contract to make this decision authoritative and remove contradictions. Implementation may proceed in slices 4A–4E without further product clarification.


## 7. Implementation evidence — PR #24

The approved 4A–4E scope is implemented in [PR #24](https://github.com/amtalwalkar-sudo/sam-travels/pull/24): versioned owner-scoped presentation screen contracts, atomic publication through the existing runtime registry, a replaceable shell component, fixed four-destination bottom navigation with expandable Settings, custom screen hosting and per-screen failure containment, two different fixture renderers, and focused ownership/duplicate/replaceability tests. The former shell contract has been reconciled with the clean-slate decision.

PR workflow run [#877](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/42313471031) passed Architecture, Web, Android and Integrated regression. The full Web suite passed 223 tests and the production build; Android build and required emulator/reliability gate passed. This is PR evidence only; Stage 4 is not marked complete until the merge and merged-main CI verification succeed.
