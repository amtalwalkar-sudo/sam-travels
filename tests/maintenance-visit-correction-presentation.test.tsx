import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RecordEnvelope } from "../packages/core/src/types";
import type { MaintenanceVisitV1 } from "../packages/application/src/maintenance-service";
import { MaintenanceVisitCorrection } from "../apps/web/src/ui/MaintenanceVisitCorrection";

const visit: RecordEnvelope<MaintenanceVisitV1> = {
  id: "feature:maintenance:visit:123e4567-e89b-42d3-a456-426614174000",
  schemaVersion: 1, revision: 1, createdAt: "2026-10-10T00:00:00.000Z",
  updatedAt: "2026-10-10T00:00:00.000Z", source: "web",
  createdBy: { personId: "admin-1", role: "admin" },
  data: {
    schemaVersion: 1, kind: "visit", vehicleId: "feature:vehicle:MH01AB1234",
    maintenanceDate: "2026-10-10", maintenanceType: "Scheduled service",
    description: "Original visit", items: [{ id: "item-1", description: "Oil", amountPaise: 250000 }],
    totalPaise: 250000,
  },
};

describe("Maintenance visit correction presentation", () => {
  it("renders a reasoned append-only correction entry point without offering source-record editing", () => {
    const service = { async listForTarget() { return []; }, async submit() { throw new Error("not_expected"); },
      async projectVisit() { throw new Error("not_expected"); }, async projectExpense() { throw new Error("not_expected"); } };
    const markup = renderToStaticMarkup(createElement(MaintenanceVisitCorrection, {
      visit, service: service as never, onCorrected: async () => undefined,
    }));
    expect(markup).toContain("Correct visit total / view history");
    expect(markup).not.toContain("Edit record");
    expect(markup).not.toContain("Delete record");
  });
});
