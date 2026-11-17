import React from "react";
import { createRoot } from "react-dom/client";
import {
  initializeApplicationRuntimeRegistry, getApplicationBusinessSettingsService, getApplicationVehicleService, getApplicationDriverRecordsService,
  getApplicationDriverAssignmentService, getApplicationComplianceService, getApplicationComplianceAnalysisService, initializeApplicationComplianceAnalysisService,
  getApplicationMaintenanceService, getApplicationFinanceLoanService, getApplicationFinanceLoanPaymentService, getApplicationFinanceLoanPrepaymentService,
  getApplicationFinanceLoanSettlementService, getApplicationRecordSource, initializeApplicationFeatureLifecycle, initializeApplicationBusinessSettingsService,
  initializeApplicationVehicleService, initializeApplicationDriverRecordsService, initializeApplicationDriverAssignmentService, initializeApplicationComplianceService,
  initializeApplicationMaintenanceService, initializeApplicationFinanceLoanService, initializeApplicationFinanceLoanPaymentService, initializeApplicationFinanceLoanPrepaymentService,
  initializeApplicationFinanceLoanSettlementService, getApplicationBusinessExpensesService, initializeApplicationBusinessExpensesService, initializeApplicationRecordSource,
  FeatureRecordService, BUSINESS_SETUP_FORM_V1,
  MAINTENANCE_VISIT_FORM_V1,
  LOAN_PAYMENT_FORM_V1,
  PRE_BUSINESS_COST_FORM_V1,
  PerformanceAdminSettingsServiceV1, createPerformanceCalculationServiceV1, BusinessStartDateCostAllocationService, FullCostBreakevenService,
  TripFinancialService
} from "../../../packages/application/src";
import { assertBusinessSettingsRecordV1 } from "../../../packages/features/business-settings";
import { assertBusinessExpenseRecordV1, assertFuelPurchaseV1, assertBusinessExpenseEntryV1, calculateDailyBusinessExpenses, calculateFuelIntervals, calculateFuelCostRateHistory } from "../../../packages/features/business-expenses";
import { assertVehicleRecordV1 } from "../../../packages/features/vehicle";
import { assertDriverRecordV1 } from "../../../packages/features/driver-records";
import { assertComplianceRecordV1, analyzeComplianceCoverage, calculateDailyComplianceCost, resolveComplianceOverlapReview, ComplianceOverlapReviewService } from "../../../packages/features/compliance";
import {
  assertMaintenanceRecordV1, calculateMaintenanceVisitTotal, maintenanceBusinessDateFromInstant
} from "../../../packages/features/maintenance";
import {
  assertFinanceLoanRecordV1, createLoanScheduleVersion, loanCalculationInputsChanged, assertFinanceLoanPrepaymentStateV1,
  createLoanPrepaymentRevisionV1
} from "../../../packages/features/finance";
import { DISCOVERED_FEATURE_EXTENSIONS } from "./generated-feature-catalog";
import { createPlatformRepository, getPlatformRecordSource } from "./native-store";
import { registerBrowserBackupParticipants } from "./register-browser-backup-participants";
import { createBusinessExpenseFormSubmissionHandler } from "./business-expense-form-submission";
import { createBusinessExpenseEnrichmentQueue } from "./business-expense-enrichment-runtime";
import { createBusinessExpenseHistoricalCorrections } from "./business-expense-corrections";
import { initializePersonIdentityRuntime, getPersonIdentityService } from "./person-identity-runtime";
import { createAdminPresentationAdapters } from "./admin-presentation-adapters";
import { createAdminFormRuntimeV1 } from "./admin-form-runtime";
import { App } from "./ui/App";
import { AdminServicesProvider } from "./ui/admin-services-context";
import "./ui/styles.css";
// Initialize contracts, backup validators, and platform services before lifecycle/UI.
async function bootstrap(): Promise<void> {
  const runtimeRegistry = initializeApplicationRuntimeRegistry({ extensions: [...DISCOVERED_FEATURE_EXTENSIONS] });
  initializeApplicationRecordSource(getPlatformRecordSource());
  registerBrowserBackupParticipants();
  const repository = await createPlatformRepository();
  const performanceAdminSettings = new PerformanceAdminSettingsServiceV1(repository);
  const businessExpenseEnrichmentQueue = createBusinessExpenseEnrichmentQueue(repository);
  const identityService = await initializePersonIdentityRuntime(repository, getPlatformRecordSource());
  FeatureRecordService.setAuthorResolver(async () => {
    const actor = await getPersonIdentityService().currentActor();
    return { personId: actor.actorId, role: actor.role };
  });
  initializeApplicationBusinessSettingsService(repository, assertBusinessSettingsRecordV1);
  const driverRecords = initializeApplicationDriverRecordsService(repository, assertDriverRecordV1);
  const vehicles = initializeApplicationVehicleService(repository, assertVehicleRecordV1);
  const adminAdapters = createAdminPresentationAdapters({ identity: identityService, records: repository, source: getPlatformRecordSource(), driverRecords });
  const historicalCorrections = createBusinessExpenseHistoricalCorrections(
    repository, getApplicationRecordSource(), getPersonIdentityService(),
  );
  initializeApplicationBusinessExpensesService(repository, {
    validateRecord: assertBusinessExpenseRecordV1,
    validateFuelPurchase: assertFuelPurchaseV1,
    validateExpenseEntry: assertBusinessExpenseEntryV1,
    calculateDailyExpenses: calculateDailyBusinessExpenses,
    calculateFuelIntervals,
    calculateFuelCostRateHistory,
  }, vehicles, undefined, historicalCorrections);
  initializeApplicationDriverAssignmentService(repository, driverRecords, vehicles);
  const handleBusinessExpenseSubmission = createBusinessExpenseFormSubmissionHandler(
    getApplicationBusinessExpensesService(), getApplicationRecordSource(), businessExpenseEnrichmentQueue,
  );
  const financeLoans = initializeApplicationFinanceLoanService(repository, vehicles, assertFinanceLoanRecordV1, createLoanScheduleVersion, loanCalculationInputsChanged);
  const financePrepayments = initializeApplicationFinanceLoanPrepaymentService(
    repository, financeLoans, assertFinanceLoanPrepaymentStateV1, createLoanPrepaymentRevisionV1,
  );
  initializeApplicationFinanceLoanPaymentService(repository, financeLoans, undefined, financePrepayments);
  initializeApplicationFinanceLoanSettlementService(repository, financeLoans, financePrepayments);
  initializeApplicationComplianceService(repository, assertComplianceRecordV1, vehicles);
  const complianceReviewEvents = new ComplianceOverlapReviewService(repository, {
    currentActor: async () => {
      const actor = await getPersonIdentityService().currentActor();
      return { actorId: actor.actorId, role: actor.role };
    },
  }, getApplicationRecordSource());
  initializeApplicationComplianceAnalysisService(
    getApplicationComplianceService(), complianceReviewEvents, getPersonIdentityService(), {
      analyzeCoverage: analyzeComplianceCoverage,
      resolveOverlap: resolveComplianceOverlapReview,
      calculateDailyCost: calculateDailyComplianceCost,
      validateProjectedComplianceData: assertComplianceRecordV1,
    },
    adminAdapters.compliance,
  );
  initializeApplicationMaintenanceService(
    repository, assertMaintenanceRecordV1, vehicles,
    calculateMaintenanceVisitTotal, maintenanceBusinessDateFromInstant,
  );
  initializeApplicationFeatureLifecycle(repository);
  const formRuntime = createAdminFormRuntimeV1({
    repository,
    recordSource: getApplicationRecordSource(),
    performanceAdminSettings,
    handleBusinessExpenseSubmission,
  });
  const costAllocation = new BusinessStartDateCostAllocationService(
    getApplicationBusinessSettingsService(), getApplicationComplianceAnalysisService(),
    getApplicationFinanceLoanService(), getApplicationFinanceLoanPrepaymentService(),
    getApplicationFinanceLoanPaymentService(), undefined, repository, getApplicationRecordSource(),
  );
  const tripFinancials = new TripFinancialService(repository, getApplicationRecordSource());
  const fullCostBreakeven = new FullCostBreakevenService(
    getApplicationVehicleService(), getApplicationMaintenanceService(),
    getApplicationBusinessExpensesService(), costAllocation, tripFinancials,
  );
  const performanceCalculation = createPerformanceCalculationServiceV1({
    businessSettings: getApplicationBusinessSettingsService(),
    adminSettings: performanceAdminSettings,
    fullCost: fullCostBreakeven,
    allocation: costAllocation,
    tripFinancials,
    recordRepository: repository,
  });
  const adminServices = Object.freeze({
    formRuntime,
    businessSettings: getApplicationBusinessSettingsService(),
    costAllocation,
    vehicles: getApplicationVehicleService(),
    driverRecords: getApplicationDriverRecordsService(),
    driverAssignments: getApplicationDriverAssignmentService(),
    compliance: getApplicationComplianceService(),
    complianceAnalysis: getApplicationComplianceAnalysisService(),
    maintenance: getApplicationMaintenanceService(),
    financeLoans: getApplicationFinanceLoanService(),
    financeLoanPayments: getApplicationFinanceLoanPaymentService(),
    financeLoanPrepayments: getApplicationFinanceLoanPrepaymentService(),
    financeLoanSettlements: getApplicationFinanceLoanSettlementService(),
    businessExpenses: getApplicationBusinessExpensesService(),
    performanceSettings: performanceAdminSettings,
    performanceCalculation,
    recordSource: getApplicationRecordSource(),
  });
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <AdminServicesProvider services={adminServices} identityAdapter={adminAdapters.identity} maintenanceCorrections={adminAdapters.maintenance} complianceCorrections={adminAdapters.compliance}>
        <App runtimeRegistry={runtimeRegistry} platformRepository={repository} fullCostBreakeven={fullCostBreakeven} performanceCalculation={performanceCalculation} />
      </AdminServicesProvider>
    </React.StrictMode>,
  );
}
void bootstrap();
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js")
      .catch(error => console.warn("PWA shell caching is unavailable", error));
  }, { once: true });
}