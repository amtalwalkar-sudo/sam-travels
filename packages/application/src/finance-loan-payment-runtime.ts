import type { AtomicRecordRepository } from "../../core/src/repositories";
import type { FinanceLoanService } from "./finance-loan-service";
import { FinanceLoanPaymentService } from "./finance-loan-payment-service";

export function createApplicationFinanceLoanPaymentService(repository: AtomicRecordRepository, loans: FinanceLoanService, now?: () => string) {
  return new FinanceLoanPaymentService(repository, loans, now);
}
let applicationFinanceLoanPaymentService: FinanceLoanPaymentService | undefined;
export function initializeApplicationFinanceLoanPaymentService(repository: AtomicRecordRepository, loans: FinanceLoanService, now?: () => string) {
  if (applicationFinanceLoanPaymentService) throw new Error("Application Finance Loan Payment service is already initialized");
  applicationFinanceLoanPaymentService = createApplicationFinanceLoanPaymentService(repository, loans, now);
  return applicationFinanceLoanPaymentService;
}
export function getApplicationFinanceLoanPaymentService(): FinanceLoanPaymentService {
  if (!applicationFinanceLoanPaymentService) throw new Error("Application Finance Loan Payment service has not been initialized");
  return applicationFinanceLoanPaymentService;
}
