import { describe, expect, it } from "vitest";
import { registerFeatures } from "../packages/core/src/features";
import { initializeRuntimeRegistry } from "../packages/core/src/runtime-registry";
import {
  applyCalculationRounding,
  executeRegisteredCalculation,
  dispatchFeatureIntegration,
  runCalculation,
  registerCalculations,
  registerFeatureIntegrations,
  type CalculationContract,
  type FeatureIntegrationContract,
} from "../packages/core/src/feature-contracts";

describe("versioned feature integration contracts", () => {
  const features = registerFeatures();

  it("requires the consumer to declare its producer dependency", () => {
    const integration: FeatureIntegrationContract = {
      id: "performance.work-events.v1",
      version: 1,
      producerFeatureId: "work",
      consumerFeatureId: "performance",
      eventName: "work.event-committed",
      payloadVersion: 1,
    };
    expect(registerFeatureIntegrations(features, [integration]).get(integration.id)).toEqual(integration);
    expect(() => registerFeatureIntegrations(features, [{
      ...integration,
      consumerFeatureId: "admin",
    }])).toThrow("Integration consumer must declare producer dependency");
  });

  it("dispatches only messages matching the registered integration versions", async () => {
    const integration: FeatureIntegrationContract = {
      id: "performance.work-events.v1",
      version: 1,
      producerFeatureId: "work",
      consumerFeatureId: "performance",
      eventName: "work.event-committed",
      payloadVersion: 1,
    };
    const registry = registerFeatureIntegrations(features, [integration]);
    const received: string[] = [];
    const message = {
      integrationId: integration.id,
      contractVersion: 1,
      payloadVersion: 1,
      eventName: integration.eventName,
      eventId: "event-1",
      occurredAt: "2026-11-04T12:00:00.000Z",
      payload: { revision: 3 },
    };
    await dispatchFeatureIntegration(registry, message, {
      [integration.id]: value => { received.push(value.eventId); },
    });
    expect(received).toEqual(["event-1"]);
    await expect(dispatchFeatureIntegration(registry, {
      ...message,
      payloadVersion: 2,
    }, {
      [integration.id]: () => undefined,
    })).rejects.toThrow("Incompatible feature integration message");
  });

  it("rejects messages for a different event name", async () => {
    const integration: FeatureIntegrationContract = {
      id: "performance.work-events.v1", version: 1, producerFeatureId: "work",
      consumerFeatureId: "performance", eventName: "work.event-committed", payloadVersion: 1,
    };
    const registry = registerFeatureIntegrations(features, [integration]);
    await expect(dispatchFeatureIntegration(registry, {
      integrationId: integration.id, contractVersion: 1, eventName: "work.event-deleted",
      payloadVersion: 1, eventId: "event-2", occurredAt: "2026-11-04T12:00:00.000Z", payload: {},
    }, { [integration.id]: () => undefined })).rejects.toThrow("Incompatible feature integration message");
  });

  it("rejects duplicate or unregistered integration contracts", () => {
    const integration: FeatureIntegrationContract = {
      id: "performance.work-events.v1",
      version: 1,
      producerFeatureId: "work",
      consumerFeatureId: "performance",
      eventName: "work.event-committed",
      payloadVersion: 1,
    };
    expect(() => registerFeatureIntegrations(features, [integration, integration])).toThrow("Duplicate integration contract");
    expect(() => registerFeatureIntegrations(features, [{
      ...integration,
      producerFeatureId: "unknown",
    }])).toThrow("unregistered feature");
  });
});

