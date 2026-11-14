# Work/Drive Mobile Experience and Uncoupled Forms — Implementation Contract

**Status:** Approved implementation contract. The product owner has explicitly authorized implementation of the Work/Drive shell replacement; the current PR is limited to the replaceable presentation shell and its component boundaries.
**Scope:** Driver-facing Work/Drive experience and its forms, for the current single-car/single-driver operating model.
**Platforms:** Browser PWA and the existing Android presentation surfaces, preserving their established shared workflow semantics and platform-specific contracts.
**Authority:** This contract owns the Work/Drive presentation composition, mobile interaction requirements, and the boundaries between presentation and independently owned feature modules. Existing feature/domain/architecture contracts remain authoritative for business meaning, persistence, transactions, recovery, GPS, time, and platform behaviour.

---

## 1. Purpose and intended outcome

Redesign the Work/Drive experience so a driver can understand the current operational state and the next valid action quickly on a phone, with minimal cognitive load and minimal typing.

The experience must be:

- **Driver-centric:** organised around the driver's current work state and next valid task, not around internal data structures.
- **Mobile-first:** designed for narrow phone screens and one-handed reach, rather than a desktop layout compressed to mobile.
- **Simple:** one clear primary action for the current state; secondary information and optional tasks remain visually subordinate.
- **Consistent:** forms share generic presentation and interaction conventions.
- **Safe:** must not encourage form interaction while a vehicle is moving; nonessential interaction should be deferred until the vehicle is safely stopped.
- **Offline-capable and recoverable:** preserve entered work and truthful operation status using the existing persistence and recovery architecture.
- **Architecturally uncoupled:** shared presentation must not create feature-to-feature business dependencies.

The goal is not merely a visual refresh. The UI must make the existing authoritative workflow easier to operate without changing business semantics.

## 2. Scope boundaries and explicit exclusions

### Included

1. Work/Drive screen information hierarchy and state-aware presentation.
2. Mobile layout, touch, keyboard, readability and accessibility behaviour.
3. Reusable generic form presentation primitives and common interaction conventions.
4. Driver-facing forms already belonging to Work/Drive:
   - shift-start odometer;
   - shift-end odometer;
   - 04:00 operational-boundary odometer confirmation;
   - trip completion (Fare, optional Toll and Parking);
   - cancellation fee;
   - Fuel Entry.
5. State-aware visibility and prioritisation of these forms/actions.
6. Offline, interruption, pending, success, failure and retry presentation using existing authoritative mechanisms.
7. PWA and Android presentation parity in business meaning.
8. Automated regression and acceptance coverage for the presentation and its integration boundaries.

### Explicitly excluded

- Admin form redesign or Admin information-architecture changes.
- Performance screen redesign or Performance calculations.
- Changes to fuel, fare, odometer, personal/business distance, maintenance, compliance, finance or other business calculations.
- Changes to transaction, persistence, synchronisation, recovery, backup/restore or GPS/time architecture except where a separately approved owner-contract change is required.
- A new app shell, navigation redesign outside Work/Drive, or unrelated screen redesign.
- Multi-driver, multi-car, fleet dispatch, fleet operations, concurrent driver workflows or vehicle selection during an active shift.
- Automatic trip detection, automatic shift start/end, continuous GPS tracking, or map-based Work screen.
- Physical phone testing as part of the documentation task. Physical-device acceptance remains a later release activity under the applicable platform contract.

Do not expand scope because a reusable component could theoretically be used elsewhere. Admin and other screens can adopt generic components in a separate approved change.

## 3. Contract hierarchy and source-of-truth rules

This contract must be implemented together with, and must not supersede, the existing normative contracts. At minimum:

