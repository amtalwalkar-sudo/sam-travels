# Shared Form Conformance Audit

**Status:** Partial — shared mechanics and record-backed working-copy adapter implemented; Maintenance and all current Loan web forms migrated and CI-verified; Work/Trip migrations and recovery acceptance remain open  
**Authority:** `FORM_ARCHITECTURE_AND_BEHAVIOUR_CONTRACT.md`  
**Scope audited:** Current Admin web forms, Work/Trip workflow, application-service boundary and Android overlay  
**Explicit exclusions:** Performance remains a product placeholder. Physical-device form acceptance is deferred.

## Implemented foundation (not yet full conformance)

- `packages/application/src/shared-form-runtime.ts` defines versioned form definitions, declared field validation, working-copy lifecycle, explicit Save versus Submit, revision-conflict protection, and stable operation identity.
- `packages/application/src/form-submission-port.ts` carries form ID/version, operation ID, action and values across the application boundary.
- `packages/application/src/record-form-working-copy-repository.ts` stores recoverable copies through the authoritative atomic record repository. This makes the same envelope usable by the browser IndexedDB and Android Room record adapters and the existing generic-record backup participant.
- The working-copy repository and runtime now expose definition-scoped discovery of in-progress drafts, so a presentation can offer a real resume path after a reload rather than requiring the original in-memory instance ID. Completed and unrelated forms are excluded from the resumable-draft list.
- Tests cover validation, explicit zero values, strict dates, restored working copies, definition-scoped draft discovery, Save/Submit distinction, stale revisions, and record-backed storage.
- Business Setup, Vehicle, Driver, and Compliance are the migrated Admin UI consumers. Business Setup uses `admin.business-setup` v1; Vehicle uses `admin.vehicle` v1; Driver uses `admin.driver` v1; Compliance uses `admin.compliance` v1. All use the shared runtime and record-backed working-copy repository, and dispatch writes through their existing application-owned services. Vehicle and Driver edit commands carry the working-copy instance identity and record revision captured when editing began. Compliance creation retains immutable renewal linkage and delegates validation and persistence to ComplianceService. Driver assignment history and Work selection remain owned by their existing services. Loan details uses `admin.loan-details` v1 through the shared runtime, with create/edit, durable draft resume, revision-aware updates and dispatch through `FinanceLoanService`; historical loan dates remain valid. Loan payment, prepayment and settlement now use `admin.loan-payment`, `admin.loan-prepayment` and `admin.loan-settlement` v1 through the shared runtime and record-backed drafts. Their presentation delegates to `FinanceLoanPaymentService`, `FinanceLoanPrepaymentService` and `FinanceLoanSettlementService`; the Android overlay does not yet render or submit Work/Trip financial forms.

## Existing aligned boundaries

- Admin forms submit through owning application capability services rather than writing directly to Room, IndexedDB, or feature tables.
- Admin service dependencies are supplied explicitly from the single application composition root.
- Feature-owned application services remain authoritative for business validation and durable writes.

## Remaining gaps

All current Admin web forms in the audited scope now declare versioned definitions and use the shared runtime. `AdminBusinessVehicle.tsx`, `AdminOperations.tsx`, `AdminMaintenance.tsx`, `LoanDetailsForm.tsx` and `LoanPaymentsPanel.tsx` dispatch through their existing application-owned services. Loan transaction draft lifecycle and resume behavior are extracted into `useLoanFormDrafts.ts`. Full Work/Trip financial form parity and recovery acceptance remain open.

Maintenance is now migrated in `apps/web/src/ui/AdminMaintenance.tsx`: visit, general expense and Admin-entered per-kilometre rate forms use the canonical versioned definitions, `SharedFormRuntime`, record-backed working copies, and definition-scoped draft discovery/resume. Draft updates are serialized and Save waits for queued writes; close retains the draft. Existing `MaintenanceService` remains the persistence and business-rule owner. The UI explicitly distinguishes manually entered rate history from actual recorded maintenance expenses. CI run #1520 passed on PR head `ebc00a871e394b826a5aa9934ee6512f1c328666` (architecture, web, Android and integrated regression jobs all successful). Maintenance is therefore implemented and CI-verified; this does not replace any future physical-device acceptance or final full regression.

