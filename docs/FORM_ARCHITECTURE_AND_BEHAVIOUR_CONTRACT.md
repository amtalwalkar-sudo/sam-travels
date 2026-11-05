# Form Architecture and Behaviour Contract

Status: approved form rules and recommendations documented; runtime implementation and acceptance are separate work.
Scope: the shared form foundation for all current and future Sam Travels workflows across the PWA and native Android presentation surfaces.
Authority: this contract defines form architecture and common behaviour. It supplements the shared-foundation, feature-module, persistence, transaction/recovery, security/compatibility, and UI/UX contracts. It does not replace feature-owned business rules.

## 1. Governing principles

- Every form uses one shared underlying form architecture. Forms may have different layouts, field arrangements, sections, and presentation according to their purpose.
- The shared form framework owns reusable mechanics: field rendering primitives, form state handling, validation capabilities, action confirmation, operation feedback, interruption recovery integration, and accessibility/input conventions.
- Each form owns its business meaning and declares its applicable fields, validation rules, requiredness, date/time behaviour, primary action, lifecycle stages, and post-action edit/delete policy.
- Forms collect and present information. They must not create feature-local persistence, recovery, transaction, synchronization, or business-rule systems.
- Domain/application services remain authoritative for business rules, calculations, validation that affects business acceptance, persistence, and state transitions. UI validation is helpful feedback, not a replacement for authoritative validation.
- Shared components and contracts must be extensible. Adding a form or changing its presentation must not break existing forms, saved data, business logic, or integrations.
- All persistent form data participates in the shared persistence, migration, backup/restore, recovery, diagnostics, and architecture-enforcement foundations as applicable.

## 2. Form definition and configuration

Each form must declare, through a versioned form definition or equivalent contract:
- Stable form identifier and definition/schema version.
- Owning feature and the business purpose of the form.
- Fields, field types, labels, and any help text.
- Which fields are required and which are optional.
- Applicable validation rules and whether a rule warns or blocks.
- Whether date and/or time fields are present, their defaults, and permitted ranges.
- Exactly one primary completion action: **Save** or **Submit**.
- Applicable lifecycle stages and valid transitions.
- Whether drafts/in-progress work can be edited, and the post-submission editing policy.
- Whether manual deletion is allowed, and its safeguards.
- Layout/presentation configuration without embedding business rules in the UI.

A form must not inherit arbitrary business constraints merely because another form uses the same field type or component.

## 3. Shared form architecture and flexible presentation

- Current and future forms use the same underlying form framework and shared contracts.
- Form layouts are purpose-specific. They may use reusable sections, collapsible groups, different field arrangements, and concise or expanded layouts.
- Long forms should be navigable and should not force unnecessary scrolling or expose every optional section at once.
- Presentation is decoupled from form state, business rules, validation policy, and persistence.
- The same form definition and business behaviour must be usable from supported PWA and native Android surfaces. Surface-specific presentation may differ where appropriate, but must not change business meaning or validation.
- Layouts and controls must adapt to supported phone sizes and orientations without losing entered values.

## 4. Lifecycle and status visibility

The shared lifecycle vocabulary is:
- **New:** the form has been opened and no explicit Save/Submit operation has completed.
- **In progress:** the driver has entered information; the working copy is retained but has not been explicitly saved or submitted.
- **Draft / Saved:** an explicit Save action completed successfully, where that form uses Save.
- **Submitted:** an explicit Submit action completed successfully, where that form uses Submit.
- **Finalized:** the form's business process reached its defined final state.

A form uses only the stages relevant to its purpose. Not every form must implement every stage. A form definition must specify valid transitions and the meaning of completion.

- The UI must clearly distinguish in-progress, saved/draft, submitted, finalized, pending, and failed states where applicable.
- Retaining an in-progress working copy is not the same as an explicit Save, Submit, or business-record finalization.
- Closing a screen, navigating away, or reopening the app must never by itself imply that a form was submitted or finalized.
- A success state must only be shown after the authoritative operation has durably succeeded.

## 5. One primary action: Save or Submit

- Each form has exactly one primary completion action: **Save** or **Submit**, selected according to that form's business purpose.
- A form must not present Save and Submit together as competing actions.
- **Save** explicitly stores the form as a draft and does not submit or finalize the business operation.
- **Submit** explicitly performs the form's intended business submission. It must not be represented as a draft save.
- The selected action, its meaning, and resulting lifecycle state must be clear before the driver confirms it.
- Each action requires one clear confirmation. Do not stack duplicate confirmation prompts for the same operation.
- After a successful operation, show a clear confirmation such as **✅ Saved successfully** or **✅ Submitted successfully**, matching the action.
- Never show success before the authoritative durable commit is confirmed.
- If an operation fails or remains pending, show the truthful state and retain the entered information for retry/recovery. Do not imply success.

