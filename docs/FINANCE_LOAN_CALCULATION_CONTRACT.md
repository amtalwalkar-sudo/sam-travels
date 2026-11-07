# Finance Loan Calculation Contract

**Status:** Approved calculation convention; implementation contract v1  
**Owner:** Finance  
**Scope:** Fixed-rate, standard monthly reducing-balance EMI quote and original amortization schedule  
**Currency:** INR  
**Business date:** Asia/Kolkata date supplied by the owning loan record

This contract defines the Finance-owned calculation used by Loan. Admin is a presentation/access point and must call the Finance capability; it must not calculate EMI, interest, principal allocation, outstanding balance, or schedules itself.

This contract is deliberately independent of forms, navigation, vehicle selection UI, persistence adapters, Room, and IndexedDB. Those layers may change without changing this calculation's inputs, outputs, or rules.

## 1. Approved convention

1. Convert the nominal annual interest rate to a monthly rate by dividing the annual rate by 12.
2. Use a standard monthly reducing-balance schedule. Each month's interest is calculated on that period's opening outstanding principal.
3. Calculate the regular EMI using the standard fixed-payment EMI formula.
4. Round the regular scheduled EMI to the nearest whole rupee using half-up rounding.
5. Store and return money as integer paise. Do not use binary floating point as the source of truth.
6. Calculate each monthly interest amount to the nearest paise using half-up rounding.
7. Adjust the final instalment to the exact remaining principal plus that period's interest, in paise, so the schedule closes at zero. This final adjusted amount may differ from the regular whole-rupee EMI.
8. Keep actual payments separate from the calculated scheduled amounts. This schedule is not evidence that a payment was made.

## 2. Input units and rate representation

- principalPaise: original principal as a positive integer number of paise.
- annualInterestRateBasisPoints: nominal annual percentage rate in basis points. 100 basis points = 1.00 percentage point; 1200 basis points = 12.00% per annum.
- tenureMonths: positive integer number of monthly instalments (maximum 1200 as a defensive calculation bound).
- loanStartDate: ISO calendar date (YYYY-MM-DD) on which the loan begins.
- firstEmiDate: ISO calendar date for the first due instalment. It must be the 1st day of a calendar month and later than loanStartDate. Subsequent due dates are the 1st of each following calendar month.

The UI may display the rate as a percentage, but the domain boundary converts it to integer basis points before calculation. Currency is INR; no implicit currency conversion is performed.

## 3. Formula and exact arithmetic

Let:

- P = principal in paise
- a = annual interest rate in basis points
- b = 120000
- r = a/b = monthly rate as a fraction
- n = tenure in months

The monthly rate is the nominal annual rate divided by 12. For example, 1200 basis points (12.00% annually) gives a monthly rate of 1200/120000 = 0.01 (1%).

For a non-zero rate:

EMI = P × r × (1+r)^n / ((1+r)^n - 1)

For zero interest:

EMI = P/n

The implementation uses integer/rational arithmetic (BigInt intermediates) for the formula and rounding; it must not use JavaScript floating-point arithmetic to derive persisted money.

- Regular EMI rounding: nearest whole rupee, half-up.
- Period interest: opening principal × monthly rate, rounded to the nearest paise, half-up.
- Principal component: instalment amount minus that period's interest.
- Closing principal: opening principal minus principal component.
- Final adjusted instalment: remaining opening principal plus final-period interest; closing principal must be exactly zero.
- A schedule that cannot reduce principal (including a regular EMI rounded to zero or no greater than first-period interest) is rejected as invalid rather than emitting a misleading schedule.

## 4. Monthly period and date semantics

The first EMI date anchors the monthly schedule. Every following due date is the 1st of the next calendar month. The schedule uses equal monthly periods and applies one monthly interest calculation per instalment.

Version 1 does not calculate daily interest, broken-period/stub interest between loan start and first EMI date, irregular payment-period interest, lender-specific day-count conventions, late fees, taxes, processing fees, or variable rates. A lender adjustment supplied as an actual payment remains separate actual-payment data; it must not silently change the standard calculation.

Loan start date and first EMI date are retained as separate facts. The first EMI date must not be silently inferred from loan start date.

## 5. Outputs and provenance

The Finance calculation returns:
- currency code (INR);
- monthly-rate numerator and denominator;
- regular scheduled EMI in paise;
- one schedule row per due instalment, containing due date, opening principal, interest, instalment amount, principal component, closing principal, and whether the final instalment was adjusted;
- total scheduled interest and total scheduled payments in paise.

Every execution is identified by calculation ID finance.loan-monthly-reducing-balance.v1, calculation version 1, input schema version 1, output schema version 1, and the loan start business date. The shared calculation registry executes the exact requested version and checks committed regression fixtures before publishing the calculation.

## 6. Explicit boundaries

This calculation does not infer or fabricate:
- actual EMI payments, payment dates, missed/partial payments, reversals, or lender adjustments;
- prepayment dates, allocation timing, or whether a lender applies a prepayment immediately or at the next instalment boundary;
- a revised tenure/EMI after prepayment;
- early-settlement quotes or lender-specific foreclosure charges.

Those are separate Finance-owned workflows/calculations and require their own explicit timing, allocation, transition, and regression contracts before implementation. The Admin Loan specification's prepayment and closure features must call those Finance contracts when approved; Admin must not implement substitute formulas.

## 7. Required regression coverage

Version 1 fixtures/tests cover:
- zero-interest principal division and final-instalment adjustment;
- nominal annual-to-monthly conversion;
- a representative 12% reducing-balance schedule;
- whole-rupee EMI half-up rounding;
- paise-level monthly-interest half-up rounding;
- first-of-month due-date progression across year boundaries;
- exact zero closing principal and sum-of-components invariants;
- invalid principal/rate/tenure/date inputs and non-amortizing rounded EMI;
- exact-version registry execution and calculation provenance.

Any change to formula, interest-period rounding, date semantics, or output shape requires a new calculation version and a reviewed historical-result policy. This v1 contract does not rewrite existing trip-duration calculations or any other feature's rules.
