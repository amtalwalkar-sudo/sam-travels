import type { AtomicRecordBatchRepository } from "../../core/src/repositories";
import type { RecordAuthorV1 } from "../../core/src/types";
import type { FinanceLoanRecordV1 } from "./finance-loan-service";
import { FinanceLoanPrepaymentService, type FinanceLoanPrepaymentRevisionBuilder,
  type FinanceLoanPrepaymentStateValidator } from "./finance-loan-prepayment-service";

export function createApplicationFinanceLoanPrepaymentService(
  repository: AtomicRecordBatchRepository,
  loans: { get(id: string): Promise<import("../../core/src/types").RecordEnvelope<FinanceLoanRecordV1> | undefined> },
  validateState: FinanceLoanPrepaymentStateValidator,
  buildRevision: FinanceLoanPrepaymentRevisionBuilder,
  now?: () => string, currentAuthor?: () => Promise<RecordAuthorV1>,
) {
  return new FinanceLoanPrepaymentService(repository, loans, validateState, buildRevision, now, currentAuthor);
}
let applicationFinanceLoanPrepaymentService: FinanceLoanPrepaymentService | undefined;
export function initializeApplicationFinanceLoanPrepaymentService(
  repository: AtomicRecordBatchRepository,
  loans: { get(id: string): Promise<import("../../core/src/types").RecordEnvelope<FinanceLoanRecordV1> | undefined> },
  validateState: FinanceLoanPrepaymentStateValidator,
  buildRevision: FinanceLoanPrepaymentRevisionBuilder,
  now?: () => string, currentAuthor?: () => Promise<RecordAuthorV1>,
) {
  if (applicationFinanceLoanPrepaymentService) throw new Error("Application Finance Loan Prepayment service is already initialized");
  applicationFinanceLoanPrepaymentService = createApplicationFinanceLoanPrepaymentService(
    repository, loans, validateState, buildRevision, now, currentAuthor,
  );
  return applicationFinanceLoanPrepaymentService;
}
export function getApplicationFinanceLoanPrepaymentService(): FinanceLoanPrepaymentService {
  if (!applicationFinanceLoanPrepaymentService) throw new Error("Application Finance Loan Prepayment service has not been initialized");
  return applicationFinanceLoanPrepaymentService;
}
