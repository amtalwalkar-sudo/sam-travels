# Fuel Entry and Business Expense Calculation Contract

**Version:** 1.1  
**Status:** Owner decisions reconciled with the approved breakeven and upstream source contracts; this amendment is documentation-only and makes no runtime implementation claim.
**Base:** `main` after merged PR #77 (`6f92fe759e753e93e17f86efc11df94a00e0c1e8`).
**Scope:** PR 1 expense-source foundation and Fuel Entry; PR 2 full-cost breakeven. Driver Target remains a later, separately sequenced phase after reliable breakeven.
**Authorities:** `FORM_ARCHITECTURE_AND_BEHAVIOUR_CONTRACT.md`, `LOCATION_AND_STATE_TIMING_CONTRACT.md`, `NETWORK_ACCESS_CONTRACT.md`, `BUSINESS_START_DATE_COST_ALLOCATION_CONTRACT.md`, and the existing architecture, persistence, backup, recovery, and feature-extension contracts.

## 1. Product boundary

The calculation and source-record foundation is the primary deliverable. It must be platform-neutral, versioned, deterministic, replay-safe, auditable, and independent of any Performance-screen presentation.

- **Fuel Entry is the only new driver-facing form/UI change in PR 1.**
- Admin placement is fixed for PR 1: **Admin → Finance** contains separate **Platform Fees** and **Miscellaneous Business Expenses** sections, each with its own dedicated entry form; **Admin → Compliance** contains a separate **Traffic Challans** section with its own dedicated entry form. Do not create a generic combined expense form or add unrelated Admin headers/restructure other Admin areas.
- Fuel Entry is accessed from **Work** (including when no shift is active) and remains available from other app screens; it is not an Admin form.
- All four forms (Fuel Entry and the three Admin expense forms) must conform to `FORM_ARCHITECTURE_AND_BEHAVIOUR_CONTRACT.md` and use the existing PWA shared form architecture/runtime on every supported surface. This includes registered/versioned form definitions; one declared primary Save or Submit action; shared working-copy and lifecycle semantics; field-specific requiredness and warning/blocking validation; authoritative business-boundary validation; interruption/restart recovery; durable persistence; idempotent operations; truthful pending/success/failure states; audit-safe correction; versioning/migration; backup/restore participation; mobile viewport/keyboard/touch/accessibility rules; and applicable PWA/native parity and automated conformance gates. Form-specific business rules remain in domain/application services. Do not introduce feature-local form state, persistence, validation, recovery, transaction, or calculation systems.
- Do not change the Performance screen, its UI/UX shell, navigation, dashboards, or presentation in PR 1 or PR 2. The Performance interface will consume selected calculation outputs in a later, separate presentation task.
- Do not duplicate existing Compliance or EMI allocation logic. Consume the canonical daily outputs from the merged Business Start Date allocation service.
- PR 1 establishes expense source records, calculations, daily cost outputs, and the fuel-entry form.
- PR 2 adds normal/full-cost breakeven and the Admin-configured daily driver target on top of verified daily cost outputs.
- Each PR must preserve browser/Android parity, offline-first behavior, shared form semantics, deterministic calculations, backup/restore, and regression gates.

## 2. Fuel entry form

### 2.1 Access and lifecycle

- A driver can open Fuel Entry from any app screen, regardless of current Work/Shift state. An active shift is not a prerequisite.
- Opening Fuel Entry must not change shift, trip, or driver-workflow state.
- The form uses the existing shared, versioned form architecture. It must not introduce feature-local form state, persistence, validation, or recovery.
- The form has one primary completion action: **Submit**. The action creates one fuel purchase record; it is not a Save-and-Submit pair.
- Every field change updates the form's in-progress working copy through the shared form runtime.
- Closing the form, navigating away, backgrounding the app, or closing the app does not submit or discard the entry. Reopening Fuel Entry must find and resume the correct incomplete working copy without mixing it with another driver or record.
- The approved shared form contract requires retained working copies to survive navigation, backgrounding, process termination, app restart, and supported recovery. Therefore restart recovery is part of conformance, even though the initial product request described it as optional.
- A resumed form retains its original working-copy identity and values. Its final entry timestamp and location evidence are captured for the actual submission event, not retroactively fabricated from the time the draft was first opened.
- Submission is idempotent. A repeated tap/retry with the same operation identity must not create duplicate fuel purchases. An ambiguous failure retains the form values and operation identity for safe retry.
- A successfully submitted purchase is immutable by default. Corrections use the existing auditable correction mechanism; they do not silently overwrite the original source facts.

