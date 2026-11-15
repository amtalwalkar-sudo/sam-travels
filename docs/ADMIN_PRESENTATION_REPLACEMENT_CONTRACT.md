# Admin Presentation Replacement Contract

**Status:** Normative presentation-replacement contract. This document defines boundaries and delivery gates; it does not authorize changes to business rules or capability foundations.  
**Product authority:** [Admin Functional Specification](ADMIN_FUNCTIONAL_SPECIFICATION.md)  
**Delivery authority:** [Admin Implementation Plan](ADMIN_IMPLEMENTATION_PLAN.md)  
**Presentation authority:** [UI/UX Shell Foundation](UI_UX_SHELL_FOUNDATION_CONTRACT.md)  
**Form authority:** [Form Architecture and Behaviour](FORM_ARCHITECTURE_AND_BEHAVIOUR_CONTRACT.md)  
**Evidence baseline:** main at 8d7564b93ff9518ef89e17fe5e1133c250c4eb16

## 1. Objective

Replace the complete Admin presentation experience: its workspace shell, internal navigation, all six sections, every Admin-owned form, record lists/details, status and feedback surfaces, and empty/loading/error/blocked states.

This is a complete presentation replacement, not a CSS reskin. The new experience may change the visual design, navigation within Admin, layout, interaction patterns and component hierarchy. It must not change the authoritative application capabilities, business outcomes, records, workflows, persistence, recovery, permissions or platform behaviour underneath it.

The Admin presentation must be independently replaceable at every level:
- Admin workspace shell;
- each of the six sections;
- section-level subviews and coordinators;
- each form and form field group;
- record summaries, rows/cards and detail/history views;
- selectors, confirmations and status components; and
- loading, empty, validation, failure, pending and blocked states.

A change to one presentation unit must not force a change to another unit or to the underlying architecture.

## 2. In scope

1. Admin workspace shell and Admin-local navigation.
2. All six approved sections: Business setup, Vehicle, Driver, Compliance, Finance (including Loan workflows), and Maintenance.
3. All existing Admin create/edit forms and supported payment, prepayment, settlement, correction, renewal and rate-entry forms.
4. Record summaries, lists, histories, detail views, contextual selectors, confirmations, validation and operation feedback.
5. Admin-specific responsive layout, accessibility, keyboard/touch interaction, focus management and scoped styling.
6. Narrow presentation adapters/view models needed to translate authoritative application results into display-ready props.
7. Automated architecture, form-conformance, workflow-parity and cross-platform regression tests.

## 3. Explicit exclusions

- Work/Drive screen and driver workflow redesign. Fuel purchase entry remains in Work and is not moved into Admin.
- Timeline redesign or behaviour changes.
- Performance screen redesign or calculation changes.
- Global application shell, the four primary destinations (Drive, Timeline, Performance, Admin), Settings expansion or unrelated navigation.
- New business capabilities, fields, calculations, accounting policies, workflows, permissions, roles or record lifecycle rules.
- Changes to Room, IndexedDB/Dexie, repositories, feature registration, backup formats, transaction/recovery foundations, native overlay or network policy merely to accommodate the new UI.
- Fleet dispatch, fleet tenancy, multi-driver tenancy or a parallel Work/Shift/trip state machine.

Admin is a presentation/access surface, not a business-data owner.

## 4. Product hierarchy and capability ownership

The Admin Functional Specification remains the product-rule authority. Existing ownership remains:

| Admin area | Authoritative owner | Presentation responsibility |
|---|---|---|
| Business setup | Business Settings | Read/update approved business start date; display related existing allocation information without recalculating it |
| Vehicle | Vehicle | Present vehicle records, approved edits and lifecycle actions |
| Driver | Driver Records and Driver Assignment | Present driver records, assignment history and supported actions; Work owns operational driver state |
| Compliance | Compliance | Present records, renewals, validity, overlap/gap information and existing analysis |
| Finance | Finance and Business Expenses | Present loans, schedules, payments, prepayments, settlement history, platform fees and miscellaneous business expenses through owner services |
| Maintenance | Maintenance | Present visits, expense items, rate history, accruals, reminders and supported correction/history workflows |

The Admin feature remains non-persistent. It must not acquire its own record namespace, repository, calculation engine, ledger or independent business-state lifecycle.

