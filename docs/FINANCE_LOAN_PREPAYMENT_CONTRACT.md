# Finance Loan Prepayment Contract v1

**Status:** Approved Reduce Tenure behaviour; the Finance-owned calculation, record validator and service implement this mode. The Reduce EMI alternative is not part of the owner's approved workflow. Runtime conformance remains subject to the exact-SHA audit.  
**Owner:** Finance.  
**Calculation dependency:** `finance.loan-monthly-reducing-balance.v1` (unchanged).

## 1. Purpose and scope

Define the single approved Finance-owned principal-prepayment behaviour: **Reduce Tenure**. Retain the current regular EMI and scheduled due dates, reduce principal by the accepted prepayment amount, and shorten the remaining repayment period. A Reduce EMI option is not approved for this workflow and must not be exposed or accepted.

A prepayment is a principal reduction, not an EMI payment, a payment allocation, a settlement, or a loan closure. The existing payment ledger remains the source of actual EMI payment facts. This contract does not authorize settlement or closure.

The implementation adds no new interest convention. It reuses the registered monthly reducing-balance convention, annual-to-monthly conversion, integer-paise arithmetic, and monthly-interest rounding unchanged. It does **not** alter or overload `finance.loan-monthly-reducing-balance.v1`: that calculation derives EMI from a fixed tenure, so it cannot by itself implement Reduce Tenure with a fixed EMI. The Finance runtime uses the separately registered calculation `finance.loan-prepayment-reamortization.v1`, which retains the existing regular EMI and solves the shortened payoff horizon.

## 2. Approved user-visible behaviour

A prepayment command records:

- loan identity;
- unique command/idempotency identity;
- business date;
- positive amount in INR paise;
- selected mode (`reduce_tenure` only);
- creation timestamp and source/provenance;
- the schedule version and payment-ledger revision against which it was accepted;
- resulting schedule version and calculation provenance.

The UI presents a preview before confirmation: principal immediately before prepayment, prepayment amount, principal after prepayment, selected mode, resulting EMI, resulting remaining installment count / final due date, and estimated interest saved against the no-prepayment baseline from the same effective point.

The user must explicitly confirm the preview. The preview is not a committed transaction and must be recalculated if its source revisions change.

## 3. Eligibility and amount rules

1. The loan must exist, be active for repayment, and have a valid current schedule.
2. The business date must be a valid ISO calendar date and must not precede the loan start date.
3. The amount must be a positive safe integer number of paise.
4. The prepayment must be greater than zero and strictly less than the verified principal outstanding. A full payoff belongs to the separately gated settlement/closure workflow; it must not be represented as a prepayment.
5. **Due-EMI guard:** every scheduled installment with a due date on or before the prepayment business date must be fully paid and allocated to that loan. If any such installment is unpaid or partially paid, reject the prepayment with a stable reason code. The user must record/correct the EMI payment first. Do not silently deduct overdue EMI amounts from the prepayment.
6. Unallocated payment credit is not an EMI allocation and must not be treated as proof that an installment is paid.
7. A prepayment must never be used to create a negative principal balance or an implicit cash refund.

The principal outstanding is derived from the Finance amortization schedule after applying the verified, fully paid installments due through the prepayment date. Actual payment records remain authoritative for whether those installments were paid; the schedule supplies their principal components. Do not infer payment from elapsed time or from a payment amount alone.

## 4. Effective date and schedule construction

The prepayment takes effect after all eligible installments due on or before its business date have been fully paid and allocated, and before the next unpaid installment. The resulting schedule begins with the next unpaid installment's due date and uses the principal outstanding after those paid installments, less the prepayment.

The original schedule and every prior re-amortized schedule are immutable. The prepayment creates a new schedule revision with a complete input snapshot, output, calculation ID/version, schema versions, effective date, source prepayment identity, and provenance. Historical schedules remain readable and must never be rewritten.

### 4.1 Reduce Tenure

- Keep the current regular EMI in paise unchanged.
- Use the separately registered prepayment re-amortization calculation to recalculate monthly interest and principal components from the reduced opening principal using the existing Finance monthly reducing-balance convention.
- Continue at the unchanged regular EMI until the final adjusted installment.
- End as soon as the remaining principal and accrued scheduled interest are fully repaid; the final installment may be smaller than the regular EMI.
- The resulting number of installments / final due date may be shorter; it must not be longer than the no-prepayment baseline from the same effective point.

### 4.2 Explicitly unsupported alternative

Reduce EMI is not an approved mode for this workflow. The regular EMI amount and regular due dates remain unchanged after prepayment; only the principal and remaining tenure change. Do not expose a Reduce EMI selector or accept a reduce_emi command.