### 2.2 Entry fields and derived quantity

The intended form data is:

| Field | Meaning | Treatment |
|---|---|---|
| Odometer | Vehicle odometer reading in km at refuelling | Driver-entered; stored as an integer km reading |
| Partial refill | Checkbox indicating this is not a full-tank refill | Driver-selected; unchecked by default, meaning full-tank refill |
| Price per kg | CNG rate in INR/kg | Driver-entered |
| Total amount paid | Actual amount paid in INR | Driver-entered and stored in integer paise |
| CNG quantity | Kilograms dispensed | Calculated by KFE from total amount paid / price per kg; not entered by the driver |

The driver enters only odometer, price per kg, total amount paid, and whether the refill was partial. There is no CNG quantity input field. KFE derives quantity using decimal-safe/integer arithmetic with an explicit precision policy. The derived quantity is clearly marked as calculated and must not silently change the entered amount or rate.

Validation must follow the shared form contract:
- Positive, finite odometer, price/kg, and amount values; valid zero/negative handling is defined explicitly by the feature validator.
- Price/kg must be greater than zero before quantity can be derived.
- Preserve precision and source values; use integer paise for INR and a declared fixed precision for kg.
- Warn on suspicious odometer regression or unusually large changes; block only actual invariants.
- Do not require an active shift, trip, or network connection.
- No date restriction should be inherited from Business Start Date. The authoritative entry instant is captured by the app; any later historical correction follows the correction contract.

### 2.3 Entry timestamp and GPS evidence

- Capture a stable entry timestamp for the successful submission intent, storing the UTC instant and Asia/Kolkata business-date context under the existing time contract.
- Initiate a fresh, event-scoped GPS snapshot from the actual Fuel Entry Submit event; never request it merely because the form was opened. Use a fresh device fix (no cached/last-known position) and preserve coordinates, accuracy, actual fix timestamp, and device provider/source.
- Commit the fuel purchase and its submission timestamp locally without waiting for GPS. GPS acquisition and persistence of its separate evidence record are best-effort asynchronous work and must never hold the form open, delay submission, require internet, or block navigation/another driver action.
- Persist an explicit capture outcome under a stable fuel-scoped enrichment identity: captured, permission denied, timed out, or unavailable. A successful fix stores coordinates, accuracy, actual fix timestamp, and provider; unavailable outcomes store a reason but never fabricated coordinates. These records use the existing durable platform record store and participate in its backup/recovery path.
- If a fix resolves before the fuel source commit completes, mark it as submission-event evidence. If it resolves after the purchase is committed, mark it as late evidence while retaining the actual fix timestamp; never represent a late result as an exact submission-time fix.
- Reverse geocoding remains a separate retryable task derived from the persisted GPS evidence. It cannot roll back or delay the already-committed purchase.
- The GPS snapshot is immutable source evidence once attached. A correction must not silently rewrite it.

### 2.4 Offline and reverse geocoding

- Fuel form opening, field editing, draft persistence, validation, derived quantity, submission, local record reads, and all local calculations work offline.
- Reverse geocoding is the only network-dependent part of this workflow.
- Store GPS coordinates locally first. A durable background enrichment task may later send coordinates to the existing server-side Geoapify proxy when the app's network policy permits and connectivity is available.
- Reverse geocoding must be queued/retried without polling, with bounded retry/backoff, idempotent request identity, and explicit pending/resolved/not-found/unavailable states.
- Persist the resolved locality as enrichment metadata linked to the fuel record. Never replace or mutate the original latitude/longitude, entry timestamp, or GPS fix metadata.
- Failure, timeout, missing proxy configuration, disabled network policy, or geocoder outage must not affect fuel record creation, form completion, navigation, or any driver workflow.
- Do not make a geocoder request from the form's critical submit path.
- Reuse the existing reverse-geocoder adapter/proxy and shared network policy where appropriate, but do not assume the current Timeline enrichment service is a complete persistence solution: its current cache is session-local and its source-event scope is Timeline-specific. Fuel enrichment needs durable fuel-record linkage and recovery on both browser IndexedDB and Android Room.
- No continuous GPS tracking or location polling is introduced.

