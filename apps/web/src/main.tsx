import React from "react";
import { createRoot } from "react-dom/client";
import { initializeApplicationRuntimeRegistry } from "../../../packages/application/src";
import { LOGBOOK_FEATURE_EXTENSION } from "../../../packages/features/logbook";
import { App } from "./ui/App";
import "./ui/styles.css";

// The outer composition root supplies statically linked feature contributions.
// The application layer validates the complete registry before mounting UI.
initializeApplicationRuntimeRegistry({ extensions: [LOGBOOK_FEATURE_EXTENSION] });

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
