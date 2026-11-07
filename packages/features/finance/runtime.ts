import {
  type CalculationContract,
  type FeatureExtensionDefinition,
} from "../../core/src/index";
import {
  calculateLoanEmiQuote,
  type LoanCalculationInput,
  type LoanEmiQuote,
} from "./loan-calculation";

export const LOAN_EMI_CALCULATION: CalculationContract<LoanCalculationInput, LoanEmiQuote> = {
  id: "finance.loan-monthly-reducing-balance.v1",
  ownerFeatureId: "finance",
  version: 1,
  inputSchemaVersion: 1,
  outputSchemaVersion: 1,
  unit: "INR-paise-monthly-EMI-quote",
  effectiveDateField: "loanStartDate",
  rounding: { mode: "none", decimalPlaces: 0 },
  calculate: calculateLoanEmiQuote,
  regressionCases: [
    {
      name: "twelve-percent-nominal-annual-rate",
      input: {
        principalPaise: 10_000_000,
        annualInterestRateBasisPoints: 1200,
        tenureMonths: 12,
        loanStartDate: "2026-01-10",
        firstEmiDate: "2026-02-01",
      },
      expected: {
        currencyCode: "INR",
        monthlyRateNumerator: 1200,
        monthlyRateDenominator: 120000,
        regularEmiPaise: 888500,
      },
    },
    {
      name: "zero-interest",
      input: {
        principalPaise: 1_000_000,
        annualInterestRateBasisPoints: 0,
        tenureMonths: 3,
        loanStartDate: "2026-01-10",
        firstEmiDate: "2026-02-01",
      },
      expected: {
        currencyCode: "INR",
        monthlyRateNumerator: 0,
        monthlyRateDenominator: 120000,
        regularEmiPaise: 333300,
      },
    },
    {
      name: "half-rupee-emi-tie-rounds-up",
      input: {
        principalPaise: 100,
        annualInterestRateBasisPoints: 0,
        tenureMonths: 2,
        loanStartDate: "2026-01-01",
        firstEmiDate: "2026-01-01",
      },
      expected: {
        currencyCode: "INR",
        monthlyRateNumerator: 0,
        monthlyRateDenominator: 120000,
        regularEmiPaise: 100,
      },
    },
  ],
};

export const FINANCE_FEATURE_EXTENSION: FeatureExtensionDefinition = Object.freeze({
  id: "finance.calculations.v1",
  version: 1,
  featureId: "finance",
  publicEntryPoint: "packages/features/finance/index.ts",
  calculations: [LOAN_EMI_CALCULATION],
});