## 3. CNG full-tank measurement and fuel metrics

### 3.1 Full-tank checkpoints

- Full tank is the default refill classification. The driver checks **Partial refill** only when the tank was not filled completely.
- Every submitted fuel purchase, whether full or partial, is an immutable measurement/source record. Its spend is included in a valid completed full-tank interval as defined below. It is not itself a daily breakeven expense; daily breakeven fuel cost is calculated from confirmed business kilometres multiplied by the effective weighted-average fuel cost/km.
- A full-tank refill is a measurement checkpoint. The first accepted full-tank refill establishes the baseline odometer/tank-full state.
- The next accepted full-tank refill closes a full-to-full measurement interval.
- The distance for an interval is the later full-refill odometer minus the earlier full-refill odometer.
- Do not publish mileage or cost-per-km from a single full-tank checkpoint. Require two valid full-tank checkpoints and a positive odometer delta.
- A partial refill is retained as a valid purchase record but is not itself a full-tank checkpoint and cannot start or close a full-to-full measurement interval.
- Out-of-order, duplicate, regressing, or otherwise invalid checkpoint sequences are flagged for review; do not silently choose a plausible pair.

### 3.2 Interval calculations

For an interval between full-tank checkpoints, the candidate calculation outputs are:
- Mileage: distance travelled (km) / CNG consumed (kg), expressed as km/kg.
- Effective CNG cost per kg for the interval: included CNG spend / included CNG quantity.
- Fuel cost per km: included CNG spend / distance travelled (km).

Use decimal-safe arithmetic, retain calculation version and exact source record IDs/revisions, and define rounding only at the output boundary. Never use GPS endpoint distance as driven distance; use odometer readings.

**Confirmed partial-refill treatment:** Partial refills are excluded as full-tank checkpoints, but every partial refill between two consecutive full-tank checkpoints contributes its derived/recorded kg and actual amount to that full-to-full interval. Include the final full refill that closes the interval. This produces the interval's km/kg, effective cost/kg, and cost/km. Every fuel purchase remains in the immutable fuel source history. For fuel-consumption measurement, purchases after the opening baseline full refill through and including the closing full refill contribute quantity and spend to that interval. The opening baseline refill is not included in the interval it opens. Fuel purchase spend is not added as a second daily breakeven expense; this supersedes the older direct-purchase daily-cost wording in this document.

The phrase “calculate cost per kg after 2 full tank refills” is interpreted here as calculating interval effective cost/kg after the second full-tank checkpoint; the purchase-level price/kg remains available on every individual record. The same interval also yields mileage and fuel cost/km.

### 3.3 Fuel data integrity

- A purchase record is not the same thing as a consumption interval. Preserve them separately.
- Do not count the initial baseline full refill as spend consumed in the following interval; purchases after that baseline through and including the next full refill belong to the interval.
- Recompute affected intervals deterministically when a new refill or an auditable correction is accepted.
- Retain prior calculation provenance and revisions so historical reports can explain why a value changed.
- If the next full refill never arrives, retain the purchases but report the interval as incomplete; do not extrapolate a final mileage or cost/km value.
- A missing odometer, invalid odometer delta, missing price/amount, or invalid quantity must not generate a fabricated mileage figure.

## 4. Admin expense entry forms and source records

Platform Fees, Traffic Challans, and Miscellaneous Business Expenses each have a dedicated Admin entry form under its own separate, clearly named Admin section/header. These forms are explicitly in scope for PR 1 and must follow the established shared form rules. They are not driver-facing forms. The Performance screen remains unchanged. Each form creates authoritative source records consumed by the calculation engine.

### Platform fees and passes
- Record the amount actually paid by the driver. The authoritative recognition date is the explicit Asia/Kolkata paid business date stored on the expense source entry; the entry's creation/submission timestamp is audit metadata only.
- A platform-fee source entry represents an already-paid transaction; do not create pending/unpaid platform-fee rows or introduce a separate unpaid-fee accrual state. Its `businessDate` is the actual payment date.
- In the initial one-car/one-driver scope, retain the authoritative business vehicle ID on each vehicle-related platform pass/commission entry. This is a vehicle/business expense on the paid date, not a trip-level allocation; no multi-vehicle apportionment is introduced.
- The entry may retain a source reference for traceability, but no platform payout, settlement, fee-statement matching, trip-to-payout matching, or separate net-earnings workflow is required.
- Keep completed-trip fare gross. A paid platform fee is a separate cost recognized once; do not net it out of fare and deduct it again.
- Do not infer a percentage, accrue an unpaid fee, or build a commission engine. The legacy `alreadyNettedFromIncome` flag must not be used to suppress a paid platform cost in the approved gross-fare workflow; a record carrying that contradictory state is not a valid breakeven input.

