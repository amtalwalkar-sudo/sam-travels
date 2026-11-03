# Phase 4 — Business Modules

## Current delivery slice

Phase 4 is in progress. This first vertical slice adds shared domain contracts, validation, repository-backed application services, and responsive PWA/Android forms for the business areas.

### Domain contracts delivered

- **Log Book:** dated trip records with origin/destination, completed/cancelled status, fare, cancellation fee, distance and notes.
- **Finance:** dated income/expense records with categories including fare, cancellation fee, fuel, maintenance and other.
- **Loans:** principal in paise, annual interest rate in basis points, tenure, start date and optional agreed EMI.
- **Vehicle:** registration, make/model, fuel type and odometer.
- **Maintenance:** dated service/repair record, cost, optional odometer and notes.
- **Compliance:** document type, reference, issue date and expiry date.
- **Business setup:** business name with INR and Asia/Kolkata defaults.

### Calculations and date rules

- Financial source values are integer paise; UI converts rupee input at the boundary.
- Loan EMI uses a reducing-balance monthly rate, with integer-paise rounding. An agreed EMI can be supplied when the rounded payment differs from the calculated EMI.
- Amortization schedules expose opening balance, interest, principal, EMI, prepayment and closing balance. Prepayments reduce outstanding principal and therefore reduce the remaining tenure while preserving the scheduled EMI.
- Performance supports explicit inclusive from/to dates and reports completed trips, fares, cancellation fees, gross income, fuel expenses and income after fuel. Cancellation fees are included in gross income.
- Historical business dates are accepted independently of the business setup date. Date validity is calendar-based; there is no start-date lockout.

### Persistence and presentation

- Business modules use versioned record envelopes and a shared application service; module records have stable namespaced IDs.
- Android records use the existing Room-authoritative repository; browser-only PWA records use Dexie/IndexedDB. No dual writes are introduced.
- Updates validate through domain rules. Archive uses a tombstone so the record is hidden from ordinary lists without silently deleting its history.
- The PWA/Android UI now exposes Log Book, Finance, Loans, Vehicle, Maintenance, Compliance, Performance and Business setup tabs. Entry forms are separate from domain validation and storage.
- All current business entry and calculation paths work locally without internet.

## Remaining Phase 4 work

- Loan payment/EMI history, marking schedule instalments paid, actual payment amount versus scheduled EMI, and a user-confirmed prepayment workflow.
- Full loan schedule and prepayment-impact presentation.
- Richer vehicle history and maintenance/compliance reminders and review flows.
- Expanded Admin configuration and module settings.
- More complete editing/reversal/audit UI and module-specific migration coverage.
- Broader UI/repository integration tests and Android device validation.

Do not treat this first slice as Phase 4 complete. The Phase 4 exit gate remains open until all listed module workflows, validations, historical-date handling, offline persistence, and regression tests pass without changing the Phase 3 driver workflow.
