# Admin Functional Specification

**Status:** Approved and frozen at the product-design level, subject only to explicit owner-approved policy amendments (latest: historical-record immutability, 2026-11-11)  
**Approval date:** 2026-11-07; Compliance policy amendment approved 2026-11-12  
**Implementation status:** Partial web workspace and section UI exist; end-to-end implementation and acceptance are not yet complete. This document authorizes product behaviour but does not itself prove runtime conformance.  
**Scope:** The six Admin sections and their approved product behaviour in Sam Travels

This document is the product-rule authority for the Admin experience. It records decisions approved through product discussion. It supplements, and does not replace, the repository's architecture, feature-module, data, form, persistence, transaction/recovery, security, calculation, and presentation contracts.

A conflict with a technical contract must be resolved by following that contract's authority and updating the appropriate owning documentation through review. This document does not weaken technical guarantees.

## 1. Product scope and explicit driver-scope decision

Admin contains six sections:

1. Business setup
2. Vehicle
3. Driver
4. Compliance
5. Loan
6. Maintenance

The approved Driver section is an explicit product-scope decision under the existing rule in the Feature Module and Extension Contract that driver rosters/assignments require explicit approval. This approval is bounded to the driver records and assignment behaviour specified here.

It does **not** authorize fleet dispatch, fleet tenancy, multi-driver tenancy, or a second/parallel Work/Shift or trip state machine. The existing single-driver Work/Shift workflow and its GPS, trip, persistence, and recovery contracts remain authoritative. Admin driver records and assignment history must integrate through explicit public contracts and must not duplicate or bypass that workflow.

## 2. Navigation and interaction

### Application navigation

- The four bottom-level destinations are exactly **Drive, Timeline, Performance, and Admin**.
- A settings icon is placed in the upper corner and expands when selected. Its future contents are not defined by this specification.
- Do not add a fifth bottom destination for Admin sub-sections.

### Admin navigation

- Admin presents the six sections listed above as an expandable list, not a grid of tiles or cards.
- Only one section is expanded at a time.
- Keep the selected section and its actions easy to identify.
- Vehicle-specific sections must show the selected vehicle prominently and persistently.
- The visual shell, navigation rendering, forms, and presentation remain replaceable under the UI/UX Shell Foundation Contract. This specification does not prescribe a theme or visual design system.

## 3. Vehicle context model

Vehicle is the context anchor for Driver assignment, Compliance, Loan, and Maintenance.

- Admin creates and selects vehicles in Vehicle.
- Before creating or editing a vehicle-specific record, a vehicle must be selected.
- The selected vehicle remains clearly visible throughout vehicle-specific Admin work.
- Switching the selected vehicle changes the context for all vehicle-specific sections.
- A record remains associated with the vehicle to which it was originally saved; switching context must never silently reassign existing records.
- Calculations and summaries are scoped to the relevant vehicle.
- Inactive or sold vehicles retain their records and history. They are not treated as active operating vehicles.
- Business setup is business-wide and does not require a selected vehicle.

A selected vehicle is presentation context, not a substitute for an authoritative vehicle ID in the owning application command and persisted record.

## 4. Business setup

**Approved scope:** one business-wide field only.

| Field | Behaviour |
|---|---|
| Business start date | Editable business-level date |

No business profile, contact details, currency selector, working-day settings, or other business-setup fields are approved in this scope.

Historical records in Finance, Compliance, Maintenance, and other applicable forms may predate the business start date. The business start date must not impose a lower-bound validation rule on historical record dates.

## 5. Vehicle

### Actions

- Add vehicle
- View vehicle details
- Edit vehicle details

### Fields

| Field | Requirement |
|---|---|
| Registration number | Required; identify the vehicle record |
| Make | Vehicle make |
| Model | Vehicle model |
| Vehicle type | For example, car or SUV |
| Fuel type | For example, diesel, petrol, CNG, or electric |
| Year of manufacture | Vehicle manufacture year |
| Ownership | Owned, financed, or leased |

### Rules

