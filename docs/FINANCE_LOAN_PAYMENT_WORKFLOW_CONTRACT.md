# Finance Loan Payment Workflow Contract

**Status:** Proposed v1 policy draft; not formally ratified as the authoritative payment-allocation policy. Loan payment UI and Finance service implementation are recorded separately in [Form Conformance Audit](FORM_CONFORMANCE_AUDIT.md). Existing implementation does not, by itself, approve every proposal in this draft.  
**Owner:** Finance  
**Scope:** Recording actual loan payments and allocating them against scheduled EMI obligations  
**Currency:** INR; all persisted amounts are integer paise  
**Business date:** Asia/Kolkata date supplied by the payment command

This contract extends the approved Finance Loan calculation contract without changing its formula or historical schedule versions. Finance owns payment records, allocations, idempotency, correction history, and payment status. Admin is only a presentation/access point and must call Finance application services.

## 1. Proposed allocation policy (not ratified)

1. By default, apply a payment to the oldest due EMI with an unpaid amount, then continue chronologically to later due EMIs.
2. The user may review and manually adjust the proposed allocation before the payment is committed. The final allocation must not exceed the payment amount or the unpaid amount of each selected EMI.
3. A payment may partially satisfy an EMI. The remaining unpaid amount stays outstanding against that EMI.
4. Any amount not allocated to an EMI remains explicitly **unallocated credit**. It is not silently treated as principal prepayment, advance EMI, or a payment against a future EMI.
5. Unallocated credit may be processed only through a separately approved Finance workflow (for example, prepayment). Until then it remains visible and unchanged.
6. Allocation is against the due amount of a specific immutable schedule version and installment number. A payment must never be silently moved to a different schedule version after a schedule revision.

The default allocator is deterministic. Given the same loan, selected schedule version, payment date, amount, and existing durable allocation history, it proposes the same allocation.

## 2. Payment record

A committed payment records:

- stable payment ID and stable command/idempotency ID;
- loan ID;
- payment business date (ISO calendar date; historical dates are permitted);
- amount in integer paise, strictly positive;
- payment method as a controlled Finance value;
- optional external transaction/reference identifier;
- optional user note;
- selected schedule version;
- creation timestamp and application provenance;
- status and append-only correction/reversal linkage.

The payment date is the date the user says the payment occurred. The creation timestamp is when the app durably recorded it. They are distinct facts and must not be substituted for one another.

A payment's method and reference are descriptive evidence. The app must not claim that a bank, lender, or payment provider independently verified receipt.

## 3. Allocation record

Each allocation records:

- stable allocation ID;
- payment ID and loan ID;
- schedule version and installment number;
- allocated amount in integer paise;
- creation timestamp and provenance.

For a committed payment:

- sum(allocations) must be less than or equal to payment amount;
- each allocation must be positive;
- total allocations to an installment must not exceed that installment's remaining unpaid scheduled amount;
- unallocated credit = payment amount minus sum(allocations);
- the allocation must reference an installment present in the recorded schedule version;
- no allocation may be created against a future EMI before its due date unless a later contract explicitly authorizes advance EMI treatment.

The payment workflow tracks coverage of scheduled EMI amounts. It does **not** infer a lender's interest/principal accounting, daily accrued interest, late charges, taxes, fees, or lender-side balance. Those require separately approved Finance rules and evidence. Until such a rule is approved, the UI must not label an inferred value as the lender-confirmed outstanding principal or payment-adjusted principal balance.

## 4. Schedule-version relationship

- Every payment allocation is permanently linked to the schedule version selected when it was recorded.
- Creating a new original schedule version does not rewrite, delete, or silently reallocate historical payment allocations.
- The user must explicitly select the applicable schedule version when recording a payment if more than one version could apply; the UI must explain the version/date context.
- The Finance service validates that the referenced schedule version and installment exist.
- A schedule revision cannot erase prior payment history. If a revision makes future EMI obligations different, treatment of already recorded allocations against the revised obligations requires an explicit Finance transition policy; no automatic migration is permitted in v1.

## 5. Corrections, reversals, and duplicates

