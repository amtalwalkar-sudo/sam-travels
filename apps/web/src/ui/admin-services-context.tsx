import { createContext, useContext, type ReactNode } from "react";
import type { AdminPresentationServices } from "../../../../packages/application/src";
import type { AtomicRecordBatchRepository } from "../../../../packages/core/src/repositories";

const AdminServicesContext = createContext<{ services: AdminPresentationServices; identityRecords: AtomicRecordBatchRepository } | null>(null);

export function AdminServicesProvider({ services, identityRecords, children }: {
  services: AdminPresentationServices;
  identityRecords: AtomicRecordBatchRepository;
  children: ReactNode;
}) {
  return <AdminServicesContext.Provider value={{ services, identityRecords }}>{children}</AdminServicesContext.Provider>;
}

/** Access only the explicitly supplied Admin service boundary. */
export function useAdminServices(): AdminPresentationServices {
  const services = useContext(AdminServicesContext);
  if (!services) throw new Error("Admin application services were not supplied by the composition root.");
  return services.services;
}

export function useAdminIdentityRecords(): AtomicRecordBatchRepository {
  const context = useContext(AdminServicesContext);
  if (!context) throw new Error("Admin identity repository was not supplied by the composition root.");
  return context.identityRecords;
}
