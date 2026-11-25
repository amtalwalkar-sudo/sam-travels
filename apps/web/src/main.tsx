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
  FeatureRecordService, 
  
  
  
  PerformanceAdminSettingsServiceV1, createPerformanceCalculationServiceV1, BusinessStartDateCostAllocationService, FullCostBreakevenService,
  TripFinancialService, TripFinancialCorrectionServiceV1, HistoricalTripBackfillServiceV1, OperatingConfigurationServiceV1
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
import { createBusinessExpenseHistoricalCorrections } from "./business-expense-corrections";
import { initializePersonIdentityRuntime, getPersonIdentityService } from "./person-identity-runtime";
import { createAdminPresentationAdapters } from "./admin-presentation-adapters";
import { WorkDriverSelectionService } from "../../../packages/application/src/work-driver-selection-service";
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
  const operatingConfiguration = new OperatingConfigurationServiceV1(repository);
  const performanceAdminSettings = new PerformanceAdminSettingsServiceV1(repository);
  const identityService = await initializePersonIdentityRuntime(repository, getPlatformRecordSource());
  const currentAuthor = async () => {
    const actor = await getPersonIdentityService().currentActor();
    return { personId: actor.actorId, role: actor.role };
  };
  FeatureRecordService.setAuthorResolver(currentAuthor);
  initializeApplicationBusinessSettingsService(repository, assertBusinessSettingsRecordV1);
  const driverRecords = initializeApplicationDriverRecordsService(repository, assertDriverRecordV1);
  const vehicles = initializeApplicationVehicleService(repository, assertVehicleRecordV1);
  const workDriverSelection = new WorkDriverSelectionService(repository, undefined, undefined, currentAuthor);
  const adminAdapters = createAdminPresentationAdapters({ identity: identityService, records: repository, source: getPlatformRecordSource(), driverRecords, operatingConfiguration });
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
  }, vehicles, undefined, historicalCorrections, operatingConfiguration);
  initializeApplicationDriverAssignmentService(repository, driverRecords, vehicles);
  const handleBusinessExpenseSubmission = createBusinessExpenseFormSubmissionHandler(
    getApplicationBusinessExpensesService(), getApplicationRecordSource(),
  );
  const financeLoans = initializeApplicationFinanceLoanService(repository, vehicles, assertFinanceLoanRecordV1, createLoanScheduleVersion, loanCalculationInputsChanged, undefined, operatingConfiguration);
  const financePrepayments = initializeApplicationFinanceLoanPrepaymentService(
    repository, financeLoans, assertFinanceLoanPrepaymentStateV1, createLoanPrepaymentRevisionV1, undefined, currentAuthor, operatingConfiguration,
  );
  initializeApplicationFinanceLoanPaymentService(repository, financeLoans, undefined, financePrepayments, currentAuthor, operatingConfiguration);
  initializeApplicationFinanceLoanSettlementService(repository, financeLoans, financePrepayments, undefined, currentAuthor, operatingConfiguration);
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
    calculateMaintenanceVisitTotal, maintenanceBusinessDateFromInstant, undefined, operatingConfiguration,
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
  const tripFinancialCorrections = new TripFinancialCorrectionServiceV1(
    repository, getPersonIdentityService(), getApplicationRecordSource(),
  );
  const tripFinancials = new TripFinancialService(
    repository, getApplicationRecordSource(), undefined, currentAuthor, tripFinancialCorrections,
  );
  const historicalTripBackfills = new HistoricalTripBackfillServiceV1(repository, {
    currentActor: async () => {
      const actor = await getPersonIdentityService().currentActor();
      return { role: actor.role, actorId: actor.actorId };
    },
  }, getApplicationRecordSource());
  const fullCostBreakeven = new FullCostBreakevenService(
    getApplicationVehicleService(), getApplicationMaintenanceService(),
    getApplicationBusinessExpensesService(), costAllocation, tripFinancials, repository, operatingConfiguration,
  );
  const performanceCalculation = createPerformanceCalculationServiceV1({
    businessSettings: getApplicationBusinessSettingsService(),
    adminSettings: performanceAdminSettings,
    fullCost: fullCostBreakeven,
    allocation: costAllocation,
    tripFinancials,
    historicalTripBackfills,
    recordRepository: repository,
  });
  const adminServices = Object.freeze({
    formRuntime,
    operatingConfiguration,
    businessSettings: getApplicationBusinessSettingsService(),
    costAllocation,
    vehicles: getApplicationVehicleService(),
    driverRecords: getApplicationDriverRecordsService(),
    driverAssignments: getApplicationDriverAssignmentService(),
    workDriverSelection,
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
      <AdminServicesProvider services={adminServices} identityAdapter={adminAdapters.identity} maintenanceCorrections={adminAdapters.maintenance} complianceCorrections={adminAdapters.compliance} historicalTripBackfills={historicalTripBackfills}>
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