### Traffic challans
- Preserve the challan issue date/reference separately for identification, and preserve its vehicle identity and payment status.
- A challan is recognized in full-cost breakeven only after it has actually been paid and entered. Its authoritative recognition date is the actual paid business date stored as `businessDate`; issue date and unpaid status do not create an expense.
- An unpaid challan remains visible as a source obligation but contributes zero to recognized breakeven cost until paid. There is one full-cost breakeven; no operating-breakeven exclusion/inclusion split exists.

### Miscellaneous business expenses
- Use the explicit Asia/Kolkata `businessDate` entered for the actual business expense. `createdAt` and `submittedAt` are audit timestamps and must not replace that date.
- Preserve amount in integer paise, source identity, description/reference, and append-only correction history. Apply vehicle/driver attribution only where the source expense is genuinely vehicle/driver-specific; do not invent an allocation.
- Existing Maintenance visit/repair records must not be added on top of the per-kilometre Maintenance accrual for breakeven.
- The Miscellaneous Business Expenses Admin form is part of PR 1.

## 5. Common expense and calculation architecture

- Introduce a platform-neutral, versioned expense source model and application/domain calculation services. UI components must not own calculations.
- Each source adapter declares source kind, source ID, revision, business date/period, vehicle/driver attribution, amount in paise, currency, status, and correction/reversal semantics.
- Distinguish actual purchase/transaction facts from derived allocations and analytical outputs.
- Daily allocation is canonical where a cost spans days. Monthly/weekly/yearly outputs are derived rollups of daily values, not independently calculated totals.
- Use integer paise for INR, deterministic residual distribution, stable source identities, calculation versioning, append-only provenance, and idempotent replay.
- Corrections and reversals must rebuild affected outputs from authoritative source facts while preserving historical provenance.
- Browser IndexedDB and Android Room use the same shared domain/application implementation. No duplicated native calculation engine.
- All persistent records and durable enrichment work participate in migrations, backup/restore, recovery checkpoints, and regression gates.
- A calculation with missing or ambiguous source facts is unavailable/needs-attention; do not emit plausible-looking estimates as actuals.
- Do not make the calculation engine depend on the Performance screen. Expose stable read models for future consumers.

## 6. PR sequencing

### PR 1 — Expense foundation, Fuel Entry and source calculations

Scope:
1. Add the common expense-source and calculation foundation.
2. Add Fuel Entry as the only new driver-facing form, using the existing shared PWA form runtime and the rules above.
3. Add separate Admin entry forms in the approved hierarchy: Platform Fees and Miscellaneous Business Expenses under Finance; Traffic Challans under Compliance. Each has its own dedicated section and form, using the established shared form runtime and form rules.
4. Persist fuel purchase facts, durable in-progress form working copies, timestamp, best-effort GPS evidence, and durable asynchronous locality enrichment.
5. Implement derived kg, full-tank checkpoint pairing, km/kg, effective interval cost/kg, and per-interval fuel cost/km with deterministic provenance. Preserve all purchases as source records; do not treat purchase spend as a second daily breakeven cost.
6. Add the three Admin expense forms and their authoritative source records, then implement source adapters and calculations for platform fees, challans, and miscellaneous expenses.
7. Produce reliable daily source-entry summaries and completed fuel-interval outputs without changing the Performance presentation. These source summaries are not themselves a breakeven result; breakeven fuel cost must use confirmed business kilometres multiplied by the weighted interval rate.
8. Add web/Android parity, offline, process-restart, backup/restore, idempotency, correction, and regression coverage.

