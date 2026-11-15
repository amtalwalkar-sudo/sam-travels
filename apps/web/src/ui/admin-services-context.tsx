import { createContext, useContext, type ReactNode } from "react";
import type { AdminPresentationServices } from "../../../../packages/application/src";
import type { AdminIdentityPresentationAdapter } from "../admin-identity-presentation-adapter";
import type { MaintenanceExpenseCorrectionAdapter } from "../maintenance-expense-correction-runtime";

const AdminServicesContext = createContext<AdminPresentationServices | null>(null);
const AdminIdentityContext = createContext<AdminIdentityPresentationAdapter | null>(null);
const AdminMaintenanceCorrectionContext = createContext<MaintenanceExpenseCorrectionAdapter | null>(null);

export function AdminServicesProvider({ services, identityAdapter, maintenanceCorrections, children }: {
  services: AdminPresentationServices;
  identityAdapter: AdminIdentityPresentationAdapter;
  maintenanceCorrections: MaintenanceExpenseCorrectionAdapter;
  children: ReactNode;
}) {
  return <AdminServicesContext.Provider value={services}>
    <AdminIdentityContext.Provider value={identityAdapter}>
      <AdminMaintenanceCorrectionContext.Provider value={maintenanceCorrections}>{children}</AdminMaintenanceCorrectionContext.Provider>
    </AdminIdentityContext.Provider>
  </AdminServicesContext.Provider>;
}

/** Transitional compatibility hook; sections are migrated to narrower owner hooks incrementally. */
export function useAdminServices(): AdminPresentationServices {
  const services = useContext(AdminServicesContext);
  if (!services) throw new Error("Admin application services were not supplied by the composition root.");
  return services;
}

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
