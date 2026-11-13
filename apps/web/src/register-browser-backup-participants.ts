import { registerBusinessSettingsBrowserBackupParticipant } from "./business-settings-backup";
import { registerVehicleBrowserBackupParticipant } from "./vehicle-backup";
import { registerDriverRecordsBrowserBackupParticipant } from "./driver-records-backup";
import { registerComplianceBrowserBackupParticipant } from "./compliance-backup";
import { registerMaintenanceBrowserBackupParticipant } from "./maintenance-backup";
import { registerFinanceBrowserBackupParticipant } from "./finance-backup";
import { registerBusinessExpensesBrowserBackupParticipant } from "./business-expenses-backup";

/** Register every browser backup adapter before opening the persistent repository. */
export function registerBrowserBackupParticipants(): void {
  registerBusinessSettingsBrowserBackupParticipant();
  registerVehicleBrowserBackupParticipant();
  registerDriverRecordsBrowserBackupParticipant();
  registerComplianceBrowserBackupParticipant();
  registerMaintenanceBrowserBackupParticipant();
  registerFinanceBrowserBackupParticipant();
  registerBusinessExpensesBrowserBackupParticipant();
}