## 6. In-progress preservation, drafts, and editing

- If the driver leaves a partially completed form, the entered information must remain available when that same form is reopened.
- In-progress preservation is a recovery/working-copy capability, not an implicit explicit Save action. It must not show a Saved-success message or create a submitted/finalized business record.
- The form must restore the correct working copy for the correct form instance/business record. It must not mix values between different forms, records, or drivers.
- Retained working copies must survive supported interruptions, including navigation, app backgrounding, process termination, app restart, and recovery, subject to the shared persistence/recovery contract. Never silently discard entered information.
- Forms that support explicit Save allow a saved draft to be reopened and edited repeatedly before its applicable completion transition. Saving an existing draft updates that draft rather than creating duplicates.
- A form's definition must distinguish the retained in-progress working copy from an explicitly saved draft.
- If a form can be opened from more than one surface, both surfaces must resolve to the same authoritative form instance and revision.

## 7. Submitted and finalized record policy

- Default policy: a successfully submitted form becomes read-only.
- A form may allow post-submission editing only when its business purpose explicitly requires it. This exception must be declared in its form definition.
- Where a submitted/finalized record can be corrected, preserve the original values and an auditable correction history. Never silently overwrite the original record.
- Corrections must follow the owning feature's historical-correction, transaction, and recovery rules.
- Finalization conditions are form-specific. A form must not become finalized merely because it was submitted unless its declared business process defines those states as equivalent.

## 8. Required fields and validation

- Requiredness is form-specific. Some forms have mandatory fields; others may have no mandatory fields.
- Each form clearly marks required fields where applicable and explains missing or invalid information at the point it can be corrected.
- The shared architecture provides reusable validation capabilities for common field types, including dates, times, numbers, amounts, text, phone numbers, and selections.
- Each form chooses which capabilities and rules apply to each field, including permitted ranges, precision, formatting, and whether a violation warns or blocks.
- Business-specific validation remains owned by the relevant domain/application feature. Shared field validation must not impose the same rules on every form.
- A warning is appropriate for unusual but potentially legitimate values. A blocking error is reserved for values that violate an actual form/business invariant.
- Validation messages must identify the field and explain what needs correction. Do not erase or silently rewrite a value when validation fails.
- Authoritative validation must be repeated at the business/application boundary when the form action is executed; client-side checks alone are not sufficient.

## 9. Date and time behaviour

- A form may have a date field, a time field, both, or neither.
- Date/time presence, defaults, permitted ranges, timezone interpretation, and historical-date policy are defined by the individual form and its business rules.
- The shared framework provides consistent date/time input capabilities but must not impose a universal default date or universal date restriction.
- Persist actual instants and required local/timezone context according to the shared time contract. Do not alter historical event times to fit a display date or operational period.

## 10. Field input, fat-finger protection, and illogical-entry safeguards

- Use an appropriate keyboard and input mode for each field type, including numeric/decimal keyboards where suitable.
- Apply sensible field-length limits based on the field's declared business meaning.
- Format values clearly for entry and review without changing their stored meaning.
- Detect likely accidental entries where practical, such as an extra zero, implausible odometer progression, or an amount far outside an explicitly defined contextual range.
- For unusual but potentially valid values, show a clear warning, identify the value, and let the driver review and confirm or correct it.
- Block only values that violate a defined business invariant or permitted range. Do not reject a value solely because it is unusual.
- Never silently remove digits, change units, round, clamp, or otherwise rewrite a driver's entry. Any normalization must be an explicit, documented field rule and must be visible to the driver.
- Do not use one global "normal amount" or historical average as an unquestionable limit. Contextual anomaly detection may inform a warning, but must not silently decide that a legitimate entry is invalid.
- Where a form's risk warrants it, show a concise review of important values before its one Submit action. Avoid unnecessary review screens for low-risk forms.
- Prevent accidental double taps and duplicate action execution through the shared idempotent command/action boundary, not merely by disabling a button visually.

## 11. Units, currency, and numeric precision

- Every numeric field must make its meaning and unit clear where ambiguity is possible (for example ₹, km, litres, minutes, quantity, or percentage).
- Currency fields use the currency defined by the owning feature; initial Sam Travels monetary records use INR as defined by the driver workflow contract.
- Each field declares permitted decimal precision, rounding policy, and storage representation. Display formatting must not change the stored value.
- Do not mix values with different units or silently convert them. Any conversion must be explicit, correct, and visible.
- Calculated/read-only values should be distinguishable from driver-entered values. Where a calculation materially affects a business decision, provide a concise explanation of its inputs or calculation basis.

