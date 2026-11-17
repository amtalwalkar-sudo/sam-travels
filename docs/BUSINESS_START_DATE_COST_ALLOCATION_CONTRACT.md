# Business Start Date Cost Allocation Contract

**Status:** Owner-approved product allocation policy; implementation and calculation wiring are not yet authorized by this document alone  
**Owner:** Cross-feature business reporting policy; Compliance and Finance own their source records and domain calculations  
**Timezone:** Asia/Kolkata for business dates  
**Currency:** INR; integer paise for persisted money

## 1. Purpose and authority

This contract defines how Compliance costs and scheduled loan EMI costs are allocated into business operating-day, monthly, and yearly reporting when the Business Start Date falls after the underlying record or schedule has already begun.

The Business Start Date is **not** a lower-bound validation rule for historical records and is **not** a reason to discard, truncate, or shift their actual dates. It is the point from which the business begins receiving the allocated cost.

This contract owns the cross-feature date-based pre-business recovery and normal post-start allocation policy. Compliance retains ownership of compliance records, actual validity dates, renewal relationships, overlap/gap review, and source cost. Finance retains ownership of loan records, EMI calculation, schedule, payment history, and source scheduled instalment amounts. Reporting consumes those owner-provided facts; Admin/UI must not implement competing calculations.

## 2. Approved governing rule — date-based 18-month recovery

The authoritative date attached to an entered cost amount determines its treatment. Use the source owner's business/effective date, not the record's creation timestamp, edit timestamp, or the date on which an administrator happens to enter it.

1. Preserve the original source record, source amount, source dates, schedule, and payment history unchanged.
2. If the cost amount's authoritative date is **before** the Business Start Date, classify that amount as pre-business cost.
3. Amortize the full pre-business amount in **18 equal monthly instalments** over the 18-month period beginning on the Business Start Date. Each recovery month runs from the Business Start Date's monthly anniversary (with a month-end clamp anchored to the original Business Start Date) through the day before the next anniversary. The 18-month period is not shortened or extended by a source validity end date, expiry date, schedule horizon, or other source end date.
4. Each of the 18 recovery months receives the same amount, with any indivisible paise remainder distributed deterministically across the 18 months. For daily Full Cost Breakeven, distribute that month's instalment evenly across the days in that recovery month, again using deterministic paise residual handling. Calendar-month reports sum the daily amounts that fall in each calendar month; a recovery month may cross a calendar-month boundary.
5. If the amount's authoritative date is **on or after** the Business Start Date, use the normal calculation and recognition rules for that source category. Do not apply the special 18-month recovery.
6. Recognize each source amount exactly once. The 18-month recovery is the breakeven treatment of the original pre-business amount, not a second expense added on top of it.

The source-specific date used for classification is:
- Compliance: the compliance cost's effective/valid-from business date.
- Loan EMI: the scheduled due date of each complete EMI amount. Use the entire scheduled EMI amount; do not split principal and interest for breakeven.
- Manual dated business cost: the explicit business/effective date on the cost entry.
- Other categories: the authoritative business/effective date defined by that category's owner contract.

The Business Start Date must never change a source validity date, EMI due date, payment date, loan start date, or historical event timestamp. Source validity and schedule facts remain relevant to their owning feature, but they do not cap the 18-month recovery of an amount classified as pre-business.

## 3. Compliance cost treatment

A Compliance record's source period remains its actual inclusive `validFrom` through `validTo` dates. Both dates remain exactly as entered/approved on the immutable record. The source cost is the record's total cost.

- If `validFrom` is before the Business Start Date, classify the **full recorded compliance amount** as pre-business cost and recover that amount evenly over the 18 months beginning on the Business Start Date. Do not stop recovery at `validTo`.
- If `validFrom` is on or after the Business Start Date, use the normal Compliance cost allocation over its actual inclusive validity period.
- A renewal is a separate source record with its own amount and effective date. Apply the date test independently to each renewal record.
- Existing Compliance rules remain in force: early-renewal overlaps are not silently normalized; unresolved/rejected overlap cases continue to follow the Compliance overlap-review contract, including withholding affected combined totals where required. The 18-month treatment does not bypass overlap review or permit duplicate recognition.

### Illustrative example

A compliance record with a total cost of ₹12,000 and a `validFrom` date before the Business Start Date contributes ₹12,000 ÷ 18 as its monthly recovery portion for each of the 18 recovery months, subject to deterministic paise residual distribution. Its validity end date does not shorten that recovery period.

## 4. Loan EMI allocation

For reporting allocation, use the **entire scheduled EMI instalment amount as one cost amount**. Do not split the EMI into principal and interest for this allocation. This reporting policy does not replace or alter the Finance-owned EMI quote/amortization calculation, payment history, prepayment, settlement, or outstanding-principal rules.

Option A is approved: each scheduled EMI is associated with its own monthly allocation period, anchored by the loan's actual EMI schedule:
- Period begins on that instalment's scheduled due date.
- Period ends on the day before the next scheduled due date.
- For the final scheduled instalment, the period ends on the final day of that scheduled calendar month.
- Use the complete scheduled instalment amount for the period, including any Finance-approved final-instalment adjustment.

