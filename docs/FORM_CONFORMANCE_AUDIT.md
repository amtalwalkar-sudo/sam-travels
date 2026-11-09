# Shared Form Conformance Audit

**Status:** Partial — shared mechanics and record-backed working-copy adapter implemented; Maintenance web forms migrated and CI-verified; Loan and Work/Trip migrations and recovery acceptance remain open  
**Authority:** `FORM_ARCHITECTURE_AND_BEHAVIOUR_CONTRACT.md`  
**Scope audited:** Current Admin web forms, Work/Trip workflow, application-service boundary and Android overlay  
**Explicit exclusions:** Performance remains a product placeholder. Physical-device form acceptance is deferred.

## Implemented foundation (not yet full conformance)

- `packages/application/src/shared-form-runtime.ts` defines versioned form definitions, declared field validation, working-copy lifecycle, explicit Save versus Submit, revision-conflict protection, and stable operation identity.
- `packages/application/src/form-submission-port.ts` carries form ID/version, operation ID, action and values across the application boundary.
- `packages/application/src/record-form-working-copy-repository.ts` stores recoverable copies through the authoritative atomic record repository. This makes the same envelope usable by the browser IndexedDB and Android Room record adapters and the existing generic-record backup participant.
- The working-copy repository and runtime now expose definition-scoped discovery of in-progress drafts, so a presentation can offer a real resume path after a reload rather than requiring the original in-memory instance ID. Completed and unrelated forms are excluded from the resumable-draft list.
- Tests cover validation, explicit zero values, strict dates, restored working copies, definition-scoped draft discovery, Save/Submit distinction, stale revisions, and record-backed storage.
- Business Setup, Vehicle, Driver, and Compliance are the migrated Admin UI consumers. Business Setup uses `admin.business-setup` v1; Vehicle uses `admin.vehicle` v1; Driver uses `admin.driver` v1; Compliance uses `admin.compliance` v1. All use the shared runtime and record-backed working-copy repository, and dispatch writes through their existing application-owned services. Vehicle and Driver edit commands carry the working-copy instance identity and record revision captured when editing began. Compliance creation retains immutable renewal linkage and delegates validation and persistence to ComplianceService. Driver assignment history and Work selection remain owned by their existing services. Loan details and Loan payment/prepayment/settlement forms remain unmigrated; the Android overlay does not yet render or submit driver financial forms.

## Existing aligned boundaries

- Admin forms submit through owning application capability services rather than writing directly to Room, IndexedDB, or feature tables.
- Admin service dependencies are supplied explicitly from the single application composition root.
- Feature-owned application services remain authoritative for business validation and durable writes.

## Remaining gaps

The following current Admin UI files still contain native React/HTML form state and submission handlers and do not declare versioned definitions or use the shared runtime:

- `apps/web/src/ui/AdminBusinessVehicle.tsx` — Business Setup and Vehicle are migrated; no remaining form in this file.
- `apps/web/src/ui/AdminOperations.tsx` — Driver and Compliance forms are migrated.
- `apps/web/src/ui/LoanPaymentsPanel.tsx` — payment, prepayment, and settlement forms.
- `apps/web/src/ui/AdminWorkspace.tsx` — loan details form.

Maintenance is now migrated in `apps/web/src/ui/AdminMaintenance.tsx`: visit, general expense and Admin-entered per-kilometre rate forms use the canonical versioned definitions, `SharedFormRuntime`, record-backed working copies, and definition-scoped draft discovery/resume. Draft updates are serialized and Save waits for queued writes; close retains the draft. Existing `MaintenanceService` remains the persistence and business-rule owner. The UI explicitly distinguishes manually entered rate history from actual recorded maintenance expenses. CI run #1520 passed on PR head `ebc00a871e394b826a5aa9934ee6512f1c328666` (architecture, web, Android and integrated regression jobs all successful). Maintenance is therefore implemented and CI-verified; this does not replace any future physical-device acceptance or final full regression.

Work/Trip financial forms are also absent from the current Work screen and native overlay. The approved driver workflow requires:
- Fare after End Ride; Fare ₹0 is valid, while missing Fare blocks financial finalization.
- Optional Toll and Parking, each with an independent Driver/Customer payer when an amount is entered.
- Mandatory cancellation fee after Cancel Ride; ₹0 is valid and the fee must be saved before another trip or going Offline.
- Durable pending form state linked to the original trip and shared by PWA and overlay.

## Required completion work

1. Add canonical versioned definitions for every in-scope Admin and Work/Trip form.
2. Provide composition-root wiring for the shared runtime and record-backed working-copy repository on browser and native JS surfaces.
3. Migrate Loan details, then payment, prepayment and settlement forms incrementally without changing their approved business behaviour or persistence ownership.
4. Implement the Work/Trip financial application use cases and shared durable pending obligations before adding form presentation; do not invent a second financial authority in the overlay.
5. Render the same Fare, Toll/Parking and cancellation-fee definitions in PWA and native overlay, with Kotlin/TypeScript parity tests and authoritative idempotent commits.
6. Add one-action confirmation, truthful pending/success/failure feedback, accessibility and interruption recovery to the shared adapters.
7. Add cross-surface tests for draft resume, process death, duplicate submission, stale revisions, commit feedback, and backup/restore of in-progress copies.

## Completion rule

Do not mark the shared-form gap closed until every in-scope implemented form has a versioned definition and uses the shared runtime, Work/Trip forms work on both surfaces, and the required automated conformance tests pass. A passing build or the presence of the runtime/port alone is insufficient.
