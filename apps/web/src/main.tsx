import React from "react";
import { createRoot } from "react-dom/client";
import {
  initializeApplicationRuntimeRegistry,
  initializeApplicationFeatureLifecycle,
  initializeApplicationBusinessSettingsService,
  initializeApplicationVehicleService,
  initializeApplicationDriverRecordsService,
  createApplicationDriverAssignmentService,
} from "../../../packages/application/src";
import { assertBusinessSettingsRecordV1 } from "../../../packages/features/business-settings";
import { assertVehicleRecordV1 } from "../../../packages/features/vehicle";
import { assertDriverRecordV1 } from "../../../packages/features/driver-records";
import { DISCOVERED_FEATURE_EXTENSIONS } from "./generated-feature-catalog";
import { registerBusinessSettingsBrowserBackupParticipant } from "./business-settings-backup";
import { registerVehicleBrowserBackupParticipant } from "./vehicle-backup";
import { registerDriverRecordsBrowserBackupParticipant } from "./driver-records-backup";
import { createPlatformRepository } from "./native-store";
import { App } from "./ui/App";
import "./ui/styles.css";

// Initialize contracts, backup validators, and platform services before lifecycle/UI.
async function bootstrap(): Promise<void> {
  initializeApplicationRuntimeRegistry({ extensions: [...DISCOVERED_FEATURE_EXTENSIONS] });
  registerBusinessSettingsBrowserBackupParticipant();
  registerVehicleBrowserBackupParticipant();
  registerDriverRecordsBrowserBackupParticipant();
  const repository = await createPlatformRepository();
  initializeApplicationBusinessSettingsService(repository, assertBusinessSettingsRecordV1);
  const driverRecords = initializeApplicationDriverRecordsService(repository, assertDriverRecordV1);
  const vehicles = initializeApplicationVehicleService(repository, assertVehicleRecordV1);
  createApplicationDriverAssignmentService(repository, driverRecords, vehicles);
  initializeApplicationFeatureLifecycle(repository);
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