Classify each complete scheduled EMI amount by its scheduled due date. If the due date is before the Business Start Date, the **whole scheduled EMI amount** is pre-business cost and is included in the 18-month recovery pool beginning on the Business Start Date. If the due date is on or after the Business Start Date, use the normal EMI-period allocation rules. Do not split an EMI into principal and interest for breakeven.

### Prepayment and closure schedule boundaries

The Finance Loan Prepayment Contract is authoritative for the prepayment event and resulting schedule. The approved mode is Reduce Tenure only: the regular EMI amount and due dates remain unchanged, the revised schedule retains the same next unpaid due date, and the final instalment/final due date moves earlier.

A prepayment may occur between scheduled EMI dates only after every instalment due on or before the prepayment business date is fully paid and allocated. It becomes effective on that business date, after the paid-through instalments and before the next unpaid instalment. For daily cost allocation, preserve the already-open EMI allocation period from the prior schedule through the day before the next unpaid due date, using the prior schedule's applicable scheduled EMI amount. Begin the revised schedule's future allocation rows on the next unpaid due date. Do not leave the open period unallocated, restart it at the prepayment date, or count both schedule versions for the same period.

The Finance Loan Settlement and Closure Contract is authoritative for closure. V1 settlement occurs only on a scheduled EMI due date, after all instalments due through that date are fully paid and allocated. The settlement amount is the closing principal after that date's EMI; the settlement entry and Loan closed state commit atomically. The closure date is the settlement business date. The closure-date EMI is the final scheduled instalment; its allocation period is truncated to the closure date (inclusive), and no EMI allocation may be emitted on a later date. Do not continue allocating later rows from the historical schedule merely because those rows remain in an immutable schedule snapshot.

All scheduled EMI amounts whose due dates are before the Business Start Date are included in the pre-business EMI recovery pool. Recover that pool evenly over the 18 months beginning on the Business Start Date, regardless of the loan's final scheduled EMI date. Scheduled EMI amounts with due dates on or after the Business Start Date continue under their normal EMI-period allocation rules.

The scheduled EMI amount is the allocation source. Actual payment amount/date/status remain separate facts and must not be fabricated or silently substituted for the scheduled allocation. A missed, partial, late, reversed, or adjusted payment does not by itself rewrite the scheduled EMI cost allocation. Prepayment and settlement are the explicit schedule-transition exceptions defined above and in their Finance owner contracts.

No principal/interest split is used in the reporting allocation or its daily/monthly/yearly presentation. Finance may retain the component details required by its separate loan schedule contract for loan-balance calculations; those details must not leak into or change this whole-EMI cost-allocation rule.

## 5. Daily, monthly, and yearly reconciliation

- Daily allocation is the lowest-level reporting result.
- Monthly totals are sums of the daily allocations whose business dates fall within that calendar month.
- Yearly totals are sums of the relevant monthly/daily allocations for that calendar year.
- A daily allocation is assigned to exactly one Asia/Kolkata business date.
- No pre-Business-Start-Date allocation appears as an operating-day cost before the Business Start Date.
- Every pre-business source amount is recovered only within the 18-month interval beginning on the Business Start Date, regardless of the source validity or schedule end date.
- Use integer paise and deterministic residual distribution so the 18 equal recovery-month instalments sum exactly to the original pre-business amount; daily rows within each recovery month must sum exactly to that month's instalment.
- Monthly and yearly breakeven summaries must be derived from the same versioned daily recovery schedule, not independently rounded calculations.
- Normal post-start allocations continue to follow the owning source category's normal daily/monthly rules.

A source whose validity or schedule ended before the Business Start Date is still eligible for 18-month recovery when its authoritative cost date is before the Business Start Date. Its source dates are not changed.

## 6. Record integrity and corrections

- Historical and backdated Compliance and Finance records remain allowed, including dates before the Business Start Date.
- Source records, validity dates, scheduled due dates, actual payment facts, and original amounts remain immutable under their owning contracts.
- Changing the Business Start Date must not rewrite source records or historical event timestamps.
- A correction to a submitted source record follows the owning append-only correction policy and its calculation-restatement safeguards.
- A change to Business Start Date changes the reporting allocation boundary and requires a deterministic rebuild/restatement of affected derived allocations, with prior calculation provenance retained. It must not mutate source facts.
- Allocation results must identify the source record/instalment, source revision or schedule version, Business Start Date used, allocation period, calculation version, and currency/paise result.
- Replays and rebuilds must be deterministic and idempotent across browser PWA and installed Android/Room.

## 7. Explicit exclusions and implementation gate

This contract does not authorize runtime implementation by itself. Before wiring, the implementation plan must identify:
- the owning Compliance and Finance application services and public read contracts;
- the reporting projection/registry and versioned allocation calculation;
- how Business Start Date changes trigger safe derived-allocation restatement;
- overlap-review interaction and historical correction interaction;
- schedule changes after approved prepayments, settlement, closure, or corrections;
- backup/restore participation and browser/Android parity;
- regression fixtures for pre-start 18-month recovery, source-date boundary cases, equal monthly instalments, daily paise residuals, leap years, month/year boundaries, EMI schedule transitions, source corrections, and idempotent rebuilds.

The implementation must not add a competing Admin/UI calculation, mutate immutable source history, or bypass existing transaction, recovery, persistence, and calculation-version safeguards.