- `DRIVER_WORKFLOW_CONTRACT.md` owns driver workflow semantics, allowed shift/trip transitions, Fare and cancellation obligations, and 04:00 deferral behaviour.
- `WORK_SHIFT_ODOMETER_AND_DAILY_DISTANCE_CONTRACT.md` owns odometer facts, personal/business distance allocation, daily distance projection and boundary allocation.
- `WORK_DRIVER_TRIP_SNAPSHOT_INTEGRATION_CONTRACT.md` owns immutable driver/vehicle/shift/trip context and operational-date attribution.
- `FORM_ARCHITECTURE_AND_BEHAVIOUR_CONTRACT.md` owns generic form mechanics, form lifecycle, working-copy retention, validation capabilities, primary action conventions, accessibility and interruption behaviour.
- `FUEL_ENTRY_AND_BUSINESS_EXPENSE_CALCULATION_CONTRACT.md` owns Fuel Entry fields, calculations, fuel business semantics and expense attribution.
- `TRANSACTION_AND_RECOVERY_CONTRACT.md` owns durable intent, atomic completion, idempotency, command ordering, outbox and recovery guarantees.
- `APPLICATION_LIFECYCLE_CONTRACT.md` owns startup, resume, background/foreground and lifecycle reconciliation.
- `DRIVER_OVERLAY_CONTRACT.md` owns Android overlay-specific availability, gestures, minimize/restore, bubble and overlay lifecycle behaviour.
- Applicable shared UI/UX, accessibility, GPS/time, security, persistence, migration and backup/restore contracts remain authoritative in their respective domains.

If this document and an owner contract appear to conflict, the owner contract wins for its domain. Do not resolve a conflict by silently changing behaviour. Record the discrepancy, identify the owning contract, and obtain approval for a change to that contract before implementation.

The Work/Drive UX may consume authoritative state and feature-owned actions. It must not become a second business state machine.

## 4. Uncoupled architecture — mandatory constraint

**Keep all feature modules uncoupled.** This is a firm architectural requirement, not a future aspiration.

### 4.1 Ownership boundaries

Each feature owns its own business meaning, validation, calculations, domain/application operations, persisted records, correction policy and tests:

- Odometer/Shift owns shift odometer capture and distance semantics.
- Trip owns trip lifecycle and trip-linked financial obligations.
- Cancellation owns cancellation-fee semantics within the trip workflow.
- Fuel owns fuel purchase records, fuel-specific fields and calculations.
- Transaction/recovery infrastructure owns generic durable execution and recovery guarantees.
- Work/Drive presentation composes the current workflow state and renders the actions supplied by their owners.

The exact existing repository module boundaries and public interfaces must be inspected before implementation. This document does not authorise inventing a new module structure if an equivalent boundary already exists.

### 4.2 Permitted shared capabilities

Shared code may provide generic, business-agnostic capabilities, such as:

- text, numeric and selection input rendering;
- labels, helper text, field grouping and collapsible sections;
- generic validation-message presentation;
- buttons, confirmation presentation and accessibility semantics;
- keyboard/input-mode selection;
- layout, spacing, touch-target and responsive primitives;
- generic loading, pending, success, failure and retry presentation;
- generic draft/working-copy UI integration points;
- generic form lifecycle presentation.

Shared code must not contain feature-specific field definitions, business validation, calculations, feature persistence rules, or cross-feature orchestration.

### 4.3 Prohibited dependencies and coupling

- Fuel must not import, call, or require the Odometer form/module to function.
- Odometer must not import, call, or require Fuel.
- Trip completion must not depend on Fuel, Maintenance, Performance, Compliance or Finance modules.
- Cancellation must not depend on Fuel or unrelated expense modules.
- A generic Form component must not know what a fare, fuel purchase, odometer, cancellation fee or maintenance amount means.
- A form must not write another feature's records or directly invoke another feature's private implementation.
- A feature's failure must not disable an unrelated feature's form or business operation.
- Adding a field to one form must not require changes to unrelated forms.
- Do not create a shared mega-form, shared feature store, cross-feature repository, or common business service that absorbs the responsibilities of the individual features.
- Do not duplicate a feature's business rules in the Work/Drive screen, generic form components, or another feature.
- Do not use UI navigation or shared component state as a hidden communication channel between features.

