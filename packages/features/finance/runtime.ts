import type { FeatureDefinition } from "../../core/src/features";
import {
  type CalculationContract,
  type FeatureExtensionDefinition,
} from "../../core/src/index";
import {
  buildLoanAmortizationSchedule,
  type LoanAmortizationSchedule,
  type LoanCalculationInput,
} from "./loan-calculation";

const standardInput: LoanCalculationInput = {
  principalPaise: 10_000_000,
  annualInterestRateBasisPoints: 1200,
  tenureMonths: 12,
  loanStartDate: "2026-01-10",
  firstEmiDate: "2026-02-01",
};

const standardSchedule: LoanAmortizationSchedule = {
  currencyCode: "INR",
  principalPaise: 10_000_000,
  annualInterestRateBasisPoints: 1200,
  tenureMonths: 12,
  monthlyRateNumerator: 1200,
  monthlyRateDenominator: 120000,
  regularEmiPaise: 888500,
  rows: [
    { installmentNumber: 1, dueDate: "2026-02-01", openingPrincipalPaise: 10000000, interestPaise: 100000, installmentAmountPaise: 888500, principalComponentPaise: 788500, closingPrincipalPaise: 9211500, finalAdjusted: false },
    { installmentNumber: 2, dueDate: "2026-03-01", openingPrincipalPaise: 9211500, interestPaise: 92115, installmentAmountPaise: 888500, principalComponentPaise: 796385, closingPrincipalPaise: 8415115, finalAdjusted: false },
    { installmentNumber: 3, dueDate: "2026-04-01", openingPrincipalPaise: 8415115, interestPaise: 84151, installmentAmountPaise: 888500, principalComponentPaise: 804349, closingPrincipalPaise: 7610766, finalAdjusted: false },
    { installmentNumber: 4, dueDate: "2026-05-01", openingPrincipalPaise: 7610766, interestPaise: 76108, installmentAmountPaise: 888500, principalComponentPaise: 812392, closingPrincipalPaise: 6798374, finalAdjusted: false },
    { installmentNumber: 5, dueDate: "2026-06-01", openingPrincipalPaise: 6798374, interestPaise: 67984, installmentAmountPaise: 888500, principalComponentPaise: 820516, closingPrincipalPaise: 5977858, finalAdjusted: false },
    { installmentNumber: 6, dueDate: "2026-07-01", openingPrincipalPaise: 5977858, interestPaise: 59779, installmentAmountPaise: 888500, principalComponentPaise: 828721, closingPrincipalPaise: 5149137, finalAdjusted: false },
    { installmentNumber: 7, dueDate: "2026-08-01", openingPrincipalPaise: 5149137, interestPaise: 51491, installmentAmountPaise: 888500, principalComponentPaise: 837009, closingPrincipalPaise: 4312128, finalAdjusted: false },
    { installmentNumber: 8, dueDate: "2026-09-01", openingPrincipalPaise: 4312128, interestPaise: 43121, installmentAmountPaise: 888500, principalComponentPaise: 845379, closingPrincipalPaise: 3466749, finalAdjusted: false },
    { installmentNumber: 9, dueDate: "2026-10-01", openingPrincipalPaise: 3466749, interestPaise: 34667, installmentAmountPaise: 888500, principalComponentPaise: 853833, closingPrincipalPaise: 2612916, finalAdjusted: false },
    { installmentNumber: 10, dueDate: "2026-11-01", openingPrincipalPaise: 2612916, interestPaise: 26129, installmentAmountPaise: 888500, principalComponentPaise: 862371, closingPrincipalPaise: 1750545, finalAdjusted: false },
    { installmentNumber: 11, dueDate: "2026-12-01", openingPrincipalPaise: 1750545, interestPaise: 17505, installmentAmountPaise: 888500, principalComponentPaise: 870995, closingPrincipalPaise: 879550, finalAdjusted: false },
    { installmentNumber: 12, dueDate: "2027-01-01", openingPrincipalPaise: 879550, interestPaise: 8796, installmentAmountPaise: 888346, principalComponentPaise: 879550, closingPrincipalPaise: 0, finalAdjusted: true },
  ],
  totalInterestPaise: 661846,
  totalScheduledPaymentsPaise: 10661846,
};

const zeroInterestInput: LoanCalculationInput = {
  principalPaise: 1_000_000,
  annualInterestRateBasisPoints: 0,
  tenureMonths: 3,
  loanStartDate: "2026-01-10",
  firstEmiDate: "2026-02-01",
};

const zeroInterestSchedule: LoanAmortizationSchedule = {
  currencyCode: "INR",
  principalPaise: 1_000_000,
  annualInterestRateBasisPoints: 0,
  tenureMonths: 3,
  monthlyRateNumerator: 0,
  monthlyRateDenominator: 120000,
  regularEmiPaise: 333300,
  rows: [
    { installmentNumber: 1, dueDate: "2026-02-01", openingPrincipalPaise: 1000000, interestPaise: 0, installmentAmountPaise: 333300, principalComponentPaise: 333300, closingPrincipalPaise: 666700, finalAdjusted: false },
    { installmentNumber: 2, dueDate: "2026-03-01", openingPrincipalPaise: 666700, interestPaise: 0, installmentAmountPaise: 333300, principalComponentPaise: 333300, closingPrincipalPaise: 333400, finalAdjusted: false },
    { installmentNumber: 3, dueDate: "2026-04-01", openingPrincipalPaise: 333400, interestPaise: 0, installmentAmountPaise: 333400, principalComponentPaise: 333400, closingPrincipalPaise: 0, finalAdjusted: true },
  ],
  totalInterestPaise: 0,
  totalScheduledPaymentsPaise: 1_000_000,
};

export const LOAN_EMI_CALCULATION: CalculationContract<LoanCalculationInput, LoanAmortizationSchedule> = {
  id: "finance.loan-monthly-reducing-balance.v1",
  ownerFeatureId: "finance",
  version: 1,
  inputSchemaVersion: 1,
  outputSchemaVersion: 1,
  unit: "INR-paise-monthly-amortization-schedule",
  effectiveDateField: "loanStartDate",
  rounding: { mode: "none", decimalPlaces: 0 },
  calculate: buildLoanAmortizationSchedule,
  regressionCases: [
    { name: "twelve-percent-nominal-annual-rate", input: standardInput, expected: standardSchedule },
    { name: "zero-interest-with-final-adjustment", input: zeroInterestInput, expected: zeroInterestSchedule },
  ],
};

/** Finance promotes its existing built-in identity to the approved persistent contract. */
export const FINANCE_FEATURE = Object.freeze({
  id: "finance",
  label: "Finance",
  dataPolicy: "persistent",
  contractVersion: 2,
  dependencies: [{ id: "platform", contractVersion: 1 }],
  persistence: {
    schemaVersion: 1,
    migrations: [],
    backup: { participantId: "finance-records", snapshotVersion: 1, required: true },
    restore: { validatorId: "finance-records-v1", required: true },
    lifecycle: { disableRetainsData: true, removalRequiresMigration: true },
  },
} as const satisfies FeatureDefinition);

export const FINANCE_FEATURE_EXTENSION: FeatureExtensionDefinition = Object.freeze({
  id: "finance.calculations.v1",
  version: 1,
  featureId: "finance",
  publicEntryPoint: "packages/features/finance/index.ts",
  calculations: [LOAN_EMI_CALCULATION],
});
