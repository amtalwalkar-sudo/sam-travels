import React from "react";
import { createRoot } from "react-dom/client";
import {
  initializeApplicationRuntimeRegistry,
  getApplicationBusinessSettingsService,
  getApplicationVehicleService,
  getApplicationDriverRecordsService,
  getApplicationDriverAssignmentService,
  getApplicationComplianceService,
  getApplicationComplianceAnalysisService,
  initializeApplicationComplianceAnalysisService,
  getApplicationMaintenanceService,
  getApplicationFinanceLoanService,
  getApplicationFinanceLoanPaymentService,
  getApplicationFinanceLoanPrepaymentService,
  getApplicationFinanceLoanSettlementService,
  getApplicationRecordSource,
  initializeApplicationFeatureLifecycle,
  initializeApplicationBusinessSettingsService,
  initializeApplicationVehicleService,
  initializeApplicationDriverRecordsService,
  initializeApplicationDriverAssignmentService,
  initializeApplicationComplianceService,
  initializeApplicationMaintenanceService,
  initializeApplicationFinanceLoanService,
  initializeApplicationFinanceLoanPaymentService,
  initializeApplicationFinanceLoanPrepaymentService,
  initializeApplicationFinanceLoanSettlementService,
  getApplicationBusinessExpensesService,
  initializeApplicationBusinessExpensesService,
  initializeApplicationRecordSource,
  RecordFormWorkingCopyRepository,
  FeatureRecordService,
  SharedFormRuntime,
  BUSINESS_SETUP_FORM_V1,
  VEHICLE_FORM_V1,
  DRIVER_FORM_V1,
  COMPLIANCE_FORM_V1,
  MAINTENANCE_VISIT_FORM_V1,
  MAINTENANCE_EXPENSE_FORM_V1,
  MAINTENANCE_RATE_FORM_V1,
  LOAN_DETAILS_FORM_V1,
  LOAN_PAYMENT_FORM_V1,
  LOAN_PREPAYMENT_FORM_V1,
  LOAN_SETTLEMENT_FORM_V1,
  BusinessStartDateCostAllocationService,
  FullCostBreakevenService,
  TripFinancialService,
} from "../../../packages/application/src";
import { assertBusinessSettingsRecordV1 } from "../../../packages/features/business-settings";
import { assertBusinessExpenseRecordV1, assertFuelPurchaseV1, assertBusinessExpenseEntryV1, calculateDailyBusinessExpenses, calculateFuelIntervals, calculateFuelCostRateHistory } from "../../../packages/features/business-expenses";
import { assertVehicleRecordV1 } from "../../../packages/features/vehicle";
import { assertDriverRecordV1 } from "../../../packages/features/driver-records";
import { assertComplianceRecordV1, analyzeComplianceCoverage, calculateDailyComplianceCost, resolveComplianceOverlapReview, ComplianceOverlapReviewService } from "../../../packages/features/compliance";
import {
  assertMaintenanceRecordV1,
  calculateMaintenanceVisitTotal,
  maintenanceBusinessDateFromInstant,
} from "../../../packages/features/maintenance";
import { assertFinanceLoanRecordV1, createLoanScheduleVersion, loanCalculationInputsChanged,
  assertFinanceLoanPrepaymentStateV1, createLoanPrepaymentRevisionV1 } from "../../../packages/features/finance";
