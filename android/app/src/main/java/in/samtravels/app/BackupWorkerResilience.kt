package `in`.samtravels.app

internal class InternetAccessDisabledException : Exception("internet_access_disabled")

/** Pure retry and policy decisions shared by the WorkManager worker and instrumentation tests. */
internal object BackupWorkerResilience {
    const val MAX_RETRIES = 5

    fun requireInternetAccess(isEnabled: () -> Boolean) {
        if (!isEnabled()) throw InternetAccessDisabledException()
    }

    fun shouldRetry(runAttemptCount: Int): Boolean = runAttemptCount < MAX_RETRIES

    fun shouldRetryInterruptedTransfer(error: Throwable, runAttemptCount: Int): Boolean =
        error is java.io.IOException && shouldRetry(runAttemptCount)

    fun shouldForceTokenRefresh(status: Int): Boolean = status == 401

    fun isTransientHttpStatus(status: Int): Boolean =
        status == 401 || status == 429 || status >= 500
}
