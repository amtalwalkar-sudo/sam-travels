# Shared Form Conformance Audit

**Status:** Partial — shared mechanics and record-backed working-copy adapter implemented; existing forms and native overlay are not yet migrated or accepted  
**Authority:** `FORM_ARCHITECTURE_AND_BEHAVIOUR_CONTRACT.md`  
**Scope audited:** Current Admin web forms, Work/Trip workflow, application-service boundary and Android overlay  
**Explicit exclusions:** Performance remains a product placeholder. Physical-device form acceptance is deferred.

## Implemented foundation (not yet full conformance)

- `packages/application/src/shared-form-runtime.ts` defines versioned form definitions, declared field validation, working-copy lifecycle, explicit Save versus Submit, revision-conflict protection, and stable operation identity.
- `packages/application/src/form-submission-port.ts` carries form ID/version, operation ID, action and values across the application boundary.
- `packages/application/src/record-form-working-copy-repository.ts` stores recoverable copies through the authoritative atomic record repository. This makes the same envelope usable by the browser IndexedDB and Android Room record adapters and the existing generic-record backup participant.
- Tests cover validation, explicit zero values, strict dates, restored working copies, Save/Submit distinction, stale revisions, and record-backed storage.
- Business Setup and Vehicle are the first migrated Admin UI consumers. Business Setup uses `admin.business-setup` v1; Vehicle uses `admin.vehicle` v1. Both use the shared runtime and record-backed working-copy repository, and dispatch writes through their existing application-owned services. Vehicle edit commands carry the working-copy instance identity and the record revision captured when editing began. The remaining audited Admin forms are not yet migrated; the Android overlay does not yet render or submit driver financial forms.

## Existing aligned boundaries

- Admin forms submit through owning application capability services rather than writing directly to Room, IndexedDB, or feature tables.
- Admin service dependencies are supplied explicitly from the single application composition root.
- Feature-owned application services remain authoritative for business validation and durable writes.

## Remaining gaps

The following current Admin UI files still contain native React/HTML form state and submission handlers and do not declare versioned definitions or use the shared runtime:

- `apps/web/src/ui/AdminBusinessVehicle.tsx` — Business Setup and Vehicle are migrated; no remaining form in this file.
- `apps/web/src/ui/AdminOperations.tsx` — Driver and Compliance forms.
- `apps/web/src/ui/AdminMaintenance.tsx` — Maintenance visit and expense/rate forms.
- `apps/web/src/ui/LoanPaymentsPanel.tsx` — payment, prepayment, and settlement forms.
- `apps/web/src/ui/AdminWorkspace.tsx` — loan details form.

Work/Trip financial forms are also absent from the current Work screen and native overlay. The approved driver workflow requires:
- Fare after End Ride; Fare ₹0 is valid, while missing Fare blocks financial finalization.
- Optional Toll and Parking, each with an independent Driver/Customer payer when an amount is entered.
- Mandatory cancellation fee after Cancel Ride; ₹0 is valid and the fee must be saved before another trip or going Offline.
- Durable pending form state linked to the original trip and shared by PWA and overlay.

## Required completion work

1. Add canonical versioned definitions for every in-scope Admin and Work/Trip form.
2. Provide composition-root wiring for the shared runtime and record-backed working-copy repository on browser and native JS surfaces.
3. Migrate the remaining audited Admin forms incrementally without changing their approved business behaviour or persistence ownership.
4. Implement the Work/Trip financial application use cases and shared durable pending obligations before adding form presentation; do not invent a second financial authority in the overlay.
5. Render the same Fare, Toll/Parking and cancellation-fee definitions in PWA and native overlay, with Kotlin/TypeScript parity tests and authoritative idempotent commits.
6. Add one-action confirmation, truthful pending/success/failure feedback, accessibility and interruption recovery to the shared adapters.
7. Add cross-surface tests for draft resume, process death, duplicate submission, stale revisions, commit feedback, and backup/restore of in-progress copies.

## Completion rule

Do not mark the shared-form gap closed until every in-scope implemented form has a versioned definition and uses the shared runtime, Work/Trip forms work on both surfaces, and the required automated conformance tests pass. A passing build or the presence of the runtime/port alone is insufficient.
