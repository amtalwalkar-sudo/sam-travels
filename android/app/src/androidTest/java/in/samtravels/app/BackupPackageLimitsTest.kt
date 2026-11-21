package `in`.samtravels.app

import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import androidx.test.ext.junit.runners.AndroidJUnit4

@RunWith(AndroidJUnit4::class)
class BackupPackageLimitsTest {
    @Test fun encryptedPackageByteLimitIsInclusiveAndRejectsTheFirstByteOver() {
        requireBackupPackageByteLength(MAX_BACKUP_PACKAGE_BYTES)
        val failure = runCatching {
            requireBackupPackageByteLength(MAX_BACKUP_PACKAGE_BYTES + 1)
        }.exceptionOrNull()
        assertEquals("backup_package_too_large", failure?.message)
        assertEquals("backup_invalid_package_size",
            runCatching { requireBackupPackageByteLength(-1) }.exceptionOrNull()?.message)
    }

    @Test fun recordCountLimitIsInclusiveAndRejectsTheFirstRecordOver() {
        requireBackupRecordCountWithinLimit(MAX_BACKUP_RECORD_COUNT)
        val failure = runCatching {
            requireBackupRecordCountWithinLimit(MAX_BACKUP_RECORD_COUNT + 1)
        }.exceptionOrNull()
        assertEquals("backup_record_count_limit", failure?.message)
    }
}
