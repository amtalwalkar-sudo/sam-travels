import type { FormDefinition } from "./shared-form-runtime";

/** Canonical, versioned Admin Business Setup form contract. */
export const BUSINESS_SETUP_FORM_V1 = Object.freeze<FormDefinition>({
  id: "admin.business-setup",
  version: 1,
  owner: "business-settings",
  purpose: "Set the business start date",
  primaryAction: "save",
  fields: [
    { id: "businessStartDate", label: "Business start date", type: "date", required: true },
  ],
});

/** Canonical Vehicle form; record revision is internal optimistic-concurrency metadata. */
export const VEHICLE_FORM_V1 = Object.freeze<FormDefinition>({
  id: "admin.vehicle",
  version: 1,
  owner: "vehicles",
  purpose: "Create or update a vehicle record",
  primaryAction: "save",
  fields: [
    { id: "registrationNumber", label: "Registration number", type: "text", required: true, maxLength: 32 },
    { id: "make", label: "Make", type: "text", required: true, maxLength: 80 },
    { id: "model", label: "Model", type: "text", required: true, maxLength: 80 },
    { id: "vehicleType", label: "Vehicle type", type: "text", required: true, maxLength: 48 },
    { id: "fuelType", label: "Fuel type", type: "select", required: true, options: ["Diesel", "Petrol", "CNG", "Electric", "Hybrid", "Other"] },
    { id: "yearOfManufacture", label: "Year of manufacture", type: "number", required: true },
    { id: "ownership", label: "Ownership", type: "select", required: true, options: ["Owned", "Financed", "Leased", "Attached", "Other"] },
    { id: "lifecycleState", label: "Lifecycle status", type: "select", required: true, options: ["active", "inactive", "sold"] },
    { id: "_recordRevision", label: "Record revision", type: "number" },
  ],
});
