import type { AtomicRecordRepository } from "../../core/src/repositories";
import type { RecordEnvelope } from "../../core/src/types";
import { projectHistoricalCorrectionsV1, type HistoricalCorrectionV1 } from "../../domain/src/historical-correction";
import type { GeneralMaintenanceExpenseV1, MaintenanceVisitV1 } from "./maintenance-service";

type CorrectableMaintenanceRecord = MaintenanceVisitV1 | GeneralMaintenanceExpenseV1;

/**
 * Read-only corrected projection for actual Maintenance records. The source
 * envelope and its revision remain immutable; the append-only correction
 * chain is the sole authority for corrected amounts.
 */
export async function projectMaintenanceCorrectedRecord<T extends CorrectableMaintenanceRecord>(
  repository: AtomicRecordRepository,
  record: RecordEnvelope<T>,
): Promise<RecordEnvelope<T>> {
  const correctionRows = await repository.list<HistoricalCorrectionV1>();
  const matchingRows = correctionRows.filter(row => row.id.startsWith("historical-correction:") &&
    row.data?.schemaVersion === 1 && row.data.targetRecordId === record.id);
  if (matchingRows.some(row => row.revision !== 1 ||
      row.id !== "historical-correction:" + row.data.correctionId)) {
    throw new Error("maintenance_correction_record_invalid");
  }
  const corrections = matchingRows.map(row => row.data);
  const headId = "historical-correction-chain:" + encodeURIComponent(record.id);
  const head = await repository.get<{
    schemaVersion: number; targetRecordId: string; chainRevision: number; headCorrectionId?: string;
  }>(headId);
  if (corrections.length === 0) {
    if (head) throw new Error("maintenance_correction_chain_head_invalid");
    return record;
  }
  const expectedField = record.data.kind === "visit" ? "totalPaise" : "amountPaise";
  if (corrections.some(item => item.featureId !== "maintenance" ||
      item.targetRecordRevision !== record.revision || item.fieldPath !== expectedField)) {
    throw new Error("maintenance_correction_chain_invalid");
  }
  const projection = projectHistoricalCorrectionsV1(record.data, corrections);
  const projected = projection.data as CorrectableMaintenanceRecord;
  const projectedAmount = projected.kind === "visit" ? projected.totalPaise : projected.amountPaise;
  if (projection.status !== "valid" ||
      projected.kind !== record.data.kind ||
      projected.vehicleId !== record.data.vehicleId ||
      !Number.isSafeInteger(projectedAmount) || projectedAmount < 0) {
    throw new Error("maintenance_correction_projection_invalid");
  }
  if (!head || head.data.schemaVersion !== 1 || head.data.targetRecordId !== record.id ||
      head.data.chainRevision !== projection.chainRevision ||
      head.data.headCorrectionId !== projection.headCorrectionId ||
      head.revision !== projection.chainRevision) {
    throw new Error("maintenance_correction_chain_head_invalid");
  }
  return Object.freeze({ ...record, data: projected as T });
}
