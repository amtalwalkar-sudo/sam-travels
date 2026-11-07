import React from "react";
import { createRoot } from "react-dom/client";
import {
  initializeApplicationRuntimeRegistry,
  initializeApplicationFeatureLifecycle,
  initializeApplicationBusinessSettingsService,
  initializeApplicationVehicleService,
  initializeApplicationDriverRecordsService,
  initializeApplicationDriverAssignmentService,
  initializeApplicationComplianceService,
  initializeApplicationMaintenanceService,
  initializeApplicationFinanceLoanService,
} from "../../../packages/application/src";
import { assertBusinessSettingsRecordV1 } from "../../../packages/features/business-settings";
import { assertVehicleRecordV1 } from "../../../packages/features/vehicle";
import { assertDriverRecordV1 } from "../../../packages/features/driver-records";
import { assertComplianceRecordV1 } from "../../../packages/features/compliance";
import {
  assertMaintenanceRecordV1,
  calculateMaintenanceVisitTotal,
  maintenanceBusinessDateFromInstant,
} from "../../../packages/features/maintenance";
import { assertFinanceLoanRecordV1, createLoanScheduleVersion, loanCalculationInputsChanged } from "../../../packages/features/finance";
import { DISCOVERED_FEATURE_EXTENSIONS } from "./generated-feature-catalog";
import { registerBusinessSettingsBrowserBackupParticipant } from "./business-settings-backup";
import { registerVehicleBrowserBackupParticipant } from "./vehicle-backup";
import { registerDriverRecordsBrowserBackupParticipant } from "./driver-records-backup";
import { registerComplianceBrowserBackupParticipant } from "./compliance-backup";
import { registerMaintenanceBrowserBackupParticipant } from "./maintenance-backup";
import { registerFinanceBrowserBackupParticipant } from "./finance-backup";
import { createPlatformRepository } from "./native-store";
import { App } from "./ui/App";
import "./ui/styles.css";

// Initialize contracts, backup validators, and platform services before lifecycle/UI.
async function bootstrap(): Promise<void> {
  initializeApplicationRuntimeRegistry({ extensions: [...DISCOVERED_FEATURE_EXTENSIONS] });
  registerBusinessSettingsBrowserBackupParticipant();
  registerVehicleBrowserBackupParticipant();
  registerDriverRecordsBrowserBackupParticipant();
  registerComplianceBrowserBackupParticipant();
  registerMaintenanceBrowserBackupParticipant();
  registerFinanceBrowserBackupParticipant();
  const repository = await createPlatformRepository();
  initializeApplicationBusinessSettingsService(repository, assertBusinessSettingsRecordV1);
  const driverRecords = initializeApplicationDriverRecordsService(repository, assertDriverRecordV1);
  const vehicles = initializeApplicationVehicleService(repository, assertVehicleRecordV1);
  initializeApplicationDriverAssignmentService(repository, driverRecords, vehicles);
  initializeApplicationFinanceLoanService(repository, vehicles, assertFinanceLoanRecordV1, createLoanScheduleVersion, loanCalculationInputsChanged);
  initializeApplicationComplianceService(repository, assertComplianceRecordV1, vehicles);
  initializeApplicationMaintenanceService(
    repository, assertMaintenanceRecordV1, vehicles,
    calculateMaintenanceVisitTotal, maintenanceBusinessDateFromInstant,
  );
  initializeApplicationFeatureLifecycle(repository);
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