### 4.4 Allowed coordination

The Work/Drive workflow may present or prioritise an obligation because the authoritative Driver Workflow contract defines that workflow gate. This is workflow orchestration, not permission for feature modules to depend on one another.

Where features must exchange information, use the repository's existing documented public command/query/event or projection boundary. Keep the exchanged contract minimal and versioned where required. The consumer must not reach into another feature's private state or implementation.

Generic persistence, command execution, idempotency and recovery infrastructure may be shared. Feature records and business decisions remain feature-owned. A shared infrastructure service must not merge feature data or decide feature-specific business outcomes.

### 4.5 Isolation acceptance

- Each feature's domain and form tests can run without booting unrelated feature modules.
- A feature can be changed or tested without modifying unrelated feature business logic.
- Shared form primitives have no imports or references to feature-specific domain types.
- Feature-to-feature dependency direction is absent; any necessary coordination is through an approved public boundary.
- A failure in Fuel does not prevent starting/ending a shift or completing a trip, except where an explicit existing owner contract says otherwise. No such new gate may be invented here.
- A failure in Trip does not prevent opening and saving an independent Fuel Entry.
- Generic form tests do not need feature-specific fixtures.

## 5. Work/Drive screen structure and interaction

### 5.1 State-first presentation

The screen must make these items immediately understandable:

1. Current authoritative state (for example Offline, Online, Going to pickup, Ride active, required Fare entry, boundary confirmation pending, or needs attention).
2. The single next valid primary action for that state.
3. The latest confirmed odometer reading, where required by the existing odometer contract.
4. Any mandatory unresolved obligation that affects what action is allowed next.
5. A concise and truthful pending/recovery status, when applicable.

Do not display every available action with equal visual weight. Avoid dense dashboards, excessive cards, decorative statistics, and nonessential information competing with the primary action.

### 5.2 Primary action and secondary actions

- Present one visually dominant primary action appropriate to the current authoritative state.
- Secondary actions remain available only when valid in that state and are visually subordinate.
- Do not offer an action that the authoritative workflow would reject.
- A disabled action, if shown, must explain why it is unavailable.
- Do not imply that tapping, swiping or animating an action has completed the underlying business operation.
- Do not add a new gesture requirement merely for visual novelty. Preserve the established swipe/overlay interaction contracts where those surfaces use them.

### 5.3 Mobile layout

- Use a single-column phone layout for the core Work/Drive task.
- Put the primary action in a predictable, reachable position.
- Use large, clearly labelled controls and adequate spacing to reduce accidental taps.
- Use readable typography, strong contrast and clear state text; colour must not be the only status signal.
- Keep the screen usable on narrow supported phone widths and with system insets/keyboard visible.
- Avoid horizontal scrolling for core tasks.
- Do not require precision gestures for essential actions.
- Preserve the existing navigation model unless a separately approved change is made.

### 5.4 Information restraint

- Show the latest confirmed odometer reading, not an unsaved form value, consistent with the odometer contract.
- Do not add a prominent continuously running shift timer; the Driver Workflow contract says elapsed duration is shown when going Offline and after shift end.
- Do not add a map to Work/Drive.
- Do not add fuel, maintenance or performance calculations to the Work/Drive summary.
- Do not show provisional or pending values as confirmed facts.

### 5.5 Safe-use principle

The design must not encourage drivers to fill forms or navigate the app while driving.

- Make it clear that form entry and nonessential interaction should happen only when the vehicle is safely stopped.
- Avoid workflows that require a sequence of small controls, precision tapping or extended text entry during an active ride.
- Do not place unrelated forms or promotional prompts over an active ride.
- Do not interrupt an active ride with a boundary odometer form.
- Do not claim the app detects vehicle motion or enforces a safe-stop condition unless an existing approved capability actually does so.
- A large button is not permission to interact while moving. Safety messaging and deferral of nonessential tasks take precedence over making every task instantly accessible.