describe("versioned calculation contracts", () => {
  const features = registerFeatures();
  const calculation: CalculationContract<{ left: number; right: number; businessDate: string }, number> = {
    id: "test-fixture.sum.v1",
    ownerFeatureId: "performance",
    version: 1,
    inputSchemaVersion: 1,
    outputSchemaVersion: 1,
    unit: "fixture-units",
    effectiveDateField: "businessDate",
    rounding: { mode: "half-up", decimalPlaces: 2 },
    calculate: input => input.left + input.right,
    regressionCases: [
      { name: "normal-trip", input: { left: 1, right: 2, businessDate: "2026-11-04" }, expected: 3 },
      { name: "fractional-result", input: { left: 1.25, right: 2.25, businessDate: "2026-11-04" }, expected: 3.5 },
    ],
  };

  it("registers a versioned calculation and runs all regression fixtures", () => {
    const registry = registerCalculations(features, [calculation]);
    expect(registry.get(calculation.id)?.version).toBe(1);
  });

  it("rejects calculation regressions and calculations without fixtures", () => {
    expect(() => registerCalculations(features, [{
      ...calculation,
      calculate: () => 0,
    }])).toThrow("Calculation regression failed");
    expect(() => registerCalculations(features, [{
      ...calculation,
      regressionCases: [],
    }])).toThrow("Invalid calculation contract");
  });

  it("executes only the requested registered calculation version", () => {
    expect(runCalculation(calculation, { left: 1, right: 2, businessDate: "2026-11-04" }, 1)).toBe(3);
    expect(() => runCalculation(calculation, { left: 1, right: 2, businessDate: "2026-11-04" }, 2))
      .toThrow("Incompatible calculation version");
  });

  it("executes by registered id and returns version/effective-date provenance", () => {
    const runtime = initializeRuntimeRegistry({ integrations: [], calculations: [calculation] });
    const result = executeRegisteredCalculation(
      runtime.calculations,
      calculation.id,
      { left: 1.25, right: 2.25, businessDate: "2026-11-04" },
      { version: 1, inputSchemaVersion: 1 },
    );
    expect(result).toEqual({
      calculationId: calculation.id,
      ownerFeatureId: "performance",
      version: 1,
      inputSchemaVersion: 1,
      outputSchemaVersion: 1,
      effectiveDate: "2026-11-04",
      unit: "fixture-units",
      value: 3.5,
    });
    expect(() => executeRegisteredCalculation(runtime.calculations, "missing", {}, {
      version: 1, inputSchemaVersion: 1,
    })).toThrow("Unknown calculation");
    expect(() => executeRegisteredCalculation(runtime.calculations, calculation.id, {
      left: 1, right: 2, businessDate: "2026-11-04",
    }, { version: 1, inputSchemaVersion: 2 })).toThrow("Incompatible calculation input schema");
  });

  it("applies deterministic half-up and half-even decimal rounding", () => {
    expect(applyCalculationRounding(2.25, { mode: "half-up", decimalPlaces: 1 })).toBe(2.3);
    expect(applyCalculationRounding(2.25, { mode: "half-even", decimalPlaces: 1 })).toBe(2.2);
    expect(applyCalculationRounding(-2.25, { mode: "half-up", decimalPlaces: 1 })).toBe(-2.3);
    expect(applyCalculationRounding(2.251, { mode: "floor", decimalPlaces: 1 })).toBe(2.2);
    expect(applyCalculationRounding(2.251, { mode: "ceil", decimalPlaces: 1 })).toBe(2.3);
  });

  it("rejects missing or invalid effective dates and rounds numeric outputs at execution", () => {
    expect(() => runCalculation(calculation, { left: 1, right: 2, businessDate: "2026-02-30" }, 1))
      .toThrow("Invalid calculation effective date");
    expect(() => registerCalculations(features, [{
      ...calculation,
      regressionCases: [{ name: "bad-date", input: { left: 1, right: 2, businessDate: "not-a-date" }, expected: 10 }],
    }])).toThrow("invalid effective date");
    const fractional = { ...calculation, calculate: () => 12.345 };
    expect(runCalculation(fractional, { left: 1, right: 1, businessDate: "2026-11-04" }, 1)).toBe(12.35);
  });

  it("rejects calculations owned by an unregistered feature", () => {
    expect(() => registerCalculations(features, [{
      ...calculation,
      ownerFeatureId: "missing-feature",
    }])).toThrow("Invalid calculation contract");
  });
});

describe("runtime registry bootstrap", () => {
  it("validates add-on feature registration together with all runtime contracts", () => {
    const runtime = initializeRuntimeRegistry({
      features: [{ id: "custom-addon", label: "Custom Add-on", dataPolicy: "non-persistent", contractVersion: 1, dependencies: [] }],
      integrations: [], calculations: [],
    });
    expect(runtime.features.has("custom-addon")).toBe(true);
    expect(runtime.startupOrder.at(-1)?.id).toBe("custom-addon");
  });

  it("fails bootstrap without exposing a partial registry when an add-on is invalid", () => {
    expect(() => initializeRuntimeRegistry({
      features: [{ id: "broken-addon", label: "Broken", dataPolicy: "persistent", contractVersion: 1, dependencies: [] }],
      integrations: [], calculations: [],
    })).toThrow("Persistent feature is missing its persistence contract");
  });

  it("validates and exposes feature, integration, and calculation registries together", () => {
    const runtime = initializeRuntimeRegistry();
    expect(runtime.features.size).toBe(7);
    expect(runtime.startupOrder[0].id).toBe("work");
    expect(runtime.integrations.size).toBe(0);
    expect([...runtime.backupParticipants.keys()]).toEqual(["work-driver-state"]);
    expect(runtime.backupParticipants.get("work-driver-state")).toMatchObject({ featureId: "work", snapshotVersion: 1, required: true });
    expect(runtime.calculations.size).toBe(0);
  });
});
