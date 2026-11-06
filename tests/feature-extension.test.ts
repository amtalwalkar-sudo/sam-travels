import { describe, expect, it } from "vitest";
import {
  initializeRuntimeRegistry,
  type FeatureExtensionDefinition,
} from "../packages/core/src/index";
import type { CalculationContract, FeatureIntegrationContract } from "../packages/core/src/feature-contracts";
import type { FeatureDefinition } from "../packages/core/src/features";

const addonFeature: FeatureDefinition = {
  id: "insights",
  label: "Insights",
  dataPolicy: "non-persistent",
  contractVersion: 1,
  dependencies: [{ id: "logbook", contractVersion: 1 }],
};

const totalCalculation: CalculationContract<{ businessDate: string; values: number[] }, number> = {
  id: "insights.daily-total.v1",
  ownerFeatureId: "insights",
  version: 1,
  inputSchemaVersion: 1,
  outputSchemaVersion: 1,
  unit: "minor-units",
  effectiveDateField: "businessDate",
  rounding: { mode: "none", decimalPlaces: 0 },
  calculate: input => input.values.reduce((total, value) => total + value, 0),
  regressionCases: [
    { name: "empty-day", input: { businessDate: "2026-11-06", values: [] }, expected: 0 },
    { name: "two-records", input: { businessDate: "2026-11-06", values: [1250, 750] }, expected: 2000 },
  ],
};

const workIntegration: FeatureIntegrationContract = {
  id: "insights.logbook-events.v1",
  version: 1,
  producerFeatureId: "logbook",
  consumerFeatureId: "insights",
  eventName: "logbook.trip-committed",
  payloadVersion: 1,
  validatePayload: payload => !!payload && typeof payload === "object" && "eventId" in payload,
};

const insightsExtension: FeatureExtensionDefinition = {
  id: "insights.core.v1",
  version: 1,
  featureId: "insights",
  publicEntryPoint: "packages/features/insights/index.ts",
  feature: addonFeature,
  integrations: [workIntegration],
  calculations: [totalCalculation],
};

describe("feature extension architecture", () => {
  it("adds a feature, its integrations and its calculations as one validated package", () => {
    const runtime = initializeRuntimeRegistry({ extensions: [insightsExtension] });
    expect(runtime.extensions.get("insights.core.v1")?.featureId).toBe("insights");
    expect(runtime.features.get("insights")?.dependencies).toEqual([{ id: "logbook", contractVersion: 1 }]);
    expect(runtime.integrations.get(workIntegration.id)).toBeDefined();
    expect(runtime.calculations.get(totalCalculation.id)).toBeDefined();
    expect(runtime.startupOrder.at(-1)?.id).toBe("insights");
  });

  it("executes a newly registered calculation by its exact registered version", async () => {
    const runtime = initializeRuntimeRegistry({ extensions: [insightsExtension] });
    const { executeRegisteredCalculation } = await import("../packages/core/src/feature-contracts");
    const result = executeRegisteredCalculation(
      runtime.calculations,
      totalCalculation.id,
      { businessDate: "2026-11-06", values: [1250, 750] },
      { version: 1, inputSchemaVersion: 1, outputSchemaVersion: 1 },
    );
    expect(result).toMatchObject({
      calculationId: totalCalculation.id,
      ownerFeatureId: "insights",
      effectiveDate: "2026-11-06",
      unit: "minor-units",
      value: 2000,
    });
  });

  it("allows additive extensions to an existing feature without redefining that feature", () => {
    const extension: FeatureExtensionDefinition = {
      id: "logbook.extra-calculation.v1",
      version: 1,
      featureId: "logbook",
      publicEntryPoint: "packages/features/logbook/index.ts",
      calculations: [{
        ...totalCalculation,
        id: "logbook.fixture-count.v1",
        ownerFeatureId: "logbook",
      }],
    };
    const runtime = initializeRuntimeRegistry({ extensions: [extension] });
    expect(runtime.features.get("logbook")?.dataPolicy).toBe("persistent");
    expect(runtime.calculations.has("logbook.fixture-count.v1")).toBe(true);
  });

  it("rejects a contribution assigned to a different feature owner", () => {
    expect(() => initializeRuntimeRegistry({
      extensions: [{
        ...insightsExtension,
        calculations: [{ ...totalCalculation, ownerFeatureId: "logbook" }],
      }],
    })).toThrow("calculation is outside its owner boundary");
    expect(() => initializeRuntimeRegistry({
      extensions: [{
        ...insightsExtension,
        integrations: [{
          ...workIntegration,
          producerFeatureId: "work",
          consumerFeatureId: "performance",
        }],
      }],
    })).toThrow("integration is outside its owner boundary");
  });

  it("fails closed for invalid identities, versions, entry points and missing owners", () => {
    expect(() => initializeRuntimeRegistry({
      extensions: [{ ...insightsExtension, version: 0 }],
    })).toThrow("Invalid feature extension version");
    expect(() => initializeRuntimeRegistry({
      extensions: [{ ...insightsExtension, publicEntryPoint: "packages/features/insights/private.ts" }],
    })).toThrow("Invalid feature public entry point");
    expect(() => initializeRuntimeRegistry({
      extensions: [{ ...insightsExtension, featureId: "missing" }],
    })).toThrow("unregistered feature");
    expect(() => initializeRuntimeRegistry({
      extensions: [insightsExtension, { ...insightsExtension, feature: undefined }],
    })).toThrow("Missing or duplicate feature extension id");
  });

  it("rejects a feature definition whose id differs from its extension owner", () => {
    expect(() => initializeRuntimeRegistry({
      extensions: [{
        ...insightsExtension,
        feature: { ...addonFeature, id: "other" },
      }],
    })).toThrow("does not match its owner");
  });

  it("exposes an immutable extension registry", () => {
    const runtime = initializeRuntimeRegistry({ extensions: [insightsExtension] });
    expect(Object.isFrozen(runtime.extensions)).toBe(true);
    expect((runtime.extensions as unknown as { set?: unknown }).set).toBeUndefined();
    expect(Object.isFrozen(runtime.extensions.get(insightsExtension.id)?.integrationIds)).toBe(true);
    expect(Object.isFrozen(runtime.extensions.get(insightsExtension.id)?.calculationIds)).toBe(true);
    expect(runtime.extensions.get(insightsExtension.id)?.calculationIds).toEqual([totalCalculation.id]);
  });
});
