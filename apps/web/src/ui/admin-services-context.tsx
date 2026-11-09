import { createContext, useContext, type ReactNode } from "react";
import type { AdminPresentationServices } from "../../../../packages/application/src";

const AdminServicesContext = createContext<AdminPresentationServices | null>(null);

export function AdminServicesProvider({ services, children }: {
  services: AdminPresentationServices;
  children: ReactNode;
}) {
  return <AdminServicesContext.Provider value={services}>{children}</AdminServicesContext.Provider>;
}

/** Access only the explicitly supplied Admin service boundary. */
export function useAdminServices(): AdminPresentationServices {
  const services = useContext(AdminServicesContext);
  if (!services) throw new Error("Admin application services were not supplied by the composition root.");
  return services;
}
