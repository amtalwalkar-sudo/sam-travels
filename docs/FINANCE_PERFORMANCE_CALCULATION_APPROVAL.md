# Finance and Performance Calculation Approval Gate

This document records the current implementation boundary. It is not permission to invent accounting or performance policy.

## Current production calculation

- Log Book trip duration: elapsed time between the committed trip start and end transition timestamps, expressed in minutes and rounded half-up to two decimal places.
- Cancelled and incomplete trips remain distinct statuses in the event-derived trip history. They are not silently treated as completed trips by the duration calculation.

## Approved Loan calculation (narrow scope)

The fixed-rate, standard monthly reducing-balance Loan EMI quote and original amortization schedule are approved under [Finance Loan Calculation Contract v1](FINANCE_LOAN_CALCULATION_CONTRACT.md). The Finance payment ledger, fixed-EMI/shorter-tenure prepayment and settlement/closure are governed by their separate Finance owner contracts. Those contracts do not authorize lender-specific broken-period interest, fees, or early-settlement adjustments.

## Remaining Finance transaction gates

This generic gate does not reopen the product-owner-approved source dates and inclusion rules recorded in [Breakeven and Driver Target Calculation Contract v1.9](BREAKEVEN_AND_DRIVER_TARGET_CALCULATION_CONTRACT.md) and its linked source contracts. Any additional transaction type or treatment outside that frozen scope still requires explicit owner approval, an authoritative date/status rule, and regression fixtures. Do not add refunds, reversals, adjustments, transfers, tax or lender-specific charges to the breakeven scope.

## Performance approval required

Before registering any additional production Performance calculation beyond the approved full-cost breakeven source foundation, approve:
1. Which trip and shift statuses are included in each metric.
2. Whether cancelled, unmatched, overlapping, and needs-attention trips count.
3. The exact period boundary and timezone rules.
4. The source and meaning of distance, fuel, income, and expense inputs; GPS endpoint distance must not be represented as driven distance.
5. Missing-data behavior, estimates versus actuals, rounding, and historical recalculation policy.
6. Expected results for representative normal, cancelled, incomplete, midnight-crossing, and corrected records.

The existing versioned calculation registry and regression-fixture enforcement are ready to host these definitions. Until they are approved, Finance and Performance remain unregistered rather than exposing plausible-looking but unaudited numbers.
