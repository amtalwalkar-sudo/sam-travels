import type { FeatureDefinition } from "../../core/src/features";
import type { FeatureExtensionDefinition } from "../../core/src/feature-extension";
import type { CalculationContract } from "../../core/src/feature-contracts";
import { deriveFuelQuantityMilliKg } from "./calculations";

type FuelQuantityInputV1 = Readonly<{
  businessDate: string;
  amountPaise: number;
  pricePaisePerKg: number;
}>;

const fuelQuantityRegression: CalculationContract<FuelQuantityInputV1, number> = Object.freeze({
  id: "business-expenses.fuel-quantity-millikg.v1",
  ownerFeatureId: "business-expenses",
  version: 1,
  inputSchemaVersion: 1,
  outputSchemaVersion: 1,
  unit: "milli-kilograms",
  effectiveDateField: "businessDate",
  rounding: { mode: "none" as const, decimalPlaces: 0 },
  calculate: input => deriveFuelQuantityMilliKg(input.amountPaise, input.pricePaisePerKg),
  regressionCases: [
    { name: "exact-kilograms", input: { businessDate: "2026-11-14", amountPaise: 10000, pricePaisePerKg: 10000 }, expected: 1000 },
    { name: "half-up-to-one-gram", input: { businessDate: "2026-11-14", amountPaise: 10001, pricePaisePerKg: 10000 }, expected: 1000 },
    { name: "rounds-up-at-half-gram", input: { businessDate: "2026-11-14", amountPaise: 10005, pricePaisePerKg: 10000 }, expected: 1001 },
  ],
});

export const BUSINESS_EXPENSES_FEATURE = Object.freeze({
  id: "business-expenses",
  label: "Business Expenses",
  dataPolicy: "persistent",
  contractVersion: 1,
  dependencies: [
    { id: "platform", contractVersion: 1 },
    { id: "vehicle", contractVersion: 1, optional: true },
    { id: "driver-records", contractVersion: 1, optional: true },
    { id: "finance", contractVersion: 2, optional: true },
    { id: "compliance", contractVersion: 1, optional: true },
  ],
  persistence: {
    schemaVersion: 1,
    migrations: [],
    backup: { participantId: "business-expenses-records", snapshotVersion: 1, required: true },
    restore: { validatorId: "business-expenses-records-v1", required: true },
    lifecycle: { disableRetainsData: true, removalRequiresMigration: true },
  },
} as const satisfies FeatureDefinition);

export const BUSINESS_EXPENSE_CALCULATIONS = Object.freeze([fuelQuantityRegression]);

export const BUSINESS_EXPENSES_FEATURE_EXTENSION: FeatureExtensionDefinition = Object.freeze({
  id: "business-expenses.calculations.v1",
  version: 1,
  featureId: "business-expenses",
  publicEntryPoint: "packages/features/business-expenses/index.ts",
  feature: BUSINESS_EXPENSES_FEATURE,
  calculations: BUSINESS_EXPENSE_CALCULATIONS,
});