## 6. State-aware workflow presentation

The following describes the intended presentation. The Driver Workflow, Odometer and Trip Snapshot contracts remain authoritative for the underlying transitions and required fields.

| Authoritative state | Primary presentation/action | Required supporting presentation | Must not happen |
|---|---|---|---|
| Offline / no active shift | Start shift | Shift-start odometer form; latest confirmed reading; configured driver context | Show shift active before durable commit |
| Online / no active trip | Create trip, or End shift when valid | Fuel Entry as a separate independent action; current confirmed reading | Automatically create a trip |
| Going to pickup | Start ride | Cancel trip as a valid secondary action | Invent pickup-arrival step/event |
| Ride active | End ride | Clear active-ride state | Offer Offline or End shift |
| Ride ended / Fare outstanding | Complete required trip financial entry | Fare required; optional Toll/Parking sections | Treat trip as financially finalised before successful submission |
| Trip cancelled / cancellation fee outstanding | Complete cancellation-fee entry | Fee required; ₹0 valid | Allow the next Work action or shift end before required fee is saved |
| 04:00 boundary pending during a trip | Continue the current trip workflow | Nonintrusive pending indication only if it does not interrupt the trip | Show odometer modal during active ride or before required cancellation/Fare save |
| 04:00 boundary pending and safe to resolve | Confirm boundary odometer | Existing confirmed reading and personal-km consequence where applicable | Represent rotation as Offline/Online or split a trip |
| Shift-end odometer required | End shift after required reading | End odometer and calculated business km | Commit shift end before valid durable completion |
| Pending/recovering/needs attention | Retry or continue the same valid operation | Specific operation and truthful status/reason | Show false success or discard pending intent |

The workflow must preserve the existing approved rule that:
- an active ride prevents manual Offline/shift end;
- pickup-approach cancellation requires the cancellation-fee entry to be saved before another Work action or shift end;
- End ride creates a required Fare-entry obligation;
- Fare and cancellation fee may explicitly be ₹0;
- the 04:00 boundary does not interrupt a trip, and its odometer confirmation is deferred until the required trip workflow is resolved;
- a Fuel Entry can be opened without an active shift and does not mutate shift/trip state.

Do not invent new obligation ordering if multiple obligations coexist. Follow the authoritative workflow contract and document any unresolved ordering conflict before changing it.

## 7. Shared form experience — presentation only

All Work/Drive forms should feel consistent while remaining independently owned.

### 7.1 Generic form presentation requirements

- Phone-first, single-column layout.
- Large, clear field labels; do not rely on placeholder text as the only label.
- Clear required/optional indicators.
- Numeric/decimal keyboard appropriate to the field.
- Clear units and currency beside values where ambiguity is possible.
- Read-only/calculated values visually distinguished from driver-entered values.
- Inline validation near the field that needs attention.
- Helpful, concise error text that says what must be corrected.
- One clear primary completion action for the form's declared operation.
- No competing primary buttons and no stacked confirmation prompts.
- Optional/secondary fields may be grouped or collapsed where this reduces clutter.
- Preserve values when the keyboard opens/closes, focus changes, or the form is temporarily left.
- Keep the layout usable at supported narrow phone widths and with the keyboard open.
- Important states must be conveyed with text/icons as well as colour.
- Do not silently rewrite, clamp, round or discard driver input.

### 7.2 Form action semantics

Follow the existing Form Architecture and Behaviour Contract:

- Each form declares its owning feature, stable identity/version, fields, requiredness, validation, lifecycle, and one primary completion action.
- A form's primary action may be the domain action (for example Start shift or End shift) or the form's declared Save/Submit operation. Do not display competing Save and Submit actions.
- An automatically retained working copy is not an explicit Save, Submit or finalization.
- Show success only after the authoritative durable operation succeeds.
- Pending, failed and committed states must be distinguishable.
- Client-side validation is helpful feedback; authoritative validation remains at the owning application/domain boundary.
- Submitted records follow the owning feature's immutability/correction rules.
- Generic form components do not decide requiredness, calculations, business acceptance or finalization.