## 12. Keyboard, touch, and accessibility behaviour

- Controls must have clear labels and be usable on mobile touchscreens, with adequate touch targets and spacing to reduce accidental taps.
- Focus order should follow the form's logical reading and entry order.
- The keyboard's Done/Next action must not accidentally trigger Save, Submit, deletion, or another business operation.
- Use the appropriate keyboard for the expected data and preserve entered values when the keyboard opens/closes or focus changes.
- Important state and error information must not rely on colour alone. Use text, icons, or other clear cues as well.
- Support readable text, clear contrast, and assistive-technology labels within the shared UI/UX contract.

## 13. Editing, deletion, and destructive-action safeguards

- Editing and manual deletion are form-specific capabilities. Each form explicitly declares whether they are permitted and under what conditions.
- Drafts/in-progress working copies may be editable according to their form policy. Submitted/finalized records follow Section 7.
- Every destructive or potentially damaging action must explain what will be affected and its consequences before execution.
- Require explicit confirmation for destructive actions. The confirmation must identify the target/impact clearly and must not be a vague generic prompt.
- Protect against accidental repeated deletion or destructive execution. Report success only after the operation succeeds.
- Preserve audit history, recovery checkpoints, and restore safeguards wherever required by the data's business significance and the shared contracts.
- Do not offer deletion where the owning feature requires an immutable/auditable correction or reversal instead.

## 14. Interruption, duplicate, and consistency safeguards

- A form operation must be safe across slow responses, offline conditions, repeated taps, navigation, app backgrounding, process death, WebView recreation, and restart.
- Use stable operation identity/idempotency so retrying the same intended Save/Submit does not create duplicate records or duplicate business effects.
- A pending operation must be distinguishable from a failed operation and from a committed operation.
- If the form's authoritative record changes while an older form instance is open, do not silently overwrite the newer revision. Detect the conflict and use the owning feature's reconciliation policy.
- Failure to update diagnostics, UI animation, or a presentation surface must not undo or misreport an already committed business operation.
- Form state and operation status must reconcile from authoritative persisted state after recovery; screen memory is never the source of truth.

## 15. Versioning, migration, backup, and compatibility

- Form definitions and persisted form data must be versioned where their shape or meaning is persisted.
- Changes to fields, units, validation semantics, lifecycle transitions, or calculations must be reviewed for compatibility and require explicit migrations where stored data interpretation changes.
- Existing in-progress working copies, drafts, submitted records, and finalized records must remain readable and recoverable across supported app upgrades.
- Form-owned persistent data participates in the shared feature registration and complete backup/restore participant model. No form may create a private backup path or bypass shared restore validation/checkpoint/rollback.
- Unknown or unsupported form/data versions must produce a safe, visible needs-attention outcome; never silently discard or reinterpret stored values.

## 16. Shared foundation and enforcement

- Every form inherits the mandatory shared foundation: authoritative persistence, atomic transactions, idempotency, lifecycle recovery, offline policy, versioning/migration, backup/restore, bounded privacy-safe diagnostics, and architecture enforcement.
- Installed Android PWA/WebView and native overlay surfaces use the same Room-backed application/repository boundary. Browser-only PWA uses the corresponding IndexedDB adapter under the same domain/application contract.
- Form-specific behaviour is implemented through feature-owned definitions and business services, not parallel form frameworks or feature-local persistence/recovery systems.
- Architecture and conformance checks must prevent new forms from bypassing the shared form and application boundaries.

## 17. Conformance and scope guard

A form conforms only when:
- It uses the shared form architecture and declares its form-specific policies.
- It exposes only its single declared primary completion action.
- Its lifecycle and status indicators accurately reflect authoritative operation outcomes.
- In-progress data is retained without being misrepresented as an explicit Save or Submit.
- Its required fields, validation, date/time rules, units, precision, and edit/delete policies match its approved business rules.
- It prevents duplicate effects and preserves data through supported interruption/recovery paths.
- Its destructive actions and unusual-value warnings follow this contract.
- Its data remains compatible with shared migration, backup/restore, and audit requirements.
- Units, currency, precision, rounding, keyboard, touch, and accessibility requirements in Sections 11–12 are approved shared requirements.
- Viewport adaptation, keyboard-safe visibility, sequential field navigation, automatic focus policy, forgiving correction, and submission-protection requirements in Section 18 are satisfied.

This contract records approved architecture and product rules only. It does not claim these guarantees are already implemented or runtime-enforced. Runtime changes, schema changes, UI changes, and implementation acceptance require a separate explicit authorization and test plan.


## 18. Viewport, keyboard-aware presentation, focus, and forgiving data entry

