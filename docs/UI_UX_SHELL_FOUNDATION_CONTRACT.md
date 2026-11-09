# UI/UX and Application Shell Foundation Contract

Status: approved presentation-boundary contract; its former shell composition and visual-system prescriptions are superseded by the clean-slate Stage 4 decision recorded below.
Scope: the Sam Travels single-driver PWA and Android application surfaces. This contract governs presentation architecture and user interaction. It does not define business rules, calculations, persistence semantics, or feature-specific workflows.

## Governing principle

The UI/UX and application shell form a replaceable, independently testable presentation system. They may evolve without changing business logic, calculations, persistence, recovery, platform ownership, or feature contracts.

The application may use any visual language. Consistency is optional and must never constrain a feature's custom presentation.

## Authority, precedence, and conflict resolution

This is a presentation-foundation contract, not a replacement for existing architecture or runtime contracts. Apply the following precedence:

1. Domain, transaction, persistence, recovery, security, and platform contracts remain authoritative for their respective semantics.
2. `FEATURE_MODULE_CONTRACT.md` is authoritative for feature ownership, public module boundaries, and feature/application contracts. `FORM_ARCHITECTURE_AND_BEHAVIOUR_CONTRACT.md` is the single authority for shared form mechanics and form behaviour; feature-owned business meaning and validation remain with the relevant feature contracts. Do not create a parallel form framework or a second field-definition authority.
3. `APPLICATION_LIFECYCLE_CONTRACT.md` governs startup, resume, shutdown, authoritative state readiness, and operational-action gates.
4. `PWA_LIFECYCLE_CONTRACT.md` governs browser-only PWA delivery, cache, service-worker, and browser lifecycle responsibilities.
5. `ANDROID_NATIVE_CONTRACT.md` and the runtime/bridge contracts govern native Android, Room ownership, native overlay, and bridge behavior.
6. `ARCHITECTURE.md` and `ARCHITECTURE_ENFORCEMENT.md` govern dependency direction and existing automated architecture enforcement.

If a UI requirement appears to conflict with one of these authorities, preserve the existing authoritative runtime/business guarantee and revise the presentation contract or implementation. Do not resolve a conflict by weakening persistence, recovery, platform, security, or feature guarantees. Any genuine product-level change requires explicit approval and an update to the owning contract.

## 1. Independence and separation

- Presentation renders application state and requests approved application actions. It does not own business invariants, calculations, persistence, recovery, or integration policy.
- Shell, navigation, screen composition, UI components, forms, design tokens, and global feedback are separate responsibilities connected through explicit contracts.
- UI components must not access database tables, repositories, native plugins, network clients, or feature-private implementation details directly.
- Presentation receives state through explicit view models, selectors, or typed presentation contracts and dispatches actions through approved application interfaces.
- UI state is limited to transient presentation concerns unless an explicitly owned application contract says otherwise. Durable business state remains authoritative outside the UI.
- Visual or interaction changes must not silently change business behaviour, transaction boundaries, data ownership, or recovery semantics.

## 2. Application shell

- The shell owns the global application frame, shared header/content/navigation hosts, global overlays, and shell-level lifecycle presentation.
- The shell does not own feature business workflows or feature-specific data.
- The agreed primary navigation contains exactly four destinations: Drive, Timeline, Performance, and Admin. Changes to this decision require explicit product approval.
- Navigation registration and destination identity are separate from the visual rendering of navigation controls.
- The shell provides consistent safe-area, viewport, scrolling, focus, and back-navigation coordination.
- Feature screens are mounted through explicit screen contracts; the shell must not import feature-private implementations.
- Shell replacement must not require rewriting feature registrations, domain/application contracts, or persistence adapters.
- Startup, recovery, migration, compatibility, and blocked states must remain presentable even when operational actions are disabled. A blocked shell is not an absent shell: it must show the authoritative status and safe next steps without enabling actions prematurely.
- The shell must not independently decide that startup/recovery is complete; it presents the authoritative lifecycle state and respects the application lifecycle action gates.