### 7.3 Draft and interruption behaviour

- If the driver partially completes a form and closes it, navigates away, backgrounds the app or returns later, the same form instance's entered values must be available for resumption under the shared form contract.
- Do not show an explicit Saved-success message merely because an in-progress working copy was retained.
- Do not mix working-copy values between different feature forms, records or business-event identities.
- A retry must preserve the original operation identity where it is a retry of the same intended submission.
- Process termination/restart and supported recovery follow the shared Form and Transaction/Recovery contracts.
- Do not create a separate persistence/recovery system inside each form. Use the generic infrastructure while keeping each feature's records and semantics isolated.
- Phone reboot recovery should use existing durable capabilities; do not make a new platform guarantee unless verified against the existing lifecycle contract.

## 8. Form-specific presentation requirements

This section defines only how the already-approved feature forms should be presented. It does not redefine their business rules.

### 8.1 Shift-start odometer

- Present a focused odometer entry with a large numeric input and an explicit unit (km).
- On the first-ever shift, leave the reading blank; do not invent a default or display personal km as zero.
- On later shifts, show the previous confirmed end reading as the prefill/reference according to the odometer contract.
- If the entered value is higher, show the provisional personal-kilometre difference before confirmation.
- A lower-than-previous confirmed reading must follow the existing controlled correction path; do not silently accept it.
- The Start shift action completes only through the authoritative shift-start command and durable commit.

### 8.2 Shift-end odometer

- Present one large numeric odometer input and the last confirmed/start reading as context.
- Show the calculated business-kilometre difference as read-only information.
- Use the End shift action only when the authoritative workflow permits it.
- Do not show shift ended until the durable shift-end operation succeeds.
- Show the elapsed shift duration after the shift ends, in accordance with the Driver Workflow contract.

### 8.3 04:00 boundary odometer confirmation

- Reuse the generic form presentation, but retain the boundary operation's own feature/workflow identity.
- Prefill from the last confirmed odometer reading as specified by the odometer contract.
- Explain an upward adjustment as personal kilometres where calculable.
- Do not present while a ride is active.
- If the boundary occurs during pickup approach, defer until the trip is cancelled and its required cancellation fee is saved.
- If it occurs during a ride, defer until End ride and required Fare submission are complete.
- Keep the Online session continuous; do not present this as manually ending and restarting work.
- Pending boundary work must remain visible/recoverable according to the workflow contract.

### 8.4 Trip completion form

- Present Fare prominently and mark it required.
- An empty Fare is missing; an explicit ₹0 is valid.
- Keep Toll and Parking separate and optional.
- Keep optional Toll/Parking fields in collapsible sections rather than permanently expanding every field.
- If an amount is entered for Toll or Parking, require its own payer choice (Driver or Customer).
- Do not ask for a payer when no amount is entered for that category.
- Preserve the ended trip and its financial-entry obligation if the form is interrupted.
- Submission and financial finalization must follow the Trip and Form owner contracts.

### 8.5 Cancellation-fee form

- Present the cancellation fee as required.
- An explicit ₹0 is valid.
- Do not combine the cancellation fee with Fare.
- Do not add Toll/Parking fields to the cancellation form.
- Preserve the cancellation-fee obligation until successfully submitted.
- Do not permit another Work action or shift end while the required fee remains unsaved, as required by the Driver Workflow contract.

### 8.6 Fuel Entry form

