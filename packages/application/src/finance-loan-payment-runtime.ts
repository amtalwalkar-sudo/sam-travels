import type { AtomicRecordBatchRepository } from "../../core/src/repositories";
import type { RecordAuthorV1 } from "../../core/src/types";
import type { FinanceLoanService } from "./finance-loan-service";
import { FinanceLoanPaymentService, type FinanceLoanScheduleResolver } from "./finance-loan-payment-service";

export function createApplicationFinanceLoanPaymentService(repository: AtomicRecordBatchRepository, loans: FinanceLoanService,
  now?: () => string, scheduleResolver?: FinanceLoanScheduleResolver, currentAuthor?: () => Promise<RecordAuthorV1>) {
  return new FinanceLoanPaymentService(repository, loans, now, scheduleResolver, currentAuthor);
}
let applicationFinanceLoanPaymentService: FinanceLoanPaymentService | undefined;
export function initializeApplicationFinanceLoanPaymentService(repository: AtomicRecordBatchRepository, loans: FinanceLoanService,
  now?: () => string, scheduleResolver?: FinanceLoanScheduleResolver, currentAuthor?: () => Promise<RecordAuthorV1>) {
  if (applicationFinanceLoanPaymentService) throw new Error("Application Finance Loan Payment service is already initialized");
  applicationFinanceLoanPaymentService = createApplicationFinanceLoanPaymentService(repository, loans, now, scheduleResolver, currentAuthor);
  return applicationFinanceLoanPaymentService;
}
export function getApplicationFinanceLoanPaymentService(): FinanceLoanPaymentService {
  if (!applicationFinanceLoanPaymentService) throw new Error("Application Finance Loan Payment service has not been initialized");
  return applicationFinanceLoanPaymentService;
}
