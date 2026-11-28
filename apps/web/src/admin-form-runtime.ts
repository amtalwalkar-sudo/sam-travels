import {
  SharedFormRuntime, RecordFormWorkingCopyRepository,
  type FormWorkingCopyRepository,
  getApplicationBusinessSettingsService, getApplicationComplianceService,
  getApplicationMaintenanceService, getApplicationFinanceLoanService, getApplicationFinanceLoanPaymentService,
  getApplicationFinanceLoanPrepaymentService, getApplicationFinanceLoanSettlementService,
  getApplicationDriverRecordsService, getApplicationVehicleService,
  BUSINESS_SETUP_FORM_V1, VEHICLE_FORM_V1, DRIVER_FORM_V1, COMPLIANCE_FORM_V1,
  MAINTENANCE_VISIT_FORM_V1, MAINTENANCE_EXPENSE_FORM_V1, MAINTENANCE_RATE_FORM_V1,
  LOAN_DETAILS_FORM_V1, LOAN_PAYMENT_FORM_V1, LOAN_PREPAYMENT_FORM_V1, LOAN_SETTLEMENT_FORM_V1,
  PERFORMANCE_DRIVER_TARGET_FORM_V1, PRE_BUSINESS_COST_FORM_V1,
  type FeatureRecordSource, type PerformanceAdminSettingsServiceV1,
} from "../../../packages/application/src";
import type { AtomicRecordRepository, RecordRepository } from "../../../packages/core/src";
import type { FormSubmissionCommand } from "../../../packages/application/src/form-submission-port";

type AdminFormRepositoryV1 = RecordRepository & AtomicRecordRepository;
type BusinessExpenseSubmissionV1 = (command: FormSubmissionCommand) => Promise<unknown>;
type VehicleAdminServiceV1 = Pick<ReturnType<typeof getApplicationVehicleService>, "create" | "update">;

/** Feature-specific Admin form command routing, kept out of platform bootstrap. */
export function createAdminFormRuntimeV1(dependencies: Readonly<{
  repository: AdminFormRepositoryV1;
  recordSource: FeatureRecordSource;
  performanceAdminSettings: PerformanceAdminSettingsServiceV1;
  handleBusinessExpenseSubmission: BusinessExpenseSubmissionV1;
  vehicleService?: VehicleAdminServiceV1;
  workingCopyRepository?: FormWorkingCopyRepository;
}>): SharedFormRuntime {
  const { repository, recordSource, performanceAdminSettings, handleBusinessExpenseSubmission } = dependencies;
  const vehicleService = dependencies.vehicleService ?? getApplicationVehicleService();
  return new SharedFormRuntime(
    dependencies.workingCopyRepository ?? new RecordFormWorkingCopyRepository(repository, recordSource),
    {
      submit: async (command) => {
        const expenseResult = await handleBusinessExpenseSubmission(command);
        if (expenseResult !== undefined) return expenseResult;
        if (command.action !== "save" && command.action !== "submit") throw new Error("unsupported_admin_form_operation");
        if (command.formId === PERFORMANCE_DRIVER_TARGET_FORM_V1.id) {
          const rupees = Number(command.values.monthlyTargetRupees);
          if (!Number.isFinite(rupees) || rupees < 0 || !Number.isSafeInteger(Math.round(rupees * 100))) {
            throw new Error("performance_driver_target_invalid");
          }
          return performanceAdminSettings.setMonthlyDriverTargetPaise(
            Math.round(rupees * 100), recordSource,
            { operationId: command.operationId, payloadFingerprint: command.payloadFingerprint },
            command.submittedAt,
          );
        }
        if (command.formId === PRE_BUSINESS_COST_FORM_V1.id) {
          const rupees = Number(command.values.amountRupees);
          const note = String(command.values.note ?? "").trim();
          if (!Number.isFinite(rupees) || rupees <= 0 || !Number.isSafeInteger(Math.round(rupees * 100)) || !note) {
            throw new Error("performance_pre_business_cost_invalid");
          }
          return performanceAdminSettings.createPreBusinessCost({
            commandId: command.instanceId,
            amountPaise: Math.round(rupees * 100),
            note,
            source: recordSource,
            operation: { operationId: command.operationId, payloadFingerprint: command.payloadFingerprint },
            now: command.submittedAt,
          });
        }
        if (command.formId === BUSINESS_SETUP_FORM_V1.id) {
          const businessStartDate = command.values.businessStartDate;
          if (typeof businessStartDate !== "string") throw new Error("business_start_date_required");
          return getApplicationBusinessSettingsService().setBusinessStartDate(
            businessStartDate, recordSource,
            { operationId: command.operationId, payloadFingerprint: command.payloadFingerprint },
            command.submittedAt,
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
            source: recordSource,
            businessDate: validFrom,
            operation: { operationId: command.operationId, payloadFingerprint: command.payloadFingerprint },
            now: command.submittedAt,
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
            source: recordSource,
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
            operation: { operationId: command.operationId, payloadFingerprint: command.payloadFingerprint },
            now: command.submittedAt,
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
            source: recordSource,
            data: {
              vehicleId: String(values.vehicleId ?? ""),
              expenseDate: String(values.expenseDate ?? ""),
              expenseName: String(values.expenseName ?? "").trim(),
              description: String(values.description ?? "").trim(),
              amountPaise,
              ...(typeof values.odometerKm === "number" ? { odometerKm: values.odometerKm } : {}),
              ...(typeof values.provider === "string" && values.provider.trim() ? { provider: values.provider.trim() } : {}),
            },
            operation: { operationId: command.operationId, payloadFingerprint: command.payloadFingerprint },
            now: command.submittedAt,
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
            source: recordSource,
            operation: { operationId: command.operationId, payloadFingerprint: command.payloadFingerprint },
            now: command.submittedAt,
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
            source: recordSource, now: command.submittedAt,
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
            source: recordSource, now: command.submittedAt,
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
            source: recordSource,
            preview: preview as { amountPaise: number; scheduleVersion: number; paidThroughInstallment: number;
              loanRevision: number; paymentLedgerRevision: number | null },
            now: command.submittedAt,
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
            uuid: command.instanceId, details, source: recordSource,
            operation: { operationId: command.operationId, payloadFingerprint: command.payloadFingerprint },
            now: command.submittedAt,
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
            return getApplicationDriverRecordsService().update({
              driverId, expectedRevision: revision, data,
              operation: { operationId: command.operationId, payloadFingerprint: command.payloadFingerprint },
              now: command.submittedAt,
            });
          }
          return getApplicationDriverRecordsService().create(data, recordSource,
            { operationId: command.operationId, payloadFingerprint: command.payloadFingerprint }, command.submittedAt);
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
            return vehicleService.update({
              id: command.instanceId, expectedRevision: revision, data,
              operation: { operationId: command.operationId, payloadFingerprint: command.payloadFingerprint },
              now: command.submittedAt,
            });
          }
          return vehicleService.create(data, recordSource, {
            operationId: command.operationId, payloadFingerprint: command.payloadFingerprint,
          }, command.submittedAt);
        }
        throw new Error("unsupported_admin_form_operation");
      },
    },
  );
}