- Fuel Entry is a separate feature form and must be accessible from Work/Drive even when no shift has started.
- Opening or submitting Fuel Entry must not start/end a shift, create a trip, or change trip state.
- Driver-entered purchase values are total amount paid and price per kg; calculate kg as amount paid divided by price per kg. Do not ask the driver to enter calculated kg as a separate required field.
- Full-tank refill is the default. Provide a partial-refill checkbox/choice; partial must not be the default.
- Every fuel purchase remains an expense according to the Fuel contract. Partial refills remain excluded from the applicable cost/km and mileage calculations under that contract.
- Capture entry timestamp and event-scoped GPS snapshot at submission according to the Fuel and GPS contracts.
- Reverse-geocode locality only when connectivity is available; lack of internet must not block entry or submission.
- Preserve a partially completed Fuel form for resumption.
- Do not make Fuel dependent on shift start, odometer form completion, trip completion, Maintenance or Performance.
- Do not add fuel calculations or summaries to the Work/Drive screen beyond what the Fuel contract explicitly requires.

## 9. Offline, pending, failure and recovery presentation

Use the existing Transaction/Recovery and Application Lifecycle contracts. This section does not create new persistence semantics.

- Core driver operations and form entry must not require internet connectivity.
- Clearly distinguish local app/store unavailability from lack of internet.
- Distinguish at least the meanings already represented by the runtime: in progress, safely queued/pending, GPS verification, committed/recorded, failed, and needs attention.
- Never show “saved”, “recorded”, “submitted” or “complete” before the authoritative durable commit.
- If durable intent acceptance fails, say the action was not safely queued/needs attention; do not imply it will recover automatically.
- If an operation is pending, identify the operation and retain its identity and entered values.
- A retry of the same intended operation must reuse its stable identity and be idempotent.
- A failure in one feature's form must not corrupt another feature's form or data.
- After app resume, process restart, WebView recreation or supported service recreation, reconcile authoritative state before enabling state-changing controls.
- Do not invent a destructive discard action for pending work.
- Exact status wording and visual severity remain subject to the open decisions in Section 12, but status meaning and truthfulness are mandatory.

## 10. PWA and Android consistency

- The PWA and Android surfaces must preserve the same business meaning, field requiredness, calculations, validation outcomes, operation identity and authoritative workflow transitions.
- Presentation may adapt to platform conventions; it must not change business semantics.
- The Android overlay's visibility, gestures, minimize/restore, bubble and lifecycle rules remain solely governed by `DRIVER_OVERLAY_CONTRACT.md`.
- Do not use this redesign to change overlay-specific behaviour or create a second overlay contract.
- A presentation failure, WebView recreation or overlay dismissal must not undo an already committed operation or lose a retained working copy.
- Verify browser IndexedDB and Android Room behaviour through existing owner contracts and parity suites; do not create a new data store for the redesign.

## 11. Accessibility and responsive acceptance

- All essential controls have accessible names and logical focus order.
- Touch targets and spacing are adequate for reliable phone use.
- Numeric inputs request the appropriate numeric keyboard.
- Keyboard Next/Done does not accidentally submit or trigger a business action.
- Text remains readable at supported system font scales and narrow viewport sizes.
- Contrast and status cues remain understandable without colour perception.
- Essential actions are available without precision-only gestures.
- Forms remain usable when the keyboard is visible and when optional sections are expanded.
- PWA and Android presentation adapters preserve equivalent accessible action meaning.

## 12. Decisions not yet specified — do not guess

The following presentation details were raised in the earlier UX draft but were not decided in this discussion. They must not be silently invented during implementation:

1. Whether the single configured active Driver should be auto-selected or explicitly selected when entering Work.
2. Exact Fuel action placement/prominence (persistent secondary action versus an action list/menu). Fuel remains accessible without an active shift either way.
3. Exact placement and visual prominence of the pending 04:00 boundary indicator, and its safe-to-resolve priority relative to other non-mandatory actions.
4. Exact contents and dismissal behaviour of the post-shift summary, beyond the already-required elapsed duration and confirmed end reading.
5. Exact labels, icons and severity styling for pending/recovery/needs-attention statuses. Their semantic distinctions and truthful timing are not optional.
6. Whether Cancel trip needs a separate confirmation beyond the existing command/form confirmation. Do not stack duplicate confirmations.
7. Exact ordering if multiple mandatory obligations are simultaneously present. Follow existing owner contracts; if they do not resolve a real conflict, stop and obtain a product decision rather than inventing a rule.