- Support multiple vehicle records and one or more active vehicles.
- Prevent duplicate vehicle records for the same vehicle identity; registration number is the primary human-facing identifier.
- Canonical registration identity is uppercase with all whitespace and hyphens removed. Equivalent entered formats resolve to the same vehicle, and the canonical value is stored and used for duplicate detection.
- Retain inactive/sold vehicle records and all associated history.
- Do not duplicate Compliance, Loan, or Maintenance data in the Vehicle record.
- Vehicle-specific records are accessed through the selected-vehicle context.

## 6. Driver

### Actions

- Add driver
- View driver details
- Edit driver details
- Reassign driver to another vehicle
- Retain and inspect assignment history

### Driver fields

| Field | Requirement |
|---|---|
| Driver name | Required |
| Vehicle assignment | Select an existing vehicle; assignment is managed as a relationship |
| Licence number | Driver-owned licence information |
| Licence expiry date | Driver-owned expiry date |
| Mobile number | Driver contact number |

### Assignment rule — approved

**A driver can be assigned to only one vehicle at a time.**

- A driver must not have more than one active vehicle assignment at the same time.
- Admin may reassign a driver to another vehicle.
- Reassignment closes the prior assignment and creates/activates the new assignment; it must not overwrite the historical assignment.
- Retain assignment history, including the relevant vehicle and assignment period.
- Work uses one explicitly selected active Driver at a time. A new trip must capture that Driver and the Driver’s active vehicle assignment as immutable trip-time context.
- Changing the selected Driver or reassigning a Driver later must not rewrite previously recorded trips. A new trip cannot begin without an active selected Driver and a valid active vehicle assignment.
- Reassignment must not alter or delete historical trips, payments, or other records already associated with their original driver/vehicle context.
- Inactive drivers retain their records and assignment history.
- The rule does not imply that a vehicle can have only one driver over its entire lifetime; successive assignments are retained.

Licence details belong to Driver. Compliance may read the driver's licence-expiry information for tracking, but must not create a duplicate licence record or competing source of truth.

## 7. Compliance

### Purpose

Maintain the legal and regulatory requirements applicable to each vehicle. Examples include insurance, road tax, permits, fitness and pollution certificates. The list is not fixed: different vehicles may have different compliance requirements. Admin defines the compliance name when creating a record.

### Actions

- Add compliance
- View compliance details
- Renew compliance
- View renewal history
- Review detected coverage overlaps

### Record fields

| Field | Requirement |
|---|---|
| Compliance name | Admin-defined free text |
| Vehicle | Taken from the selected vehicle context |
| Valid from | Actual start date printed on / applicable to the document |
| Valid to | Actual end date printed on / applicable to the document |
| Total cost | Cost for this compliance record |
| Supporting document | Optional attachment; absence must be visibly indicated |
| Renewal link | Optional link to the preceding compliance record |

Multiple records of the same compliance type may exist for one vehicle. Once saved, a compliance record is immutable. Historical records are retained. Correct an entry mistake only through the traceable, append-only correction process defined by the Forgiving Data Entry and Historical Correction Contract and the Compliance-owned correction policy; never edit or delete a submitted record in place.

### Renewal and validity-date rules

Renewal is a dedicated action that creates a new linked record; it does not overwrite the prior record.

- Carry forward the compliance name and vehicle.
- Link the new record to the prior record.
- Enter the actual validity start and end dates applicable to the new document, its renewal cost, and optional new supporting document.
- Preserve the prior record and its cost/document history unchanged.
- Early renewal is allowed, including when the old record has not yet expired.
- Never shift, backdate, extend, or normalize a document's validity dates merely to avoid an overlap or gap.
- Late renewal does not erase the uncovered historical period. The new record begins on its actual effective date.
- Different compliance types may have different statutory rules. Use the dates and requirements applicable to the particular document/type; do not assume one universal renewal convention.
- Valid-to must not precede valid-from. Both dates are inclusive.

### Coverage gaps and overlaps

Coverage analysis is performed for the same vehicle and compliance name. Different compliance names are analyzed independently.

**Gaps**
- Detect uncovered dates between applicable validity periods and report the exact first and last uncovered dates and inclusive day count.
- A gap remains part of the historical record after a later renewal.
- Never automatically extend a prior document, fill a gap, or imply that uncovered days were legally compliant.
- A gap for one compliance item does not invalidate other compliance items.

