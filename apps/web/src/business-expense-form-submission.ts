import type { FormSubmissionCommand } from "../../../packages/application/src/form-submission-port";
import {
  FUEL_ENTRY_FORM_V1,
  PLATFORM_FEE_FORM_V1,
  MISC_BUSINESS_EXPENSE_FORM_V1,
  TRAFFIC_CHALLAN_FORM_V1,
  getApplicationBusinessExpensesService,
  getApplicationRecordSource,
} from "../../../packages/application/src";
import { maintenanceBusinessDateFromInstant } from "../../../packages/features/maintenance";
import type { TimelineEnrichmentQueue } from "../../../packages/application/src";
import { scheduleNativeTimelineEnrichment } from "./timeline-enrichment-native";

function positiveRupeesToPaise(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(code);
  const decimal = String(value);
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(decimal)) throw new Error(code);
  const [whole, fraction = ""] = decimal.split(".");
  const paise = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  if (paise > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(code);
  return Number(paise);
}
function positiveInteger(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new Error(code);
  return value;
}
function requiredString(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
  return value.trim();
}
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}


type FuelLocationCaptureOutcome =
  | Readonly<{ status: "captured"; latitude: number; longitude: number; accuracyMeters: number; fixAt: string; gpsProvider: "device" }>
  | Readonly<{ status: "permission_denied" | "timeout" | "unavailable"; reason: string }>;

/** Starts only when Submit is pressed. Its promise is deliberately never awaited by submission. */
export function beginFuelLocationCapture(geolocation: Geolocation | undefined =
  typeof navigator === "undefined" ? undefined : navigator.geolocation): Readonly<{
  promise: Promise<FuelLocationCaptureOutcome>;
  completedAt(): number | undefined;
}> {
  let completedAt: number | undefined;
  const promise = new Promise<FuelLocationCaptureOutcome>(resolve => {
    const finish = (outcome: FuelLocationCaptureOutcome) => {
      completedAt = Date.now();
      resolve(outcome);
    };
    if (!geolocation) {
      finish({ status: "unavailable", reason: "geolocation_unsupported" });
      return;
    }
    try {
      geolocation.getCurrentPosition(position => {
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      const accuracyMeters = position.coords.accuracy;
      const capturedAt = new Date(position.timestamp);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
          !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
          !Number.isFinite(accuracyMeters) || accuracyMeters <= 0 ||
          !Number.isFinite(capturedAt.getTime())) {
        finish({ status: "unavailable", reason: "invalid_device_fix" });
        return;
      }
      finish({ status: "captured", latitude, longitude, accuracyMeters,
        fixAt: capturedAt.toISOString(), gpsProvider: "device" });
    }, error => {
      finish({
        status: error.code === error.PERMISSION_DENIED ? "permission_denied" :
          error.code === error.TIMEOUT ? "timeout" : "unavailable",
        reason: error.code === error.PERMISSION_DENIED ? "permission_denied" :
          error.code === error.TIMEOUT ? "timeout" : "position_unavailable",
      });
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 6000 });
    } catch {
      finish({ status: "unavailable", reason: "position_request_failed" });
    }
  });
  return Object.freeze({ promise, completedAt: () => completedAt });
}

