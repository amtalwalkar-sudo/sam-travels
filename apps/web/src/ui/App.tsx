import { useState, type ComponentType } from "react";
import type { AdminPresentationServices, FullCostBreakevenService } from "../../../../packages/application/src";
import type { AtomicRecordBatchRepository, RuntimeRegistry, PolicyRepository, RecordRepository } from "../../../../packages/core/src";
import { BackupPanel } from "./BackupPanel";
import { useDriverWorkspace } from "./use-driver-workspace";
import { FuelEntryPanel } from "./FuelEntryPanel";
import { AdminServicesProvider } from "./admin-services-context";
import { ApplicationShell, primaryShellDefinition, type ApplicationShellProps, type PrimaryScreen } from "./ApplicationShell";
import { DriveScreen } from "./screens/DriveScreen";
import { PrimaryScreenComposition } from "./PrimaryScreenComposition";

export type AppProps = Readonly<{
  ShellRenderer?: ComponentType<ApplicationShellProps>;
  adminServices: AdminPresentationServices;
  runtimeRegistry: RuntimeRegistry;
  platformRepository: RecordRepository & PolicyRepository & AtomicRecordBatchRepository;
  fullCostBreakeven: Pick<FullCostBreakevenService, "calculate">;
  showBreakevenSanityCheck: boolean;
}>;

/** Application composition owns global services and shell injection, not feature screen internals. */
export function App({
  ShellRenderer = ApplicationShell, adminServices, runtimeRegistry, platformRepository,
  fullCostBreakeven, showBreakevenSanityCheck,
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
        adminServices={adminServices} platformRepository={platformRepository} fullCostBreakeven={fullCostBreakeven}
        showBreakevenSanityCheck={showBreakevenSanityCheck}>
        <DriveScreen workspace={workspace} runtimeRegistry={runtimeRegistry} />
      </PrimaryScreenComposition>
      <AdminServicesProvider services={adminServices} identityRecords={platformRepository}>
        <FuelEntryPanel />
      </AdminServicesProvider>
    </ShellRenderer>
  );
}
