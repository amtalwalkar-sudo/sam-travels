import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { AdminPresentationServices } from "../../../../packages/application/src";
import type { AdminIdentityPresentationAdapter } from "../admin-identity-presentation-adapter";
import type { MaintenanceExpenseCorrectionAdapter } from "../maintenance-expense-correction-runtime";

type BusinessSetupServices = Pick<AdminPresentationServices, "formRuntime" | "businessSettings" | "costAllocation">;
type VehicleServices = Pick<AdminPresentationServices, "formRuntime" | "vehicles">;
type DriverServices = Pick<AdminPresentationServices, "formRuntime" | "driverRecords" | "driverAssignments" | "vehicles" | "recordSource">;
type ComplianceServices = Pick<AdminPresentationServices, "formRuntime" | "compliance" | "complianceAnalysis" | "vehicles">;
type MaintenanceServices = Pick<AdminPresentationServices, "formRuntime" | "maintenance" | "vehicles" | "recordSource">;
type FuelEntryServices = Pick<AdminPresentationServices, "formRuntime" | "vehicles" | "businessExpenses">;
type FinanceServices = Pick<AdminPresentationServices, "formRuntime" | "financeLoans" | "financeLoanPayments" | "financeLoanPrepayments" | "financeLoanSettlements" | "recordSource" | "vehicles">;
type WorkspaceServices = Pick<AdminPresentationServices, "vehicles" | "financeLoans" | "financeLoanPrepayments">;
type FormRuntimeServices = Pick<AdminPresentationServices, "formRuntime">;

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
}>;

const AdminServicesContext = createContext<AdminSectionAdapters | null>(null);
const AdminIdentityContext = createContext<AdminIdentityPresentationAdapter | null>(null);
const AdminMaintenanceCorrectionContext = createContext<MaintenanceExpenseCorrectionAdapter | null>(null);

export function AdminServicesProvider({ services, identityAdapter, maintenanceCorrections, children }: {
  services: AdminPresentationServices;
  identityAdapter: AdminIdentityPresentationAdapter;
  maintenanceCorrections: MaintenanceExpenseCorrectionAdapter;
  children: ReactNode;
}) {
  const adapters = useMemo<AdminSectionAdapters>(() => ({
    businessSetup: { formRuntime: services.formRuntime, businessSettings: services.businessSettings, costAllocation: services.costAllocation },
    vehicle: { formRuntime: services.formRuntime, vehicles: services.vehicles },
    driver: { formRuntime: services.formRuntime, driverRecords: services.driverRecords,
      driverAssignments: services.driverAssignments, vehicles: services.vehicles, recordSource: services.recordSource },
    compliance: { formRuntime: services.formRuntime, compliance: services.compliance,
      complianceAnalysis: services.complianceAnalysis, vehicles: services.vehicles },
    maintenance: { formRuntime: services.formRuntime, maintenance: services.maintenance, vehicles: services.vehicles, recordSource: services.recordSource },
    finance: { formRuntime: services.formRuntime, financeLoans: services.financeLoans,
      financeLoanPayments: services.financeLoanPayments, financeLoanPrepayments: services.financeLoanPrepayments,
      financeLoanSettlements: services.financeLoanSettlements, recordSource: services.recordSource, vehicles: services.vehicles },
    workspace: { vehicles: services.vehicles, financeLoans: services.financeLoans,
      financeLoanPrepayments: services.financeLoanPrepayments },
    forms: { formRuntime: services.formRuntime },
    fuelEntry: { formRuntime: services.formRuntime, vehicles: services.vehicles, businessExpenses: services.businessExpenses },
  }), [services]);

  return <AdminServicesContext.Provider value={adapters}>
    <AdminIdentityContext.Provider value={identityAdapter}>
      <AdminMaintenanceCorrectionContext.Provider value={maintenanceCorrections}>{children}</AdminMaintenanceCorrectionContext.Provider>
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