## 3. Design system

- Design systems, themes, tokens, component libraries and styling conventions are optional implementation choices, not platform requirements.
- A feature may bring its own complete visual system or use no shared system.
- Any shared presentation primitives are conveniences only and cannot constrain custom screens.

## 4. Screen and component standards

- Screens may be fully custom compositions, including bespoke components, layouts, interaction models and styling.
- No standard screen template, common component vocabulary or visual convention is required.
- Shared components may be used when useful but are never mandatory.

## 5. Interaction standards

- Navigation, back behaviour, focus, keyboard handling, gestures, dialogs, menus, confirmations, and submission feedback must respect platform and application safety contracts; visual and interaction implementations may otherwise be custom.
- Destructive or consequential actions clearly communicate scope and require confirmation appropriate to their impact.
- Input validation is presented consistently and remains distinct from domain validation and business acceptance.
- Pending, successful, failed, rejected, and uncertain outcomes must not be visually conflated.
- A presentation acknowledgement must never imply that a durable operation has committed when it has not.
- Interaction patterns must be usable with touch, keyboard, assistive technology, and supported input methods.

## 6. Extensibility

- New screens, navigation destinations, components, layouts, and form types must be addable through documented extension points.
- Extending one feature must not require editing unrelated feature internals or duplicating shared infrastructure.
- Shared contracts evolve through explicit versioning and compatibility policy.
- Extension points must be justified by real reuse or independent evolution needs; avoid speculative frameworks and unnecessary indirection.

## 7. Verification and enforcement

- Presentation architecture rules must be executable and included in pull-request CI where statically or dynamically verifiable.
- Tests cover dependency boundaries, public component contracts, navigation registration, screen composition, form presentation contracts, accessibility, responsive behaviour, and critical interaction states.
- Contract tests demonstrate that implementations can be replaced without changing consumers that depend only on the contract.
- Visual regression tests may protect stable, high-value shared patterns, but must not make harmless responsive variation brittle.
- Automated checks must distinguish what they prove from what still requires manual usability or device acceptance.
- Documentation alone does not constitute enforcement.
- Verification evidence is classified separately: static architecture checks prove declared source/import constraints; unit/contract tests prove component interfaces and isolated behaviour; integration tests prove runtime wiring and lifecycle interactions; visual/accessibility automation proves only the checks it actually executes; manual usability and physical-device acceptance remain separate evidence. No category substitutes for another.
- Extend the existing architecture gate and CI conventions rather than introducing a parallel enforcement system. Any new check must identify its scope, known bypasses/limitations, and regression fixtures.

## 8. Application state and lifecycle

- The shell presents startup, restoration, active, inactive, offline, reconnecting, interrupted, recovering, blocked, and failure states when applicable.
- Runtime state is supplied by its authoritative owner; the shell must not maintain a conflicting shadow state.
- UI projections are disposable and must be reconstructible after navigation, reload, process recreation, or application resume.
- Interrupted operations retain their true pending/unknown/failure status until the responsible runtime contract resolves them.
- Lifecycle transitions must not cause duplicate commands, lost user input, or false success feedback.
- Follow the startup/resume ordering and action gates in `APPLICATION_LIFECYCLE_CONTRACT.md`; this contract does not redefine them.

## 9. Accessibility and inclusive design

- Accessibility is a release requirement, not optional polish.
- Provide semantic roles and labels, screen-reader descriptions, logical focus order, visible focus, and accessible announcements for meaningful state changes.
- Support system text scaling and avoid clipping or truncating essential information.
- Maintain sufficient contrast and never communicate critical meaning by colour alone.
- Touch targets, motion, animation, and interaction timing must account for users with differing abilities.
- Accessibility checks are included in component and screen verification.

## 10. Internationalisation and localisation

