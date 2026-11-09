# Shared Form Conformance Audit

**Status:** Partial audit; shared form runtime and complete conformance are not yet implemented  
**Authority:** `FORM_ARCHITECTURE_AND_BEHAVIOUR_CONTRACT.md`  
**Scope audited:** Current Admin web forms and their application-service boundary  
**Explicit exclusions:** Performance remains a product placeholder. Physical-device form acceptance is deferred.

## Findings

### What is already aligned

- Admin forms submit through owning application capability services rather than writing directly to Room, IndexedDB, or feature tables.
- Admin service dependencies are now supplied explicitly from the single application composition root; UI components do not call global application-service getters.
- Feature-owned application services remain authoritative for business validation and durable writes.
- The generic `FormSubmissionPort` records a versioned form ID and values as a possible application submission boundary.

### Gaps still present

The following current Admin UI files contain native React/HTML form state and submission handlers but do not declare a versioned form definition:

- `apps/web/src/ui/AdminBusinessVehicle.tsx` — Business Settings and Vehicle forms.
- `apps/web/src/ui/AdminOperations.tsx` — Driver and Compliance forms.
- `apps/web/src/ui/AdminMaintenance.tsx` — Maintenance visit and expense/rate forms.
- `apps/web/src/ui/LoanPaymentsPanel.tsx` — payment, prepayment, and settlement forms.
- `apps/web/src/ui/AdminWorkspace.tsx` — loan details form.

The shared form submission port is currently a generic command type; the audited Admin forms do not submit through it. There is no single shared runtime yet that owns form definitions, common field mechanics, transient form lifecycle, validation presentation, action confirmation, operation feedback, or interruption-safe working-copy integration.

Consequently, the approved form contract's requirements for versioned form definitions, shared presentation/state mechanics, explicit lifecycle policy, in-progress preservation, and cross-surface form parity have not been demonstrated for these forms. The current UI-to-application-service boundary is improved, but it is not equivalent to full shared-form conformance.

## Required completion work

1. Define one canonical, versioned form-definition contract under the presentation/application boundary; do not recreate the removed duplicate schema in the shell contract.
2. Implement shared form state, field/input primitives, validation presentation, one-action confirmation, pending/success/failure feedback, and accessible mobile interaction mechanics.
3. Provide an application-owned working-copy/recovery port so interrupted forms can resume without creating records or implying an explicit Save/Submit.
4. Keep business meaning and authoritative validation in the owning feature/application service. Shared form mechanics must not become a second business-rule authority.
5. Migrate the audited Admin forms incrementally onto the shared runtime without changing their approved business behaviour or persistence contracts.
6. Add contract and integration tests for form versioning, validation, duplicate submission, interrupted working copies, authoritative commit feedback, and recovery.
7. Verify the same definitions and behaviour can be presented by supported PWA and native Android surfaces; physical-device acceptance remains a later manual step.

## Completion rule

Do not mark the shared-form gap closed until the shared runtime exists, every in-scope implemented form has a declared definition and uses it, and the required automated conformance tests pass. A passing build or the presence of `FormSubmissionPort` alone is insufficient.
