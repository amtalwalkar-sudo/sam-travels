import type { RecordEnvelope } from "../../../packages/core/src/types";
import {
  PERFORMANCE_FEATURE,
  assertPerformanceRecordV1,
  type PerformanceRecordV1,
} from "../../../packages/features/performance";
import { registerBrowserFeatureBackupParticipant } from "../../../packages/storage-browser/src";

const PREFIX = "feature:performance:";
const SETTINGS_ID = PREFIX + "settings";
const PRE_BUSINESS_PREFIX = PREFIX + "pre-business-cost:";

export function registerPerformanceBrowserBackupParticipant(): () => void {
  return registerBrowserFeatureBackupParticipant({
    feature: PERFORMANCE_FEATURE,
    participantId: "performance-records",
    recordIdPrefix: PREFIX,
    validateRecord(record: RecordEnvelope<unknown>) {
      assertPerformanceRecordV1(record.data);
      const data = record.data as PerformanceRecordV1;
      if (data.kind === "settings" && record.id !== SETTINGS_ID) {
        throw new Error("performance_settings_backup_identity_invalid");
      }
      if (data.kind === "pre_business_cost" &&
          record.id !== PRE_BUSINESS_PREFIX + data.commandId.toLowerCase()) {
        throw new Error("performance_pre_business_cost_backup_identity_invalid");
      }
    },
    validateSnapshot(records) {
      const owned = records.filter(record => record.id.startsWith(PREFIX));
      const settings = owned.filter(record => record.id === SETTINGS_ID);
      if (settings.length > 1) throw new Error("performance_settings_backup_duplicate");
      const seen = new Set<string>();
      for (const record of owned) {
        assertPerformanceRecordV1(record.data);
        const data = record.data as PerformanceRecordV1;
        if (data.kind === "settings" && record.id !== SETTINGS_ID) {
          throw new Error("performance_settings_backup_identity_invalid");
        }
        if (data.kind === "pre_business_cost") {
          if (record.id !== PRE_BUSINESS_PREFIX + data.commandId.toLowerCase() || seen.has(data.commandId)) {
            throw new Error("performance_pre_business_cost_backup_identity_invalid");
          }
          seen.add(data.commandId);
        }
      }
    },
  });
}
