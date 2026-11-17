import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FeatureScreenHost } from "../apps/web/src/ui/FeatureScreenHost";
import { PrimaryScreenComposition } from "../apps/web/src/ui/PrimaryScreenComposition";
import { AdminServicesProvider } from "../apps/web/src/ui/admin-services-context";
import type { AdminPresentationServices } from "../packages/application/src";
import { DISCOVERED_FEATURE_EXTENSIONS } from "../apps/web/src/generated-feature-catalog";
import { initializeRuntimeRegistry, registerFeatures, type RuntimeRegistry } from "../packages/core/src";
import type { DriveScreenWorkspaceV1 } from "../packages/features/work";

const extensionFeatureIds = new Set(DISCOVERED_FEATURE_EXTENSIONS.flatMap(extension =>
  extension.feature ? [extension.feature.id] : [],
));
const production = initializeRuntimeRegistry({
  features: [...registerFeatures().values()].filter(feature => !extensionFeatureIds.has(feature.id)),
  extensions: [...DISCOVERED_FEATURE_EXTENSIONS],
});

function ReplacementShell({ children }: { children: ReactNode }) {
  return createElement("main", { "data-shell": "independent" }, children);
}

const workspace = {
  ready: true, error: "",
  driver: null, pending: [], pendingBlocksWorkflow: false, pendingBoundary: false,
  driverBusy: false, driverMessage: "Ready", shiftOn: false, driverChoices: [], selectedDriverId: "",
  pendingCancellationFees: [], cancellationFeeDrafts: {}, cancellationFeeBusy: false,
  pendingCompletedTripFinancials: [], completedTripFinancialDrafts: {}, completedTripFinancialBusy: false,
  completedTripFinancialSummaries: {},
  actions: {
    retry: async () => undefined, dispatch: async () => undefined, selectDriver: async () => undefined,
    updateCancellationFeeDraft: async () => undefined, submitCancellationFee: async () => undefined,
    updateCompletedTripFinancialDraft: async () => undefined, submitCompletedTripFinancials: async () => undefined,
  },
  loadTimeline: async () => ({
    model: { events: [], projection: { logicalShifts: [], calendarDays: [], integrityIssues: [] } },
    locations: Promise.resolve({}),
  }),
} as unknown as DriveScreenWorkspaceV1 & {
  loadTimeline: (from: string, to: string, allow: boolean, signal?: AbortSignal) => Promise<{
    model: never; locations: Promise<never>;
  }>;
};

const emptyService = new Proxy({}, {
  get: () => new Proxy({}, { get: () => async () => [] }),
});
const adminServices = emptyService as AdminPresentationServices;
const adminIdentity = {} as Parameters<typeof AdminServicesProvider>[0]["identityAdapter"];
const maintenanceCorrections = {} as Parameters<typeof AdminServicesProvider>[0]["maintenanceCorrections"];
const complianceCorrections = {} as Parameters<typeof AdminServicesProvider>[0]["complianceCorrections"];

function renderProductionScreen(activeScreen: "Drive" | "Timeline" | "Performance" | "Admin",
  registry: RuntimeRegistry = production) {
  const composition = createElement(PrimaryScreenComposition, {
    activeScreen, runtimeRegistry: registry, workspace,
    performanceCalculation: { calculate: async () => { throw new Error("not called during render"); } },
    fullCostBreakeven: { calculate: async () => { throw new Error("not called during render"); } },
  });
  const provided = createElement(AdminServicesProvider, {
    services: adminServices, identityAdapter: adminIdentity,
    maintenanceCorrections, complianceCorrections, children: composition,
  });
  return renderToStaticMarkup(createElement(ReplacementShell, null, provided));
}

describe("production screen replacement boundary", () => {
  it("renders every registered production screen through its real composition context", () => {
    const expected = new Map([
      ["Drive", "work-driver-card"],
      ["Timeline", "timeline-screen"],
      ["Performance", "performance-dashboard"],
      ["Admin", "admin-replacement-shell"],
    ] as const);
    for (const [screen, marker] of expected) {
      const markup = renderProductionScreen(screen);
      expect(markup).toContain('data-shell="independent"');
      expect(markup).toContain(marker);
    }
  });

  it("replaces every registered production renderer while retaining real production contexts and an independent shell", () => {
    const screens = [...production.presentationScreens.values()].filter(screen =>
      ["work", "timeline", "performance", "admin"].includes(screen.ownerFeatureId),
    );
    expect([...new Set(screens.map(screen => screen.ownerFeatureId))].sort())
      .toEqual(["admin", "performance", "timeline", "work"]);

    const replacements = new Map(production.presentationScreens);
    for (const [id, screen] of replacements) {
      replacements.set(id, Object.freeze({
        ...screen,
        render: () => createElement("article", { "data-replacement-screen": id }, "replacement renderer"),
      }));
    }
    const runtime = { ...production, presentationScreens: replacements } as RuntimeRegistry;
    const screenByOwner = { work: "Drive", timeline: "Timeline", performance: "Performance", admin: "Admin" } as const;
    for (const screen of screens) {
      const markup = renderProductionScreen(screenByOwner[screen.ownerFeatureId as keyof typeof screenByOwner], runtime);
      expect(markup).toContain('data-shell="independent"');
      expect(markup).toContain('data-replacement-screen="' + screen.id + '"');
    }
  });
});
