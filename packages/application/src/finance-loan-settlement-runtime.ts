import type { AtomicRecordBatchRepository } from "../../core/src/repositories";
import type { RecordAuthorV1 } from "../../core/src/types";
import type { FinanceLoanService } from "./finance-loan-service";
import type { FinanceLoanScheduleResolver } from "./finance-loan-payment-service";
import { FinanceLoanSettlementService } from "./finance-loan-settlement-service";

export function createApplicationFinanceLoanSettlementService(
  repository: AtomicRecordBatchRepository, loans: FinanceLoanService,
  schedules: FinanceLoanScheduleResolver, now?: () => string, currentAuthor?: () => Promise<RecordAuthorV1>,
) {
  return new FinanceLoanSettlementService(repository, loans, schedules, now, currentAuthor);
}
let applicationFinanceLoanSettlementService: FinanceLoanSettlementService | undefined;
export function initializeApplicationFinanceLoanSettlementService(
  repository: AtomicRecordBatchRepository, loans: FinanceLoanService,
  schedules: FinanceLoanScheduleResolver, now?: () => string, currentAuthor?: () => Promise<RecordAuthorV1>,
) {
  if (applicationFinanceLoanSettlementService) throw new Error("Application Finance Loan Settlement service is already initialized");
  applicationFinanceLoanSettlementService = createApplicationFinanceLoanSettlementService(repository, loans, schedules, now, currentAuthor);
  return applicationFinanceLoanSettlementService;
}
export function getApplicationFinanceLoanSettlementService(): FinanceLoanSettlementService {
  if (!applicationFinanceLoanSettlementService) throw new Error("Application Finance Loan Settlement service has not been initialized");
  return applicationFinanceLoanSettlementService;
}
