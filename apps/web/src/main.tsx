import React from "react";
import { createRoot } from "react-dom/client";
import { getApplicationRuntimeRegistry } from "../../../packages/features/logbook";
import { App } from "./ui/App";
import "./ui/styles.css";

// Register and validate the built-in product feature integrations/calculations
// before mounting UI. Invalid contracts prevent application startup.
getApplicationRuntimeRegistry();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
