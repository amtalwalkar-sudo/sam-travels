import { createContext, useContext, type ReactNode } from "react";
import type { TripFinancialFormRuntimeV1 } from "../../../../packages/application/src/trip-financial-form-runtime";

const TripFinancialFormRuntimeContext = createContext<TripFinancialFormRuntimeV1 | null>(null);

export function TripFinancialFormRuntimeProvider({
  value, children,
}: Readonly<{ value: TripFinancialFormRuntimeV1; children: ReactNode }>) {
  return <TripFinancialFormRuntimeContext.Provider value={value}>{children}</TripFinancialFormRuntimeContext.Provider>;
}

export function useTripFinancialFormRuntime(): TripFinancialFormRuntimeV1 {
  const runtime = useContext(TripFinancialFormRuntimeContext);
  if (!runtime) throw new Error("trip_financial_form_runtime_not_provided");
  return runtime;
}