Retain the existing product hierarchy:
- Platform Fees and Miscellaneous Business Expenses are distinct forms under Admin → Finance.
- Traffic Challans remain distinct from ordinary expenses and are presented under Admin → Compliance.
- Fuel purchase entry remains a Work-owned driver workflow.
- Loan state, schedules, payments, prepayments, settlement and calculations remain Finance-owned even though they are accessed through Admin.

Do not combine different record types into a generic expense form or change ownership for presentation convenience.

## 5. Required presentation architecture

### 5.1 Replaceable Admin shell

The shell owns Admin-local navigation, section composition, responsive layout, shared Admin feedback regions and presentation-level transitions only. It receives typed section contributions, display data and callbacks through explicit contracts.

The shell must not contain section business logic or import feature-private application services, repositories, storage adapters, native plugins or domain calculations. Replacing it must not require changing feature registration, capability contracts, application services or persistence.

### 5.2 Independently replaceable sections

Each section is an independent presentation unit with:
- stable section identity;
- narrow typed inputs/display models;
- explicit callbacks for supported actions;
- its own ready, loading, empty, unavailable and error states;
- section-local layout and styling; and
- no dependency on another section's private components or state.

Cross-section coordination (for example, selecting a vehicle before showing its Finance records) belongs in a small Admin presentation adapter/coordinator with explicit inputs and outputs, not in a global service container or catch-all section component.

### 5.3 Independently replaceable leaf components

Forms, fields, record rows/cards, history views, detail panels, selectors, confirmations, status indicators and state surfaces must have narrow contracts and be independently replaceable.

A leaf receives prepared display values and event callbacks. It does not fetch or mutate business data, decide business eligibility, validate business acceptance, calculate financial/compliance outcomes, or reach into parent/sibling internals. It must not know about Room, Dexie, IndexedDB, repositories, native plugins, network clients or feature-private service implementations.

Do not pass broad AdminPresentationServices, repositories, application contexts or service locators into visual leaf components. Only an outer presentation adapter may depend on the explicitly supplied application boundary. Convert results into narrow display models before passing them to the shell and leaves.

### 5.4 Presentation adapter

An Admin presentation adapter may call explicitly supplied typed application services, coordinate approved queries/commands, map results into view models, own transient presentation state and translate command outcomes into feedback.

It may not duplicate domain rules, silently normalize business data, calculate business outcomes, write storage directly or create its own durable workflow/retry system. UI state is disposable; durable drafts and records remain in existing application/repository mechanisms.

## 6. Forms: shared mechanics, feature-owned meaning

Every Admin form uses the shared Form Architecture and Behaviour Contract and the owning capability's versioned form definition. Do not create a second Admin-only form framework.

Shared mechanics may provide working-copy lifecycle, field-state handling, common rendering primitives, validation feedback capabilities, submission state, accessibility/input conventions, interruption recovery integration and operation feedback.

Each form retains its own stable ID/version, owner, purpose, fields, labels, requiredness, units, validation, date/time semantics, single primary action (Save or Submit), lifecycle transitions, draft/resume/edit policy, post-submission correction/reversal policy and confirmation requirements.

A shared amount field does not make a platform fee, challan, fuel purchase, loan payment or maintenance expense the same business record.

Preserve the applicable shared-form guarantees:
- editable working copy remains separate from the authoritative submitted record;
- drafts use the existing shared working-copy runtime/repository and can be resumed after reload/restart where supported;
- stale revisions and concurrent changes fail safely;
- owning application/domain services remain authoritative for business validation;
- exactly one explicit primary Save or Submit action;
- ambiguous/repeated retries preserve operation identity and are idempotent;
- pending, committed, rejected, failed and uncertain outcomes are distinct;
- no success is shown before durable completion is confirmed;
- correction/reversal/history remains append-only and attributable where required;
- consequential actions receive appropriate confirmation; and
- PWA and Android/WebView use the same application workflow and correct authoritative store.

Do not add draft persistence, retry queues, caches, local ledgers or form-specific storage to presentation components.

## 7. Cross-platform and lifecycle guarantees

- Browser-only PWA business records continue to use the existing IndexedDB/Dexie repository.
- Installed Android continues to use Room as the sole authoritative business store. WebView must use the Room-backed application/native repository boundary and must not create a competing IndexedDB business history.
- Both platforms use the same domain/application contracts and business rules.
- Supported local Admin workflows remain offline-capable according to their owning contracts; presentation must not introduce a network dependency.
- Startup, migration, recovery, blocked and unavailable states are rendered from authoritative lifecycle/capability status. UI must not infer readiness or enable actions prematurely.
- Backup/restore participants, validators, schema compatibility, record identity and recovery semantics remain unchanged.

