import React from "react";
import { createRoot } from "react-dom/client";
import {
  initializeApplicationRuntimeRegistry,
  initializeApplicationFeatureLifecycle,
  initializeApplicationBusinessSettingsService,
} from "../../../packages/application/src";
import { assertBusinessSettingsRecordV1 } from "../../../packages/features/business-settings";
import { DISCOVERED_FEATURE_EXTENSIONS } from "./generated-feature-catalog";
import { registerBusinessSettingsBrowserBackupParticipant } from "./business-settings-backup";
import { createPlatformRepository } from "./native-store";
import { App } from "./ui/App";
import "./ui/styles.css";

// Initialize contracts, backup validators, and platform services before lifecycle/UI.
async function bootstrap(): Promise<void> {
  initializeApplicationRuntimeRegistry({ extensions: [...DISCOVERED_FEATURE_EXTENSIONS] });
  registerBusinessSettingsBrowserBackupParticipant();
  const repository = await createPlatformRepository();
  initializeApplicationBusinessSettingsService(repository, assertBusinessSettingsRecordV1);
  initializeApplicationFeatureLifecycle(repository);
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
