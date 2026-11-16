import { useState, type ComponentType } from "react";
import type { FullCostBreakevenService, PerformanceCalculationServiceV1 } from "../../../../packages/application/src";
import type { AtomicRecordBatchRepository, RuntimeRegistry, PolicyRepository, RecordRepository } from "../../../../packages/core/src";
import { BackupPanel } from "./BackupPanel";
import { useDriverWorkspace } from "./use-driver-workspace";
import { FuelEntryPanel } from "./FuelEntryPanel";
import { ApplicationShell, primaryShellDefinition, type ApplicationShellProps, type PrimaryScreen } from "./ApplicationShell";
import { DriveScreen } from "./screens/DriveScreen";
import { PrimaryScreenComposition } from "./PrimaryScreenComposition";

export type AppProps = Readonly<{
  ShellRenderer?: ComponentType<ApplicationShellProps>;
  runtimeRegistry: RuntimeRegistry;
  platformRepository: RecordRepository & PolicyRepository & AtomicRecordBatchRepository;
  fullCostBreakeven: Pick<FullCostBreakevenService, "calculate">;
  performanceCalculation: Pick<PerformanceCalculationServiceV1, "calculate">;
}>;

/** Application composition owns global services and shell injection, not feature screen internals. */
export function App({
  ShellRenderer = ApplicationShell, runtimeRegistry, platformRepository,
  fullCostBreakeven, performanceCalculation,
}: AppProps) {
  const [activeScreen, setActiveScreen] = useState<PrimaryScreen>(primaryShellDefinition.initialScreen);
  const workspace = useDriverWorkspace(runtimeRegistry, platformRepository);
  const { repo, enabled } = workspace;
  const { toggleNetwork } = workspace.actions;

  return (
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
        performanceCalculation={performanceCalculation}>
        <DriveScreen workspace={workspace} runtimeRegistry={runtimeRegistry} />
      </PrimaryScreenComposition>
      <FuelEntryPanel />
    </ShellRenderer>
  );
}
