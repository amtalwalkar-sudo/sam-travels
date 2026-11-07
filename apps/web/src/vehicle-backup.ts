import type { RecordEnvelope } from "../../../packages/core/src/types";
import { VEHICLE_FEATURE } from "../../../packages/features/vehicle";
import { assertVehicleRecordV1 } from "../../../packages/features/vehicle";
import { registerBrowserFeatureBackupParticipant } from "../../../packages/storage-browser/src";

/** Register Vehicle backup/restore validation before storage or lifecycle startup. */
export function registerVehicleBrowserBackupParticipant(): () => void {
  return registerBrowserFeatureBackupParticipant({
    feature: VEHICLE_FEATURE,
    participantId: "vehicle-records",
    recordIdPrefix: "feature:vehicle:",
    validateRecord(record: RecordEnvelope<unknown>) {
      assertVehicleRecordV1(record.data);
      if (record.id !== "feature:vehicle:" + record.data.registrationNumber) {
        throw new Error("vehicle_backup_record_identity_invalid");
      }
    },
    validateSnapshot(records) {
      const owned = records.filter(record => record.id.startsWith("feature:vehicle:"));
      const identities = owned.map(record => {
        assertVehicleRecordV1(record.data);
        if (record.id !== "feature:vehicle:" + record.data.registrationNumber) {
          throw new Error("vehicle_backup_record_identity_invalid");
        }
        return record.data.registrationNumber;
      });
      if (new Set(identities).size !== identities.length) {
        throw new Error("vehicle_backup_duplicate_registration");
      }
    },
  });
}