Acceptance gates:
- Fuel entry can be opened from every screen and when no shift is active.
- Form draft survives navigation, app close/reopen, process restart, and supported recovery without accidental submission or data loss.
- Fuel submission and local calculations work with network disabled; geocoding failure never blocks the driver.
- GPS evidence is event-scoped and correctly timestamped; absent/late evidence is represented honestly.
- Full-to-full mileage requires two valid full-tank checkpoints and a positive odometer delta.
- Full tank is the default; the Partial refill checkbox is unchecked by default.
- All fuel purchases remain immutable source records; only full-tank records are checkpoints for km/kg and cost/km intervals, while intervening partial purchases contribute quantity and spend to the interval. Fuel purchases are not separately added to daily breakeven costs.
- Platform Fees and Miscellaneous Business Expenses each have a separate Admin entry form under Finance; Traffic Challans has a separate Admin entry form under Compliance. All three conform to the shared PWA form architecture and form rules.
- All calculated values reconcile to immutable source records and versioned provenance.
- Browser and Android use the same calculation/application services and their respective durable stores.
- Full architecture, web, Android, integrated regression, and backup/restore gates pass.

### PR 2 — Full-cost breakeven source integration

Scope:
1. Build daily business cost from the canonical Compliance/EMI outputs and PR 1 expense outputs.
2. Calculate exactly one **full-cost breakeven** from the authoritative gross-fare, paid-expense, fuel-consumption, maintenance, Compliance and whole-EMI inputs.
3. Treat paid platform charges as separate costs against gross fare; do not use payout-received gating, net-payout normalization, or a variable commission/contribution-margin engine.
4. Driver Target is not part of this source-foundation delivery. Its approved monthly surplus-above-breakeven design remains last in sequence and must not delay or alter the reliable breakeven foundation.
5. Expose daily/weekly/monthly full-cost breakeven read models for future Performance consumption. Driver Target comparisons remain a later phase.
6. Keep all calculations independent of the Performance UI/UX shell.

Driver Target is a later phase and remains last in sequence. Its approved product rule is a monthly Admin-configured additional surplus above full-cost breakeven, as defined by the Breakeven and Driver Target Calculation Contract; this source-foundation PR does not design or implement it. The initial calculation scope supports exactly one car and one driver. Multi-car, multi-driver, and shared-cost allocation are deferred; keep the architecture extensible without implementing that future complexity now. No UI is added to Performance in this PR.

## 7. Repository assessment and implementation blockers to resolve

Inspection of `main` after PR #77 found:
- The shared form contract/runtime and record-backed working-copy repository already exist. The form contract requires restart recovery, so the Fuel form must conform rather than introduce a weaker draft lifecycle.
- The shared location contract supports offline event-scoped GPS acquisition, and the existing reverse-geocoder adapter/proxy exists. Timeline enrichment currently uses a session-local cache and Timeline-specific event types, so fuel needs durable enrichment linkage/queue handling rather than relying on that cache as-is.
- Existing completed-trip financial records store fare, toll, and parking, but no platform-fee field or authoritative platform-settlement record was found; PR 1 therefore needs an Admin Platform Fees source form and record model.
- Existing Maintenance records include vehicle-scoped visits and general expenses, but there is no dedicated traffic-challan source or general business-expense category model in the inspected source; PR 1 therefore needs dedicated Admin forms and typed record models for these categories.
- These are approved Admin entry forms, not unapproved UI. They must be implemented using the shared form architecture; no separate Performance presentation is included.

## 8. Owner decisions resolved

- **Fuel quantity:** Driver enters only total amount paid and price per kg. KFE calculates kg as amount / price per kg. There is no pump-quantity input.
- **Driver Target:** The approved rule is a monthly Admin-configured additional surplus above full-cost breakeven, per Breakeven Contract v1.9. Target design and implementation remain deferred until reliable breakeven is complete; Driver Target is last in sequence.
- **Initial operating scope:** One car and one driver only. Multi-car, multi-driver, and shared-cost allocation are explicitly deferred. Keep the architecture extensible without implementing that future complexity now.
- **Partial-refill treatment** and the three separate Admin expense forms remain approved as specified above.
- **Fuel timestamp and location:** At submission, capture a UTC timestamp and Asia/Kolkata business-date context, plus a fresh event-scoped GPS snapshot when available. Preserve accuracy, fix time, provider/source, and capture status. Missing or late GPS must be represented honestly and must never block submission or driver work.
- **Offline and geocoding:** Fuel entry, draft recovery, submission, and local calculations work offline. Persist coordinates locally; reverse geocoding runs later through a durable, retryable background task when internet and network policy permit. Geocoding never runs in the critical submit path and never blocks the driver.
- **Work access:** Fuel Entry is accessible from the Work screen even when no shift is active, and from any app screen. Opening it must not start or alter a shift, trip, or workflow state.
- **Form lifecycle:** Use the shared form architecture and working-copy lifecycle. Drafts survive navigation, app background/close, process restart, and supported recovery; no close/navigation action submits or discards a draft. One Submit action creates an idempotent purchase record.
- **Scope boundary:** Include the approved partial-refill checkpoint rules, three separate Admin expense forms, timestamp/GPS evidence, durable asynchronous reverse-geocoding, offline operation, and all previously approved source, correction, audit, backup/restore, browser/Android parity, and regression requirements. Do not add Performance presentation changes.

