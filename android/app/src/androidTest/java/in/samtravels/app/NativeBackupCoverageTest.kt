package `in`.samtravels.app

import org.junit.Test

class NativeBackupCoverageTest {
    @Test fun everyRoomEntityIsCoveredByManualAndScheduledBusinessSnapshots() {
        // Shared by BackupPlugin and DailyDropboxBackupWorker.
        NativeBackupCoverage.assertRoomSchemaCovered()
    }
}
