import type { RecordEnvelope } from "../../../packages/core/src/types";
import { DRIVER_RECORDS_FEATURE, assertDriverRecordV1, driverRecordId } from "../../../packages/features/driver-records";
import { registerBrowserFeatureBackupParticipant } from "../../../packages/storage-browser/src";

/** Register Driver profile backup/restore validation before application startup. */
export function registerDriverRecordsBrowserBackupParticipant(): () => void {
  return registerBrowserFeatureBackupParticipant({
    feature: DRIVER_RECORDS_FEATURE,
    participantId: "driver-records",
    recordIdPrefix: "feature:driver-records:driver:",
    validateRecord(record: RecordEnvelope<unknown>) {
      assertDriverRecordV1(record.data);
      if (record.id !== driverRecordId(record.data.driverId)) {
        throw new Error("driver_record_identity_mismatch");
      }
    },
    validateSnapshot(records) {
      const owned = records.filter(record => record.id.startsWith("feature:driver-records:driver:"));
      const ids = owned.map(record => {
        assertDriverRecordV1(record.data);
        const id = driverRecordId(record.data.driverId);
        if (record.id !== id) throw new Error("driver_record_identity_mismatch");
        return id;
      });
      if (new Set(ids).size !== ids.length) throw new Error("driver_backup_duplicate_identity");
    },
  });
}
