import type { getApplicationBusinessSettingsService } from "./business-settings-runtime";
import type { getApplicationVehicleService } from "./vehicle-runtime";
import type { getApplicationDriverRecordsService } from "./driver-records-runtime";
import type { getApplicationDriverAssignmentService } from "./driver-assignment-runtime";
import type { getApplicationComplianceService } from "./compliance-runtime";
import type { getApplicationMaintenanceService } from "./maintenance-runtime";
import type { getApplicationFinanceLoanService } from "./finance-loan-runtime";
import type { getApplicationFinanceLoanPaymentService } from "./finance-loan-payment-runtime";
import type { getApplicationFinanceLoanPrepaymentService } from "./finance-loan-prepayment-runtime";
import type { getApplicationFinanceLoanSettlementService } from "./finance-loan-settlement-runtime";
import type { getApplicationRecordSource } from "./platform-context";

/**
 * Explicit application-service dependencies supplied by the composition root
 * to the Admin presentation. UI components never locate global services.
 */
export type AdminPresentationServices = Readonly<{
  businessSettings: ReturnType<typeof getApplicationBusinessSettingsService>;
  vehicles: ReturnType<typeof getApplicationVehicleService>;
  driverRecords: ReturnType<typeof getApplicationDriverRecordsService>;
  driverAssignments: ReturnType<typeof getApplicationDriverAssignmentService>;
  compliance: ReturnType<typeof getApplicationComplianceService>;
  maintenance: ReturnType<typeof getApplicationMaintenanceService>;
  financeLoans: ReturnType<typeof getApplicationFinanceLoanService>;
  financeLoanPayments: ReturnType<typeof getApplicationFinanceLoanPaymentService>;
  financeLoanPrepayments: ReturnType<typeof getApplicationFinanceLoanPrepaymentService>;
  financeLoanSettlements: ReturnType<typeof getApplicationFinanceLoanSettlementService>;
  recordSource: ReturnType<typeof getApplicationRecordSource>;
}>;
