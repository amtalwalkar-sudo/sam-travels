# Business Start Date Cost Allocation Contract

**Status:** Owner-approved product allocation policy; implementation and calculation wiring are not yet authorized by this document alone  
**Owner:** Cross-feature business reporting policy; Compliance and Finance own their source records and domain calculations  
**Timezone:** Asia/Kolkata for business dates  
**Currency:** INR; integer paise for persisted money

## 1. Purpose and authority

This contract defines how Compliance costs and scheduled loan EMI costs are allocated into business operating-day, monthly, and yearly reporting when the Business Start Date falls after the underlying record or schedule has already begun.

The Business Start Date is **not** a lower-bound validation rule for historical records and is **not** a reason to discard, truncate, or shift their actual dates. It is the point from which the business begins receiving the allocated cost.

This contract owns the cross-feature carry-forward and allocation policy. Compliance retains ownership of compliance records, actual validity dates, renewal relationships, overlap/gap review, and source cost. Finance retains ownership of loan records, EMI calculation, schedule, payment history, and source scheduled instalment amounts. Reporting consumes those owner-provided facts; Admin/UI must not implement competing calculations.

## 2. Approved governing rule

For an eligible cost record or schedule that starts before the Business Start Date:

1. Preserve its actual start/end dates and source amount/scheduled amounts unchanged.
2. Calculate the cost attributable to the full actual period, including days before the Business Start Date.
3. Do not report those pre-business days as operating-day costs before the Business Start Date.
4. Carry the pre-business accrued amount forward.
5. Allocate the carried-forward amount evenly over the remaining eligible allocation days beginning on the Business Start Date and ending at the source record's/schedule's applicable end.
6. Include the resulting daily allocations in the monthly and yearly totals for the months/years in which those business allocation days occur.
7. The entire source cost must be allocated exactly once. Carry-forward is a redistribution of the same cost, not an additional charge.

If the source period begins on or after the Business Start Date, allocate across its full eligible period using the same source-period rules, without a carry-forward.

The Business Start Date must never change a source validity date, EMI due date, payment date, loan start date, or historical event timestamp.

## 3. Compliance allocation

A Compliance record's source period is its actual inclusive `validFrom` through `validTo` dates. Both dates remain exactly as entered/approved on the immutable record. The source cost is the record's total cost.

For a record whose validity begins before the Business Start Date and continues beyond it:

- Determine the full inclusive validity-day count and the source cost per validity day.
- Accumulate the amount attributable to validity days before the Business Start Date as pre-business carry-forward.
- Add that carry-forward to the amount otherwise attributable to the remaining validity days.
- Allocate the record's entire total cost evenly across the remaining inclusive validity days from the Business Start Date through `validTo`.
- Stop allocating at the actual `validTo`; do not extend the compliance period to accommodate the business start date.

### Approved example

- Actual validity: 1 January through 31 December (365 inclusive days)
- Total compliance cost: ₹12,000
- Business Start Date: 1 March
- Pre-business days: 1 January through 28 February (59 days)
- Business allocation days: 1 March through 31 December (306 days)

The full ₹12,000 is allocated across the 306 business days:

`₹12,000 ÷ 306 = approximately ₹39.215686 per business day`

The January and February portions are not shown as business operating costs in January or February. Their accrued value is carried forward and included in the daily allocation beginning 1 March. March through December monthly totals are the sums of their daily allocations; the yearly total reconciles to ₹12,000.

Existing Compliance rules remain in force: early-renewal overlaps are not silently normalized; unresolved/rejected overlap cases continue to follow the Compliance overlap-review contract, including withholding affected combined totals where required. Carry-forward does not bypass overlap review or double-count overlapping records.

## 4. Loan EMI allocation

For reporting allocation, use the **entire scheduled EMI instalment amount as one cost amount**. Do not split the EMI into principal and interest for this allocation. This reporting policy does not replace or alter the Finance-owned EMI quote/amortization calculation, payment history, prepayment, settlement, or outstanding-principal rules.

Option A is approved: each scheduled EMI is associated with its own monthly allocation period, anchored by the loan's actual EMI schedule:
- Period begins on that instalment's scheduled due date.
- Period ends on the day before the next scheduled due date.
- For the final scheduled instalment, the period ends on the final day of that scheduled calendar month.
- Use the complete scheduled instalment amount for the period, including any Finance-approved final-instalment adjustment.

