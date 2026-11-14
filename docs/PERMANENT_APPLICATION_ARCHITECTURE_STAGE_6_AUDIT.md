# Permanent Application Architecture — Stage 6 End-to-End Verification Audit

**Status:** In progress. This audit records the approved Stage 6 acceptance work; it does not mark the stage complete.
**Baseline:** main at 65a6596c03bf4f49dfbc74822ababbcbbcd86fb9 after PR #84 was merged.
**Scope:** Complete production adoption of the Stage 4 presentation boundary, typed/versioned screen context contracts, actual screen mounting and shell replacement evidence, failure isolation, accessibility/responsive regression, and full cross-platform CI enforcement.
**Non-scope:** Visual redesign, changes to the four approved primary destinations, new business workflows, domain/calculation/persistence changes, new registries, replacement lifecycle/backup/recovery mechanisms, or physical-device acceptance before the final acceptance step.

## 1. Governing constraints

1. Preserve the approved unrestricted custom-screen model. No required screen templates, design system, component library, theme or visual language.
2. Reuse the one application-owned runtime registry and feature-owned presentation contributions. Do not add a parallel screen registry.
3. Feature screens consume typed, versioned context contracts. The application supplies context and application-owned actions; the host validates context identity/version before rendering.
4. The shell and screen composition remain replaceable without changing domain/application contracts, feature business rules, durable data, lifecycle, persistence, backup/restore, recovery, migrations or Android platform ownership.
5. A screen failure must be contained to that screen, diagnosable through a safe callback, and retryable. It must not imply a successful operation or disable unrelated application destinations.
6. Keep existing PWA and Android presentation surfaces separate. No browser presentation implementation may take over native Room or Android overlay ownership.
7. Static checks, contract tests, runtime mount tests, accessibility/responsive tests, integrated CI and physical-device acceptance are distinct evidence categories.

## 2. Stage 6 acceptance work

### 6A — Typed presentation contract
- Add an explicit context contract identity and version to each screen contribution.
- Type the feature-owned state/action value at the screen declaration.
- Validate the supplied context identity and version before invoking the renderer.
- Freeze screen metadata and context identity; reject invalid contracts during registration.
- Preserve opaque renderer output and unrestricted custom layouts.

### 6B — Production screen composition
- Keep App.tsx as a thin application/shell composition root.
- Move Drive's transient UI state and screen implementation into its own screen module.
- Move primary screen routing/mounting out of App.tsx into a separately replaceable composition component.
- Keep feature business logic and durable state in their existing owners.
- Keep Timeline and Admin registered through the existing feature runtime catalogue.

### 6C — Runtime mounting, replacement and failure isolation
- Mount a registered custom screen through the real React host.
- Render the same contribution under an alternate shell without changing the contribution.
- Validate mount-point selection and context compatibility.
- Test failure fallback, safe failure notification and retry affordance.
- Verify that other shell destinations remain available when one screen fails.

### 6D — Architecture, accessibility and responsive enforcement
- Extend check:architecture to reject central App screen composition, missing typed context contracts, bypasses of the validated host and missing runtime/accessibility fixtures.
- Test semantic primary navigation, current destination, accessible Settings control and fixed destination count.
- Test narrow viewport, safe-area, focus-visible and touch-target CSS requirements.
- Keep manual assistive-technology and device usability acceptance explicitly separate.

### 6E — Cross-platform completion
- Run focused presentation tests, complete Web tests/build and architecture checks.
- Run Android Gradle build, unit/instrumentation and emulator reliability gates.
- Run integrated regression.
- Merge only after all required PR jobs pass, then verify all required jobs again on merged main.
- Record exact PR head, merge commit and merged-main workflow evidence. Do not claim physical-device acceptance.

## 3. Implementation evidence in progress

The Stage 6 branch feat/stage6-presentation-architecture currently contains:
- FeaturePresentationContext and FeaturePresentationContextContract types.
- Explicit context identity/version on registered screen contributions.
- Registration-time context metadata validation and immutable context metadata.
- A host-side context compatibility check before renderer invocation.
- A retryable screen failure fallback and optional safe screen-failure callback.
- Timeline and Admin declarations updated to typed context values.
- App.tsx reduced to shell/application composition; Drive UI and transient state moved to apps/web/src/ui/screens/DriveScreen.tsx; primary destination mounting moved to PrimaryScreenComposition.tsx.
- Runtime host tests for custom screen mounting and replacement-shell composition.
- Focused fallback and shell accessibility/responsive contract tests.
- Architecture checker additions for typed contexts, composition boundaries, replacement tests and accessibility/responsive fixtures.

These are implementation claims pending CI validation. The test suite and TypeScript build must pass before this evidence is accepted.

## 4. Remaining verification gates

- Verify all new and changed TypeScript compiles under the repository's strict compiler settings.
- Verify the full web suite and production build.
- Verify the architecture checker and feature-catalogue freshness.
- Verify Android and integrated regression on the exact PR head.
- Review the PR diff for any unintended changes to workflow semantics, persistence, backup/restore, recovery or platform ownership.
- After merge, verify all required jobs on the exact merge commit.
- Physical-device acceptance remains pending and is deliberately deferred to the final user acceptance stage.

## 5. Completion rule

Stage 6 is complete only when all 6A–6E requirements have implementation evidence, all required PR CI jobs pass, the PR is merged, and all required merged-main CI jobs pass on the exact merge commit. A green PR alone is insufficient. Physical-device acceptance must be recorded separately and must not be inferred from CI.
