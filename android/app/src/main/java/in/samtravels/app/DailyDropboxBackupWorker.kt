package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.work.*
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.io.IOException
import java.net.URLEncoder
import java.time.Instant
import java.util.concurrent.TimeUnit

internal object BackgroundBackupScheduler {
    private const val PERIODIC_NAME = "sam-travels-daily-dropbox-backup"
    private const val ONCE_NAME = "sam-travels-dropbox-backup-now"

    fun schedule(context: Context) {
        val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        val periodic = PeriodicWorkRequestBuilder<DailyDropboxBackupWorker>(24, TimeUnit.HOURS)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.MINUTES)
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC_NAME, ExistingPeriodicWorkPolicy.KEEP, periodic,
        )
    }

    fun runSoon(context: Context) {
        val request = OneTimeWorkRequestBuilder<DailyDropboxBackupWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(ONCE_NAME, ExistingWorkPolicy.KEEP, request)
        schedule(context)
    }
}

/**
 * Headless Android worker. It deliberately implements the V2 wire format natively:
 * WebView/Capacitor JavaScript is not available when WorkManager starts this process.
 */
class DailyDropboxBackupWorker(context: Context, parameters: WorkerParameters) : Worker(context, parameters) {
    private val db by lazy {
        Room.databaseBuilder(applicationContext, LocalDatabase::class.java, "sam-travels.db")
            .enableMultiInstanceInvalidation()
            .build()
    }
    private val credentials by lazy { SecureCredentialVault(applicationContext) }
    private val state = applicationContext.getSharedPreferences("sam_travels_background_backup", Context.MODE_PRIVATE)

    override fun doWork(): Result {
        val previousStatus = state.getString("last_status", null)
        if (BackupWorkerResilience.shouldReconcileInterruptedRun(previousStatus)) {
            state.edit().putString("last_interrupted_at", Instant.now().toString())
                .putString("last_status", "interrupted_reconciled")
                .putString("last_error", "previous_backup_run_interrupted").commit()
        }
        state.edit().putString("last_attempt", Instant.now().toString())
            .putString("last_status", "running").remove("last_error").commit()
        try {
            val config = applicationContext.getSharedPreferences("sam_travels_dropbox_config", Context.MODE_PRIVATE)
            val clientId = config.getString("client_id", null)?.takeIf { it.isNotBlank() }
                ?: return defer("dropbox_configuration_missing")
            if (!internetAllowed()) return defer("internet_access_disabled")
            val recoveryKey = BackupRecoveryKeyVault(applicationContext).read()
                ?: return defer("backup_recovery_key_unavailable")

            val token = accessToken(clientId) ?: return defer("dropbox_authentication_required")
            if (!internetAllowed()) return defer("internet_access_disabled")
            val snapshot = makeSnapshot()
            val plaintext = snapshot.first.toString().toByteArray(Charsets.UTF_8)
            val manifest = snapshot.second
            val backup = NativeBackupV2Package.create(plaintext, manifest, recoveryKey)
            val bytes = backup.toString().toByteArray(Charsets.UTF_8)
            val digest = manifest.getString("plaintextSha256").replace("/", "_").replace("+", "-").take(12)
            val filename = "sam-travels-auto-r${manifest.optInt("snapshotRevision")}-${digest}.stbackup"
            val path = "/SamTravelsBackups/" + filename

            var uploadToken = ensureFolder(token, clientId)
            if (!internetAllowed()) return defer("internet_access_disabled")
            var upload = request(
                "https://content.dropboxapi.com/2/files/upload",
                "POST",
                bytes,
                mapOf(
                    "Authorization" to "Bearer $uploadToken",
                    "Content-Type" to "application/octet-stream",
                    "Dropbox-API-Arg" to JSONObject()
                        .put("path", path).put("mode", "add").put("autorename", false).put("mute", true).toString(),
                ),
            )
            // Dropbox can revoke an access token before its locally stored expiry.
            // Force one refresh and replay the idempotent add/no-autorename upload.
            if (BackupWorkerResilience.shouldForceTokenRefresh(upload.first)) {
                uploadToken = accessToken(clientId, forceRefresh = true)
                    ?: return defer("dropbox_reauthentication_required")
                if (!internetAllowed()) return defer("internet_access_disabled")
                upload = request(
                    "https://content.dropboxapi.com/2/files/upload",
                    "POST",
                    bytes,
                    mapOf(
                        "Authorization" to "Bearer $uploadToken",
                        "Content-Type" to "application/octet-stream",
                        "Dropbox-API-Arg" to JSONObject()
                            .put("path", path).put("mode", "add").put("autorename", false).put("mute", true).toString(),
                    ),
                )
            }
            if (upload.first == 401) throw TransientBackupException("dropbox_token_rejected")
            if (upload.first != 200 && upload.first != 409) {
                if (upload.first == 429 || upload.first >= 500) throw TransientBackupException("dropbox_upload_http_${upload.first}")
                throw PermanentBackupException("dropbox_upload_http_${upload.first}")
            }
            if (!internetAllowed()) return defer("internet_access_disabled")
            val metadata = request(
                "https://api.dropboxapi.com/2/files/get_metadata",
                "POST",
                JSONObject().put("path", path).toString().toByteArray(Charsets.UTF_8),
                mapOf("Authorization" to "Bearer $token", "Content-Type" to "application/json"),
            )
            if (metadata.first != 200) throw TransientBackupException("dropbox_upload_verification_failed")
            val remote = JSONObject(metadata.second.toString(Charsets.UTF_8))
            if (remote.optLong("size", -1) != bytes.size.toLong()) {
                throw PermanentBackupException("dropbox_upload_size_mismatch")
            }
            state.edit().putString("last_success", Instant.now().toString())
                .putString("last_status", "success").remove("last_error").commit()
            return Result.success()
        } catch (error: InternetAccessDisabledException) {
            return defer("internet_access_disabled")
        } catch (error: TransientBackupException) {
            return retryOrFinish(error.message ?: "dropbox_transient_failure")
        } catch (error: IOException) {
            state.edit().putString("last_status", "retrying").putString("last_error", "dropbox_io_interrupted").commit()
            return if (BackupWorkerResilience.shouldRetryInterruptedTransfer(error, runAttemptCount)) Result.retry() else {
                state.edit().putString("last_status", "retry_exhausted").commit()
                Result.success()
            }
        } catch (error: Exception) {
            state.edit().putString("last_status", "failed")
                .putString("last_error", error.message ?: "backup_failed").commit()
            return Result.success()
        } finally {
            runCatching { db.close() }
        }
    }