If a workflow or platform gap is discovered, record it against its owning contract and handle it as a separately scoped capability/reliability change. Do not hide it with a presentation workaround.

## 8. Visual and interaction direction

Design a clear, calm, mobile-first, task-oriented administration workspace for a single-driver business—not a fleet-management console.

Make section destinations and current context immediately understandable. Prioritize common tasks and important record status without hiding history or secondary actions. Use progressive disclosure for detailed schedules/history. Keep long forms manageable on a phone. Make vehicle context explicit wherever it affects Finance or Maintenance. Distinguish saved records, drafts and pending operations. Give warnings and blocked actions a clear reason and safe next step. Avoid dashboard clutter, decorative metrics, redundant cards and unnecessary navigation depth.

Support touch, keyboard, assistive technology, reduced motion, responsive browser layouts and accessible feedback/focus behaviour.

The assistant owns visual refinement and component design choices within this contract and the approved product rules. Do not introduce repeated screen-by-screen visual approval checkpoints. The user retains final acceptance and merge authority.

## 9. Inspected source baseline

This inventory was inspected on main at 8d7564b93ff9518ef89e17fe5e1133c250c4eb16. It is a starting point, not a claim that all workflows are complete.

### Workspace and composition
- packages/features/admin/runtime.ts registers admin.workspace.v1 as a non-persistent presentation contribution.
- apps/web/src/ui/AdminWorkspace.tsx currently composes all six sections, expanded-section state, Finance vehicle selection, loan/schedule loading and Finance record presentation.
- apps/web/src/ui/AdminWorkspace.css contains current Admin/loan presentation styling.
- apps/web/src/ui/admin-services-context.tsx supplies explicit Admin service and identity-record dependencies.
- packages/application/src/admin-presentation-services.ts defines the typed service boundary supplied to Admin.
- PersonIdentityPanel is mounted at workspace level. Preserve existing identity/security responsibilities; do not weaken authentication/authorization policy as part of visual replacement.

### Section and form inventory

| Area | Current source contribution |
|---|---|
| Business setup | apps/web/src/ui/AdminBusinessVehicle.tsx — BusinessSetupSection; BusinessStartDateCostAllocationPanel |
| Vehicle | apps/web/src/ui/AdminBusinessVehicle.tsx — VehicleSection |
| Driver | apps/web/src/ui/AdminOperations.tsx — DriverSection |
| Compliance | apps/web/src/ui/AdminOperations.tsx — ComplianceSection; apps/web/src/ui/AdminComplianceOverview.tsx; apps/web/src/ui/BusinessExpenseAdminForms.tsx — TrafficChallanSection |
| Finance | AdminWorkspace.tsx — vehicle/loan/schedule composition; LoanDetailsForm.tsx; LoanPaymentsPanel.tsx; BusinessExpenseAdminForms.tsx — PlatformFeeSection and MiscBusinessExpenseSection |
| Maintenance | AdminOperations.tsx re-exports MaintenanceSection; implementation in AdminMaintenance.tsx; MaintenanceExpenseCorrection.tsx |

Shared support includes packages/application/src/admin-form-definitions.ts, shared-form-runtime.ts, form-submission-port.ts, record-form-working-copy-repository.ts, useLoanFormDrafts.ts, explicit service composition, section-specific tests, browser acceptance scripts and Android/Room instrumentation.

This file inventory may change when presentation files are split into independently replaceable components. It does not authorize moving domain/application/persistence ownership into the UI tree.

## 10. Ordered implementation stages

### Stage 0 — source/test inventory and contract reconciliation
Recheck the target branch/head, Admin routes, feature registration, every presentation file, every form definition, application service inputs, tests and browser/Android acceptance paths. Reconcile this contract against the Admin Functional Specification, Admin Implementation Plan, Form Architecture, UI/UX Shell Foundation and all relevant capability-owner contracts. Build a workflow parity matrix mapping each current action to its owning service, persistence/backup/recovery owner and tests.

**Exit:** complete inventory, explicit ownership map, parity matrix and no unresolved product-scope ambiguity.