- User-facing text is externalised from component implementation; avoid hardcoded strings in screen logic.
- Layouts must tolerate translated text expansion, different scripts, and right-to-left direction where supported.
- Dates, times, numbers, and currencies use explicit locale-aware presentation formatters.
- Formatting must not mutate stored values or redefine domain semantics.
- The initial supported language and locale policy are product decisions for the design phase; architecture must not prevent later localisation.

## 11. Device and environment adaptability

- Layouts adapt to viewport size, density, system font scale, safe areas, orientation, and supported Android/WebView versions.
- Do not base layout correctness on one handset model, fixed screen dimensions, or a single pixel density.
- Define responsive behaviour for narrow, regular, and expanded available widths.
- Handle system bars, cutouts, keyboard/IME resizing, and window insets without obscuring controls or content.
- Device-specific behaviour belongs behind presentation/platform contracts, not scattered device-model checks.

## 12. Privacy and security in presentation

- Presentation displays only information required for the current user task.
- Sensitive values support appropriate masking and deliberate reveal behaviour.
- Permission-dependent capabilities communicate availability and next steps without pretending that presentation visibility grants permission.
- Authentication/session and access-denied states are explicit where applicable.
- Secrets, credentials, tokens, and sensitive personal data must not be written to UI diagnostics, analytics, logs, or crash messages.
- Destructive actions disclose their scope and use the owning application operation; hiding a screen is never treated as deletion or access control.

## 13. Performance and resource management

- Common navigation and interaction should remain responsive on supported lower-powered devices.
- Long histories and large collections use appropriate pagination, windowing, or incremental rendering.
- Avoid unnecessary rerenders, expensive synchronous work, unbounded subscriptions, and retained screen resources.
- Loading and progressive rendering must preserve clear user feedback and must not imply data completeness prematurely.
- Images, icons, and other assets use appropriate sizing, caching, and lifecycle management.
- Performance budgets and measurement methods are established before broad visual implementation and checked for regressions.

## 14. Notifications and global feedback

- Shared feedback primitives provide consistent success, warning, error, informational, pending, and persistent-alert presentation.
- Global feedback infrastructure is independent of individual feature screens.
- Features provide typed, user-safe feedback requests; they do not implement competing toast, banner, or dialog systems.
- Feedback communicates whether an action was accepted, persisted, completed, or requires attention.
- Important unresolved states must not rely solely on transient messages that disappear.
- Notification permission, delivery, and background execution remain governed by platform and application contracts.

## 15. UI contract versioning and governance

- Public shell, navigation, component, form, design-token, and presentation-state contracts have explicit owners and compatibility expectations.
- Breaking changes require a migration plan, affected-consumer inventory, compatibility tests, and controlled rollout.
- Deprecated contracts have a documented replacement and removal condition.
- Shared components and tokens are governed centrally; feature teams may compose and extend them through approved contracts without modifying shared internals.
- Exceptions identify the reason, owner, affected scope, and review/removal condition.
- Product-approved design decisions and implementation status are tracked separately; an approved contract does not imply that every capability is implemented.

## 16. Component-level independence and decoupling

- Every major shell, navigation, screen-composition, design-system, UI-component, form, feedback, interaction, accessibility, and device-adaptation unit has a clear responsibility and explicit contract.
- Components communicate through typed props, callbacks, events, slots, view models, or other documented interfaces. They must not reach into one another's private state or implementation.
- Shared state has one explicit owner. Avoid duplicated state, hidden global mutation, and implicit service-locator dependencies.
- Components are composable and independently testable with contract-compatible substitutes or test doubles.
- A component implementation can be replaced without rewriting unrelated components or changing feature business behaviour.
- Navigation presentation can be replaced without changing destination registration; screen layout can be replaced without changing feature logic; form rendering can be replaced without changing form data/application contracts; theme implementation can be replaced without changing runtime behaviour.
- Form-specific ownership, typed field/value contracts, validation, and application wiring remain governed by `FEATURE_MODULE_CONTRACT.md`; this contract governs only presentation composition and renderer replaceability.
- Dependency graphs must be acyclic. Shared primitives must not become catch-all modules or create reverse dependencies from lower-level components to higher-level composition.
- Consistency is achieved through shared contracts and design tokens, not by coupling components to one another's implementation.
- Exceptions are explicit and justified; avoid creating a framework for every small visual element.

