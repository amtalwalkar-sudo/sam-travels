import type { AtomicRecordBatchRepository } from "../../../packages/core/src/repositories";
import type { RecordEnvelope } from "../../../packages/core/src/types";
import { HistoricalCorrectionService } from "../../../packages/application/src/historical-correction-service";
import { projectHistoricalCorrectionsV1 } from "../../../packages/domain/src/historical-correction";
import type { PersonIdentityService } from "../../../packages/application/src/person-identity-service";
import type { OperatingConfigurationServiceV1 } from "../../../packages/application/src/operating-configuration-service";

export type MaintenanceExpenseCorrectionReferenceV1 = Readonly<{
  sourceId: string;
  revision: number;
  chainRevision: number;
}>;

export type MaintenanceExpenseCorrectionProjectionV1 = Readonly<{
  data: import("../../../packages/application/src/maintenance-service").GeneralMaintenanceExpenseV1;
  correctionChainRevision: number;
  correctionRefs: readonly MaintenanceExpenseCorrectionReferenceV1[];
}>;
export type MaintenanceVisitCorrectionProjectionV1 = Readonly<{
  data: import("../../../packages/application/src/maintenance-service").MaintenanceVisitV1;
  correctionChainRevision: number;
  correctionRefs: readonly MaintenanceExpenseCorrectionReferenceV1[];
}>;

/** Maintenance-owned correction operations and read projection exposed to Admin. */
export type MaintenanceExpenseCorrectionAdapter = Pick<HistoricalCorrectionService, "listForTarget" | "submit"> & {
  projectExpense(
    expense: RecordEnvelope<import("../../../packages/application/src/maintenance-service").GeneralMaintenanceExpenseV1>,
  ): Promise<MaintenanceExpenseCorrectionProjectionV1>;
  projectVisit(
    visit: RecordEnvelope<import("../../../packages/application/src/maintenance-service").MaintenanceVisitV1>,
  ): Promise<MaintenanceVisitCorrectionProjectionV1>;
};