import { DISCOVERED_FEATURE_EXTENSIONS } from "./generated-feature-catalog";
import { createPlatformRepository, getPlatformRecordSource } from "./native-store";
import { registerBrowserBackupParticipants } from "./register-browser-backup-participants";
import { handleBusinessExpenseFormSubmission } from "./business-expense-form-submission";
import { createBusinessExpenseEnrichmentQueue } from "./business-expense-enrichment-runtime";
import { createBusinessExpenseHistoricalCorrections } from "./business-expense-corrections";
import { initializePersonIdentityRuntime, getPersonIdentityService } from "./person-identity-runtime";
import { App } from "./ui/App";
import { AdminServicesProvider } from "./ui/admin-services-context";
import "./ui/styles.css";
// Initialize contracts, backup validators, and platform services before lifecycle/UI.
async function bootstrap(): Promise<void> {
  const runtimeRegistry = initializeApplicationRuntimeRegistry({ extensions: [...DISCOVERED_FEATURE_EXTENSIONS] });
  initializeApplicationRecordSource(getPlatformRecordSource());
  registerBrowserBackupParticipants();
  const repository = await createPlatformRepository();
  const businessExpenseEnrichmentQueue = createBusinessExpenseEnrichmentQueue(repository);
  await initializePersonIdentityRuntime(repository, getPlatformRecordSource());
  FeatureRecordService.setAuthorResolver(async () => {
    const actor = await getPersonIdentityService().currentActor();
    return { personId: actor.actorId, role: actor.role };
  });
  initializeApplicationBusinessSettingsService(repository, assertBusinessSettingsRecordV1);
  const driverRecords = initializeApplicationDriverRecordsService(repository, assertDriverRecordV1);
  const vehicles = initializeApplicationVehicleService(repository, assertVehicleRecordV1);
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
    historicalCorrections,
  );
  initializeApplicationMaintenanceService(
    repository, assertMaintenanceRecordV1, vehicles,
    calculateMaintenanceVisitTotal, maintenanceBusinessDateFromInstant,
  );
  initializeApplicationFeatureLifecycle(repository);
  const formRuntime = new SharedFormRuntime(
    new RecordFormWorkingCopyRepository(repository, getApplicationRecordSource()),
    {
      submit: async (command) => {
        const expenseResult = await handleBusinessExpenseFormSubmission(command, businessExpenseEnrichmentQueue);
        if (expenseResult !== undefined) return expenseResult;
        if (command.action !== "save") throw new Error("unsupported_admin_form_operation");
        if (command.formId === BUSINESS_SETUP_FORM_V1.id) {
          const businessStartDate = command.values.businessStartDate;
          if (typeof businessStartDate !== "string") throw new Error("business_start_date_required");
          return getApplicationBusinessSettingsService().setBusinessStartDate(
            businessStartDate, getApplicationRecordSource(),
          );
        }
        if (command.formId === COMPLIANCE_FORM_V1.id) {
          const values = command.values;
          const complianceName = String(values.complianceName ?? "").trim();
          const validFrom = String(values.validFrom ?? "");
          const validTo = String(values.validTo ?? "");
          const paise = values.totalCostPaise;
          if (validTo < validFrom) throw new Error("compliance_validity_period_invalid");
          if (typeof paise !== "number" || !Number.isSafeInteger(paise) || paise < 0) {
            throw new Error("compliance_cost_invalid");
          }
          const documentRef = typeof values.supportingDocumentRef === "string"
            ? values.supportingDocumentRef.trim() : "";
          const renewedFromRecordId = typeof values.renewedFromRecordId === "string"
            ? values.renewedFromRecordId.trim() : "";
          return getApplicationComplianceService().create({
            uuid: command.instanceId,
            data: {
              schemaVersion: 1,
              vehicleId: String(values.vehicleId ?? ""),
              complianceName,
              validFrom,
              validTo,
              totalCostPaise: paise,
              ...(documentRef ? { supportingDocumentRef: documentRef } : {}),
              ...(renewedFromRecordId ? { renewedFromRecordId } : {}),
            },
            source: getApplicationRecordSource(),
            businessDate: validFrom,
          });
        }
        if (command.formId === MAINTENANCE_VISIT_FORM_V1.id) {
          const values = command.values;
          const itemsValue = values.itemsJson;
          if (typeof itemsValue !== "string") throw new Error("maintenance_items_required");
          let items: unknown;
          try { items = JSON.parse(itemsValue); } catch { throw new Error("maintenance_items_invalid"); }
          if (!Array.isArray(items)) throw new Error("maintenance_items_invalid");
          return getApplicationMaintenanceService().createVisit({
            uuid: command.instanceId,
            source: getApplicationRecordSource(),
            data: {
              vehicleId: String(values.vehicleId ?? ""),
              maintenanceDate: String(values.maintenanceDate ?? ""),
              maintenanceType: String(values.maintenanceType ?? "").trim(),
              description: String(values.description ?? "").trim(),
              items: items as import("../../../packages/application/src").MaintenanceExpenseItemV1[],
              ...(typeof values.odometerKm === "number" ? { odometerKm: values.odometerKm } : {}),
              ...(typeof values.provider === "string" && values.provider.trim() ? { provider: values.provider.trim() } : {}),
              ...(typeof values.nextServiceDate === "string" && values.nextServiceDate ? { nextServiceDate: values.nextServiceDate } : {}),
              ...(typeof values.nextServiceKm === "number" ? { nextServiceKm: values.nextServiceKm } : {}),
            },
          });
        }
        if (command.formId === MAINTENANCE_EXPENSE_FORM_V1.id) {
          const values = command.values;
          const amountPaise = values.amountPaise;
          if (typeof amountPaise !== "number" || !Number.isSafeInteger(amountPaise) || amountPaise < 0) {
            throw new Error("maintenance_expense_amount_invalid");
          }
          return getApplicationMaintenanceService().createExpense({
            uuid: command.instanceId,
            source: getApplicationRecordSource(),
            data: {
              vehicleId: String(values.vehicleId ?? ""),
              expenseDate: String(values.expenseDate ?? ""),
              expenseName: String(values.expenseName ?? "").trim(),
              description: String(values.description ?? "").trim(),
              amountPaise,
              ...(typeof values.odometerKm === "number" ? { odometerKm: values.odometerKm } : {}),
              ...(typeof values.provider === "string" && values.provider.trim() ? { provider: values.provider.trim() } : {}),
            },
          });
        }
        if (command.formId === MAINTENANCE_RATE_FORM_V1.id) {
          const values = command.values;
          const ratePaisePerKm = values.ratePaisePerKm;
          if (typeof ratePaisePerKm !== "number" || !Number.isSafeInteger(ratePaisePerKm) || ratePaisePerKm < 0) {
            throw new Error("maintenance_rate_invalid");
          }
          return getApplicationMaintenanceService().setRate({
            vehicleId: String(values.vehicleId ?? ""),
            ratePaisePerKm,
            commandId: command.instanceId,
            source: getApplicationRecordSource(),
          });
        }
        if (command.formId === LOAN_PAYMENT_FORM_V1.id) {
          const values = command.values;
          let allocations: unknown;
          try { allocations = JSON.parse(String(values.allocationsJson ?? "[]")); }
          catch { throw new Error("finance_payment_allocations_invalid"); }
          if (!Array.isArray(allocations)) throw new Error("finance_payment_allocations_invalid");
          const amountPaise = values.amountPaise;
          const scheduleVersion = values.scheduleVersion;
          if (typeof amountPaise !== "number" || !Number.isSafeInteger(amountPaise) || amountPaise <= 0 ||
              typeof scheduleVersion !== "number" || !Number.isSafeInteger(scheduleVersion) || scheduleVersion < 1) {
            throw new Error("finance_payment_input_invalid");
          }
          return getApplicationFinanceLoanPaymentService().record({
            id: command.operationId, commandId: command.operationId,
            loanId: String(values.loanId ?? ""), businessDate: String(values.businessDate ?? ""),
            amountPaise, method: values.method as import("../../../packages/application/src").FinancePaymentMethodV1,
            scheduleVersion,
            allocations: allocations as readonly { installmentNumber: number; amountPaise: number }[],
            ...(typeof values.reference === "string" && values.reference.trim() ? { reference: values.reference.trim() } : {}),
            ...(typeof values.note === "string" && values.note.trim() ? { note: values.note.trim() } : {}),
            source: getApplicationRecordSource(),
          });
        }
        if (command.formId === LOAN_PREPAYMENT_FORM_V1.id) {
          const values = command.values;
          let preview: unknown;
          try { preview = JSON.parse(String(values.previewJson ?? "")); }
          catch { throw new Error("finance_loan_prepayment_preview_invalid"); }
          if (!preview || typeof preview !== "object") throw new Error("finance_loan_prepayment_preview_invalid");
          return getApplicationFinanceLoanPrepaymentService().commit({
            preview: preview as import("../../../packages/application/src").FinanceLoanPrepaymentPreviewV1,
            source: getApplicationRecordSource(),
          });
        }
        if (command.formId === LOAN_SETTLEMENT_FORM_V1.id) {
          const values = command.values;
          let preview: unknown;
          try { preview = JSON.parse(String(values.previewJson ?? "")); }
          catch { throw new Error("finance_payment_settlement_preview_invalid"); }
          if (!preview || typeof preview !== "object") throw new Error("finance_payment_settlement_preview_invalid");
          return getApplicationFinanceLoanSettlementService().commit({
            id: command.operationId, commandId: command.operationId,
            loanId: String(values.loanId ?? ""), businessDate: String(values.businessDate ?? ""),
            method: values.method as import("../../../packages/application/src").FinancePaymentMethodV1,
            ...(typeof values.reference === "string" && values.reference.trim() ? { reference: values.reference.trim() } : {}),
            source: getApplicationRecordSource(),
            preview: preview as { amountPaise: number; scheduleVersion: number; paidThroughInstallment: number;
              loanRevision: number; paymentLedgerRevision: number | null },
          });
        }
        if (command.formId === LOAN_DETAILS_FORM_V1.id) {
          const values = command.values;
          const principalPaise = values.principalPaise;
          const annualInterestRateBasisPoints = values.annualInterestRateBasisPoints;
          const tenureMonths = values.tenureMonths;
          if (typeof principalPaise !== "number" || !Number.isSafeInteger(principalPaise) || principalPaise <= 0 ||
              typeof annualInterestRateBasisPoints !== "number" || !Number.isSafeInteger(annualInterestRateBasisPoints) || annualInterestRateBasisPoints < 0 ||
              typeof tenureMonths !== "number" || !Number.isSafeInteger(tenureMonths) || tenureMonths < 1 || tenureMonths > 1200) {
            throw new Error("finance_loan_calculation_inputs_invalid");
          }
          const loanAccountReference = typeof values.loanAccountReference === "string" ? values.loanAccountReference.trim() : "";
          const details = {
            loanName: String(values.loanName ?? "").trim(),
            lenderName: String(values.lenderName ?? "").trim(),
            ...(loanAccountReference ? { loanAccountReference } : {}),
            vehicleId: String(values.vehicleId ?? ""),
            principalPaise,
            annualInterestRateBasisPoints,
            loanStartDate: String(values.loanStartDate ?? ""),
            tenureMonths,
            firstEmiDate: String(values.firstEmiDate ?? ""),
          };
          // Legacy edit drafts carry record metadata; reject them instead of mutating or duplicating history.
          if (typeof values._recordRevision === "number") throw new Error("finance_loan_details_immutable");
          return getApplicationFinanceLoanService().create({
            uuid: command.instanceId, details, source: getApplicationRecordSource(),
          });
        }
        if (command.formId === DRIVER_FORM_V1.id) {
          const values = command.values;
          const driverId = command.instanceId.startsWith("new:")
            ? command.instanceId.slice(4) : command.instanceId;
          const data = {
            schemaVersion: 1 as const,
            driverId,
            name: String(values.name ?? "").trim(),
            lifecycleState: values.lifecycleState as "active" | "inactive",
            ...(typeof values.licenceNumber === "string" && values.licenceNumber.trim()
              ? { licenceNumber: values.licenceNumber.trim() } : {}),
            ...(typeof values.licenceExpiryDate === "string" && values.licenceExpiryDate
              ? { licenceExpiryDate: values.licenceExpiryDate } : {}),
            ...(typeof values.mobileNumber === "string" && values.mobileNumber.trim()
              ? { mobileNumber: values.mobileNumber.trim() } : {}),
            selectedForWork: values.lifecycleState === "active" && values._selectedForWork === true,
          };
          const revision = values._recordRevision;
          if (typeof revision === "number") {
            return getApplicationDriverRecordsService().update({ driverId, expectedRevision: revision, data });
          }
          return getApplicationDriverRecordsService().create(data, getApplicationRecordSource());
        }
        if (command.formId === VEHICLE_FORM_V1.id) {
          const values = command.values;
          const data = {
            schemaVersion: 1 as const,
            registrationNumber: String(values.registrationNumber ?? "").trim().toUpperCase(),
            make: String(values.make ?? "").trim(),
            model: String(values.model ?? "").trim(),
            vehicleType: String(values.vehicleType ?? "").trim(),
            fuelType: String(values.fuelType ?? ""),
            yearOfManufacture: Number(values.yearOfManufacture),
            ownership: String(values.ownership ?? ""),
            lifecycleState: values.lifecycleState as "active" | "inactive" | "sold",
          };
          const revision = values._recordRevision;
          if (typeof revision === "number") {
            return getApplicationVehicleService().update({
              id: command.instanceId, expectedRevision: revision, data,
            });
          }
          return getApplicationVehicleService().create(data, getApplicationRecordSource());
        }
        throw new Error("unsupported_admin_form_operation");
      },
    },
  );
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
    recordSource: getApplicationRecordSource(),
  });
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <AdminServicesProvider services={adminServices} identityRecords={repository}>
        <App adminServices={adminServices} runtimeRegistry={runtimeRegistry} platformRepository={repository} fullCostBreakeven={fullCostBreakeven} />
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