**Overlaps**
- Detect intersecting validity periods and report the exact first and last overlapping dates, inclusive day count, and both source record identities.
- Present gaps and overlaps as two separate lists; do not combine them into one issue list.
- A detected overlap is unconfirmed until an explicit review decision is durably recorded.
- Legitimate separate policies/documents may be accepted after explicit confirmation. Confirmation does not alter either document's dates or erase the overlap.
- An overlap review event is append-only and linked to the affected source records. It records the reviewer/actor identity and role, decision, mandatory reason or confirmation rationale, recorded timestamp, stable event ID, and the relevant source record identities/revisions. The review event does not mutate the original compliance records.
- A confirmation applies only to the exact source records and overlap being reviewed. If either source record is subsequently corrected or superseded, the prior review does not automatically authorize the changed overlap; the affected analysis requires review again.
- Rejection or unresolved review leaves the overlap unconfirmed. Do not silently treat it as accepted.
- Backup and restore must preserve and validate review events and their source relationships. Missing or conflicting review references fail closed and require attention; restore must not infer confirmation.

### Daily compliance cost

For an individual compliance record:

**Daily allocation = total record cost in INR paise ÷ number of inclusive validity days.**

- Count both valid-from and valid-to dates.
- Apply a record's allocation only on dates within that record's actual validity period.
- Use exact rational arithmetic internally; do not round daily allocations before aggregation. Round only for display under the shared financial precision rules.
- Preserve a per-date breakdown identifying each source record and its exact allocation.
- Uncovered dates have no allocation for that compliance item. Zero financial cost does not mean the vehicle is legally compliant.
- Before an overlap has an explicit, current confirmation, show the overlap and source allocations separately but withhold the combined total for the affected compliance item/date range.
- After explicit confirmation, include both (or all) distinct source records' actual daily allocations on each overlapping date. Display each source contribution and the resulting combined amount.
- Confirmation is not permission to duplicate a source record: each source record contributes at most once per date.
- A review becoming stale after a source correction invalidates the prior confirmation for the changed overlap until reviewed again.
- Totals remain scoped to the selected vehicle and requested date range. Fleet overview aggregates must retain vehicle and source-record provenance and must not collapse separate vehicles into one compliance calculation.

### Historical corrections and audit history

- Compliance historical corrections use the shared append-only historical-correction foundation through a Compliance-owned target policy and workflow.
- Preserve the original record, original values, actor/source, original timestamps, business-effective dates, correction reason, and correction chain.
- Corrections are new attributable events; they never rewrite submitted history in place.
- Recompute only affected date projections under the approved, versioned calculation rules. Preserve the as-originally-recorded view and the current corrected projection.
- Re-run gap/overlap analysis after a correction. Any overlap confirmation whose source identity/revision no longer matches must be treated as stale and reviewed again.
- Retain original and corrected records, overlap review events, and calculation provenance through backup, restore, and recovery.

### Status and Admin presentation

For each compliance item, show one of:
- Valid
- Expiring soon
- Expired

The operational Expiring soon indicator begins 15 calendar days before the valid-to date (inclusive of the 15th day) and is Admin-only. Expired begins after the valid-to date. This is an operational indicator, not a statutory grace period or a change to document validity.

- No device notifications, push notifications, or reminder delivery are authorized by this specification.
- Missing supporting documents are allowed but must be visibly identified.
- The default Compliance overview is fleet-wide and combines records across vehicles without losing vehicle context.
- Provide a vehicle filter to narrow the overview to one vehicle.
- Show coverage gaps and overlaps in separate lists.
- Show the overlap review state (unreviewed, confirmed, rejected, or stale/needs review) and source records.
- Show daily allocations and their source breakdown; show the combined amount only when the relevant overlap is confirmed.
- Retain the selected vehicle prominently in vehicle-specific views.
- Inactive/sold vehicles retain their compliance history and are not treated as active operating vehicles.

The Admin presentation is a replaceable read/query and command surface. It does not own Compliance records, review-event persistence, calculations, or correction history.
## 8. Loan

