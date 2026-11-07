import type { RecordEnvelope } from "../../../packages/core/src/types";
import {
  DRIVER_RECORDS_FEATURE, assertDriverRecordV1, driverRecordId,
  assertDriverAssignmentHistoryV1, driverAssignmentHistoryId,
} from "../../../packages/features/driver-records";
import { registerBrowserFeatureBackupParticipant } from "../../../packages/storage-browser/src";

/** Register Driver profiles and assignment history before browser backup/restore. */
export function registerDriverRecordsBrowserBackupParticipant(): () => void {
  return registerBrowserFeatureBackupParticipant({
    feature: DRIVER_RECORDS_FEATURE,
    participantId: "driver-records",
    recordIdPrefix: "feature:driver-records:",
    validateRecord(record: RecordEnvelope<unknown>) {
      if (record.id.startsWith("feature:driver-records:driver:")) {
        assertDriverRecordV1(record.data);
        if (record.id !== driverRecordId(record.data.driverId)) throw new Error("driver_record_identity_mismatch");
      } else if (record.id.startsWith("feature:driver-records:assignment:")) {
        assertDriverAssignmentHistoryV1(record.data);
        if (record.id !== driverAssignmentHistoryId(record.data.driverId)) throw new Error("driver_assignment_identity_mismatch");
      } else throw new Error("driver_record_namespace_mismatch");
    },
    validateSnapshot(records) {
      const driverIds = new Set<string>();
      const assignmentIds = new Set<string>();
      for (const record of records.filter(item => item.id.startsWith("feature:driver-records:"))) {
        if (record.id.startsWith("feature:driver-records:driver:")) {
          assertDriverRecordV1(record.data);
          const id = driverRecordId(record.data.driverId);
          if (record.id !== id || driverIds.has(id)) throw new Error("driver_backup_duplicate_identity");
          driverIds.add(id);
        } else if (record.id.startsWith("feature:driver-records:assignment:")) {
          assertDriverAssignmentHistoryV1(record.data);
          const id = driverAssignmentHistoryId(record.data.driverId);
          if (record.id !== id || assignmentIds.has(id)) throw new Error("driver_assignment_identity_mismatch");
          assignmentIds.add(id);
        } else throw new Error("driver_record_namespace_mismatch");
      }
    },
  });
}