For a monthly EMI period that straddles the Business Start Date, the portion accrued before the Business Start Date is carried forward and the **whole EMI amount for that period** is allocated evenly over the remaining days of that EMI period from the Business Start Date.

### Prepayment and closure schedule boundaries

The Finance Loan Prepayment Contract is authoritative for the prepayment event and resulting schedule. The approved mode is Reduce Tenure only: the regular EMI amount and due dates remain unchanged, the revised schedule retains the same next unpaid due date, and the final instalment/final due date moves earlier.

A prepayment may occur between scheduled EMI dates only after every instalment due on or before the prepayment business date is fully paid and allocated. It becomes effective on that business date, after the paid-through instalments and before the next unpaid instalment. For daily cost allocation, preserve the already-open EMI allocation period from the prior schedule through the day before the next unpaid due date, using the prior schedule's applicable scheduled EMI amount. Begin the revised schedule's future allocation rows on the next unpaid due date. Do not leave the open period unallocated, restart it at the prepayment date, or count both schedule versions for the same period.

The Finance Loan Settlement and Closure Contract is authoritative for closure. V1 settlement occurs only on a scheduled EMI due date, after all instalments due through that date are fully paid and allocated. The settlement amount is the closing principal after that date's EMI; the settlement entry and Loan closed state commit atomically. The closure date is the settlement business date. The closure-date EMI is the final scheduled instalment; its allocation period is truncated to the closure date (inclusive), and no EMI allocation may be emitted on a later date. Do not continue allocating later rows from the historical schedule merely because those rows remain in an immutable schedule snapshot.

Scheduled EMI periods that have fully elapsed before the Business Start Date create a pre-business EMI carry-forward balance. That balance is allocated evenly over the remaining loan schedule days beginning on the Business Start Date and ending on the final scheduled EMI allocation-period end. Each later scheduled EMI continues to be allocated over its own monthly allocation period. This ensures that historic EMI costs are neither discarded nor shown as pre-business operating costs.

The scheduled EMI amount is the allocation source. Actual payment amount/date/status remain separate facts and must not be fabricated or silently substituted for the scheduled allocation. A missed, partial, late, reversed, or adjusted payment does not by itself rewrite the scheduled EMI cost allocation. Prepayment and settlement are the explicit schedule-transition exceptions defined above and in their Finance owner contracts.

No principal/interest split is used in the reporting allocation or its daily/monthly/yearly presentation. Finance may retain the component details required by its separate loan schedule contract for loan-balance calculations; those details must not leak into or change this whole-EMI cost-allocation rule.

## 5. Daily, monthly, and yearly reconciliation

- Daily allocation is the lowest-level reporting result.
- Monthly totals are sums of the daily allocations whose business dates fall within that calendar month.
- Yearly totals are sums of the relevant monthly/daily allocations for that calendar year.
- A daily allocation is assigned to exactly one Asia/Kolkata business date.
- No pre-Business-Start-Date allocation appears as an operating-day cost before the Business Start Date.
- The carried-forward amount is fully absorbed by the end of the applicable allocation horizon. Compliance ends at its actual `validTo`; EMI carry-forward ends at the final scheduled EMI allocation-period end.
- Use integer paise and deterministic residual distribution so daily amounts sum exactly to the source amount. Where equal division leaves remainder paise, distribute those paise deterministically across allocation days; never lose or create money through rounding.
- Monthly and yearly summaries must be derived from the same daily allocation results, not independently rounded calculations.

If the Business Start Date is after a source record's entire validity/schedule horizon, there are no remaining eligible allocation days for that source. Do not silently move its end date or create an unbounded allocation; report it as a pre-business historical item requiring an explicit policy decision before business-cost allocation.

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
- regression fixtures for pre-start carry-forward, boundary dates, leap years, month/year boundaries, final EMI periods, paise residuals, source corrections, and idempotent rebuilds.

The implementation must not add a competing Admin/UI calculation, mutate immutable source history, or bypass existing transaction, recovery, persistence, and calculation-version safeguards.
