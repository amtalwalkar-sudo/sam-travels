import type { AtomicRecordBatchRepository } from "../../../packages/core/src/repositories";
import type { RecordEnvelope } from "../../../packages/core/src/types";
import { HistoricalCorrectionService } from "../../../packages/application/src/historical-correction-service";
import { projectHistoricalCorrectionsV1 } from "../../../packages/domain/src/historical-correction";
import type { PersonIdentityService } from "../../../packages/application/src/person-identity-service";

/** Maintenance-owned correction operations exposed to the Admin presentation. */
export type MaintenanceExpenseCorrectionAdapter = Pick<HistoricalCorrectionService, "listForTarget" | "submit">;

/** Constructed only at the application composition boundary, never in React presentation. */
export function createMaintenanceExpenseCorrectionAdapter(
  records: AtomicRecordBatchRepository,
  source: RecordEnvelope<unknown>["source"],
  identity: PersonIdentityService,
): MaintenanceExpenseCorrectionAdapter {
  return new HistoricalCorrectionService(records, identity, {
    resolve: async (record: RecordEnvelope<unknown>) => {
      const data = record.data as Record<string, unknown>;
      if (!record.id.startsWith("feature:maintenance:expense:") || data.kind !== "expense" || data.schemaVersion !== 1 ||
          typeof data.amountPaise !== "number" || !Number.isSafeInteger(data.amountPaise) || data.amountPaise < 0) {
        throw new Error("maintenance_expense_correction_target_invalid");
      }
      return {
        featureId: "maintenance",
        allowedFieldPaths: ["amountPaise"],
        validateProjectedData: value => {
          const projected = value as Record<string, unknown>;
          if (projected.kind !== "expense" || !Number.isSafeInteger(projected.amountPaise) ||
              (projected.amountPaise as number) < 0) throw new Error("maintenance_expense_correction_value_invalid");
        },
      };
    },
  }, source);
}

/** Display projection helper; correction policy and writes remain in the owner service. */
export async function projectMaintenanceExpenseRecords(
  expenses: readonly RecordEnvelope<import("../../../packages/application/src/maintenance-service").GeneralMaintenanceExpenseV1>[],
  service: MaintenanceExpenseCorrectionAdapter,
) {
  return Promise.all(expenses.map(async expense => {
    const corrections = await service.listForTarget(expense.id);
    const projection = projectHistoricalCorrectionsV1(expense.data, corrections);
    return projection.status === "valid" ? { ...expense, data: projection.data } : expense;
  }));
}
