# Fuel Entry and Business Expense Calculation Contract

**Status:** Draft for owner review. This PR is documentation-only; no runtime implementation is included yet.
**Base:** `main` after merged PR #77 (`6f92fe759e753e93e17f86efc11df94a00e0c1e8`).
**Scope:** PR 1 expense foundation and fuel entry; PR 2 breakeven and Admin-configured daily driver target.
**Authorities:** `FORM_ARCHITECTURE_AND_BEHAVIOUR_CONTRACT.md`, `LOCATION_AND_STATE_TIMING_CONTRACT.md`, `NETWORK_ACCESS_CONTRACT.md`, `BUSINESS_START_DATE_COST_ALLOCATION_CONTRACT.md`, and the existing architecture, persistence, backup, recovery, and feature-extension contracts.

## 1. Product boundary

The calculation and source-record foundation is the primary deliverable. It must be platform-neutral, versioned, deterministic, replay-safe, auditable, and independent of any Performance-screen presentation.

- **Fuel is the only new driver-facing form/UI change in PR 1.**
- Platform fees, traffic challans, and miscellaneous business expenses are background source/calculation capabilities. Do not add new user-facing forms or redesign existing screens for them in PR 1.
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
| Refill type | Full tank or partial refill | Driver-selected; full/partial is explicit |
| Price per kg | CNG rate in INR/kg | Driver-entered |
| Total amount paid | Actual amount paid in INR | Driver-entered and stored in integer paise |
| CNG quantity | Kilograms dispensed | Derived from total amount paid / price per kg; display as a calculated value |

The derived quantity is calculated using decimal-safe/integer arithmetic with an explicit precision policy. It must not silently change the entered amount or rate. The displayed derived quantity is clearly marked as calculated.

**Owner review note:** The request mentioned both entering CNG kg and having the app calculate kg from amount/rate. This draft treats kg as a calculated, read-only value. If the driver must also enter the pump-displayed kg, it should be a separate observed value used for comparison, not a replacement for the derived canonical quantity.

Validation must follow the shared form contract:
- Positive, finite odometer, price/kg, and amount values; valid zero/negative handling is defined explicitly by the feature validator.
- Price/kg must be greater than zero before quantity can be derived.
- Preserve precision and source values; use integer paise for INR and a declared fixed precision for kg.
- Warn on suspicious odometer regression or unusually large changes; block only actual invariants.
- Do not require an active shift, trip, or network connection.
- No date restriction should be inherited from Business Start Date. The authoritative entry instant is captured by the app; any later historical correction follows the correction contract.

### 2.3 Entry timestamp and GPS evidence

- Capture a stable entry timestamp for the successful submission intent, storing the UTC instant and Asia/Kolkata business-date context under the existing time contract.
- Initiate a fresh, event-scoped GPS snapshot for the fuel-entry submission. Persist coordinates, accuracy, fix timestamp, provider/source, and capture status when available.
- GPS acquisition is best-effort and asynchronous. It must never hold the form open, delay submission, require internet, or block the driver from continuing to another screen.
- Persist the fuel purchase and its entry timestamp locally even if GPS is unavailable, permission is denied, the device is offline, or acquisition times out. Record an explicit location status/reason and retain a recoverable enrichment task where appropriate; never invent coordinates or use an unrelated last-known fix as if it were captured at submission.
- A late GPS result must retain its actual fix timestamp and be marked as late/recovery evidence; it must not be represented as exact submission-time evidence.
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

**Important measurement rule requiring owner confirmation:** If partial refills occur between two full-tank checkpoints, accurate full-to-full consumption requires including the kg and amount of those intervening partial purchases, as well as the final top-up that restores the tank to full. The partial refill is excluded as a checkpoint, but its purchase quantity and cost are included in the interval total. Excluding partial refills entirely would understate both fuel quantity and fuel spend and produce incorrect km/kg and cost/km. This distinction must be confirmed before implementation.

The phrase “calculate cost per kg after 2 full tank refills” is interpreted here as calculating interval effective cost/kg after the second full-tank checkpoint; the purchase-level price/kg remains available on every individual record. The same interval also yields mileage and fuel cost/km.

### 3.3 Fuel data integrity

- A purchase record is not the same thing as a consumption interval. Preserve them separately.
- Do not count the initial baseline full refill as spend consumed in the following interval; purchases after that baseline through and including the next full refill belong to the interval.
- Recompute affected intervals deterministically when a new refill or an auditable correction is accepted.
- Retain prior calculation provenance and revisions so historical reports can explain why a value changed.
- If the next full refill never arrives, retain the purchases but report the interval as incomplete; do not extrapolate a final mileage or cost/km value.
- A missing odometer, invalid odometer delta, missing price/amount, or invalid quantity must not generate a fabricated mileage figure.

## 4. Other business expense sources — background only in PR 1

No new user-facing entry forms are approved for these categories in PR 1. The calculation engine must expose typed, source-specific adapters and must not assume that a source exists merely because a calculation has been designed.

### Platform fees
- Attribute actual platform fees to the relevant trip, platform settlement, or authoritative fee statement, with source identity, effective date, amount, and reversal/correction linkage.
- Do not infer platform fees from a generic percentage unless a versioned, owner-approved platform fee rule and its effective dates are explicitly supplied.
- Do not double-count a fee already deducted from a net-income source.
- Preserve gross fare, platform fee, and net proceeds as distinct facts wherever source data provides them.

