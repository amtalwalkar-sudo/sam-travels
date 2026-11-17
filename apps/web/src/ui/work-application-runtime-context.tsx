import { createContext, useContext, type ReactNode } from "react";
import type { WorkApplicationRuntimeV1 } from "../work-application-runtime";

const WorkApplicationRuntimeContext = createContext<WorkApplicationRuntimeV1 | null>(null);

export function WorkApplicationRuntimeProvider({ value, children }: {
  value: WorkApplicationRuntimeV1;
  children: ReactNode;
}) {
  return <WorkApplicationRuntimeContext.Provider value={value}>{children}</WorkApplicationRuntimeContext.Provider>;
}

export function useWorkApplicationRuntime(): WorkApplicationRuntimeV1 {
  const runtime = useContext(WorkApplicationRuntimeContext);
  if (!runtime) throw new Error("Work application runtime was not supplied by the composition root.");
  return runtime;
}
