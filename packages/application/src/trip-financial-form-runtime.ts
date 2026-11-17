import type { AtomicRecordRepository, RecordRepository } from "../../core/src/repositories";
import type { RecordAuthorV1, RecordEnvelope } from "../../core/src/types";
import { RecordFormWorkingCopyRepository } from "./record-form-working-copy-repository";
import { SharedFormRuntime } from "./shared-form-runtime";
import { TRIP_CANCELLATION_FEE_FORM_V1, TRIP_COMPLETED_FINANCIALS_FORM_V1 } from "./driver-form-definitions";
import { TripFinancialService, submitCompletedTripFinancials, TRIP_FINANCIAL_OBLIGATION_PREFIX, type CancellationFeeObligation, type CompletedTripFinancialObligation, type CompletedTripFinancialValues } from "./trip-financial-service";

/**
 * Owns durable trip-financial form construction and submission wiring.
 * React workspaces bind to this application runtime; they do not construct
 * working-copy repositories, generic form runtimes, or financial services.
 */
export function createTripFinancialFormRuntimeV1(
  records: RecordRepository & AtomicRecordRepository,
  source: RecordEnvelope<unknown>["source"],
  currentAuthor: () => Promise<RecordAuthorV1>,
) {
  const financials = new TripFinancialService(records, source, undefined, currentAuthor);
  const workingCopies = new RecordFormWorkingCopyRepository(records, source);
  const forms = new SharedFormRuntime(workingCopies, {
    submit: async command => {
      if (command.action !== "submit") throw new Error("unsupported_trip_financial_form");
      if (command.formId === TRIP_CANCELLATION_FEE_FORM_V1.id) {
        return financials.submitCancellationFee(
          command.instanceId,
          command.values.cancellationFeePaise as number,
          command.operationId,
        );
      }
      if (command.formId === TRIP_COMPLETED_FINANCIALS_FORM_V1.id) {
        const author = await currentAuthor();
        return submitCompletedTripFinancials(
          records, source, command.instanceId,
          command.values as unknown as CompletedTripFinancialValues,
          command.operationId, undefined, author,
        );
      }
      throw new Error("unsupported_trip_financial_form");
    },
  });
  async function openCopy(definition: typeof TRIP_CANCELLATION_FEE_FORM_V1 | typeof TRIP_COMPLETED_FINANCIALS_FORM_V1, tripId: string) {
    let copy = await forms.open(definition, tripId);
    if (copy.values.tripId !== tripId) copy = await forms.update(definition, copy, "tripId", tripId);
    return copy;
  }

  async function openCancellationFeeDraft(tripId: string) {
    const copy = await openCopy(TRIP_CANCELLATION_FEE_FORM_V1, tripId);
    return copy.values;
  }

  async function updateCancellationFeeDraft(tripId: string, amountPaise: number | ""): Promise<void> {
    const copy = await openCopy(TRIP_CANCELLATION_FEE_FORM_V1, tripId);
    await forms.update(TRIP_CANCELLATION_FEE_FORM_V1, copy, "cancellationFeePaise", amountPaise);
  }

  async function submitCancellationFeeDraft(tripId: string, amountPaise: number): Promise<unknown> {
    let copy = await openCopy(TRIP_CANCELLATION_FEE_FORM_V1, tripId);
    if (copy.values.cancellationFeePaise !== amountPaise) {
      copy = await forms.update(TRIP_CANCELLATION_FEE_FORM_V1, copy, "cancellationFeePaise", amountPaise);
    }
    return forms.submit(TRIP_CANCELLATION_FEE_FORM_V1, copy);
  }

  async function listPendingCompletedTripFinancials() {
    const rows = await records.list<CompletedTripFinancialObligation>();
    return rows.filter(row => row.id.startsWith(TRIP_FINANCIAL_OBLIGATION_PREFIX) && !row.deletedAt &&
      row.data?.kind === "completed_ride_financials" && row.data.status === "pending");
  }

  async function openCompletedTripFinancialDraft(tripId: string) {
    const copy = await openCopy(TRIP_COMPLETED_FINANCIALS_FORM_V1, tripId);
    return copy.values;
  }

  async function updateCompletedTripFinancialDraft(tripId: string, fieldId: string, value: unknown): Promise<void> {
    const copy = await openCopy(TRIP_COMPLETED_FINANCIALS_FORM_V1, tripId);
    await forms.update(TRIP_COMPLETED_FINANCIALS_FORM_V1, copy, fieldId, value);
  }

  async function submitCompletedTripFinancialDraft(tripId: string, values: CompletedTripFinancialValues): Promise<unknown> {
    let copy = await openCopy(TRIP_COMPLETED_FINANCIALS_FORM_V1, tripId);
    for (const [field, value] of Object.entries(values)) {
      if (copy.values[field] !== value) {
        copy = await forms.update(TRIP_COMPLETED_FINANCIALS_FORM_V1, copy, field, value);
      }
    }
    return forms.submit(TRIP_COMPLETED_FINANCIALS_FORM_V1, copy);
  }

  return Object.freeze({
    financials,
    listPendingCancellationFees: (): Promise<readonly RecordEnvelope<CancellationFeeObligation>[]> =>
      financials.pendingCancellationFees(),
    openCancellationFeeDraft,
    updateCancellationFeeDraft,
    submitCancellationFeeDraft,
    listPendingCompletedTripFinancials,
    openCompletedTripFinancialDraft,
    updateCompletedTripFinancialDraft,
    submitCompletedTripFinancialDraft,
  });
}

export type TripFinancialFormRuntimeV1 = ReturnType<typeof createTripFinancialFormRuntimeV1>;
