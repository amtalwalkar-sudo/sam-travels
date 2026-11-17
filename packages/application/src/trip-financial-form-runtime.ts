import type { AtomicRecordRepository, RecordRepository } from "../../core/src/repositories";
import type { RecordAuthorV1, RecordEnvelope } from "../../core/src/types";
import { RecordFormWorkingCopyRepository } from "./record-form-working-copy-repository";
import { SharedFormRuntime } from "./shared-form-runtime";
import { TRIP_CANCELLATION_FEE_FORM_V1, TRIP_COMPLETED_FINANCIALS_FORM_V1 } from "./driver-form-definitions";
import { TripFinancialService, submitCompletedTripFinancials, type CompletedTripFinancialValues } from "./trip-financial-service";

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
  return Object.freeze({ forms, financials });
}