    private fun retryOrFinish(reason: String): Result {
        state.edit().putString("last_status", "retrying").putString("last_error", reason).commit()
        return if (BackupWorkerResilience.shouldRetry(runAttemptCount)) Result.retry() else {
            state.edit().putString("last_status", "retry_exhausted").commit()
            Result.success()
        }
    }

    private fun defer(reason: String): Result {
        state.edit().putString("last_status", "deferred").putString("last_error", reason).commit()
        return Result.success()
    }

    private fun internetAllowed(): Boolean {
        val row = db.records().get("network-policy") ?: return false
        return runCatching { JSONObject(row.json).optJSONObject("data")?.optBoolean("enabled", false) == true }
            .getOrDefault(false)
    }

    private fun makeSnapshot(): Pair<JSONObject, JSONObject> {
        var result: Pair<JSONObject, JSONObject>? = null
        db.runInTransaction {
            val records = org.json.JSONArray()
            db.records().list().filterNot {
                it.id.startsWith("__sam_travels_recovery_checkpoint__:") ||
                    it.id.startsWith("__sam_travels_recovery_journal__:")
            }.forEach { row ->
                records.put(JSONObject().put("id", row.id).put("json", row.json)
                    .put("schemaVersion", row.schemaVersion).put("updatedAt", row.updatedAt))
            }
            var revision = 0
            for (i in 0 until records.length()) {
                val row = records.getJSONObject(i)
                if (row.optString("id") == "driver-state") {
                    revision = runCatching {
                        JSONObject(row.optString("json")).optJSONObject("value")?.optInt("revision", 0) ?: 0
                    }.getOrDefault(0)
                }
            }
            val snapshot = JSONObject().put("records", records).put("snapshotRevision", revision).put("schemaVersion", 1)
            val manifest = JSONObject()
                .put("applicationVersion", applicationContext.packageManager.getPackageInfo(applicationContext.packageName, 0).versionName ?: "unknown")
                .put("schemaVersion", 1)
                .put("createdAt", Instant.now().toString())
                .put("businessTimezone", "Asia/Kolkata")
                .put("snapshotRevision", revision)
                .put("recordCounts", JSONObject().put("records", records.length()))
            result = snapshot to manifest
        }
        return result ?: error("backup_snapshot_unavailable")
    }

