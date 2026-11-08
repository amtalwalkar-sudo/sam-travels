# Finance Loan Early Settlement and Closure Contract

**Status:** Approved v1 contract
**Owner:** Finance
**Scope:** Full early settlement and permanent Loan closure for fixed-rate monthly reducing-balance loans
**Currency:** INR; persisted money uses integer paise

This contract is Finance-owned. Admin/UI may present quotes and commands but must not calculate settlement amounts or independently mutate payment, settlement, or lifecycle records.

## 1. Settlement eligibility and date

1. A settlement date must exactly match an EMI due date in the schedule version effective on that business date.
2. Every EMI due on or before the settlement date must be fully paid and allocated to its scheduled installment in the Finance payment ledger. Partial allocations, unallocated payment credit, or reversed payments do not satisfy this requirement.
3. Settlement is not eligible if any due installment through that date remains unpaid or under-allocated.
4. The schedule version effective on the settlement business date is authoritative. This includes schedule revisions created by approved prepayments.
5. Backdated settlement is not allowed when it precedes any committed payment, prepayment, or other Loan history entry.

## 2. Settlement amount (v1)

1. The payoff amount is the verified remaining principal after the EMI due on the settlement date has been fully paid and allocated.
2. Finance derives the remaining principal from the closing principal of the effective schedule row for that settlement installment, after validating payment allocations against that row's scheduled amount.
3. The payoff is persisted as integer paise and must be positive to create a settlement command.
4. v1 does not add daily interest, broken-period/stub interest, foreclosure charges, fees, taxes, lender-specific day-count conventions, or other uncontracted adjustments.
5. The quote must include the loan identity, business date, effective schedule version, loan revision, payment-ledger revision, verified paid-through installment, remaining principal, calculation/contract identifier and version, and a unique command identifier.

## 3. Quote freshness and commit

1. A quote is a preview only; it does not create a payment or close the Loan.
2. Confirmation must revalidate the eligibility conditions and all quoted revisions/identities. A stale quote is rejected and requires a fresh quote.
3. Settlement payment is a Finance-owned ledger entry distinct from EMI payment and principal prepayment. It must not be represented as an EMI allocation or prepayment.
4. The settlement command, Finance payment-ledger revision, Loan lifecycle state, and immutable settlement history must commit atomically using the repository's multi-record compare-and-set transaction boundary.
5. Commands are idempotent by command ID. Reusing a command ID with different inputs is rejected. Concurrent or duplicate settlement attempts must not result in duplicate settlement entries or closure.
6. A failed atomic commit leaves all records unchanged. The user may obtain a new quote and retry.
7. Settlement history is append-only and retains the quote provenance, amount, settlement date, ledger entry identity, and committed revisions.

## 4. Closure

1. Successful full settlement transitions the Loan to closed in the same atomic commit.
2. Closure history is immutable and references the settlement command, settlement payment, settlement date, amount, and effective schedule version.
3. A closed Loan rejects further EMI payments, reversals, principal prepayments, settlement attempts, calculation-input edits, and any other financial mutation. Read-only schedule and history access remains available.
4. A closure command is idempotent by command ID; a second distinct closure or settlement command is rejected.
5. Closure must never be performed by a UI-only flag or a separate non-atomic follow-up action.

## 5. Persistence and recovery

Settlement and closure records must be included in browser and native Android backup/restore participants. Restore validation must verify record identity, Loan linkage, ledger linkage, history invariants, and closed-state consistency. Existing recovery-checkpoint safeguards remain in force.

## 6. Required validation

- Eligible settlement on an EMI date with all due EMIs fully paid and allocated.
- Reject non-EMI date, unpaid/partial/under-allocated due EMI, reversed EMI, stale quote, backdated history conflict, and invalid/nonpositive payoff.
- Verify payoff derives from effective schedule revision, including prepayment-adjusted schedules.
- Idempotent replay and conflicting command-ID reuse.
- Concurrent settlement attempts serialize; no duplicate ledger entry or closure.
- Atomic failure leaves Loan, ledger, settlement, and closure records unchanged.
- Closed Loan blocks all financial mutations while read-only history remains accessible.
- Browser IndexedDB and Android Room persistence, backup/restore, validation, and recovery regression.