If no installments remain, the loan is not eligible for prepayment; use the separately gated settlement/closure process.

## 5. Interest-saved comparison

Interest saved is a projection, not a guaranteed lender quote. Calculate it as:

`interestSavedPaise = baselineRemainingInterestPaise - revisedRemainingInterestPaise`

Both schedules must start from the same verified principal and next installment date, use the same rate and calculation version, and include the same already-paid installment history. The baseline is the remaining schedule without this prepayment; the revised schedule is after applying it. Never compare lifetime totals from different starting points. If the result is negative or cannot be reproduced, reject the preview/command rather than display misleading savings.

## 6. Persistence, ownership, and atomicity

- Finance exclusively owns prepayment commands, prepayment history, schedule re-amortization, and resulting principal projections.
- Work, Timeline, UI components, and other features may consume only a versioned Finance public query/command contract. They must not read Finance tables or mutate schedule rows.
- Payment facts remain in the Finance-owned payment ledger. A prepayment must not rewrite, reverse, or reallocate EMI payment entries.
- A committed prepayment and its resulting schedule revision must be indivisible: either both are persisted and visible, or neither is.
- Repeated delivery of the same command ID with identical canonical input returns the original committed result. Reuse of a command ID with different input is rejected.
- Concurrent prepayments, loan edits, and EMI payment writes must not both commit against stale principal/payment state. A compare-and-swap on the loan record alone is insufficient while payment facts live in a separate record. Implementation must provide a proven serialization/atomic-command boundary across the loan schedule state and payment-ledger revision (or a single Finance aggregate transaction). Do not ship a best-effort read-then-write implementation.
- The command must validate expected loan revision, current schedule version, and payment-ledger revision at commit. A stale preview is rejected with a stable conflict code and must be refreshed.
- If the existing repository cannot provide the required cross-record atomicity/serialization, keep the prepayment command and UI disabled until that infrastructure is implemented and tested.

## 7. Validation and audit invariants

- Prepayment IDs and command IDs are unique within their defined Finance scope.
- Every committed prepayment links to exactly one loan and one prior schedule version.
- Every resulting schedule version links back to exactly one accepted prepayment.
- Amounts, principal balances, interest, EMI, and totals use safe integer paise; no floating-point currency arithmetic.
- Every schedule is reproducible from its immutable inputs and the registered calculation version.
- Prior payment entries, allocations, schedule versions, and prepayment entries remain immutable.
- The schedule's remaining principal must equal the previous verified principal less the accepted prepayment amount.
- Reduce Tenure preserves regular EMI and due dates; the final due date moves earlier. Reduce EMI is unsupported.
- No prepayment can be committed if any EMI due through its business date is unpaid/partially paid.
- Backup, restore, migration, and record validation must include all committed prepayment history and schedule provenance. Restore must reject malformed, non-reproducible, cross-linked, or internally inconsistent records.
- No automatic lender fee, penalty, tax, rebate, or interest adjustment is inferred. If such lender-specific charges are later required, they need an explicit separately approved field and calculation contract.

## 8. Required regression coverage before enabling the feature

1. Reduce Tenure with positive interest and zero interest.
2. Principal reductions that preserve the regular EMI, shorten the remaining tenure, and produce a final adjusted installment.
3. One-paise boundaries, rounding ties, large safe-integer amounts, and invalid/over-principal amounts.
4. Fully paid due installments; unpaid and partially paid due installments; unallocated credit without installment allocation.
5. Prepayment before the first EMI, on an EMI due date after payment, and between EMI due dates.
6. Reject full payoff and zero remaining installments.
7. Idempotent replay; command-ID payload mismatch; concurrent duplicate commands.
8. Concurrent EMI payment, reversal/correction, loan edit, and prepayment conflict tests proving no stale-balance double commit.
9. Immutable historical schedules and payment records.
10. Backup/restore round-trip, malformed snapshot rejection, and calculation-provenance reproduction.
11. Interest-saved baseline and revised schedule equivalence from the same effective point.
12. UI preview refresh and confirmation rejection when loan/payment revisions change.

## 9. Explicit non-goals / separate gates

This contract does not implement or authorize:
- early-settlement quotes or full payoff;
- loan closure or reopening;
- lender foreclosure fees, penalties, waivers, or negotiated rebates;
- changing the interest rate or original loan terms;
- editing or deleting prior EMI payment facts;
- automatic bank/lender reconciliation.

Each requires its own Finance-owned contract and regression coverage.
