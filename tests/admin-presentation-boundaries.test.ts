import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Admin presentation dependency boundaries", () => {
  it("keeps the replacement shell independent of application and persistence internals", () => {
    const shell = source("../apps/web/src/ui/AdminWorkspaceShell.tsx");
    expect(shell).not.toMatch(/packages\\/(?:application|core|storage)/);
    expect(shell).not.toMatch(/useAdminServices|Repository|ServiceLocator|localStorage|indexedDB/i);
  });

  it("keeps Person Identity persistence and session services behind its adapter", () => {
    const panel = source("../apps/web/src/ui/PersonIdentityPanel.tsx");
    expect(panel).not.toMatch(/AtomicRecordRepository|getPlatformRecordSource|getPersonIdentityService|person-identity-adapters/);
    expect(panel).toContain("AdminIdentityPresentationAdapter");
  });

  it("keeps Maintenance correction service construction outside React presentation", () => {
    const correction = source("../apps/web/src/ui/MaintenanceExpenseCorrection.tsx");
    const section = source("../apps/web/src/ui/AdminMaintenance.tsx");
    expect(correction).not.toMatch(/AtomicRecordBatchRepository|new HistoricalCorrectionService|getPersonIdentityService|createMaintenanceExpenseCorrectionService/);
    expect(section).not.toMatch(/AtomicRecordBatchRepository|createMaintenanceExpenseCorrectionService/);
    expect(section).toContain("useAdminMaintenanceCorrectionAdapter");
  });

  it("prevents Admin section components from using the broad service-container hook", () => {
    const files = [
      "AdminBusinessVehicle.tsx", "AdminComplianceOverview.tsx", "AdminMaintenance.tsx",
      "AdminOperations.tsx", "BusinessExpenseAdminForms.tsx", "LoanDetailsForm.tsx",
      "LoanPaymentsPanel.tsx", "useLoanFormDrafts.ts",
    ];
    for (const file of files) {
      expect(source("../apps/web/src/ui/" + file)).not.toMatch(/useAdminServices\\s*\\(/);
    }
  });
});