These open decisions do not permit changing existing workflow rules. The implementation may proceed on already-defined behaviour while leaving only the affected presentation detail pending approval.

## 13. Implementation sequence

Implementation should be incremental and preserve feature isolation:

1. **Repository and contract reconciliation**
   - Read this contract and all owner contracts listed in Section 3 before changing code.
   - Inspect the existing Work/Drive screen, form framework, feature modules, command/query boundaries and tests.
   - Identify discrepancies between the current UI and the contracts (including the prohibition on a prominent live shift timer).
   - Record the affected owner contract and resolve contradictions before changing semantics.
2. **Generic mobile presentation primitives**
   - Implement or adapt only generic layout, input, label, validation-display, action and status primitives.
   - Keep them free of feature-specific types and business logic.
   - Reuse existing shared form infrastructure where it already satisfies the contract; do not build a competing framework.
3. **Work/Drive state presentation**
   - Compose the authoritative workflow projection into the state-first screen.
   - Keep one primary action and valid secondary actions.
   - Do not duplicate state transitions or business validation in UI.
4. **Migrate forms independently**
   - Migrate one feature form at a time, preserving its owner boundary.
   - A common visual component may be reused, but feature fields, validation, calculations and submission remain in the feature.
   - Fuel must remain usable independently of shift/trip state.
5. **Recovery and parity verification**
   - Verify retained working copies, offline use, idempotent retries, lifecycle recovery and PWA/Room parity.
   - Do not claim a feature is complete based only on a visual screenshot or component-level test.
6. **Regression and CI**
   - Run focused feature tests, shared form tests, integration/parity tests and the full repository CI.
   - Fix regressions introduced by the work.
   - Report actual test/CI results and any remaining physical-device acceptance separately.

No step authorises a Performance, Admin or unrelated screen redesign.

## 14. Required test and acceptance matrix

### Work/Drive state presentation

- Each authoritative workflow state maps to the correct primary action and only valid secondary actions.
- UI never advances state before authoritative commit.
- Active ride has no Offline or End shift action.
- Pickup cancellation with an unsaved required fee blocks the next Work action/shift end.
- End ride produces a Fare obligation; Fare absence blocks finalization and ₹0 is accepted.
- Boundary prompt is deferred according to the Driver Workflow contract.
- No prominent continuously running shift timer appears.
- No map or automatic trip detection is introduced.

### Generic form behaviour

- One primary completion action; no competing Save/Submit buttons.
- Required/optional fields are clear and errors appear beside the relevant field.
- Numeric fields use appropriate keyboards and units.
- Working copy survives navigation and supported lifecycle interruption.
- Retained working copy is not misreported as explicit Save/Submit.
- Pending, failed and committed outcomes are distinct.
- Duplicate submission/retry does not duplicate business effects.
- Generic form components have no feature-specific imports or business rules.

### Feature-form regressions

- Shift-start first-reading blank behaviour, subsequent prefill, personal-km preview and controlled lower-reading correction remain unchanged.
- Shift-end business-km calculation and validation remain unchanged.
- Trip Fare, Toll, Parking and payer rules remain unchanged.
- Cancellation fee is mandatory, ₹0 valid, and distinct from Fare.
- Fuel is available with no active shift; only approved driver inputs are requested; kg is calculated; full refill is default; partial refill semantics remain unchanged; timestamp/GPS snapshot and offline submission remain correct.
- A Fuel failure does not block shift/trip operations; a Trip failure does not block independent Fuel Entry.

### Uncoupled architecture

