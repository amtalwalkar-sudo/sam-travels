import { describe, expect, it } from "vitest";
import { registerFeatures } from "../packages/core/src/features";
import { analyzeFeatureExtensionUpgradeImpact, validateFeatureExtensionUpgrade, type FeatureExtensionCompatibilitySnapshot } from "../packages/core/src/feature-compatibility";
import type { FeatureExtensionDefinition } from "../packages/core/src/feature-extension";

const feature = registerFeatures().get("logbook")!;
const extension: FeatureExtensionDefinition = {
  id: "logbook.core.v1",
  version: 1,
  featureId: "logbook",
  publicEntryPoint: "packages/features/logbook/index.ts",
  integrations: [{
    id: "logbook.work-driver-events.v1",
    version: 1,
    producerFeatureId: "work",
    consumerFeatureId: "logbook",
    eventName: "work.driver-event-committed",
    payloadVersion: 1,
    validatePayload: () => true,
  }],
  calculations: [{
    id: "logbook.trip-duration-minutes.v1",
    ownerFeatureId: "logbook",
    version: 1,
    inputSchemaVersion: 1,
    outputSchemaVersion: 1,
    unit: "minutes",
    effectiveDateField: "businessDate",
    rounding: { mode: "half-up", decimalPlaces: 2 },
    calculate: () => 1,
    regressionCases: [{ name: "fixture", input: { businessDate: "2026-11-06" }, expected: 1 }],
  }],
};
const snapshot = (overrides: Partial<FeatureExtensionCompatibilitySnapshot> = {}): FeatureExtensionCompatibilitySnapshot => ({
  extension,
  feature,
  ...overrides,
});

describe("feature extension compatibility preflight", () => {
  it("accepts an additive extension version that preserves existing contracts", () => {
    validateFeatureExtensionUpgrade(snapshot(), snapshot({
      extension: { ...extension, version: 2, calculations: [...(extension.calculations ?? []), {
        id: "logbook.new-metric.v1",
        ownerFeatureId: "logbook",
        version: 1,
        inputSchemaVersion: 1,
        outputSchemaVersion: 1,
        unit: "count",
        effectiveDateField: "businessDate",
        rounding: { mode: "none", decimalPlaces: 0 },
        calculate: () => 1,
        regressionCases: [{ name: "fixture", input: { businessDate: "2026-11-06" }, expected: 1 }],
      }] },
    }));
  });

  it("rejects extension downgrade, identity change and owner change", () => {
    expect(() => validateFeatureExtensionUpgrade(snapshot(), snapshot({
      extension: { ...extension, version: 0 },
    }))).toThrow("must increase its version");
    expect(() => validateFeatureExtensionUpgrade(snapshot(), snapshot({
      extension: { ...extension, id: "other.extension" },
    }))).toThrow("identity cannot change");
    expect(() => validateFeatureExtensionUpgrade(snapshot(), snapshot({
      extension: { ...extension, featureId: "work" },
    }))).toThrow("owner identity cannot change");
  });

  it("rejects removal of a published integration or calculation contract", () => {
    expect(() => validateFeatureExtensionUpgrade(snapshot(), snapshot({
      extension: { ...extension, version: 2, integrations: [] },
    }))).toThrow("cannot silently remove integration");
    expect(() => validateFeatureExtensionUpgrade(snapshot(), snapshot({
      extension: { ...extension, version: 2, calculations: [] },
    }))).toThrow("cannot silently remove calculation");
  });

  it("requires contract version increases when integration payload or calculation schema changes", () => {
    expect(() => validateFeatureExtensionUpgrade(snapshot(), snapshot({
      extension: { ...extension, version: 2, integrations: [{ ...extension.integrations![0], payloadVersion: 2 }] },
    }))).toThrow("requires an integration version increase");
    expect(() => validateFeatureExtensionUpgrade(snapshot(), snapshot({
      extension: { ...extension, version: 2, calculations: [{ ...extension.calculations![0], inputSchemaVersion: 2 }] },
    }))).toThrow("requires a calculation version increase");
  });

  it("rejects persistent-to-non-persistent downgrade", () => {
    expect(() => validateFeatureExtensionUpgrade(snapshot(), snapshot({
      extension: { ...extension, version: 2 },
      feature: { ...feature, dataPolicy: "non-persistent", persistence: undefined },
    }))).toThrow("cannot become non-persistent");
  });

  it("reports all changed extension contract surfaces deterministically", () => {
    const previous = snapshot({ extension: {
      ...extension, version: 1,
      dataQueries: [{
        id: "logbook.events.v1", ownerFeatureId: "logbook", version: 1, outputSchemaVersion: 1,
        query: async () => ({ status: "unavailable", reason: "offline" } as const),
        validateRecord: (value: unknown): value is { id: string } => !!value && typeof value === "object",
      }],
      presentationScreens: [{ id: "logbook.timeline", ownerFeatureId: "logbook", version: 1, mountPoint: "main", label: "Timeline", context: { id: "logbook.timeline", version: 1 }, render: () => null }],
    }});
    const proposed = snapshot({ extension: {
      ...extension, version: 2, integrations: [],
      calculations: [{ ...extension.calculations![0], version: 2, outputSchemaVersion: 2 }],
      dataQueries: [],
      presentationScreens: [{ id: "logbook.timeline", ownerFeatureId: "logbook", version: 2, mountPoint: "secondary", label: "Timeline", context: { id: "logbook.timeline", version: 1 }, render: () => null }],
    }});
    const report = analyzeFeatureExtensionUpgradeImpact(previous, proposed);
    const changes = report.findings.map(item => item.surface + ":" + item.change);
    expect(report.compatible).toBe(false);
    expect(changes).toContain("integration:removed");
    expect(changes).toContain("data_query:removed");
    expect(changes).toContain("calculation:contract_metadata_changed");
    expect(changes).toContain("presentation:contract_metadata_changed");
    expect(analyzeFeatureExtensionUpgradeImpact(previous, proposed)).toEqual(report);
  });
});