The owner decisions recorded in this contract are resolved. No further clarification is currently required to proceed against this scope after the documentation review gate is accepted.


## Breakeven integration amendment — fuel source versus consumed fuel cost

**Approval:** Approved product-owner clarification recorded alongside Breakeven Contract v1.8 / Addendum H.  
**Authority:** For breakeven fuel-cost treatment, this amendment supplements and supersedes conflicting wording in this document.  
**Implementation effect:** Documentation only; no runtime implementation is claimed.

1. Every fuel purchase remains an immutable source record and contributes quantity/spend to the appropriate full-tank measurement interval under Section 3.
2. Fuel purchase spend is used to derive the weighted-average fuel cost per kilometre from all valid completed full-tank intervals:
   `weighted fuel cost/km = total included fuel expenditure across completed intervals ÷ total confirmed kilometres across those intervals`.
3. Daily breakeven fuel cost is confirmed business kilometres multiplied by the effective weighted-average fuel cost/km. Fuel purchases are **not** added again as separate daily breakeven expenses; doing so would double-count fuel against the kilometre-based consumption cost.
4. A partial refill contributes its actual quantity and spend to the interval between full-tank checkpoints. The full refill that closes the interval is included; the baseline full refill that opens the interval is not counted as consumption within that interval.
5. If no valid completed interval exists, the rate is pending—not zero and not an invented estimate. Do not present a complete actual breakeven result that silently treats the missing rate as zero.
6. A newly completed interval updates the weighted-average rate prospectively from the calendar day after interval completion. The prior rate remains effective on the completion date and all earlier dates. No retroactive rate application is permitted.
7. The phrase in Section 3.2 that all fuel purchases enter business expense totals remains true for source-record/accounting visibility, but it must not be interpreted as a second fuel expense in the full-cost breakeven calculation. The Breakeven Contract v1.9 is authoritative for the final aggregation semantics.


## Source-date and attribution reconciliation amendment

**Authority:** This section records the previously discussed source-date decisions and defers to the source-owning contracts for immutable identity and event snapshots.

1. **Completed ride fare:** use the trip's immutable trip context operational date and captured vehicle/driver/assignment identity. The driver may submit the fare after the ride; submission time is audit metadata, not a replacement operational date.
2. **Cancellation fee:** link the fee to its cancellation event and trip. Use the same immutable trip context and operational date; fee submission time is retained separately as audit metadata. Do not create a separate cash/platform or payout record.
3. **Parking and toll:** inherit the completed trip's immutable context and operational date. The existing trip-form inclusion/payer control is authoritative: an amount already included in the fare/customer charge is not added again as a driver expense; an amount recorded as driver-paid is included once as a separate driver expense.
4. **Platform pass/commission:** recognize only when paid and entered, on the explicit paid business date; no payout or trip matching is required. Keep the amount separate from gross fare.
5. **Traffic challan:** retain the issue date/reference for identification, but recognize cost only after payment, on the explicit paid business date. Unpaid challans remain unrecognized.
6. **Miscellaneous business expense:** use the explicit business date on the source record. Creation/submission timestamps are audit metadata only.
7. **Fuel purchase:** business date is the Asia/Kolkata calendar date derived from the actual purchase timestamp; it is source/measurement history, not the daily breakeven recognition date for fuel consumption.
8. Vehicle and driver attribution must come from the source record or immutable Work/Trip context. Do not infer historical attribution from the currently selected Admin vehicle/driver.

The older PR 1/PR 2 language in this document that describes fuel purchases as direct daily breakeven expenses, challans as an operating/full-cost split, or net-payout/contribution-margin treatment is superseded by this amendment and Breakeven Contract v1.9 Addendum H.