/** Constructed only at the application composition boundary, never in React presentation. */
export function createMaintenanceExpenseCorrectionAdapter(
  records: AtomicRecordBatchRepository,
  source: RecordEnvelope<unknown>["source"],
  identity: PersonIdentityService,
  operatingConfiguration?: Pick<OperatingConfigurationServiceV1, "get">,
): MaintenanceExpenseCorrectionAdapter {
  const corrections = new HistoricalCorrectionService(records, identity, {
    resolve: async (record: RecordEnvelope<unknown>) => {
      const data = record.data as Record<string, unknown>;
      if (record.id.startsWith("feature:maintenance:expense:") && data.kind === "expense" &&
          data.schemaVersion === 1 && typeof data.amountPaise === "number" &&
          Number.isSafeInteger(data.amountPaise) && data.amountPaise >= 0) {
        return {
          featureId: "maintenance", allowedFieldPaths: ["amountPaise"],
          validateProjectedData: value => {
            const projected = value as Record<string, unknown>;
            if (projected.kind !== "expense" || !Number.isSafeInteger(projected.amountPaise) ||
                (projected.amountPaise as number) < 0) throw new Error("maintenance_expense_correction_value_invalid");
          },
        };
      }
      if (record.id.startsWith("feature:maintenance:visit:") && data.kind === "visit" &&
          data.schemaVersion === 1 && typeof data.totalPaise === "number" &&
          Number.isSafeInteger(data.totalPaise) && data.totalPaise >= 0) {
        return {
          featureId: "maintenance", allowedFieldPaths: ["totalPaise"],
          validateProjectedData: value => {
            const projected = value as Record<string, unknown>;
            if (projected.kind !== "visit" || !Number.isSafeInteger(projected.totalPaise) ||
                (projected.totalPaise as number) < 0) throw new Error("maintenance_visit_correction_value_invalid");
          },
        };
      }
      throw new Error("maintenance_correction_target_invalid");
    },
  }, source);

  return Object.freeze({
    listForTarget: (targetRecordId: string) => corrections.listForTarget(targetRecordId),
    submit: async (input: Parameters<HistoricalCorrectionService["submit"]>[0]) => {
      if (operatingConfiguration) {
        const target = await records.get(input.targetRecordId);
        if (!target || (target.data as { vehicleId?: string }).vehicleId !== (await operatingConfiguration.get()).vehicleId) {
          throw new Error("maintenance_correction_operating_vehicle_mismatch");
        }
      }
      return corrections.submit(input);
    },
    projectExpense: async (expense: RecordEnvelope<
      import("../../../packages/application/src/maintenance-service").GeneralMaintenanceExpenseV1
    >) => {
      const original = await records.get<import("../../../packages/application/src/maintenance-service").GeneralMaintenanceExpenseV1>(expense.id);
      if (!original || original.revision !== expense.revision ||
          original.data.kind !== "expense" || original.data.vehicleId !== expense.data.vehicleId) {
        throw new Error("maintenance_expense_projection_source_changed");
      }
      const history = await corrections.listForTarget(expense.id);
      if (history.some(item => item.featureId !== "maintenance" ||
          item.targetRecordRevision !== original.revision || item.fieldPath !== "amountPaise")) {
        throw new Error("maintenance_expense_correction_chain_invalid");
      }
      const projection = projectHistoricalCorrectionsV1(original.data, history);
      if (projection.status !== "valid" || projection.data.kind !== "expense" ||
          !Number.isSafeInteger(projection.data.amountPaise) || projection.data.amountPaise < 0) {
        throw new Error("maintenance_expense_correction_projection_invalid");
      }
      const chainHeadId = "historical-correction-chain:" + encodeURIComponent(expense.id);
      const head = await records.get<{ schemaVersion: number; targetRecordId: string;
        chainRevision: number; headCorrectionId?: string }>(chainHeadId);
      if (history.length === 0 ? !!head :
          !head || head.data.schemaVersion !== 1 || head.data.targetRecordId !== expense.id ||
          head.data.chainRevision !== projection.chainRevision ||
          head.data.headCorrectionId !== projection.headCorrectionId ||
          head.revision !== projection.chainRevision) {
        throw new Error("maintenance_expense_correction_chain_head_invalid");
      }
      const correctionRefs = await Promise.all(history.map(async item => {
        const record = await records.get("historical-correction:" + item.correctionId);
        if (!record || record.revision !== 1) throw new Error("maintenance_expense_correction_record_invalid");
        return Object.freeze({
          sourceId: record.id, revision: record.revision, chainRevision: item.chainRevision,
        });
      }));
      return Object.freeze({
        data: projection.data,
        correctionChainRevision: projection.chainRevision,
        correctionRefs: Object.freeze(correctionRefs),
      });
    },
    projectVisit: async (visit: RecordEnvelope<
      import("../../../packages/application/src/maintenance-service").MaintenanceVisitV1
    >) => {
      const original = await records.get<import("../../../packages/application/src/maintenance-service").MaintenanceVisitV1>(visit.id);
      if (!original || original.revision !== visit.revision ||
          original.data.kind !== "visit" || original.data.vehicleId !== visit.data.vehicleId) {
        throw new Error("maintenance_visit_projection_source_changed");
      }
      const history = await corrections.listForTarget(visit.id);
      if (history.some(item => item.featureId !== "maintenance" ||
          item.targetRecordRevision !== original.revision || item.fieldPath !== "totalPaise")) {
        throw new Error("maintenance_visit_correction_chain_invalid");
      }
      const projection = projectHistoricalCorrectionsV1(original.data, history);
      if (projection.status !== "valid" || projection.data.kind !== "visit" ||
          !Number.isSafeInteger(projection.data.totalPaise) || projection.data.totalPaise < 0) {
        throw new Error("maintenance_visit_correction_projection_invalid");
      }
      const chainHeadId = "historical-correction-chain:" + encodeURIComponent(visit.id);
      const head = await records.get<{ schemaVersion: number; targetRecordId: string;
        chainRevision: number; headCorrectionId?: string }>(chainHeadId);
      if (history.length === 0 ? !!head :
          !head || head.data.schemaVersion !== 1 || head.data.targetRecordId !== visit.id ||
          head.data.chainRevision !== projection.chainRevision ||
          head.data.headCorrectionId !== projection.headCorrectionId ||
          head.revision !== projection.chainRevision) {
        throw new Error("maintenance_visit_correction_chain_head_invalid");
      }
      const correctionRefs = await Promise.all(history.map(async item => {
        const record = await records.get("historical-correction:" + item.correctionId);
        if (!record || record.revision !== 1) throw new Error("maintenance_visit_correction_record_invalid");
        return Object.freeze({ sourceId: record.id, revision: record.revision, chainRevision: item.chainRevision });
      }));
      return Object.freeze({
        data: projection.data, correctionChainRevision: projection.chainRevision,
        correctionRefs: Object.freeze(correctionRefs),
      });
    },
  });
}

/** Display projection includes corrected values and immutable correction-chain provenance. */
export async function projectMaintenanceExpenseRecords(
  expenses: readonly RecordEnvelope<import("../../../packages/application/src/maintenance-service").GeneralMaintenanceExpenseV1>[],
  service: MaintenanceExpenseCorrectionAdapter,
) {
  return Promise.all(expenses.map(async expense => {
    const projection = await service.projectExpense(expense);
    return {
      ...expense,
      data: projection.data,
      correctionChainRevision: projection.correctionChainRevision,
      correctionRefs: projection.correctionRefs,
    };
  }));
}


/** Display projection includes corrected visit totals and immutable correction-chain provenance. */
export async function projectMaintenanceVisitRecords(
  visits: readonly RecordEnvelope<import("../../../packages/application/src/maintenance-service").MaintenanceVisitV1>[],
  service: MaintenanceExpenseCorrectionAdapter,
) {
  return Promise.all(visits.map(async visit => {
    const projection = await service.projectVisit(visit);
    return {
      ...visit,
      data: projection.data,
      correctionChainRevision: projection.correctionChainRevision,
      correctionRefs: projection.correctionRefs,
    };
  }));
}