### Stage 1 — presentation contracts and shell
Define narrow typed shell, navigation, section, display-model and callback contracts. Implement a replaceable shell/section host while retaining current registrations and application service composition. Add architecture tests proving shell/leaf components cannot reach application internals, repositories, platform APIs or feature-private implementations. Preserve the global four-destination navigation.

**Exit:** shell is replaceable independently and existing sections still mount without business/persistence changes.

### Stage 2 — migrate sections independently
Migrate Business setup, Vehicle, Driver, Compliance, Finance and Maintenance one at a time. Extract adapters from visual components; use narrow view models/callbacks; split leaf components where justified; preserve every existing field, action, status, history and access rule; test each section independently and integrated against the parity matrix.

Do not funnel all sections through one giant component or universal Admin data service.

**Exit:** every section passes independent and integrated parity checks.

### Stage 3 — migrate every Admin form
Inventory every registered definition and rendered create/edit/correction form. Move each presentation to shared form mechanics and narrow form/field contracts. Verify draft persistence/resume, validation, one primary action, stale-revision handling, idempotent retry, durable feedback and owner-service dispatch. Keep distinct business definitions distinct.

**Exit:** every rendered/registered Admin form is in automated conformance tests; no form writes directly to persistence.

### Stage 4 — retire old presentation
Only after parity, remove superseded shell/section components, duplicate layout code, obsolete CSS and unused presentation adapters. Retain shared form/application code still used elsewhere. Verify there is one active Admin path and no hidden legacy route or alternate mount.

**Exit:** old presentation is retired without removing shared foundations.

### Stage 5 — integrated acceptance
Required CI covers architecture boundaries, all web tests/build, browser-driven acceptance of every section/form, offline/reload/draft/retry paths, Android build and Room-backed WebView/bridge acceptance, relevant Android instrumentation, backup/restore/failure recovery, PWA/Android business-result parity and integrated regression.

Physical-device testing remains a separate final owner acceptance gate. Green CI is not physical-device acceptance.

**Exit:** required checks green on exact PR head with no unresolved data-integrity, authorization, parity or presentation-boundary failures.

## 11. Minimum test matrix

1. Shell can be replaced without changing section owners, application services, feature registration or persisted records.
2. One section can be replaced/reordered without changing another section's behaviour.
3. A leaf form/field/row/history/state component can be replaced without importing business logic.
4. Presentation cannot import/call Room, Dexie, IndexedDB, repositories, storage adapters or native plugins.
5. Shell/leaf components cannot import feature domain/application implementations or calculate business outcomes.
6. Services are supplied at the composition boundary; no global service lookup or broad service container reaches leaf components.
7. Every Admin form is included in conformance tests, including negative fixtures for missing/dual actions, undeclared fields, direct persistence and application-boundary bypass.
8. Draft close/reload/restart recovery resumes the same working copy where supported and does not create a submitted record.
9. Duplicate/ambiguous retries create at most one business operation; operation-ID payload reuse is rejected as defined by the owner.
10. Stale revisions fail safely without overwriting newer records.
11. Business calculations, eligibility, validation, histories and action results match owner services.
12. PWA and Android have equivalent business outcomes while using their correct authoritative stores.
13. Existing Admin/Driver identity, PIN/role, actor attribution and correction permissions remain enforced by authoritative services.
14. Offline and blocked lifecycle states remain safe; no premature action enablement.
15. Backup/restore round-trips capability records and histories through existing validators.
16. Keyboard, focus, touch, screen-reader feedback and mobile viewport behaviour remain accessible.

## 12. Scope-change and delivery discipline

If implementation finds a missing business rule, incomplete owner service, data-integrity issue or platform gap, stop that workflow migration, identify the owner contract, record evidence, propose a separately scoped owner-layer change, and resume presentation work only when the existing operation can be called safely.

Do not solve owner-layer problems with UI business rules, fallback writes, duplicate calculations, hidden caches or alternate workflows.

This contract PR is documentation-only. Runtime replacement follows only after Stage 0 is reconciled. Each runtime PR must state sections/forms changed, owner services used, data/persistence impact (expected none for presentation-only work), tests, CI evidence and remaining gates. Keep PRs draft/open until acceptance is green. Do not merge without explicit user authorization. Admin is not complete until all six sections, all in-scope forms, cross-platform workflows and required reliability/backup/restore acceptance meet the completion definition.
