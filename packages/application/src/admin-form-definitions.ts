import type { FormDefinition } from "./shared-form-runtime";

/** Canonical, versioned Admin Business Setup form contract. */
export const BUSINESS_SETUP_FORM_V1: FormDefinition = Object.freeze({
  id: "admin.business-setup",
  version: 1,
  owner: "business-settings",
  purpose: "Set the business start date",
  primaryAction: "save",
  fields: [
    { id: "businessStartDate", label: "Business start date", type: "date", required: true },
  ],
});
