# UI/UX and Application Shell Foundation Contract

Status: approved foundation contract; implementation and enforcement are to be delivered in later, separately reviewed slices.
Scope: the Sam Travels single-driver PWA and Android application surfaces. This contract governs presentation architecture and user interaction. It does not define business rules, calculations, persistence semantics, or feature-specific workflows.

## Governing principle

The UI/UX and application shell form a replaceable, independently testable presentation system. They may evolve without changing business logic, calculations, persistence, recovery, platform ownership, or feature contracts.

The application must present one coherent design language while allowing each section to use the layout and interaction patterns appropriate to its work.

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

## 3. Design system

- A shared design language governs colour roles, typography, spacing, sizing, shape, elevation, iconography, motion, and visual states.
- Shared design decisions are expressed as semantic tokens and reusable primitives, not copied literal values scattered through screens.
- Themes are presentation configuration. Theme changes must not alter application state or business behaviour.
- Components consume semantic tokens; feature screens must not create competing global design systems.
- The exact visual theme, palette, typography choices, and component styling remain undecided until the visual-design phase.

## 4. Screen and component standards

- Screens are compositions of independently reusable components and section-level layouts.
- Common patterns for lists, details, summaries, forms, empty states, loading states, errors, and offline states are defined centrally.
- Shared components have one cohesive responsibility, explicit inputs/outputs, documented state ownership, and stable public contracts.
- Feature-specific composition is permitted; duplicated generic components or unexplained visual exceptions are not.
- A screen may use a specialised layout when it materially improves its task, while retaining the shared design language and interaction conventions.

## 5. Interaction standards

- Navigation, back behaviour, focus, keyboard handling, gestures, dialogs, menus, confirmations, and submission feedback follow shared interaction contracts.
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

## 8. Application state and lifecycle

- The shell presents startup, restoration, active, inactive, offline, reconnecting, interrupted, recovering, blocked, and failure states when applicable.
- Runtime state is supplied by its authoritative owner; the shell must not maintain a conflicting shadow state.
- UI projections are disposable and must be reconstructible after navigation, reload, process recreation, or application resume.
- Interrupted operations retain their true pending/unknown/failure status until the responsible runtime contract resolves them.
- Lifecycle transitions must not cause duplicate commands, lost user input, or false success feedback.

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
- Dependency graphs must be acyclic. Shared primitives must not become catch-all modules or create reverse dependencies from lower-level components to higher-level composition.
- Consistency is achieved through shared contracts and design tokens, not by coupling components to one another's implementation.
- Exceptions are explicit and justified; avoid creating a framework for every small visual element.

## Cross-cutting acceptance criteria

Before the foundation is considered implemented, automated and reviewed evidence must demonstrate:

1. Shell and navigation implementations can be replaced behind stable contracts.
2. A feature screen and its layout can be replaced without changing its domain/application behaviour.
3. Form renderers and field components can be replaced without changing form data contracts or persistence.
4. Theme and token changes do not alter business state or operations.
5. Component dependency checks reject prohibited imports, cycles, and private feature access.
6. Components can be tested independently with contract-compatible substitutes.
7. Lifecycle, offline, pending, error, and recovery states are presented from authoritative runtime state.
8. Responsive, safe-area, keyboard, accessibility, localisation-readiness, and privacy requirements have repeatable checks.
9. Shared feedback and interaction conventions are reused rather than reimplemented per feature.
10. UI contract changes have compatibility, migration, and regression evidence.

## Explicit non-goals for this contract

- It does not select the final theme, colours, typography, icon set, or screen layouts.
- It does not define business rules, calculations, accounting semantics, or feature workflows.
- It does not authorize implementation of speculative features or additional navigation destinations.
- It does not claim that physical-device usability, accessibility, or performance acceptance has passed merely because automated checks pass.
- It does not require every visual element to become a separately abstracted component.

## Implementation policy

First reconcile this contract with existing architecture, feature, form, and platform contracts. Then implement enforcement and shell/presentation foundations in small, reviewable slices. Do not begin feature-specific visual redesign or add business rules and calculations as part of this documentation change.