- A stable command ID is required for every write. Replaying the same command returns the original durable outcome and must not create a duplicate payment or allocation.
- A payment is never hard-deleted after commit.
- A correction is represented by a linked compensating reversal/cancellation record and, when appropriate, a new replacement payment. The original payment and allocations remain inspectable.
- A reversal must identify the payment being reversed, reason, business date, actor/provenance, and stable command ID.
- A reversal and its allocation effects commit atomically. Partial reversal state is forbidden in v1; reverse the full payment, then record the corrected payment.
- A payment cannot be reversed twice. Duplicate reversal commands return the prior outcome; conflicting reversals fail closed.
- A correction must not silently change the original payment date, amount, method, reference, or allocation rows.

## 6. Atomicity and persistence

Payment creation, its allocations, and the derived unallocated-credit amount form one Finance-owned business operation. They must commit atomically through the authoritative platform repository (Android Room on Android; browser IndexedDB only in browser-only PWA).

If the current repository abstraction cannot guarantee a multi-record atomic transaction, Finance must use a journalled/recoverable operation with durable idempotency and failure-injection tests before enabling the write. No partial payment, allocation, or unallocated-credit state may become visible.

The service must enforce revision checks and validate the loan, schedule version, installment, amount bounds, and existing allocations at the authoritative write boundary. UI validation alone is insufficient.

## 7. Derived EMI status

For each installment, Finance may derive:

- scheduled amount from the referenced immutable schedule;
- allocated amount from non-reversed committed allocations;
- remaining scheduled amount = scheduled amount minus allocated amount;
- status: unpaid, partially paid, or paid.

An EMI is paid only when its remaining scheduled amount is exactly zero. A payment against one EMI does not imply that another EMI is paid. The status is a derived view, not a separately editable fact.

Overdue status may be shown only by comparing the installment due date with an explicit Finance business date. This contract does not add late fees or penalties.

## 8. Backup, restore, lifecycle, and privacy

Payment and allocation records are part of the existing Finance backup participant and restore validator. Restore validation must check:

- stable and unique IDs;
- correct Finance namespace and loan ownership;
- supported schema versions;
- payment amount and allocation integer/range invariants;
- schedule-version and installment references;
- idempotency-key uniqueness;
- correction/reversal links and absence of cycles or duplicate reversals;
- atomic-operation journal consistency, if journalling is used.

Backup/restore must round-trip payments, allocations, reversals, and unallocated credit as one coherent Finance history. Loan deletion or feature disablement must not erase repayment history. Sensitive external references must be displayed only where needed and never used as authentication credentials.

## 9. Required tests before implementation acceptance

- default oldest-due-first allocation across multiple unpaid EMIs;
- manual allocation override and validation;
- partial payment and subsequent completion of the same EMI;
- payment spanning more than one EMI;
- excess amount retained as unallocated credit;
- no automatic conversion of excess into prepayment or future EMI;
- historical payment dates;
- invalid/over-limit/zero/negative paise amounts;
- allocation to nonexistent, future, or wrong-version installment rejected;
- payment and allocation totals reconcile exactly in integer paise;
- duplicate command replay is idempotent;
- duplicate/conflicting reversal rejected; full reversal and replacement retain history;
- concurrent writes and stale revisions fail safely;
- interruption at each persistence boundary leaves no partial business effect;
- browser and Android backup/restore round-trip, including malformed/cross-linked data rejection;
- schedule revision does not mutate historical payment allocations;
- no inferred lender balance, fees, interest allocation, or principal balance appears in the UI.

## 10. Explicit exclusions and follow-on gates

This contract does not authorize:

- prepayment or application of unallocated credit to principal;
- lender-specific interest/principal allocation, daily accrual, penalties, fees, or reconciliation;
- schedule re-amortization after prepayment;
- early-settlement quotes, foreclosure charges, settlement payment, or loan closure;
- automatic allocation migration when a new schedule version is created.

Each requires its own Finance-owned contract and tests. This proposal must not be read as a current instruction to disable the already-implemented Loan payment UI. The current runtime implementation and its tests are tracked in [Form Conformance Audit](FORM_CONFORMANCE_AUDIT.md). Before this draft is treated as the normative allocation policy, its rules must be explicitly ratified against the implemented Finance service and tests. Do not infer approval of any excluded workflow from this proposal.
