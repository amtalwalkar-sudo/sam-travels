import React from "react";
import { createRoot } from "react-dom/client";
import { registerFeatures, resolveFeatureStartupOrder } from "../../../packages/core/src/features";
import { App } from "./ui/App";
import "./ui/styles.css";

// Validate module contracts before mounting any UI that can initiate writes.
const runtimeFeatures = registerFeatures();
resolveFeatureStartupOrder(runtimeFeatures);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
