import React from "react";
import { createRoot } from "react-dom/client";
import {
  initializeApplicationRuntimeRegistry,
  getApplicationBusinessSettingsService,
  getApplicationVehicleService,
  getApplicationDriverRecordsService,
  getApplicationDriverAssignmentService,
  getApplicationComplianceService,
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
  initializeApplicationRecordSource,
  RecordFormWorkingCopyRepository,
  SharedFormRuntime,
  BUSINESS_SETUP_FORM_V1,
  VEHICLE_FORM_V1,
} from "../../../packages/application/src";
import { assertBusinessSettingsRecordV1 } from "../../../packages/features/business-settings";
import { assertVehicleRecordV1 } from "../../../packages/features/vehicle";
import { assertDriverRecordV1 } from "../../../packages/features/driver-records";
import { assertComplianceRecordV1 } from "../../../packages/features/compliance";
import {
  assertMaintenanceRecordV1,
  calculateMaintenanceVisitTotal,
  maintenanceBusinessDateFromInstant,
} from "../../../packages/features/maintenance";
import { assertFinanceLoanRecordV1, createLoanScheduleVersion, loanCalculationInputsChanged,
  assertFinanceLoanPrepaymentStateV1, createLoanPrepaymentRevisionV1 } from "../../../packages/features/finance";
import { DISCOVERED_FEATURE_EXTENSIONS } from "./generated-feature-catalog";
import { registerBusinessSettingsBrowserBackupParticipant } from "./business-settings-backup";
import { registerVehicleBrowserBackupParticipant } from "./vehicle-backup";
import { registerDriverRecordsBrowserBackupParticipant } from "./driver-records-backup";
import { registerComplianceBrowserBackupParticipant } from "./compliance-backup";
import { registerMaintenanceBrowserBackupParticipant } from "./maintenance-backup";
import { registerFinanceBrowserBackupParticipant } from "./finance-backup";
import { createPlatformRepository, getPlatformRecordSource } from "./native-store";
import { App } from "./ui/App";
import "./ui/styles.css";

// Initialize contracts, backup validators, and platform services before lifecycle/UI.
async function bootstrap(): Promise<void> {
  const runtimeRegistry = initializeApplicationRuntimeRegistry({ extensions: [...DISCOVERED_FEATURE_EXTENSIONS] });
  initializeApplicationRecordSource(getPlatformRecordSource());
  registerBusinessSettingsBrowserBackupParticipant();
  registerVehicleBrowserBackupParticipant();
  registerDriverRecordsBrowserBackupParticipant();
  registerComplianceBrowserBackupParticipant();
  registerMaintenanceBrowserBackupParticipant();
  registerFinanceBrowserBackupParticipant();
  const repository = await createPlatformRepository();
  initializeApplicationBusinessSettingsService(repository, assertBusinessSettingsRecordV1);
  const driverRecords = initializeApplicationDriverRecordsService(repository, assertDriverRecordV1);
  const vehicles = initializeApplicationVehicleService(repository, assertVehicleRecordV1);
  initializeApplicationDriverAssignmentService(repository, driverRecords, vehicles);
  const financeLoans = initializeApplicationFinanceLoanService(repository, vehicles, assertFinanceLoanRecordV1, createLoanScheduleVersion, loanCalculationInputsChanged);
  const financePrepayments = initializeApplicationFinanceLoanPrepaymentService(
    repository, financeLoans, assertFinanceLoanPrepaymentStateV1, createLoanPrepaymentRevisionV1,
  );
  initializeApplicationFinanceLoanPaymentService(repository, financeLoans, undefined, financePrepayments);
  initializeApplicationFinanceLoanSettlementService(repository, financeLoans, financePrepayments);
  initializeApplicationComplianceService(repository, assertComplianceRecordV1, vehicles);
  initializeApplicationMaintenanceService(
    repository, assertMaintenanceRecordV1, vehicles,
    calculateMaintenanceVisitTotal, maintenanceBusinessDateFromInstant,
  );
  initializeApplicationFeatureLifecycle(repository);
  const formRuntime = new SharedFormRuntime(
    new RecordFormWorkingCopyRepository(repository, getApplicationRecordSource()),
    {
      submit: async (command) => {
        if (command.action !== "save") throw new Error("unsupported_admin_form_operation");
        if (command.formId === BUSINESS_SETUP_FORM_V1.id) {
          const businessStartDate = command.values.businessStartDate;
          if (typeof businessStartDate !== "string") throw new Error("business_start_date_required");
          return getApplicationBusinessSettingsService().setBusinessStartDate(
            businessStartDate, getApplicationRecordSource(),
          );
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
  const adminServices = Object.freeze({
    formRuntime,
    businessSettings: getApplicationBusinessSettingsService(),
    vehicles: getApplicationVehicleService(),
    driverRecords: getApplicationDriverRecordsService(),
    driverAssignments: getApplicationDriverAssignmentService(),
    compliance: getApplicationComplianceService(),
    maintenance: getApplicationMaintenanceService(),
    financeLoans: getApplicationFinanceLoanService(),
    financeLoanPayments: getApplicationFinanceLoanPaymentService(),
    financeLoanPrepayments: getApplicationFinanceLoanPrepaymentService(),
    financeLoanSettlements: getApplicationFinanceLoanSettlementService(),
    recordSource: getApplicationRecordSource(),
  });
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App adminServices={adminServices} runtimeRegistry={runtimeRegistry} platformRepository={repository} />
    </React.StrictMode>,
  );
}

void bootstrap();
