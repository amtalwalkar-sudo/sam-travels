# Finance and Performance Calculation Approval Gate

This document records the current implementation boundary. It is not permission to invent accounting or performance policy.

## Current production calculation

- Log Book trip duration: elapsed time between the committed trip start and end transition timestamps, expressed in minutes and rounded half-up to two decimal places.
- Cancelled and incomplete trips remain distinct statuses in the event-derived trip history. They are not silently treated as completed trips by the duration calculation.

## Approved Loan calculation (narrow scope)

The fixed-rate, standard monthly reducing-balance Loan EMI quote and original amortization schedule are approved under [Finance Loan Calculation Contract v1](FINANCE_LOAN_CALCULATION_CONTRACT.md). This is a narrow calculation approval only; Finance remains without a persistent transaction ledger. The contract explicitly excludes prepayment re-amortization, payment allocation, broken-period interest, and early-settlement quotes until those workflows receive their own timing, transition, and regression approvals.

## Finance transaction approval still required

Before registering a production Finance calculation, the product owner must approve:
1. Which persisted transaction types count as income, expense, refund, cancellation fee, adjustment, and transfer.
2. Whether a value is recognized on transaction date, service date, due date, or settlement date.
3. Whether unpaid, partially paid, reversed, refunded, or disputed amounts are included.
4. Tax, discount, fee, rounding, currency, and historical-correction behavior.
5. The exact output definition and regression examples, including boundary and reversal cases.

No Finance calculation is registered while Finance has no persistent transaction model and these rules are undefined.

## Performance approval required

Before registering a production Performance calculation, approve:
1. Which trip and shift statuses are included in each metric.
2. Whether cancelled, unmatched, overlapping, and needs-attention trips count.
3. The exact period boundary and timezone rules.
4. The source and meaning of distance, fuel, income, and expense inputs; GPS endpoint distance must not be represented as driven distance.
5. Missing-data behavior, estimates versus actuals, rounding, and historical recalculation policy.
6. Expected results for representative normal, cancelled, incomplete, midnight-crossing, and corrected records.

The existing versioned calculation registry and regression-fixture enforcement are ready to host these definitions. Until they are approved, Finance and Performance remain unregistered rather than exposing plausible-looking but unaudited numbers.
