import { createReadonlyRegistry } from "./readonly-registry";
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
  /** Direct input property containing the ISO business-effective date (YYYY-MM-DD). */
  effectiveDateField: string;
  rounding: CalculationRounding;
  calculate(input: Input): Output;
  regressionCases: CalculationRegressionCase<Input, Output>[];
};

/**
 * Calculation inputs, outputs, and regression fixtures are data, not mutable
 * application state. Copy JSON-shaped values and freeze the copy before
 * handing them to calculation code. Reject cycles and non-data values.
 */
function cloneFrozenCalculationData<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Calculation data must contain finite numbers");
    return value;
  }
  if (typeof value !== "object") throw new Error("Calculation data must be JSON-compatible");
  const source = value as object;
  if (seen.has(source)) throw new Error("Calculation data cannot contain cycles");
  seen.add(source);
  let copy: object;
  if (Array.isArray(value)) {
    copy = value.map(item => cloneFrozenCalculationData(item, seen));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("Calculation data must contain only plain objects and arrays");
    }
    const record: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      record[key] = cloneFrozenCalculationData(item, seen);
    }
    copy = record;
  }
  seen.delete(source);
  return Object.freeze(copy) as T;
}

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

function validIsoBusinessDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
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
  return createReadonlyRegistry(registry);
}

/** Register versioned, pure domain calculations and execute their regression fixtures immediately. */
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
      !Number.isSafeInteger(contract.version) || contract.version < 1 ||
      !Number.isSafeInteger(contract.inputSchemaVersion) || contract.inputSchemaVersion < 1 ||
      !Number.isSafeInteger(contract.outputSchemaVersion) || contract.outputSchemaVersion < 1 ||
      !contract.unit ||
      !contract.effectiveDateField ||
      !["none", "half-up", "half-even", "floor", "ceil"].includes(contract.rounding.mode) ||
      !Number.isInteger(contract.rounding.decimalPlaces) ||
      contract.rounding.decimalPlaces < 0 ||
      contract.rounding.decimalPlaces > 12 ||
      !Array.isArray(contract.regressionCases) ||
      contract.regressionCases.length === 0
    ) {
      throw new Error("Invalid calculation contract: " + contract.id);
    }
    for (const testCase of contract.regressionCases) {
      if (!validIsoBusinessDate((testCase.input as Record<string, unknown>)[contract.effectiveDateField])) {
        throw new Error("Calculation regression case has invalid effective date: " + contract.id + ":" + testCase.name);
      }
      const immutableInput = cloneFrozenCalculationData(testCase.input);
      const actual = cloneFrozenCalculationData(contract.calculate(immutableInput));
      const expected = typeof testCase.expected === "number"
        ? applyCalculationRounding(testCase.expected, contract.rounding)
        : testCase.expected;
      const normalized = typeof actual === "number"
        ? applyCalculationRounding(actual, contract.rounding)
        : actual;
      if (stableSerialize(normalized) !== stableSerialize(expected)) {
        throw new Error("Calculation regression failed: " + contract.id + ":" + testCase.name);
      }
    }
    registry.set(contract.id, Object.freeze({
      ...contract,
      rounding: Object.freeze({ ...contract.rounding }),
      regressionCases: Object.freeze(contract.regressionCases.map(testCase => Object.freeze({
        name: testCase.name,
        input: cloneFrozenCalculationData(testCase.input),
        expected: cloneFrozenCalculationData(testCase.expected),
      }))) as CalculationRegressionCase<Input, Output>[],
    }));
  }
  return createReadonlyRegistry(registry);
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
  eventName: string;
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
    message.payloadVersion !== contract.payloadVersion ||
    message.eventName !== contract.eventName
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

/** Execute the exact calculation version and apply its declared date and rounding policy. */
export function runCalculation<Input, Output>(
  contract: CalculationContract<Input, Output>,
  input: Input,
  expectedVersion: number,
): Output {
  if (contract.version !== expectedVersion) {
    throw new Error("Incompatible calculation version: " + contract.id);
  }
  if (!validIsoBusinessDate((input as Record<string, unknown>)[contract.effectiveDateField])) {
    throw new Error("Invalid calculation effective date: " + contract.id);
  }
  const immutableInput = cloneFrozenCalculationData(input);
  const result = contract.calculate(immutableInput);
  const normalized = typeof result === "number"
    ? applyCalculationRounding(result, contract.rounding)
    : result;
  return cloneFrozenCalculationData(normalized) as Output;
}


export type CalculationExecutionResult<Output = unknown> = Readonly<{
  calculationId: string;
  ownerFeatureId: FeatureId;
  version: number;
  inputSchemaVersion: number;
  outputSchemaVersion: number;
  effectiveDate: string;
  unit: string;
  value: Output;
}>;

/**
 * Execute a calculation by its registered identity, not by a UI-held function.
 * The result carries the exact rule/schema versions and effective date so
 * callers can retain provenance without duplicating formula logic.
 */
export function executeRegisteredCalculation<Input, Output>(
  registry: ReadonlyMap<string, CalculationContract<any, any>>,
  calculationId: string,
  input: Input,
  expected: { version: number; inputSchemaVersion: number; outputSchemaVersion: number },
): CalculationExecutionResult<Output> {
  const contract = registry.get(calculationId);
  if (!contract) throw new Error("Unknown calculation: " + calculationId);
  if (contract.inputSchemaVersion !== expected.inputSchemaVersion) {
    throw new Error("Incompatible calculation input schema: " + calculationId);
  }
  if (contract.outputSchemaVersion !== expected.outputSchemaVersion) {
    throw new Error("Incompatible calculation output schema: " + calculationId);
  }
  const typedContract = contract as CalculationContract<Input, Output>;
  const value = runCalculation(typedContract, input, expected.version);
  const effectiveDate = (input as Record<string, unknown>)[contract.effectiveDateField];
  if (typeof effectiveDate !== "string") {
    throw new Error("Invalid calculation effective date: " + calculationId);
  }
  return Object.freeze({
    calculationId: contract.id,
    ownerFeatureId: contract.ownerFeatureId,
    version: contract.version,
    inputSchemaVersion: contract.inputSchemaVersion,
    outputSchemaVersion: contract.outputSchemaVersion,
    effectiveDate,
    unit: contract.unit,
    value,
  });
}