### Viewport and scrolling
- Use a fit-first, scroll-when-needed approach. Short forms should fit within the usable viewport where practical; longer forms may scroll vertically.
- Do not force a non-scrolling layout when it would make fields or controls cramped. Avoid unnecessary nested scrolling and unnecessary scrolling in short forms.
- Layouts must adapt to different supported phone sizes, orientations, and changing keyboard heights. Avoid fixed dimensions that cause content to be clipped.
- When the keyboard opens, adapt or reposition the form so the active field, its label, entered value, and relevant help/validation message remain visible.
- No field, error message, or essential action may be obscured behind the keyboard. The primary Save/Submit action must remain logically reachable without overlapping or hiding form content.
- Save or Submit placement is form-specific and must appear where it is most logical for that workflow. It is not required to be universally fixed at the bottom or universally placed after the last field.

### Keyboard and keypad selection
- Select the input method appropriate to each field: numeric, decimal numeric, text, phone, date/time, or another suitable type.
- Numeric entry must use the appropriate whole-number or decimal input mode according to the field's declared precision.
- Do not apply surprising automatic formatting while the driver is typing. Make backspace, clearing, selecting, and replacing digits straightforward.
- A shared custom numeric keypad may be used if native/system keyboards cannot reliably provide the required visibility, consistency, or driver-friendly behaviour. Any custom keypad must support the field's required digits, decimal separator where permitted, backspace, clear, and an explicit Next/Done action. It must preserve the same validation and business semantics across PWA and Android overlay surfaces.
- A custom keypad is an implementation option, not a reason to create a separate form framework or input/business-rule path.

### Automatic focus and keyboard opening
- Automatic focus on the first logical editable field is the default for straightforward data-entry forms. Where appropriate, open the suitable keyboard automatically so the driver can begin entering information without first tapping the field.
- This is especially important for short, task-oriented forms such as Fare and Cancellation Fee entry: when the form opens, focus the amount field and present the appropriate numeric keypad, allowing direct entry followed by the form's explicit Submit action.
- Apply the same direct-entry principle to other forms wherever the next action is unambiguous and immediate data entry is expected.
- Do not automatically open the keyboard when the driver must first read instructions, choose a section, make a prerequisite selection, or when no suitable first field is yet available. In those cases, focus/open the keyboard only after the necessary choice or context is established.
- Automatic focus must never interrupt an active task, obscure essential context, or move focus unexpectedly.

### Sequential field navigation
- Each form declares its logical data-entry order independently of visual layout.
- For multi-field forms, the keyboard's Next/Enter action moves focus to the next eligible editable field in that declared order, without requiring the driver to tap each field.
- Keep the keyboard open when moving between compatible fields. When the next field requires a different input type, switch to the appropriate input method without losing entered values.
- Skip hidden, collapsed, inapplicable, calculated, and read-only fields. Optional fields are included or skipped according to the form's declared entry flow; do not unexpectedly force entry into an unopened optional section.
- The driver may tap any visible editable field to revisit and correct an earlier value. Sequential navigation must not remove manual navigation or correction freedom.
- The final field's Done action dismisses the keyboard or moves to an appropriate review state. It must never trigger Save, Submit, deletion, or another business operation implicitly.
- Enter/Next navigation must work consistently across PWA and Android overlay forms, within the capabilities of each platform's input method.

### Forgiving correction and validation recovery
- Preserve all valid entries when a field fails validation. Never clear the entire form because one field is incorrect.
- Keep the driver at the relevant field or return focus to it in a predictable way; identify the issue and explain how to correct it.
- Tapping an actionable validation message may focus or scroll to the relevant field. Validation must not cause unrelated or repeated unexpected cursor jumps.
- Do not lose the driver's position or entered values when the keyboard opens/closes, focus changes, or validation is displayed.
- Make field values easy to edit, replace, and correct before submission. Never silently alter the driver's entered value.
- Distinguish editable, calculated, read-only, required, and optional fields visually and accessibly. Use clear grouping and collapsible secondary sections where they reduce cognitive load without hiding required information.
- For longer forms, provide a clear sense of progress or section position where useful, without adding unnecessary steps to short forms.

### Submission and interaction safeguards
- Keyboard Next/Enter/Done actions are navigation controls, not implicit business actions. Only the form's explicitly labelled Save or Submit control performs its declared completion action.
- Prevent accidental double submission through the shared idempotent command boundary and show a truthful pending state while saving.
- Do not clear the form or advance the workflow until durable save/submit success is confirmed. On failure, retain entries and make correction or retry straightforward.
- Use adequate touch targets, spacing, readable labels, and logical focus order. Important errors and status must remain understandable without relying on colour alone.
