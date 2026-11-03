package `in`.samtravels.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

class BackupWorkerResilienceTest {
    @Test fun interruptedUploadUsesBoundedWorkManagerRetryBudget() {
        val interruptedTransfer = IOException("connection reset while writing request body")
        for (attempt in 0 until BackupWorkerResilience.MAX_RETRIES) {
            assertTrue(BackupWorkerResilience.shouldRetryInterruptedTransfer(interruptedTransfer, attempt))
        }
        assertFalse(BackupWorkerResilience.shouldRetryInterruptedTransfer(
            interruptedTransfer, BackupWorkerResilience.MAX_RETRIES,
        ))
    }

    @Test fun transientDropboxResponsesAreRetriedButPermanentClientErrorsAreNot() {
        assertTrue(BackupWorkerResilience.isTransientHttpStatus(401))
        assertTrue(BackupWorkerResilience.isTransientHttpStatus(429))
        assertTrue(BackupWorkerResilience.isTransientHttpStatus(503))
        assertFalse(BackupWorkerResilience.isTransientHttpStatus(400))
        assertFalse(BackupWorkerResilience.isTransientHttpStatus(403))
    }

    @Test fun internetPolicyIsRecheckedAndStopsTheNextRequestAfterRevocation() {
        var enabled = true
        BackupWorkerResilience.requireInternetAccess { enabled }

        enabled = false
        try {
            BackupWorkerResilience.requireInternetAccess { enabled }
            throw AssertionError("Expected policy revocation to block the next request")
        } catch (error: InternetAccessDisabledException) {
            assertEqualsPolicyError(error.message)
        }
    }

    private fun assertEqualsPolicyError(actual: String?) {
        assertTrue(actual == "internet_access_disabled")
    }
}
