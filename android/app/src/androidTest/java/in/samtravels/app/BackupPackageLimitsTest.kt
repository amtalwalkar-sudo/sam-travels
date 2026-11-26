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

    @Test fun utf8PreflightCountsMultibyteTextWithoutEncodingAllocation() {
        assertEquals(8L, utf8ByteLength("a€😀"))
        assertEquals(0L, utf8ByteLength(""))
        assertEquals("backup_invalid_plaintext_encoding",
            runCatching { utf8ByteLength("\uD800") }.exceptionOrNull()?.message)
    }

    @Test fun plaintextPreflightAccountsForGcmTagBase64AndEnvelopeReserve() {
        val limit = 1_024L
        val reserve = 10L
        val largestPlaintext = (Math.floorDiv(limit - reserve, 4L) * 3L) - 16L
        assertEquals(1_022L, requireBackupPlaintextWithinPackageLimit(largestPlaintext, limit, reserve))
        assertEquals("backup_plaintext_preflight_exceeded",
            runCatching {
                requireBackupPlaintextWithinPackageLimit(largestPlaintext + 1L, limit, reserve)
            }.exceptionOrNull()?.message)
        assertEquals("backup_invalid_plaintext_size",
            runCatching { estimateBackupPackageBytes(-1L, reserve) }.exceptionOrNull()?.message)
    }

    @Test fun recordCountLimitIsInclusiveAndRejectsTheFirstRecordOver() {
        requireBackupRecordCountWithinLimit(MAX_BACKUP_RECORD_COUNT)
        val failure = runCatching {
            requireBackupRecordCountWithinLimit(MAX_BACKUP_RECORD_COUNT + 1)
        }.exceptionOrNull()
        assertEquals("backup_record_count_limit", failure?.message)
    }
}
