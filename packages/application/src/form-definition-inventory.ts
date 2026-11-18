import type { FormDefinition } from "./shared-form-runtime";
import {
  ADMIN_FORM_DEFINITIONS,
  PERFORMANCE_DRIVER_TARGET_FORM_V1,
  PRE_BUSINESS_COST_FORM_V1,
} from "./admin-form-definitions";
import {
  FUEL_ENTRY_FORM_V1,
  TRIP_COMPLETED_FINANCIALS_FORM_V1,
  TRIP_CANCELLATION_FEE_FORM_V1,
} from "./driver-form-definitions";

/**
 * Complete discoverable inventory of persisted user-entry forms.
 * Admin-specific inventory remains available as ADMIN_FORM_DEFINITIONS;
 * this registry also includes Performance and Work/Trip forms.
 */
export const ALL_FORM_DEFINITIONS: readonly FormDefinition[] = Object.freeze([
  ...ADMIN_FORM_DEFINITIONS,
  PERFORMANCE_DRIVER_TARGET_FORM_V1,
  PRE_BUSINESS_COST_FORM_V1,
  FUEL_ENTRY_FORM_V1,
  TRIP_COMPLETED_FINANCIALS_FORM_V1,
  TRIP_CANCELLATION_FEE_FORM_V1,
]);
