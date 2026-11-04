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
  return JSON.stringify(value) ?? "undefined";
}

/** Validate explicit producer/consumer contracts against the runtime feature graph. */
export function registerFeatureIntegrations(
  features: ReadonlyMap<FeatureId, FeatureDefinition>,
  contracts: FeatureIntegrationContract[],
): ReadonlyMap<string, FeatureIntegrationContract> {
  const registry = new Map<string, FeatureIntegrationContract>();
  for (const contract of contracts) {
    if (registry.has(contract.id)) throw new Error("Duplicate integration contract: " + contract.id);
    if (!contract.id || !contract.eventName || !Number.isSafeInteger(contract.version) || contract.version < 1 || !Number.isSafeInteger(contract.payloadVersion) || contract.payloadVersion < 1) {
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
export function registerCalculations<Input, Output>(
  features: ReadonlyMap<FeatureId, FeatureDefinition>,
  contracts: CalculationContract<Input, Output>[],
): ReadonlyMap<string, CalculationContract<Input, Output>> {
  const registry = new Map<string, CalculationContract<Input, Output>>();
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
      !["none", "half-up", "half-even", "floor", "ceil"].includes(contract.rounding.mode) ||\n      !Number.isInteger(contract.rounding.decimalPlaces) ||
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

/** Apply a declared decimal rounding policy without changing the source formula. */
export function applyCalculationRounding(value: number, policy: CalculationRounding): number {
  if (!Number.isFinite(value)) throw new Error("Calculation output must be finite");
  if (policy.mode === "none") return value;
  const scale = 10 ** policy.decimalPlaces;
  const scaled = value * scale;
  let rounded: number;
  if (policy.mode === "floor") rounded = Math.floor(scaled);
  else if (policy.mode === "ceil") rounded = Math.ceil(scaled);
  else {
    const sign = Math.sign(scaled) || 1;
    const absolute = Math.abs(scaled);
    const lower = Math.floor(absolute);
    const fraction = absolute - lower;
    const tie = Math.abs(fraction - 0.5) <= Number.EPSILON * Math.max(1, absolute) * 2;
    const increment = policy.mode === "half-up"
      ? fraction >= 0.5
      : fraction > 0.5 || (tie && lower % 2 !== 0);
    rounded = sign * (lower + (increment ? 1 : 0));
  }
  return rounded / scale;
}

export type FeatureIntegrationMessage<Payload> = {
  integrationId: string;
  contractVersion: number;
  payloadVersion: number;
  eventId: string;
  occurredAt: string;
  payload: Payload;
};

export type FeatureIntegrationHandler<Payload> =
  (message: FeatureIntegrationMessage<Payload>) => void | Promise<void>;

/** Deliver only messages that match the registered integration and payload versions. */
export async function dispatchFeatureIntegration<Payload>(
  registry: ReadonlyMap<string, FeatureIntegrationContract>,
  message: FeatureIntegrationMessage<Payload>,
  handlers: Readonly<Record<string, FeatureIntegrationHandler<Payload>>>,
): Promise<void> {
  const contract = registry.get(message.integrationId);
  if (!contract) throw new Error("Unknown feature integration: " + message.integrationId);
  if (
    message.contractVersion !== contract.version ||
    message.payloadVersion !== contract.payloadVersion
  ) {
    throw new Error("Incompatible feature integration message: " + message.integrationId);
  }
  if (!message.eventId || !Number.isFinite(Date.parse(message.occurredAt))) {
    throw new Error("Invalid feature integration message envelope: " + message.integrationId);
  }
  const handler = handlers[contract.id];
  if (!handler) throw new Error("Missing feature integration handler: " + contract.id);
  await handler(message);
}

/** Execute a registered calculation only when the caller requests its exact version. */
export function runCalculation<Input, Output>(
  contract: CalculationContract<Input, Output>,
  input: Input,
  expectedVersion: number,
): Output {
  if (contract.version !== expectedVersion) {
    throw new Error("Incompatible calculation version: " + contract.id);
  }
  return contract.calculate(input);
}
