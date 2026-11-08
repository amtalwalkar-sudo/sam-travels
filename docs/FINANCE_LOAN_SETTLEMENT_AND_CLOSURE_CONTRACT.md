# Finance Loan Settlement and Closure — Simplified Contract

**Status:** Approved for implementation
**Scope:** Full settlement of a fixed-rate monthly reducing-balance loan
**Currency:** INR; all persisted amounts are integer paise

## Goal

Reuse the existing Finance payment ledger, Loan record, schedule and atomic repository support. Do not introduce a second settlement ledger, standalone closure record, settlement quote store, or separate lifecycle service.

## Settlement

1. Settlement is allowed only on an EMI due date in the schedule effective on that date.
2. Every EMI due through that date must already be fully paid and allocated. Partial, unallocated, or reversed payments do not count.
3. The settlement amount is the remaining principal after the settlement-date EMI, taken from the closing principal of that effective schedule row.
4. V1 adds no daily/stub interest, foreclosure fee, tax, or other adjustment.
5. The UI may show a preview, but it is not persisted. On confirmation, Finance rechecks the Loan and payment ledger revisions and recalculates eligibility and amount. If anything changed, reject and ask the user to refresh the preview.
6. Record settlement as a distinct `kind: "settlement"` entry in the existing Finance payment ledger. It is not an EMI allocation, regular EMI payment, or principal prepayment. The entry carries the amount, date, method/reference, command ID, effective schedule version, and paid-through installment.
7. In one existing atomic multi-record commit, append the settlement ledger entry and mark the Loan closed. If either write fails, neither is committed.
8. Command ID replay is idempotent. A conflicting reuse is rejected. A second settlement is rejected.

## Closed Loan

1. Store the Loan lifecycle state on the existing Loan record; an active Loan is the default for existing records.
2. A closed Loan remains readable, including its schedule, payments, prepayments and settlement entry.
3. Reject new EMI payments, reversals, prepayments, settlement attempts, and calculation-input edits after closure.
4. The settlement ledger entry is the immutable settlement/closure history. Do not create a duplicate closure-history record or a separate settlement aggregate.

## Backup and restore

Keep the existing Loan and Finance payment backup participants. Validate that a settlement entry links to an existing Loan and that the linked Loan is closed. A closed Loan must have exactly one settlement entry; an active Loan must have none. Preserve existing recovery-checkpoint safeguards.

## Required tests

- Successful settlement on an EMI date after all due EMIs are fully allocated.
- Reject non-EMI dates, unpaid/partial/unallocated/reversed EMIs, stale preview, nonpositive payoff and duplicate settlement.
- Verify payoff uses the effective schedule after prepayment.
- Verify settlement ledger entry and Loan closure commit together; simulated failure changes neither.
- Verify closed Loan blocks payments, reversals, prepayments, second settlement and calculation-input edits.
- Verify browser and Android persistence and backup/restore retain the settlement entry and closed state.