    private fun accessToken(clientId: String, forceRefresh: Boolean = false): String? {
        val stored = credentials.get(TOKEN_KEY) ?: return null
        val tokens = JSONObject(stored)
        if (!forceRefresh && tokens.optString("accessToken").isNotBlank() &&
            tokens.optLong("expiresAt") > System.currentTimeMillis() + 60_000) return tokens.getString("accessToken")
        val refresh = tokens.optString("refreshToken")
        if (refresh.isBlank()) return null
        BackupWorkerResilience.requireInternetAccess(::internetAllowed)
        val form = "grant_type=refresh_token&refresh_token=" + encode(refresh) + "&client_id=" + encode(clientId)
        val response = request(
            "https://api.dropboxapi.com/oauth2/token", "POST", form.toByteArray(Charsets.UTF_8),
            mapOf("Content-Type" to "application/x-www-form-urlencoded"),
        )
        if (BackupWorkerResilience.isTransientHttpStatus(response.first)) {
            throw TransientBackupException("dropbox_token_refresh_http_${response.first}")
        }
        if (response.first != 200) return null
        val refreshed = JSONObject(response.second.toString(Charsets.UTF_8))
        val next = JSONObject().put("accessToken", refreshed.getString("access_token"))
            .put("refreshToken", refreshed.optString("refresh_token", refresh))
            .put("expiresAt", System.currentTimeMillis() + refreshed.optLong("expires_in") * 1000)
        credentials.set(TOKEN_KEY, next.toString())
        return next.getString("accessToken")
    }

    private fun ensureFolder(token: String, clientId: String): String {
        BackupWorkerResilience.requireInternetAccess(::internetAllowed)
        val body = JSONObject().put("path", "/SamTravelsBackups").put("autorename", false)
            .toString().toByteArray(Charsets.UTF_8)
        fun create(accessToken: String) = request(
            "https://api.dropboxapi.com/2/files/create_folder_v2", "POST", body,
            mapOf("Authorization" to "Bearer $accessToken", "Content-Type" to "application/json"),
        )
        var activeToken = token
        var response = create(activeToken)
        if (BackupWorkerResilience.shouldForceTokenRefresh(response.first)) {
            activeToken = accessToken(clientId, forceRefresh = true)
                ?: throw PermanentBackupException("dropbox_reauthentication_required")
            BackupWorkerResilience.requireInternetAccess(::internetAllowed)
            response = create(activeToken)
        }
        if (response.first != 200 && response.first != 409) throw TransientBackupException("dropbox_folder_create_http_${response.first}")
        return activeToken
    }

    private fun request(url: String, method: String, body: ByteArray, headers: Map<String, String>): Pair<Int, ByteArray> {
        BackupWorkerResilience.requireInternetAccess(::internetAllowed)
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 20_000
            connection.readTimeout = 45_000
            connection.doOutput = true
            headers.forEach { (key, value) -> connection.setRequestProperty(key, value) }
            connection.outputStream.use { it.write(body) }
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val output = ByteArrayOutputStream()
            stream?.use { it.copyTo(output) }
            return code to output.toByteArray()
        } finally {
            connection.disconnect()
        }
    }

    private fun encode(value: String) = URLEncoder.encode(value, "UTF-8")

    private class TransientBackupException(message: String) : Exception(message)
    private class PermanentBackupException(message: String) : Exception(message)

    private companion object {
        const val TOKEN_KEY = "dropbox.oauth.tokens.v1"
    }
}
