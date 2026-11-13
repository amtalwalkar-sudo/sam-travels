# Business Start Date Cost Allocation — Implementation Plan

**Status:** Draft implementation plan for PR review; runtime implementation is not yet complete.
**Policy authority:** [Business Start Date Cost Allocation Contract](BUSINESS_START_DATE_COST_ALLOCATION_CONTRACT.md).
**Base:** `main` after PR #76 merge.
**Scope:** Versioned, deterministic reporting allocations for Compliance and whole scheduled EMI costs.

## 1. Objective

Implement the approved Business Start Date carry-forward policy without changing source records, actual dates, loan amortization, payment history, Compliance overlap decisions, or historical correction facts.

The calculation must be owned by a platform-neutral application/domain capability. UI components may display allocation results but must not calculate them independently.

## 2. Existing source authorities

- Business Start Date: Business Settings singleton, `feature:business-settings:business`, read through `BusinessSettingsService`.
- Compliance: immutable Compliance records with actual inclusive `validFrom`, `validTo`, and `totalCostPaise`; overlap review remains authoritative.
- Finance: loan record and its versioned amortization schedule; each schedule row supplies `dueDate` and the complete `installmentAmountPaise`.
- Finance prepayment schedule revisions remain owned by Finance and represent genuine duration changes (preserving the contractual EMI amount and regular due date; the final due date may move earlier). Settlement/payment ledger facts do not independently truncate the schedule used for allocation. The allocation input identifies the selected Finance schedule version and never infers schedule changes from payment status or paid-through boundaries.

## 3. Calculation contract to implement

### Compliance

1. Preserve the actual inclusive validity range.
2. If the range includes Business Start Date, allocate the complete `totalCostPaise` over the inclusive dates from Business Start Date through actual `validTo`.
3. If the record begins on/after Business Start Date, allocate over its full actual inclusive validity range.
4. If the record ends before Business Start Date, return a pre-business historical item with no operating-day allocation; do not extend its end date.
5. Do not allocate or aggregate affected same-name overlaps unless the existing Compliance overlap-review result is confirmed.
6. Allocate integer paise deterministically. Daily values must sum exactly to the source amount.

### Whole scheduled EMI

1. Use the complete scheduled `installmentAmountPaise` from the selected Finance schedule version. Do not split principal and interest.
2. For each instalment, define its allocation period from its due date through the day before the next due date. For the final instalment, use the final day of that due-date calendar month.
3. If Business Start Date falls inside an instalment period, allocate that instalment's complete amount over the remaining inclusive days of that period.
4. Sum complete scheduled EMI amounts for periods fully elapsed before Business Start Date into a single pre-business EMI carry-forward balance. Allocate that balance evenly over the remaining schedule days from Business Start Date through the final instalment allocation-period end.
5. Continue allocating each subsequent instalment over its own allocation period. Keep the carry-forward allocation separate in provenance so it can be audited and reconciled without double counting.
6. If no eligible schedule days remain after Business Start Date, return a pre-business historical item requiring explicit policy; do not extend the schedule.
7. Actual payment dates, amounts, statuses, reversals, settlement paid-through boundaries and closure facts do not silently replace scheduled EMI allocation inputs. A prepayment-driven duration change must be represented by the Finance-owned revised schedule rows; preserve contractual EMI amount and regular due dates, with only the final instalment date moving earlier. Schedule selection and restatement provenance must identify the exact Finance schedule version.

## 4. Determinism, money and provenance

- Use Asia/Kolkata calendar dates and inclusive day ranges.
- Use integer paise and a deterministic residual rule (earlier eligible business dates receive remainder paise first).
- Daily allocations are the canonical result. Monthly and yearly totals are sums of daily paise, never separately rounded calculations.
- Every allocation result records source identity/revision, Business Start Date, applicable validity/EMI period, Finance schedule version where relevant, allocation calculation ID/version, and amount in paise.
- Rebuilds for a changed Business Start Date or changed source revision are deterministic and idempotent. Source facts remain immutable; derived projections are replaced only through the repository's approved correction/recovery mechanism.
- A calculation result must reconcile exactly to its eligible source amount. No missing or duplicate paise.
- A deterministic fingerprint of the allocation inputs is retained as an append-only provenance record in the platform records table. Identical input states are idempotent; changed Business Start Date/source/schedule inputs create distinct records. The report exposes this history for audit. These metadata records are included by the platform records backup participant.

## 5. Delivery sequence

1. Add pure, independently testable Compliance and EMI allocation functions with strict input validation and a versioned calculation identifier.
2. Add an application allocation service that reads Business Settings, Compliance records/review decisions, and Finance loans/schedule versions through their owning service boundaries.
3. Add a deterministic derived reporting projection with explicit provenance and safe rebuild semantics when Business Start Date or source revisions change.
4. Wire reporting reads to the projection; UI remains presentation-only and consumes daily/monthly/yearly results.
5. Add backup/restore coverage for derived projections or deterministic rebuild metadata, following the persistence and recovery contracts.
6. Verify browser PWA and Android Room parity and run full CI.

## 6. Required regression coverage

- Business Start Date before, on, and after Compliance validity boundaries.
- Leap day, month end, year end, inclusive-day counts, and records fully expired before Business Start Date.
- Confirmed, unresolved, rejected, and stale Compliance overlap reviews.
- EMI periods wholly before, straddling, and wholly after Business Start Date.
- Irregular first EMI date, final adjusted EMI, schedule revisions, prepayment/settlement schedule effects, and final period end.
- Paise division with zero, one, and many remainder paise; exact daily/monthly/yearly reconciliation.
- Business Start Date changes in both directions, source corrections, duplicate rebuilds, interrupted rebuild/recovery, and source-version changes.
- Settlement/payment ledger paid-through facts do not truncate future scheduled EMI allocation rows.
- Prepayment revised schedules preserve contractual EMI amounts and regular due dates while reducing remaining duration/final due date.
- No mutation of Compliance validity dates, loan dates, EMI due dates, payment history, or original source amounts.
- PWA/Android parity.

## 7. Explicit non-goals

- No principal/interest split in reporting allocations.
- No change to Finance's EMI or outstanding-principal calculations.
- No rewriting or validation cutoff for historical Finance/Compliance records.
- No independent calculation in React/UI.
- No hardcoded sample dates, periods, or amounts.
- No extension of source validity or EMI schedule to force an allocation.

## PR #77 audit refinement

- Settlement ledger `paidThroughInstallment` is a payment fact and must not truncate the selected scheduled EMI rows in the cost-allocation projection. A prepayment-driven reduction in loan duration must be represented by the Finance-owned revised schedule rows. This change is covered by the service regression that verifies later scheduled rows remain present when settlement payment facts exist.
- Compliance correction projection and durable prior-restatement provenance remain explicit completion gates; they are not marked complete by the current read-time rebuild.

- Compliance append-only correction chains are now projected into Compliance overview and daily-cost reads before overlap analysis; invalid/forked/stale correction chains fail closed. Regression coverage verifies projected data and immutability of the original source.