### Purpose and ownership

Loan is a vehicle-specific Admin section for viewing and managing the vehicle's loan records. The loan data and calculations must have one Finance-owned domain/application source of truth; the Admin section is a presentation/access point, not a second finance ledger or calculation engine.

### Actions

- Add loan
- View loan details
- View loan history

Saved original loan details are immutable after creation. The Loan details edit action is not permitted; Admin may view the saved details and add the separately approved payment, prepayment, and settlement events. A mistaken driver entry may be corrected only through the owner-approved traceable correction process; no generic Admin edit or delete is allowed.

### Loan fields

| Field | Requirement |
|---|---|
| Loan name | Admin-defined |
| Lender name | Required |
| Loan account number | Optional reference |
| Original principal | Required |
| Annual interest rate | Fixed rate |
| Loan start date | Required |
| Tenure | Required, in months |
| EMI | Automatically calculated |
| First EMI date | Required |

### Approved functionality

- Support multiple loans per vehicle.
- Keep a separate schedule, payment history, prepayment history, and repayment summary for each loan.
- Calculate EMI automatically from original principal, fixed annual interest rate, and tenure.
- Show outstanding principal, EMI schedule, total paid, and repayment summary.
- Support manual EMI payment entries.
- Support prepayments.
- Support loan closure/early settlement.
- Preserve closed loan history.

### EMI payment entry

Capture:
- EMI due date
- Actual payment date
- Scheduled EMI amount
- Actual amount paid
- Status: Paid or Pending
- Optional note

Keep scheduled EMI and actual amount paid as separate values. The actual payment may differ because of rounding or lender adjustment. A payment marked Paid updates the payment history and the outstanding calculation according to the Finance-owned calculation contract.

### Prepayment

A prepayment records an actual additional principal payment. Where permitted by the lender, Admin can choose:
- Reduce remaining tenure; or
- Reduce future EMI.

Show the resulting outstanding principal, revised future schedule, remaining tenure or revised EMI, and estimated interest saved. Preserve the prepayment record and the schedule version/effect needed to explain the change.

### Loan closure / early settlement

Capture:
- Closure date
- Actual final settlement amount
- Optional notes

On closure:
- Mark the loan closed.
- Stop future EMI scheduling.
- Preserve EMI and prepayment history.
- Record the actual final settlement amount.
- Show the final repayment picture, including total paid and estimated interest saved.

### Explicit exclusions and historical rules

- Fixed interest rate only; variable-rate loans are not included.
- Do not add a separate opening/current outstanding-principal field.
- For an existing loan, enter its original loan details and the repayment history that is available. Do not invent missing payment history or assume an unrecorded payment.
- No loan agreement/lender document uploads.
- No processing fees or additional loan charges in this scope.
- Historical loan start dates, EMI due dates, payment dates, prepayments, and closure dates are allowed, including dates before the business start date.
- Preserve closed loans and their history when a vehicle becomes inactive or is sold.

### EMI schedule and rounding — approved

- EMI due dates fall on the **1st day of each calendar month**.
- The first EMI date is the first scheduled due date and must be a calendar month's first day; subsequent scheduled due dates are the 1st of each following month.
- The automatically calculated EMI amount is rounded to the **nearest whole rupee** for the scheduled EMI.
- Keep the unrounded calculation precision available internally. Apply the shared integer-minor-unit money storage and named rounding rules for persisted amounts and other financial calculations; do not use binary floating point as the source of truth.
- Keep the scheduled EMI and actual amount paid as separate values. Actual payments may differ from the rounded scheduled amount.

The Finance-owned [Loan Calculation Contract v1](FINANCE_LOAN_CALCULATION_CONTRACT.md) defines and regression-tests the approved annual-to-monthly conversion and standard monthly reducing-balance convention. Loan runtime implementation must use that exact version; it must not add a competing Admin formula or silently introduce lender-specific daily-interest conventions. Prepayment re-amortization and early-settlement calculations remain separately gated by Finance-owned contracts.

## 9. Maintenance

### Purpose and coverage