/** Shared-form submission adapter; persistence and domain validation remain in application services. */
export async function handleBusinessExpenseFormSubmission(
  command: FormSubmissionCommand,
  locationEnrichment?: TimelineEnrichmentQueue,
): Promise<unknown | undefined> {
  const values = command.values;
  const service = getApplicationBusinessExpensesService();
  const source = getApplicationRecordSource();

  if (command.formId === FUEL_ENTRY_FORM_V1.id) {
    if (command.action !== "submit") throw new Error("fuel_entry_requires_submit");
    const occurredAt = new Date().toISOString();
    // The fresh device fix is requested from this actual Submit event, never
    // when the form opens. Its callback is detached from the local save path.
    const locationCapture = locationEnrichment ? beginFuelLocationCapture() : undefined;
    let sourceCommitted = false;
    const captureOutcome = locationCapture?.promise.then(outcome => ({
      outcome,
      captureTiming: sourceCommitted ? "late" as const : "submission_event" as const,
    }));
    const created = await service.createFuelPurchase({
      uuid: command.instanceId, source,
      data: {
        vehicleId: requiredString(values.vehicleId, "fuel_vehicle_required"),
        odometerKm: positiveInteger(values.odometerKm, "fuel_odometer_invalid"),
        pricePaisePerKg: positiveRupeesToPaise(values.priceRupeesPerKg, "fuel_price_invalid"),
        amountPaise: positiveRupeesToPaise(values.amountRupees, "fuel_amount_invalid"),
        partialRefill: values.partialRefill === true,
        occurredAt,
        businessDate: maintenanceBusinessDateFromInstant(occurredAt),
      },
    });
    sourceCommitted = true;
    // The fuel source is committed independently of GPS. When a fix arrives,
    // persist its coordinates, accuracy, provider and actual fix timestamp under
    // a stable fuel-scoped record. A post-commit fix is explicitly marked late.
    if (captureOutcome && locationEnrichment) {
      void captureOutcome
        .then(({ outcome, captureTiming }) => locationEnrichment.recordFuelLocationCapture({
          eventId: "fuel:" + created.id, outcome, captureTiming,
        }))
        .then(() => {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new Event("timeline-enrichment-queue-updated"));
          }
          return scheduleNativeTimelineEnrichment();
        })
        .catch(() => undefined);
    }
    return created;
  }

  if (![PLATFORM_FEE_FORM_V1.id, MISC_BUSINESS_EXPENSE_FORM_V1.id, TRAFFIC_CHALLAN_FORM_V1.id].includes(command.formId as never)) {
    return undefined;
  }
  if (command.action !== "save") throw new Error("business_expense_admin_form_requires_save");
  const businessDate = requiredString(values.businessDate, "business_expense_date_required");
  const amountPaise = positiveRupeesToPaise(values.amountRupees, "business_expense_amount_invalid");

  if (command.formId === PLATFORM_FEE_FORM_V1.id) {
    if (typeof values.alreadyNettedFromIncome !== "boolean") throw new Error("platform_fee_income_treatment_required");
    return service.createExpenseEntry({
      uuid: command.instanceId, source,
      data: {
        sourceKind: "platform_fee", businessDate, amountPaise, currencyCode: "INR", effect: "charge",
        reference: requiredString(values.reference, "platform_fee_source_reference_required"),
        alreadyNettedFromIncome: values.alreadyNettedFromIncome,
        ...(optionalString(values.description) ? { description: optionalString(values.description) } : {}),
      },
    });
  }
  if (command.formId === MISC_BUSINESS_EXPENSE_FORM_V1.id) {
    return service.createExpenseEntry({
      uuid: command.instanceId, source,
      data: {
        sourceKind: "miscellaneous", businessDate, amountPaise, currencyCode: "INR", effect: "charge",
        category: requiredString(values.category, "miscellaneous_expense_category_required"),
        ...(optionalString(values.vehicleId) ? { vehicleId: optionalString(values.vehicleId) } : {}),
        ...(optionalString(values.driverId) ? { driverId: optionalString(values.driverId) } : {}),
        ...(optionalString(values.description) ? { description: optionalString(values.description) } : {}),
        ...(optionalString(values.reference) ? { reference: optionalString(values.reference) } : {}),
      },
    });
  }
  const paymentStatus = values.paymentStatus;
  if (paymentStatus !== "unpaid" && paymentStatus !== "paid") throw new Error("traffic_challan_payment_status_required");
  return service.createExpenseEntry({
    uuid: command.instanceId, source,
    data: {
      sourceKind: "traffic_challan", businessDate, amountPaise, currencyCode: "INR", effect: "charge",
      vehicleId: requiredString(values.vehicleId, "traffic_challan_vehicle_required"),
      paymentStatus,
      description: requiredString(values.description, "traffic_challan_reason_required"),
      ...(optionalString(values.driverId) ? { driverId: optionalString(values.driverId) } : {}),
      ...(optionalString(values.reference) ? { reference: optionalString(values.reference) } : {}),
    },
  });
}
