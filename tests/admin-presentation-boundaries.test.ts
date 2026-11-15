import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Admin presentation dependency boundaries", () => {
  it("keeps the replacement shell independent of application and persistence internals", () => {
    const shell = source("../apps/web/src/ui/AdminWorkspaceShell.tsx");
    for (const forbidden of ["packages/application", "packages/core", "packages/storage", "useAdminServices(", "Repository", "localStorage", "indexedDB"]) {
      expect(shell).not.toContain(forbidden);
    }
  });

  it("keeps the Admin workspace as a composition-only shell", () => {
    const workspace = source("../apps/web/src/ui/AdminWorkspace.tsx");
    for (const forbidden of ["AdminPresentationServices", "financeLoans", "financeLoanPrepayments", "useAdminWorkspaceServices", "AtomicRecordRepository"]) {
      expect(workspace).not.toContain(forbidden);
    }
    for (const section of ["AdminBusinessSetupSection", "AdminVehicleSection", "AdminDriverSection",
      "AdminComplianceSection", "AdminFinanceSection", "AdminMaintenance"]) {
      expect(workspace).toContain(section);
    }
  });

  it("keeps independently owned Admin section modules and expense forms separate", () => {
    expect(source("../apps/web/src/ui/AdminBusinessSetupSection.tsx")).toContain("useAdminBusinessSetupServices");
    expect(source("../apps/web/src/ui/AdminVehicleSection.tsx")).toContain("useAdminVehicleServices");
    expect(source("../apps/web/src/ui/AdminDriverSection.tsx")).toContain("useAdminDriverServices");
    expect(source("../apps/web/src/ui/AdminComplianceSection.tsx")).toContain("useAdminComplianceServices");
    expect(source("../apps/web/src/ui/AdminFinanceSection.tsx")).toContain("useAdminWorkspaceServices");
    expect(source("../apps/web/src/ui/AdminPlatformFeeSection.tsx")).toContain("PLATFORM_FEE_FORM_V1");
    expect(source("../apps/web/src/ui/AdminMiscBusinessExpenseSection.tsx")).toContain("MISC_BUSINESS_EXPENSE_FORM_V1");
    expect(source("../apps/web/src/ui/AdminTrafficChallanSection.tsx")).toContain("TRAFFIC_CHALLAN_FORM_V1");
  });

  it("keeps Person Identity persistence and session services behind its adapter", () => {
    const panel = source("../apps/web/src/ui/PersonIdentityPanel.tsx");
    for (const forbidden of ["AtomicRecordRepository", "getPlatformRecordSource", "getPersonIdentityService", "person-identity-adapters"]) {
      expect(panel).not.toContain(forbidden);
    }
    expect(panel).toContain("AdminIdentityPresentationAdapter");
  });

  it("keeps Maintenance correction service construction outside React presentation", () => {
    const correction = source("../apps/web/src/ui/MaintenanceExpenseCorrection.tsx");
    const section = source("../apps/web/src/ui/AdminMaintenance.tsx");
    for (const forbidden of ["AtomicRecordBatchRepository", "new HistoricalCorrectionService", "getPersonIdentityService", "createMaintenanceExpenseCorrectionService"]) {
      expect(correction).not.toContain(forbidden);
      expect(section).not.toContain(forbidden);
    }
    expect(section).toContain("useAdminMaintenanceCorrectionAdapter");
  });

  it("prevents Admin section components from using the broad service-container hook", () => {
    const files = [
      "AdminBusinessVehicle.tsx", "AdminComplianceOverview.tsx", "AdminMaintenance.tsx",
      "AdminOperations.tsx", "BusinessExpenseAdminForms.tsx", "LoanDetailsForm.tsx",
      "LoanPaymentsPanel.tsx", "useLoanFormDrafts.ts",
    ];
    for (const file of files) {
      expect(source("../apps/web/src/ui/" + file)).not.toContain("useAdminServices(");
    }
  });
});
