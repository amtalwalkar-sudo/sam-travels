import React from "react";
import { createRoot } from "react-dom/client";
import { initializeRuntimeRegistry } from "../../../packages/core/src/runtime-registry";
import { App } from "./ui/App";
import "./ui/styles.css";

// Fail closed on invalid feature, integration, or calculation contracts before mounting UI.
initializeRuntimeRegistry();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