- Static dependency/import checks confirm no feature-to-feature private dependency.
- Generic form package has no domain imports from Fuel, Odometer, Trip, Cancellation, Maintenance, Performance or Finance.
- Each feature's form/domain tests run independently of unrelated feature modules.
- Public interfaces used for coordination are documented and minimal.
- No feature-specific persistence/recovery implementation is added to generic form presentation.

### Platform, lifecycle and recovery

- PWA and Android produce equivalent business outcomes and validation.
- IndexedDB and Room remain the authoritative stores for their respective surfaces.
- Navigation, background/foreground, WebView recreation, process restart and supported service recovery preserve the same operation and working-copy identity.
- Offline use does not require network access for core entry.
- Stale state/revision is reconciled before state-changing actions are enabled.
- Backup/restore continues to preserve source facts and working/pending state according to the owner contracts.

### Accessibility and responsive UI

- Narrow phone widths, keyboard-open layout, system font scaling, contrast, touch targets, focus order and accessible labels are verified.
- Essential actions are not gesture-only.
- No form interaction is encouraged while moving; safety guidance is visible at appropriate points.

## 15. Definition of done

The redesign is complete only when:

1. The Work/Drive screen satisfies the state-first, mobile-first and safety requirements.
2. All in-scope driver forms use the common generic presentation conventions without sharing business logic.
3. Feature modules remain uncoupled and independently testable.
4. Existing domain semantics and owner contracts are preserved.
5. Offline, working-copy retention, recovery, idempotency and PWA/Android parity tests pass.
6. Relevant accessibility/responsive checks pass.
7. Full CI is green.
8. Any unresolved presentation decisions are explicitly listed; no unapproved semantic assumptions are hidden in the implementation.
9. Physical-device testing is reported separately and is not falsely claimed complete based on CI/emulator results.

## 16. Change control

This contract is the implementation baseline for the agreed Work/Drive mobile UX and uncoupled forms redesign.

Any proposed change to a business rule, feature ownership boundary, persistence model, workflow transition, recovery guarantee, GPS/time rule, or platform contract must be made in the relevant owner contract and approved before implementation. Update this document only to reference the approved change and keep its presentation scope coherent.

A UI simplification is not permission to remove a required field, bypass a validation rule, combine business records, alter calculations, weaken recovery, or introduce a dependency between features.

**Current task status:** implementation authorized. This contract change and the Work shell replacement are being delivered as an unmerged draft PR; tests and CI results must be reported from actual runs.


## 17. Simplified shell-replacement implementation slice

The product owner has clarified that the immediate implementation is a replacement of the Work/Drive presentation shell, not a form-by-form business workflow rewrite.

- Replace the Work screen's presentation frame and layout through a dedicated, replaceable shell component.
- The shell accepts independently supplied, opaque regions (heading, status, current workflow, and feature extensions). It must not inspect their internal state or import feature/domain/application modules.
- The Work screen adapter maps authoritative workspace projections and existing owner-provided actions into presentation props. It does not create a new workflow engine or duplicate domain validation.
- Existing forms and feature contributions remain owned by their existing modules and continue to function through their current application contracts. This slice does not migrate or rewrite each form's business logic.
- The shell and each region can be replaced independently through typed props/slots. Shell styling is scoped to Work and must not alter Admin, Performance, Timeline, native overlay, or global business behaviour.
- The new presentation must remove the prominent continuously running shift/trip timers from the Work screen, as required by the Driver Workflow contract. Duration calculations and historical reporting remain untouched.
- Keep the fixed four-destination application navigation and the separate Settings control unchanged.
- The native Android overlay remains a separate presentation surface governed by `DRIVER_OVERLAY_CONTRACT.md`; this Work shell change must not alter its implementation.

This clarification narrows the first implementation slice and supersedes the form-by-form migration sequence in Section 13 for this PR only. Later form presentation changes require their own feature-isolated work and must preserve the form owner contracts.