Maintain vehicle-related service visits, repairs, and expenses. Maintenance types are admin-defined free text, not a fixed list. Coverage includes regular servicing, repairs, tyres, punctures, batteries, engine/mechanical work, oil/fluids, brakes, electrical work, breakdowns, and other vehicle-related expenses.

### Actions

- Add maintenance record
- View maintenance details
- View maintenance history

### Maintenance visit fields

- Maintenance date
- Admin-defined maintenance type
- Description
- One or more individual expense items and amounts
- Automatically calculated visit total
- Optional odometer reading
- Optional service provider
- Optional next service date
- Optional next service kilometre

A service visit may contain multiple expense items. Example:

| Item | Amount |
|---|---:|
| Engine oil | ₹2,000 |
| Oil filter | ₹500 |
| Labour | ₹800 |
| **Visit total** | **₹3,300** |

Items may be added, removed, or revised while the visit is an unsubmitted working draft. Once the maintenance visit is saved as a historical record, it is immutable. The visit total is the sum of its draft items and is used in actual maintenance expense history.

### General maintenance expenses

Support vehicle expenses that are not tied to a formal service visit, including towing, roadside assistance, emergency repairs, and puncture assistance.

Capture:
- Expense date
- Admin-defined expense name/type
- Description
- Amount
- Optional odometer reading
- Optional service provider

Include these entries in the vehicle's actual maintenance expense history.

### Odometer and service reminders

- Odometer reading is optional and may be entered or revised while the record is an unsubmitted working draft. A saved historical maintenance record is immutable.
- Never invent or estimate a missing odometer reading.
- Support next-service reminders by date, kilometre reading, or both.
- Check kilometre-based reminders when a vehicle odometer reading is updated.
- Retain prior service and reminder history.
- Historical/backdated maintenance entries are allowed.
- Retain maintenance history when a vehicle becomes inactive or is sold.

### Standard daily maintenance expense — approved calculation

Each vehicle has its own editable standard maintenance rate.

- Default rate for each new vehicle: **₹2.50 per kilometre**.
- Admin can edit the rate for an individual vehicle.
- Editing one vehicle's rate must not alter another vehicle's rate.
- Daily kilometres come from the authoritative trip records for that vehicle, grouped using the existing approved business-date rules.

**Daily standard maintenance expense = actual daily kilometres × that vehicle's standard rate.**

Example: 150 km × ₹2.50/km = ₹375 for that vehicle's day.

This is a standard daily accrual, not an estimate derived from historical maintenance bills.

Keep the two measures separate:
1. Actual maintenance expenses entered from bills/service visits/general expense records.
2. Standard daily maintenance expense calculated from daily trip kilometres and the vehicle's configured rate.

Do not silently combine or double-count them. Any future Performance/Finance metric that consumes either measure requires an explicit, versioned integration and calculation approval.

**Rate-change and history policy — approved**

- Admin may change a vehicle's standard maintenance rate at any time.
- A saved rate change applies to new daily per-kilometre calculations from the date the new rate is saved (using the existing Asia/Kolkata business-date rules).
- Previously calculated daily maintenance accrual records remain unchanged when the rate is edited. Do not retrospectively recalculate or rewrite historical accruals because of a rate change.
- New daily calculations use the latest saved rate for that vehicle.
- A rate change for one vehicle never changes another vehicle's rate or accruals.
- Preserve enough rate-change history to explain which rate was used for each daily accrual.

## 10. Shared date, record, and data-integrity rules

- Historical and backdated records are allowed wherever the relevant section permits them, including dates before the business start date.
- Business dates remain distinct from event timestamps; follow the existing Asia/Kolkata business-date and timestamp contracts.
- Preserve stable record identity and vehicle/driver relationships.
- Reassignment, renewal, closure, deactivation, or a presentation change must not erase historical records.
- Corrections must be explicit and auditable where required by the owning data/finance contracts.
- Missing information remains missing; do not fabricate dates, odometer readings, payments, documents, or other source facts.
- Validate at the domain/application boundary, not only in the UI.
- Display known zero, unavailable, pending, not-applicable, and invalid/needs-attention states distinctly.
- Financial values use integer minor units with explicit currency and named, tested rounding rules, as required by the shared data and architecture contracts.
- A calculation has one owner, one versioned formula/units/effective-date contract, explicit missing-input behaviour, and regression fixtures.
- Cross-feature calculations consume public application contracts or approved versioned integrations; never read another feature's private tables.
- Inactive/sold vehicle records remain available for history, backup, migration, and recovery.

