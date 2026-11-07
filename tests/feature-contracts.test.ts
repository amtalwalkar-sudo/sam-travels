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
      validatePayload: payload => !!payload && typeof payload === "object" && "revision" in payload,
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
      validatePayload: payload => !!payload && typeof payload === "object" && "revision" in payload,
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
      payload: "not-an-object",
    }, {
      [integration.id]: () => undefined,
    })).rejects.toThrow("Invalid feature integration payload");
    await expect(dispatchFeatureIntegration(registry, {
      ...message,
      payloadVersion: 2,
    }, {
      [integration.id]: () => undefined,
    })).rejects.toThrow("Incompatible feature integration message");
  });

  it("can replay a committed integration after a transient consumer failure", async () => {
    const integration: FeatureIntegrationContract = {
      id: "logbook.work-events.v1", version: 1, producerFeatureId: "work",
      consumerFeatureId: "logbook", eventName: "work.event-committed", payloadVersion: 1,
      validatePayload: payload => !!payload && typeof payload === "object" && "revision" in payload,
    };
    const registry = registerFeatureIntegrations(features, [integration]);
    const message = {
      integrationId: integration.id, contractVersion: 1, payloadVersion: 1,
      eventName: integration.eventName, eventId: "durable-event-1",
      occurredAt: "2026-11-05T10:00:00.000Z", payload: { revision: 4 },
    };
    let attempts = 0;
    const handler = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("injected_consumer_interruption");
    };
    await expect(dispatchFeatureIntegration(registry, message, {
      [integration.id]: handler,
    })).rejects.toThrow("injected_consumer_interruption");
    await expect(dispatchFeatureIntegration(registry, message, {
      [integration.id]: handler,
    })).resolves.toBeUndefined();
    expect(attempts).toBe(2);
  });

  it("rejects messages for a different event name", async () => {
    const integration: FeatureIntegrationContract = {
      id: "performance.work-events.v1", version: 1, producerFeatureId: "work",
      consumerFeatureId: "performance", eventName: "work.event-committed", payloadVersion: 1,
      validatePayload: payload => !!payload && typeof payload === "object" && "revision" in payload,
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
      validatePayload: payload => !!payload && typeof payload === "object" && "revision" in payload,
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
      { name: "small-integers", input: { left: 1, right: 2, businessDate: "2026-11-04" }, expected: 3 },
      { name: "fractional-values", input: { left: 1.25, right: 2.25, businessDate: "2026-11-04" }, expected: 3.5 },
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

  it("exposes runtime-immutable calculation and integration registries", () => {
    const integration: FeatureIntegrationContract = {
      id: "fixture.integration.v1", version: 1, producerFeatureId: "work",
      consumerFeatureId: "logbook", eventName: "fixture.event", payloadVersion: 1,
      validatePayload: payload => !!payload && typeof payload === "object" && "revision" in payload,
    };
    const integrationRegistry = registerFeatureIntegrations(features, [integration]);
    const calculationRegistry = registerCalculations(features, [calculation]);
    expect(Object.isFrozen(integrationRegistry)).toBe(true);
    expect(Object.isFrozen(calculationRegistry)).toBe(true);
    expect((integrationRegistry as unknown as { set?: unknown }).set).toBeUndefined();
    expect((calculationRegistry as unknown as { clear?: unknown }).clear).toBeUndefined();
    expect(Object.isFrozen(calculationRegistry.get(calculation.id)!.rounding)).toBe(true);
    expect(Object.isFrozen(calculationRegistry.get(calculation.id)!.regressionCases)).toBe(true);
  });

  it("executes by registered id and returns version/effective-date provenance", () => {
    const runtime = initializeRuntimeRegistry({ integrations: [], calculations: [calculation] });
    const result = executeRegisteredCalculation(
      runtime.calculations,
      calculation.id,
      { left: 1.25, right: 2.25, businessDate: "2026-11-04" },
      { version: 1, inputSchemaVersion: 1, outputSchemaVersion: 1 },
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
      version: 1, inputSchemaVersion: 1, outputSchemaVersion: 1,
    })).toThrow("Unknown calculation");
    expect(() => executeRegisteredCalculation(runtime.calculations, calculation.id, {
      left: 1, right: 2, businessDate: "2026-11-04",
    }, { version: 1, inputSchemaVersion: 2, outputSchemaVersion: 1 })).toThrow("Incompatible calculation input schema");
    expect(() => executeRegisteredCalculation(runtime.calculations, calculation.id, {
      left: 1, right: 2, businessDate: "2026-11-04",
    }, { version: 1, inputSchemaVersion: 1, outputSchemaVersion: 2 })).toThrow("Incompatible calculation output schema");
  });

  it("isolates calculation inputs and registered regression fixtures from mutation", () => {
    const fixtureInput = { left: 1, right: 2, businessDate: "2026-11-04" };
    const contract = {
      ...calculation,
      regressionCases: [{ name: "isolated-fixture", input: fixtureInput, expected: 3 }],
    };
    const registry = registerCalculations(features, [contract]);
    fixtureInput.left = 100;
    const registeredFixture = registry.get(calculation.id)!.regressionCases[0];
    expect(registeredFixture.input.left).toBe(1);
    expect(Object.isFrozen(registeredFixture.input)).toBe(true);

    const callerInput = { left: 4, right: 5, businessDate: "2026-11-04" };
    const mutatingCalculation = {
      ...calculation,
      calculate(input: typeof callerInput) {
        input.left = 500;
        return input.left + input.right;
      },
    };
    expect(() => runCalculation(mutatingCalculation, callerInput, 1)).toThrow();
    expect(callerInput.left).toBe(4);
  });

  it("rejects cyclic or non-data calculation fixtures during registration", () => {
    const cyclic: { left: number; right: number; businessDate: string; self?: unknown } = {
      left: 1, right: 2, businessDate: "2026-11-04",
    };
    cyclic.self = cyclic;
    expect(() => registerCalculations(features, [{
      ...calculation,
      regressionCases: [{ name: "cyclic", input: cyclic, expected: 3 }],
    }])).toThrow("Calculation data cannot contain cycles");
    expect(() => registerCalculations(features, [{
      ...calculation,
      regressionCases: [{
        name: "non-finite",
        input: { left: Number.NaN, right: 2, businessDate: "2026-11-04" },
        expected: 3,
      }],
    }])).toThrow("Calculation data must contain finite numbers");
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
    expect(runtime.startupOrder.map(feature => feature.id)).toContain("custom-addon");
  });

  it("rejects an invalid add-on without preventing unrelated features from booting", () => {
    const runtime = initializeRuntimeRegistry({
      features: [
        { id: "broken-addon", label: "Broken", dataPolicy: "persistent", contractVersion: 1, dependencies: [] },
        { id: "healthy-addon", label: "Healthy", dataPolicy: "non-persistent", contractVersion: 1, dependencies: [] },
      ],
      integrations: [], calculations: [],
    });
    expect(runtime.activation.results.get("broken-addon")?.state).toBe("rejected");
    expect(runtime.activeFeatures.has("healthy-addon")).toBe(true);
    expect(runtime.features.has("healthy-addon")).toBe(true);
  });

  it("keeps backup participants for persistent features whose required dependency is blocked", () => {
    const runtime = initializeRuntimeRegistry({
      features: [{
        id: "persistent-blocked",
        label: "Persistent Blocked",
        dataPolicy: "persistent",
        contractVersion: 1,
        dependencies: ["not-installed"],
        persistence: {
          schemaVersion: 1, migrations: [],
          backup: { participantId: "persistent-blocked-backup", snapshotVersion: 1, required: true },
          restore: { validatorId: "persistent-blocked-restore-v1", required: true },
          lifecycle: { disableRetainsData: true, removalRequiresMigration: true },
        },
      }],
    });
    expect(runtime.activation.results.get("persistent-blocked")?.state).toBe("blocked");
    expect(runtime.features.has("persistent-blocked")).toBe(true);
    expect(runtime.activeFeatures.has("persistent-blocked")).toBe(false);
    expect(runtime.backupParticipants.get("persistent-blocked-backup")).toMatchObject({
      featureId: "persistent-blocked", required: true,
    });
  });

  it("withholds all contributions owned by a feature when one top-level contract fails", () => {
    const invalidIntegration: FeatureIntegrationContract = {
      id: "performance.invalid-event.v1",
      version: 1,
      producerFeatureId: "work",
      consumerFeatureId: "performance",
      eventName: "",
      payloadVersion: 1,
      validatePayload: () => true,
    };
    const performanceCalculation: CalculationContract<{ businessDate: string }, number> = {
      id: "performance.fixture-total.v1",
      ownerFeatureId: "performance",
      version: 1,
      inputSchemaVersion: 1,
      outputSchemaVersion: 1,
      unit: "fixture-units",
      effectiveDateField: "businessDate",
      rounding: { mode: "none", decimalPlaces: 0 },
      calculate: () => 3,
      regressionCases: [{ name: "valid", input: { businessDate: "2026-11-06" }, expected: 3 }],
    };
    const independentCalculation: CalculationContract<{ businessDate: string }, number> = {
      ...performanceCalculation,
      id: "finance.independent-total.v1",
      ownerFeatureId: "finance",
    };
    const runtime = initializeRuntimeRegistry({
      integrations: [invalidIntegration],
      calculations: [performanceCalculation, independentCalculation],
    });
    expect(runtime.integrations.has(invalidIntegration.id)).toBe(false);
    expect(runtime.calculations.has(performanceCalculation.id)).toBe(false);
    expect(runtime.calculations.has(independentCalculation.id)).toBe(true);
    expect(runtime.contributionFailures).toContainEqual(expect.objectContaining({
      featureId: "performance", code: "invalid_integration",
    }));
  });

  it("validates and exposes feature, integration, and calculation registries together", () => {
    const runtime = initializeRuntimeRegistry();
    expect(runtime.features.size).toBe(8);
    expect(runtime.startupOrder[0].id).toBe("platform");
    expect(runtime.integrations.size).toBe(0);
    expect([...runtime.backupParticipants.keys()]).toEqual(["platform-records", "work-driver-state", "logbook-events", "vehicle-records"]);
    expect(runtime.backupParticipants.get("work-driver-state")).toMatchObject({ featureId: "work", snapshotVersion: 1, required: true });
    expect(runtime.calculations.size).toBe(0);
    expect(Object.isFrozen(runtime)).toBe(true);
    expect(Object.isFrozen(runtime.startupOrder)).toBe(true);
    expect((runtime.features as unknown as { set?: unknown }).set).toBeUndefined();
  });
});
