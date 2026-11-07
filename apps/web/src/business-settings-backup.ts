import type { RecordEnvelope } from "../../../packages/core/src/types";
import { BUSINESS_SETTINGS_FEATURE } from "../../../packages/features/business-settings";
import { assertBusinessSettingsRecordV1 } from "../../../packages/features/business-settings";
import { registerBrowserFeatureBackupParticipant } from "../../../packages/storage-browser/src";

/** Register the feature-owned backup/restore contract before any snapshot is read. */
export function registerBusinessSettingsBrowserBackupParticipant(): () => void {
  return registerBrowserFeatureBackupParticipant({
    feature: BUSINESS_SETTINGS_FEATURE,
    participantId: "business-settings-records",
    recordIdPrefix: "feature:business-settings:",
    validateRecord(record: RecordEnvelope<unknown>) {
      if (record.id !== "feature:business-settings:business") {
        throw new Error("business_settings_backup_singleton_identity_invalid");
      }
      assertBusinessSettingsRecordV1(record.data);
    },
    validateSnapshot(records) {
      const owned = records.filter(record => record.id.startsWith("feature:business-settings:"));
      if (owned.length > 1 || owned.some(record => record.id !== "feature:business-settings:business")) {
        throw new Error("business_settings_backup_singleton_identity_invalid");
      }
    },
  });
}
