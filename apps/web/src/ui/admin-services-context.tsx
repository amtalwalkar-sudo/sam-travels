import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { AdminPresentationServices } from "../../../../packages/application/src";
import type { AdminIdentityPresentationAdapter } from "../admin-identity-presentation-adapter";
import type { MaintenanceExpenseCorrectionAdapter } from "../maintenance-expense-correction-runtime";
import type { ComplianceHistoricalCorrectionAdapter } from "../compliance-historical-correction";
import type { HistoricalTripBackfillServiceV1 } from "../../../../packages/application/src/historical-trip-backfill-service";

type BusinessSetupServices = Pick<AdminPresentationServices, "formRuntime" | "businessSettings" | "costAllocation">;
type VehicleServices = Pick<AdminPresentationServices, "formRuntime" | "vehicles">;
type DriverServices = Pick<AdminPresentationServices, "formRuntime" | "driverRecords" | "driverAssignments" | "workDriverSelection" | "vehicles" | "recordSource">;
type ComplianceServices = Pick<AdminPresentationServices, "formRuntime" | "compliance" | "complianceAnalysis" | "vehicles">;
type MaintenanceServices = Pick<AdminPresentationServices, "formRuntime" | "maintenance" | "vehicles" | "recordSource" | "operatingConfiguration">;
type FuelEntryServices = Pick<AdminPresentationServices, "formRuntime" | "vehicles" | "businessExpenses" | "operatingConfiguration">;
type FinanceServices = Pick<AdminPresentationServices, "formRuntime" | "financeLoans" | "financeLoanPayments" | "financeLoanPrepayments" | "financeLoanSettlements" | "recordSource" | "vehicles" | "operatingConfiguration">;
type PerformanceServices = Pick<AdminPresentationServices, "formRuntime" | "performanceSettings" | "performanceCalculation" | "operatingConfiguration">;
type WorkspaceServices = Pick<AdminPresentationServices, "vehicles" | "financeLoans" | "financeLoanPrepayments" | "operatingConfiguration">;
type FormRuntimeServices = Pick<AdminPresentationServices, "formRuntime" | "operatingConfiguration" | "vehicles">;

type AdminSectionAdapters = Readonly<{
  businessSetup: BusinessSetupServices;
  vehicle: VehicleServices;
  driver: DriverServices;
  compliance: ComplianceServices;
  maintenance: MaintenanceServices;
  finance: FinanceServices;
  workspace: WorkspaceServices;
  forms: FormRuntimeServices;
  fuelEntry: FuelEntryServices;
  performance: PerformanceServices;
}>;

const AdminServicesContext = createContext<AdminSectionAdapters | null>(null);
const AdminIdentityContext = createContext<AdminIdentityPresentationAdapter | null>(null);
const AdminMaintenanceCorrectionContext = createContext<MaintenanceExpenseCorrectionAdapter | null>(null);
const AdminComplianceCorrectionContext = createContext<ComplianceHistoricalCorrectionAdapter | null>(null);
const HistoricalTripBackfillContext = createContext<HistoricalTripBackfillServiceV1 | null>(null);