Loan details is now migrated in `apps/web/src/ui/LoanDetailsForm.tsx` and integrated through `apps/web/src/ui/AdminWorkspace.tsx`. The canonical `admin.loan-details` v1 definition validates the declared fields, accepts historical dates, and dispatches create/update through `FinanceLoanService`. The presentation supports create/edit, definition-scoped draft discovery and resume, serialized working-copy updates, and revision-aware edit saves. FinanceLoanService remains authoritative for vehicle association, stale revision rejection, schedule versioning and calculation-input rules. CI run #1532 passed on exact PR head `d8f68178d2c147930410abf4489f671d9d8c80a8`; web regression/build, architecture checks, and Android Room/workflow/backup reliability gate all passed. The merged-main APK publication step was skipped. This verifies the Loan details slice only; it does not certify payment/prepayment/settlement, Work/Trip, physical-device acceptance or final full regression.

Loan payment and closeout forms are now migrated in `apps/web/src/ui/LoanPaymentsPanel.tsx`, with shared draft lifecycle in `apps/web/src/ui/useLoanFormDrafts.ts`. Payment Save dispatches with stable operation identity to FinanceLoanPaymentService; oldest-due-first suggestions, editable allocations, schedule version selection, references/notes and unallocated-credit separation remain intact. The existing reason-and-confirmation reversal action remains delegated directly to FinanceLoanPaymentService. Prepayment uses a recoverable draft, non-committing FinanceLoanPrepaymentService preview and explicit shared-runtime submit; the canonical definition requires the service preview before confirmation, and commit revalidates the preview against current loan, ledger and prepayment revisions. Settlement uses a recoverable draft, non-committing settlement preview, explicit confirmation dialog and shared-runtime submit; FinanceLoanSettlementService revalidates the preview and atomically records settlement plus Loan closure. CI run #1547 passed on exact PR head `f66097f3908c85777595f7e88f9b5bed9ebce729`: architecture, web (77 files / 419 tests and production build), Android build and Room/workflow/backup reliability gate, and integrated regression gate all passed. The merged-main APK publication step was skipped. This verifies the Loan web form slice only; Work/Trip, physical-device acceptance and final full regression remain open.

Work/Trip financial forms are also absent from the current Work screen and native overlay. The approved driver workflow requires:
- Fare after End Ride; Fare ₹0 is valid, while missing Fare blocks financial finalization.
- Optional Toll and Parking, each with an independent Driver/Customer payer when an amount is entered.
- Mandatory cancellation fee after Cancel Ride; ₹0 is valid and the fee must be saved before another trip or going Offline.
- Durable pending form state linked to the original trip and shared by PWA and overlay.

## Required completion work

1. Add canonical versioned definitions for every in-scope Admin and Work/Trip form.
2. Provide composition-root wiring for the shared runtime and record-backed working-copy repository on browser and native JS surfaces.
3. Loan details, payment, prepayment and settlement web forms are migrated and CI-verified; preserve their approved Finance service ownership and business behaviour in future changes.
4. Implement the Work/Trip financial application use cases and shared durable pending obligations before adding form presentation; do not invent a second financial authority in the overlay.
5. Render the same Fare, Toll/Parking and cancellation-fee definitions in PWA and native overlay, with Kotlin/TypeScript parity tests and authoritative idempotent commits.
6. Add one-action confirmation, truthful pending/success/failure feedback, accessibility and interruption recovery to the shared adapters.
7. Add cross-surface tests for draft resume, process death, duplicate submission, stale revisions, commit feedback, and backup/restore of in-progress copies.

## Completion rule

Do not mark the shared-form gap closed until every in-scope implemented form has a versioned definition and uses the shared runtime, Work/Trip forms work on both surfaces, and the required automated conformance tests pass. A passing build or the presence of the runtime/port alone is insufficient.