## Platform presentation boundary

- The browser-only PWA and installed Android application follow the same design language, interaction principles, accessibility expectations, and platform-neutral application contracts.
- The PWA and native Android overlay are distinct presentation surfaces with independently appropriate implementations; this contract does not require pixel-identical UI or force native UI into React component abstractions.
- Both surfaces must continue to observe and request changes through the same authoritative application/domain state and transition contracts. They must not create separate business state machines or writable business-state copies.
- Android Room/bridge ownership and PWA IndexedDB/service-worker boundaries remain governed by their platform contracts. Presentation architecture must not introduce a fallback or dual-write path.

## Cross-cutting acceptance criteria

Before the foundation is considered implemented, automated and reviewed evidence must demonstrate:

1. Shell and navigation implementations can be replaced behind stable contracts.
2. A feature screen and its layout can be replaced without changing its domain/application behaviour.
3. Form renderers and field components can be replaced without changing form data contracts or persistence.
4. Theme and token changes do not alter business state or operations.
5. Component dependency checks reject prohibited imports, cycles, and private feature access.
6. Components can be tested independently with contract-compatible substitutes.
7. Lifecycle, offline, pending, error, and recovery states are presented from authoritative runtime state, including blocked startup without operational actions.
8. Responsive, safe-area, keyboard, accessibility, localisation-readiness, and privacy requirements have repeatable checks.
9. Shared feedback and interaction conventions are reused rather than reimplemented per feature.
10. UI contract changes have compatibility, migration, and regression evidence.
11. PWA and Android surfaces are verified independently while retaining the same authoritative application semantics.

## Explicit non-goals for this contract

- It does not select the final theme, colours, typography, icon set, or screen layouts.
- It does not define business rules, calculations, accounting semantics, or feature workflows.
- It does not authorize implementation of speculative features or additional navigation destinations.
- It does not claim that physical-device usability, accessibility, or performance acceptance has passed merely because automated checks pass.
- It does not require every visual element to become a separately abstracted component.
- It does not require the PWA and native Android overlay to share one UI implementation.

## Implementation policy

First reconcile this contract with existing architecture, feature, form, lifecycle, recovery, security, and platform contracts. Then implement enforcement and shell/presentation foundations in small, reviewable slices. Do not begin feature-specific visual redesign or add business rules and calculations as part of this documentation change. The shell implementation must preserve authoritative startup/recovery gates and platform-specific ownership.


## Clean-slate presentation decision — Stage 4 (authoritative)

The product owner has explicitly approved discarding the existing presentation implementation and its visual design. The former shell, layouts, navigation controls, component styling, and UI abstractions are not preservation constraints. They may be replaced rather than migrated. This decision does **not** authorize removal or semantic redesign of application workflows, feature contracts, business rules, durable data, lifecycle gates, persistence, backup/restore, recovery, migrations, upgrades, security, or native platform ownership.

The replacement primary navigation is fixed at exactly four bottom destinations, in this order: **Drive, Timeline, Performance, Admin**. An expandable **Settings (gear) control** belongs in the upper corner and is not a fifth bottom destination. The four destinations are product-owned shell navigation; feature-owned custom screens may be mounted within approved destinations but may not silently add or replace primary destinations.

Each feature may supply a completely custom screen and interaction experience. No mandatory screen template, design system, theme, component library, form renderer, or visual language is imposed. The shell is a replaceable host and must not inspect, reshape, or constrain a custom screen's internal composition. Presentation code continues to consume authoritative application state and request actions through approved application ports; it must not own business rules or durable state.

The four-menu and settings arrangement is a product-level shell requirement, not a framework limitation. The PWA shell and native Android overlay remain separate presentation surfaces. This decision supersedes any earlier requirement in this document that a shared design language, shared component patterns, or the prior shell implementation be preserved.