## 11. Forms and presentation boundaries

- All forms use the existing [Form Architecture and Behaviour Contract](FORM_ARCHITECTURE_AND_BEHAVIOUR_CONTRACT.md).
- Forms are replaceable presentation adapters. They collect and display data; they do not own business calculations, persistence, recovery, or cross-feature rules.
- Each form declares its owning capability, fields, requiredness, validation, date behaviour, lifecycle, and one primary completion action (Save or Submit).
- Changing or replacing a form must not change stable application wiring, record identity, calculation rules, or persisted history.
- UI and UX can be redesigned independently without changing domain rules or persistence contracts.
- The Admin navigation list and selected-vehicle indicator are presentation concerns; the authoritative vehicle relationship is validated and persisted by the owning capability.

## 12. Architecture and implementation constraints

Implementation must follow the existing five-stage architecture programme and the current normative contracts. This specification does not add a new architecture stage, replace a completed stage, or authorize a rewrite of stable foundations.

- Treat Admin as a product area and navigation grouping; do not automatically turn all six visible sections into one catch-all persistence module.
- Assign each entity, invariant, workflow, calculation, repository, and migration to one explicit owning capability.
- Loan data/calculations are Finance-owned. Vehicle data and vehicle-specific records must use explicit public contracts and ownership boundaries. Driver records/assignment history must have one explicit owner and must not create a parallel Work/Shift lifecycle.
- Use the validated feature-extension registry and versioned public capability entry points.
- Any persistent capability must declare its schema, migrations, dependencies, lifecycle, backup participation, restore validation, and recovery behaviour before persistent writes are enabled.
- Room is the sole authoritative business store on installed Android. IndexedDB is authoritative only in browser-only PWA. Never dual-write the same business operation.
- Use explicit, repeatable-safe migrations; preserve stable IDs, timestamps, revisions, event identity, and idempotency keys.
- All business writes and consequential transitions use the established durable transaction and recovery boundaries.
- New calculations are domain/application-owned, independently tested, versioned when historical outputs depend on their rules, and integrated through approved contracts.
- Extend existing architecture enforcement and CI; do not create a parallel architecture gate.
- Preserve offline operation, backup/restore completeness, checkpoint-before-restore, and recovery guarantees.
- Keep presentation, forms, data, calculations, and platform adapters independently changeable.

## 13. Required review and implementation sequence

This document is a frozen product specification, not a claim that Admin has been implemented.

1. Merge this documentation-only specification PR after review against the existing contracts.
2. Before runtime work, prepare an implementation plan that maps each section's records and workflows to owning capabilities, public contracts, registry entries, migrations, backup/restore participants, and tests.
3. The Finance-owned [Loan Calculation Contract v1](FINANCE_LOAN_CALCULATION_CONTRACT.md) defines and regression-tests the approved annual-to-monthly conversion and reducing-balance convention. Merge that contract before Loan runtime implementation, and keep all Loan formulas in Finance. The monthly 1st due-date cadence and nearest-whole-rupee scheduled EMI rounding are approved here. The vehicle maintenance rate-change effective-date/history policy is also approved here: saved changes apply to new daily calculations from the save date, and previously calculated daily accrual records remain unchanged.
4. Implement in reviewed, independently testable vertical slices. Do not build all screens first and defer data ownership, calculations, or recovery.
5. Keep each implementation PR within its approved slice. No unrelated runtime/UI/schema changes belong in the documentation PR.
6. Do not begin Admin runtime implementation until the documentation PR is merged and a separate implementation plan/slice is approved.

## 14. Normative references

