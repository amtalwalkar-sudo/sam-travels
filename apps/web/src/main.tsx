import React from "react";
import { createRoot } from "react-dom/client";
import {
  initializeApplicationRuntimeRegistry,
  initializeApplicationFeatureLifecycle,
} from "../../../packages/application/src";
import { LOGBOOK_FEATURE_EXTENSION } from "../../../packages/features/logbook";
import { createPlatformRepository } from "./native-store";
import { App } from "./ui/App";
import "./ui/styles.css";

// Initialize all contracts and the authoritative lifecycle repository before UI.
async function bootstrap(): Promise<void> {
  initializeApplicationRuntimeRegistry({ extensions: [LOGBOOK_FEATURE_EXTENSION] });
  const repository = await createPlatformRepository();
  initializeApplicationFeatureLifecycle(repository);
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
