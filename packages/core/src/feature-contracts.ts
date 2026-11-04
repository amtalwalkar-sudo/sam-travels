import type { FeatureDefinition, FeatureId } from "./features";

export type FeatureIntegrationContract = {
  id: string;
  version: number;
  producerFeatureId: FeatureId;
  consumerFeatureId: FeatureId;
  eventName: string;
  payloadVersion: number;
};

export type CalculationRounding = {
  mode: "none" | "half-up" | "half-even" | "floor" | "ceil";
  decimalPlaces: number;
};

export type CalculationRegressionCase<Input, Output> = {
  name: string;
  input: Input;
  expected: Output;
};

export type CalculationContract<Input, Output> = {
  id: string;
  ownerFeatureId: FeatureId;
  version: number;
  inputSchemaVersion: number;
  outputSchemaVersion: number;
  unit: string;
  effectiveDateField: string;
  rounding: CalculationRounding;
  calculate(input: Input): Output;
  regressionCases: CalculationRegressionCase<Input, Output>[];
};

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableSerialize).join(",") + "]";
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return "{" + Object.keys(object).sort().map(key =>
      JSON.stringify(key) + ":" + stableSerialize(object[key]),
    ).join(",") + "}";
  }
  return JSON.stringify(value);
}

/** Validate explicit producer/consumer contracts against the runtime feature graph. */
export function registerFeatureIntegrations(
  features: ReadonlyMap<FeatureId, FeatureDefinition>,
  contracts: FeatureIntegrationContract[],
): ReadonlyMap<string, FeatureIntegrationContract> {
  const registry = new Map<string, FeatureIntegrationContract>();
  for (const contract of contracts) {
    if (registry.has(contract.id)) throw new Error("Duplicate integration contract: " + contract.id);
    if (!contract.id || !contract.eventName || contract.version < 1 || contract.payloadVersion < 1) {
      throw new Error("Invalid integration contract: " + contract.id);
    }
    const producer = features.get(contract.producerFeatureId);
    const consumer = features.get(contract.consumerFeatureId);
    if (!producer || !consumer) throw new Error("Integration references an unregistered feature: " + contract.id);
    const dependsOnProducer = consumer.dependencies.some(dependency =>
      typeof dependency === "string"
        ? dependency === producer.id
        : dependency.id === producer.id && dependency.contractVersion === producer.contractVersion,
    );
    if (!dependsOnProducer) {
      throw new Error("Integration consumer must declare producer dependency: " + contract.id);
    }
    registry.set(contract.id, Object.freeze({ ...contract }));
  }
  return registry;
}

/**
 * Register versioned, pure domain calculations and execute their regression
 * fixtures immediately. UI and persistence code consume this contract; neither
 * owns or reimplements the formula.
 */
export function registerCalculations(
  features: ReadonlyMap<FeatureId, FeatureDefinition>,
  contracts: CalculationContract<unknown, unknown>[],
): ReadonlyMap<string, CalculationContract<unknown, unknown>> {
  const registry = new Map<string, CalculationContract<unknown, unknown>>();
  for (const contract of contracts) {
    if (registry.has(contract.id)) throw new Error("Duplicate calculation contract: " + contract.id);
    if (
      !contract.id ||
      !features.has(contract.ownerFeatureId) ||
      contract.version < 1 ||
      contract.inputSchemaVersion < 1 ||
      contract.outputSchemaVersion < 1 ||
      !contract.unit ||
      !contract.effectiveDateField ||
      !Number.isInteger(contract.rounding.decimalPlaces) ||
      contract.rounding.decimalPlaces < 0 ||
      contract.rounding.decimalPlaces > 12 ||
      contract.regressionCases.length === 0
    ) {
      throw new Error("Invalid calculation contract: " + contract.id);
    }
    for (const testCase of contract.regressionCases) {
      const actual = contract.calculate(testCase.input);
      if (stableSerialize(actual) !== stableSerialize(testCase.expected)) {
        throw new Error("Calculation regression failed: " + contract.id + ":" + testCase.name);
      }
    }
    registry.set(contract.id, Object.freeze({ ...contract }));
  }
  return registry;
}