- [Architecture overview](../ARCHITECTURE.md)
- [Architecture Foundation Contract](ARCHITECTURE_FOUNDATION_CONTRACT.md)
- [Feature Module and Extension Contract](FEATURE_MODULE_CONTRACT.md)
- [Form Architecture and Behaviour Contract](FORM_ARCHITECTURE_AND_BEHAVIOUR_CONTRACT.md)
- [Data Contract](../DATA_CONTRACT.md)
- [Local Persistence Contract](LOCAL_PERSISTENCE_CONTRACT.md)
- [Transaction and Recovery Contract](TRANSACTION_AND_RECOVERY_CONTRACT.md)
- [Security and Compatibility Contract](SECURITY_AND_COMPATIBILITY_CONTRACT.md)
- [UI/UX Shell Foundation Contract](UI_UX_SHELL_FOUNDATION_CONTRACT.md)
- [Driver Workflow Contract](DRIVER_WORKFLOW_CONTRACT.md)

If an applicable contract is updated, this specification must be reviewed for compatibility; do not duplicate its technical rules here.


## 15. Owner-approved historical-record immutability amendment — 2026-11-11

The owner has clarified the business rule: submitted historical business records must never be edited or deleted in a way that changes or erases history. At the time of this amendment, the initially approved correction exception covered driver-entered mistakes; Section 16 and the shared correction contract subsequently define the complete Driver/Admin permission boundary. All corrections must preserve the original value and a trace of the correction. This amendment supersedes any contrary “Edit details” action or later-edit wording in this specification:

- **Compliance:** saved coverage records are immutable; renewal creates a new linked record.
- **Loan details:** saved original loan details are immutable; no edit/delete action. Payments, prepayments, and settlements remain separate Finance-owned append-only events under their contracts.
- **Maintenance:** saved visits and expenses are immutable; changes are allowed only in an unsubmitted working draft. Previously exposed saved-record edit service paths have been removed.
- **Driver/Vehicle master profiles:** profile maintenance remains allowed only where it does not rewrite historical snapshots or event records. The Work/Trip contracts freeze driver/vehicle context into historical shifts/trips.
- **Driver-entered Work/Trip financial records:** drafts may change before submission. Submitted Fare/Toll/Parking/Cancellation Fee records are immutable except via a dedicated append-only correction workflow; that workflow is not yet implemented or enabled.
- **No historical delete controls:** no user-facing delete action is permitted for submitted business records. Repository cleanup/removal operations must be purpose-scoped so they cannot remove historical business-event records.

This amendment updates product policy only. Technical implementation and acceptance evidence remain in the owning feature contracts and [Business-Event Reliability Audit](BUSINESS_EVENT_RELIABILITY_AUDIT.md).

## 16. Cross-feature correction policy alignment — 2026-11-11

The [Forgiving Data Entry and Historical Correction Contract](FORGIVING_DATA_ENTRY_AND_HISTORICAL_CORRECTION_CONTRACT.md) now owns the shared policy for correcting mistakes in submitted driver- and admin-entered business records. It supersedes any interpretation of Section 15 that would permanently exclude admin-entered records from a safe correction path.

- The immutability rule remains: no ordinary post-submission edit or delete of historical records.
- A permitted correction is a new append-only, attributable, reasoned event linked to the original; the original remains unchanged and available in history.
- The same shared audit, idempotency, recovery, and calculation-restatement safeguards apply to admin-entered records.
- **Driver permission:** a Driver may correct only submitted records originally entered by that same Driver.
- **Admin permission:** an Admin may correct submitted records originally entered by any Driver or Admin, including the Admin's own entries.
- A Driver may not correct another Driver's or an Admin's entry. An Admin may intervene without the original author submitting the correction.
- Both roles use the same append-only, attributable, reasoned correction model. Neither role may silently overwrite or delete the submitted original.
- This permission applies only to record types whose owning feature contract and implementation support correction; it does not bypass feature-specific financial closure, reversal, allocation, or other safeguards. No blanket Admin approval of ordinary Driver self-corrections is required by this owner decision.
- Until the required permission, actor-attribution, domain-validation, persistence, and acceptance contracts are implemented and verified, submitted records remain immutable and existing correction paths remain disabled or limited to already approved domain-specific behaviour.

This is a product-policy alignment only. It does not authorize Admin runtime changes or alter Finance-owned payment, prepayment, settlement, or reversal semantics.
