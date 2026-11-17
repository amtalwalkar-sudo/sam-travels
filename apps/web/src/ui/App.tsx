import { useMemo, useState, type ComponentType } from "react";
import type { FullCostBreakevenService, PerformanceCalculationServiceV1 } from "../../../../packages/application/src";
import type { AtomicRecordBatchRepository, RuntimeRegistry, PolicyRepository, RecordRepository } from "../../../../packages/core/src";
import { BackupPanel } from "./BackupPanel";
import { getPlatformRecordSource } from "../native-store";
import { getPersonIdentityService } from "../person-identity-runtime";
import { createTripFinancialFormRuntimeV1 } from "../../../../packages/application/src";
import { TripFinancialFormRuntimeProvider } from "./trip-financial-form-context";
import { DeviceReadinessPrompt } from "./DeviceReadinessPrompt";
import { useDriverWorkspace } from "./use-driver-workspace";
import { WorkApplicationRuntimeV1 } from "../work-application-runtime";
import { useAdminMaintenanceServices } from "./admin-services-context";
import { FuelEntryPanel } from "./FuelEntryPanel";
import { ApplicationShell, primaryShellDefinition, type ApplicationShellProps, type PrimaryScreen } from "./ApplicationShell";
import { PrimaryScreenComposition } from "./PrimaryScreenComposition";

export type AppProps = Readonly<{
  ShellRenderer?: ComponentType<ApplicationShellProps>;
  runtimeRegistry: RuntimeRegistry;
  platformRepository: RecordRepository & PolicyRepository & AtomicRecordBatchRepository;
  fullCostBreakeven: Pick<FullCostBreakevenService, "calculate">;
  performanceCalculation: Pick<PerformanceCalculationServiceV1, "calculate">;
}>;

/** Application composition owns shared services, dependency injection, and replaceable shell selection. */
export function App(props: AppProps) {
  const tripFinancialForms = useMemo(() => createTripFinancialFormRuntimeV1(
    props.platformRepository, getPlatformRecordSource(), async () => {
      const actor = await getPersonIdentityService().currentActor();
      return { personId: actor.actorId, role: actor.role };
    },
  ), [props.platformRepository]);
  return <TripFinancialFormRuntimeProvider value={tripFinancialForms}>
    <AppWorkspace {...props} />
  </TripFinancialFormRuntimeProvider>;
}

function AppWorkspace({
  ShellRenderer = ApplicationShell, runtimeRegistry, platformRepository,
  fullCostBreakeven, performanceCalculation,
}: AppProps) {
  const [activeScreen, setActiveScreen] = useState<PrimaryScreen>(primaryShellDefinition.initialScreen);
  const { maintenance, recordSource } = useAdminMaintenanceServices();
  const workRuntime = useMemo(() => new WorkApplicationRuntimeV1({
    runtime: runtimeRegistry,
    records: platformRepository,
    maintenance,
    source: recordSource,
  }), [runtimeRegistry, platformRepository, maintenance, recordSource]);
  const workspace = useDriverWorkspace(workRuntime, platformRepository);
  const { repo, enabled } = workspace;
  const { toggleNetwork } = workspace.actions;

  return (
    <>
      <ShellRenderer shellDefinition={primaryShellDefinition} activeScreen={activeScreen} onNavigate={setActiveScreen}
        settingsContent={<>
          <button className={enabled ? "network enabled" : "network"} onClick={toggleNetwork} disabled={!repo} aria-pressed={enabled}>
            <i />Internet {enabled ? "On" : "Off"}
          </button>
          <p>Connection is optional. Your workspace remains local-first.</p>
          <BackupPanel />
        </>}>
        <PrimaryScreenComposition activeScreen={activeScreen} runtimeRegistry={runtimeRegistry} workspace={workspace}
          fullCostBreakeven={fullCostBreakeven}
          performanceCalculation={performanceCalculation} />
        <FuelEntryPanel />
      </ShellRenderer>
      <DeviceReadinessPrompt />
    </>
  );
}
