import React from "react";
import { createRoot } from "react-dom/client";
import {
  initializeApplicationRuntimeRegistry,
  initializeApplicationFeatureLifecycle,
} from "../../../packages/application/src";
import { DISCOVERED_FEATURE_EXTENSIONS } from "./generated-feature-catalog";
import { registerBusinessSettingsBrowserBackupParticipant } from "./business-settings-backup";
import { createPlatformRepository } from "./native-store";
import { App } from "./ui/App";
import "./ui/styles.css";

// Initialize all contracts and executable backup validators before feature lifecycle/UI.
async function bootstrap(): Promise<void> {
  initializeApplicationRuntimeRegistry({ extensions: [...DISCOVERED_FEATURE_EXTENSIONS] });
  registerBusinessSettingsBrowserBackupParticipant();
  const repository = await createPlatformRepository();
  initializeApplicationFeatureLifecycle(repository);
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
