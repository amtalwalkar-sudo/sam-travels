import { describe, expect, it } from "vitest";
import { registerFeatures } from "../packages/core/src/features";
import { initializeRuntimeRegistry } from "../packages/core/src/runtime-registry";
import {
  applyCalculationRounding,
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
  const calculation: CalculationContract<{ distanceKm: number; fuelLitres: number }, number> = {
    id: "test-fuel-efficiency",
    ownerFeatureId: "performance",
    version: 1,
    inputSchemaVersion: 1,
    outputSchemaVersion: 1,
    unit: "km/L",
    effectiveDateField: "businessDate",
    rounding: { mode: "half-up", decimalPlaces: 2 },
    calculate: input => input.distanceKm / input.fuelLitres,
    regressionCases: [
      { name: "normal-trip", input: { distanceKm: 120, fuelLitres: 10 }, expected: 12 },
      { name: "fractional-result", input: { distanceKm: 100, fuelLitres: 8 }, expected: 12.5 },
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
    expect(runCalculation(calculation, { distanceKm: 120, fuelLitres: 10 }, 1)).toBe(12);
    expect(() => runCalculation(calculation, { distanceKm: 120, fuelLitres: 10 }, 2))
      .toThrow("Incompatible calculation version");
  });

  it("applies deterministic half-up and half-even decimal rounding", () => {
    expect(applyCalculationRounding(2.25, { mode: "half-up", decimalPlaces: 1 })).toBe(2.3);
    expect(applyCalculationRounding(2.25, { mode: "half-even", decimalPlaces: 1 })).toBe(2.2);
    expect(applyCalculationRounding(-2.25, { mode: "half-up", decimalPlaces: 1 })).toBe(-2.3);
    expect(applyCalculationRounding(2.251, { mode: "floor", decimalPlaces: 1 })).toBe(2.2);
    expect(applyCalculationRounding(2.251, { mode: "ceil", decimalPlaces: 1 })).toBe(2.3);
  });

  it("rejects calculations owned by an unregistered feature", () => {
    expect(() => registerCalculations(features, [{
      ...calculation,
      ownerFeatureId: "missing-feature",
    }])).toThrow("Invalid calculation contract");
  });
});

describe("runtime registry bootstrap", () => {
  it("validates and exposes feature, integration, and calculation registries together", () => {
    const runtime = initializeRuntimeRegistry();
    expect(runtime.features.size).toBe(7);
    expect(runtime.startupOrder[0].id).toBe("work");
    expect(runtime.integrations.size).toBe(0);
    expect(runtime.calculations.size).toBe(0);
  });
});