export function AdminServicesProvider({ services, identityAdapter, maintenanceCorrections, complianceCorrections, historicalTripBackfills, children }: {
  services: AdminPresentationServices;
  identityAdapter: AdminIdentityPresentationAdapter;
  maintenanceCorrections: MaintenanceExpenseCorrectionAdapter;
  complianceCorrections: ComplianceHistoricalCorrectionAdapter;
  historicalTripBackfills?: HistoricalTripBackfillServiceV1;
  children: ReactNode;
}) {
  const adapters = useMemo<AdminSectionAdapters>(() => ({
    businessSetup: { formRuntime: services.formRuntime, businessSettings: services.businessSettings, costAllocation: services.costAllocation },
    vehicle: { formRuntime: services.formRuntime, vehicles: services.vehicles },
    driver: { formRuntime: services.formRuntime, driverRecords: services.driverRecords,
      driverAssignments: services.driverAssignments, workDriverSelection: services.workDriverSelection, vehicles: services.vehicles, recordSource: services.recordSource },
    compliance: { formRuntime: services.formRuntime, compliance: services.compliance,
      complianceAnalysis: services.complianceAnalysis, vehicles: services.vehicles },
    maintenance: { formRuntime: services.formRuntime, maintenance: services.maintenance, vehicles: services.vehicles, recordSource: services.recordSource, operatingConfiguration: services.operatingConfiguration },
    finance: { formRuntime: services.formRuntime, financeLoans: services.financeLoans,
      financeLoanPayments: services.financeLoanPayments, financeLoanPrepayments: services.financeLoanPrepayments,
      financeLoanSettlements: services.financeLoanSettlements, recordSource: services.recordSource, vehicles: services.vehicles, operatingConfiguration: services.operatingConfiguration },
    workspace: { vehicles: services.vehicles, financeLoans: services.financeLoans,
      financeLoanPrepayments: services.financeLoanPrepayments, operatingConfiguration: services.operatingConfiguration },
    forms: { formRuntime: services.formRuntime, operatingConfiguration: services.operatingConfiguration, vehicles: services.vehicles },
    fuelEntry: { formRuntime: services.formRuntime, vehicles: services.vehicles, businessExpenses: services.businessExpenses, operatingConfiguration: services.operatingConfiguration },
    performance: { formRuntime: services.formRuntime, performanceSettings: services.performanceSettings,
      performanceCalculation: services.performanceCalculation, operatingConfiguration: services.operatingConfiguration },
  }), [services]);

  return <AdminServicesContext.Provider value={adapters}>
    <AdminIdentityContext.Provider value={identityAdapter}>
      <AdminMaintenanceCorrectionContext.Provider value={maintenanceCorrections}>
        <AdminComplianceCorrectionContext.Provider value={complianceCorrections}><HistoricalTripBackfillContext.Provider value={historicalTripBackfills ?? null}>{children}</HistoricalTripBackfillContext.Provider></AdminComplianceCorrectionContext.Provider>
      </AdminMaintenanceCorrectionContext.Provider>
    </AdminIdentityContext.Provider>
  </AdminServicesContext.Provider>;
}

function useSectionAdapters(): AdminSectionAdapters {
  const adapters = useContext(AdminServicesContext);
  if (!adapters) throw new Error("Admin application adapters were not supplied by the composition root.");
  return adapters;
}

export function useAdminBusinessSetupServices(): BusinessSetupServices { return useSectionAdapters().businessSetup; }
export function useAdminVehicleServices(): VehicleServices { return useSectionAdapters().vehicle; }
export function useAdminDriverServices(): DriverServices { return useSectionAdapters().driver; }
export function useAdminComplianceServices(): ComplianceServices { return useSectionAdapters().compliance; }
export function useAdminMaintenanceServices(): MaintenanceServices { return useSectionAdapters().maintenance; }
export function useAdminFinanceServices(): FinanceServices { return useSectionAdapters().finance; }
export function useAdminWorkspaceServices(): WorkspaceServices { return useSectionAdapters().workspace; }
export function useAdminFormRuntime(): FormRuntimeServices { return useSectionAdapters().forms; }
export function useAdminFuelEntryServices(): FuelEntryServices { return useSectionAdapters().fuelEntry; }
export function useAdminPerformanceServices(): PerformanceServices { return useSectionAdapters().performance; }

export function useAdminIdentityAdapter(): AdminIdentityPresentationAdapter {
  const adapter = useContext(AdminIdentityContext);
  if (!adapter) throw new Error("Admin identity adapter was not supplied by the composition root.");
  return adapter;
}

export function useAdminMaintenanceCorrectionAdapter(): MaintenanceExpenseCorrectionAdapter {
  const adapter = useContext(AdminMaintenanceCorrectionContext);
  if (!adapter) throw new Error("Maintenance correction adapter was not supplied by the composition root.");
  return adapter;
}

export function useAdminComplianceCorrectionAdapter(): ComplianceHistoricalCorrectionAdapter {
  const adapter = useContext(AdminComplianceCorrectionContext);
  if (!adapter) throw new Error("Compliance correction adapter was not supplied by the composition root.");
  return adapter;
}

export function useHistoricalTripBackfillService(): HistoricalTripBackfillServiceV1 {
  const service = useContext(HistoricalTripBackfillContext);
  if (!service) throw new Error("Historical trip backfill service was not supplied by the composition root.");
  return service;
}