### Traffic challans
- Preserve challan amount, issue/transaction date, vehicle, optional driver, reason/reference, and payment/reversal status as distinct facts.
- Challans are excluded from normal operating breakeven and included in full-cost breakeven.
- They must remain separately identifiable and must not be silently blended into ordinary fuel/maintenance operating cost.

### Miscellaneous business expenses
- Use typed category and attribution metadata (business, vehicle, or driver where supported), business date, amount in integer paise, source identity, description/reference, and correction/reversal history.
- Existing general Maintenance expense records may be adapted only when their meaning and ownership genuinely match; do not relabel unrelated Maintenance records or count the same amount twice.
- No new Miscellaneous entry screen is part of PR 1.

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
2. Add the Fuel Entry form as the only new user-facing form, using the shared form runtime and the rules above.
3. Persist fuel purchase facts, durable in-progress form working copies, timestamp, best-effort GPS evidence, and durable asynchronous locality enrichment.
4. Implement derived kg, full-tank checkpoint pairing, km/kg, effective interval cost/kg, and fuel cost/km with deterministic provenance.
5. Add background source adapters and calculations for platform fees, challans, and miscellaneous expenses only where authoritative source facts already exist or a source ingestion contract is approved. Do not add new forms for them.
6. Produce reliable daily expense/fuel calculation outputs without changing the Performance presentation.
7. Add web/Android parity, offline, process-restart, backup/restore, idempotency, correction, and regression coverage.

Acceptance gates:
- Fuel entry can be opened from every screen and when no shift is active.
- Form draft survives navigation, app close/reopen, process restart, and supported recovery without accidental submission or data loss.
- Fuel submission and local calculations work with network disabled; geocoding failure never blocks the driver.
- GPS evidence is event-scoped and correctly timestamped; absent/late evidence is represented honestly.
- Full-to-full mileage requires two valid full-tank checkpoints and a positive odometer delta.
- Partial-refill treatment follows the confirmed measurement rule.
- All calculated values reconcile to immutable source records and versioned provenance.
- Browser and Android use the same calculation/application services and their respective durable stores.
- Full architecture, web, Android, integrated regression, and backup/restore gates pass.

### PR 2 — Breakeven and Admin-configured daily driver target

Scope:
1. Build daily business cost from the canonical Compliance/EMI outputs and PR 1 expense outputs.
2. Calculate **normal operating breakeven**, excluding traffic challans.
3. Calculate **full-cost breakeven**, including traffic challans and other included obligations according to their approved treatment.
4. Account for platform fees correctly when deriving the revenue needed to cover costs; distinguish gross revenue from net proceeds and use contribution-margin logic where variable fees apply.
5. Allow Admin to configure the desired target above breakeven. The daily target is derived from the current applicable breakeven plus the configured additional amount or margin; it is not a hardcoded driver-entered target.
6. Expose daily/weekly/monthly calculation read models and actual-versus-target comparisons for future Performance consumption.
7. Keep all calculations independent of the Performance UI/UX shell.

The exact target configuration unit (fixed INR addition versus percentage/margin) and allocation policy when multiple drivers/vehicles share costs must be approved before PR 2 implementation. No UI is added to Performance in this PR.

## 7. Repository assessment and implementation blockers to resolve

Inspection of `main` after PR #77 found:
- The shared form contract/runtime and record-backed working-copy repository already exist. The form contract requires restart recovery, so the Fuel form must conform rather than introduce a weaker draft lifecycle.
- The shared location contract supports offline event-scoped GPS acquisition, and the existing reverse-geocoder adapter/proxy exists. Timeline enrichment currently uses a session-local cache and Timeline-specific event types, so fuel needs durable enrichment linkage/queue handling rather than relying on that cache as-is.
- Existing completed-trip financial records store fare, toll, and parking, but no platform-fee field or authoritative platform-settlement record was found.
- Existing Maintenance records include vehicle-scoped visits and general expenses, but there is no typed traffic-challan source or general business-expense category model in the inspected source.
- Therefore platform fees, challans, and miscellaneous calculations cannot be claimed as production-ready until authoritative source records/ingestion are identified. PR 1 may define adapters and output contracts, but it must not fabricate inputs or introduce unapproved entry UI.

## 8. Owner decisions required before calculation implementation

1. **Partial refill treatment:** Confirm that partial refills are excluded as full-tank checkpoints but their kg and amount are included in the next full-to-full interval. This is required for physically correct mileage and cost/km.
2. **Fuel quantity field:** Confirm that CNG kg is app-derived from total amount / price per kg and shown read-only, rather than separately entered by the driver as a second source value.
3. **Background expense source facts:** Identify the existing authoritative source for platform fees, traffic challans, and miscellaneous expenses, or confirm that PR 1 should only create typed adapters/read models until those source records are separately approved. No extra UI is assumed.
4. **Driver target policy for PR 2:** Confirm whether Admin's amount above breakeven is a fixed INR addition or a percentage/margin, and how shared vehicle/business costs are attributed when multiple drivers work.

No runtime implementation should begin until the owner decisions that affect calculation correctness and source availability are resolved. This document is the review gate for the implementation commits that will follow in this PR.
