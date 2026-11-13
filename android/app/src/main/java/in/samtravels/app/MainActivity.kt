package `in`.samtravels.app

import android.content.Intent
import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        NativeBusinessSettingsBackup.ensureRegistered()
        NativeVehicleBackup.ensureRegistered()
        NativeDriverRecordsBackup.ensureRegistered()
        NativeComplianceBackup.ensureRegistered()
        NativeMaintenanceBackup.ensureRegistered()
        NativeFinanceBackup.ensureRegistered()
        NativeBusinessExpensesBackup.ensureRegistered()
        registerPlugin(RoomStorePlugin::class.java)
        registerPlugin(DriverWorkflowPlugin::class.java)
        registerPlugin(TimelineEnrichmentPlugin::class.java)
        registerPlugin(DeviceReadinessPlugin::class.java)
        registerPlugin(SecureVaultPlugin::class.java)
        registerPlugin(BackupKeyVaultPlugin::class.java)
        registerPlugin(BackupPlugin::class.java)
        registerPlugin(DiagnosticsPlugin::class.java)
        persistDropboxCallback(intent)
        super.onCreate(savedInstanceState)
        BackgroundBackupScheduler.schedule(this)
    }

    override fun onResume() {
        super.onResume()
        resumeEnabledOverlayFromForeground()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        persistDropboxCallback(intent)
    }

    /**
     * If Android deferred overlay restart at boot because background location
     * permission is unavailable, reopening the app in the foreground safely
     * resumes the user's previously enabled overlay.
     */
    private fun resumeEnabledOverlayFromForeground() {
        val preferences = getSharedPreferences("sam_travels_driver_overlay", MODE_PRIVATE)
        if (!preferences.getBoolean("overlay_enabled", false) || !android.provider.Settings.canDrawOverlays(this)) return
        val hasLocation = checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED ||
            checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED
        if (!hasLocation) return
        try {
            val service = Intent(this, DriverOverlayService::class.java)
            if (android.os.Build.VERSION.SDK_INT >= 26) startForegroundService(service) else startService(service)
            preferences.edit().putBoolean("boot_resume_deferred", false).commit()
        } catch (_: Exception) {
            preferences.edit().putBoolean("boot_resume_deferred", true).commit()
        }
    }

    private fun persistDropboxCallback(intent: Intent?) {
        val uri = intent?.data ?: return
        if (uri.scheme != "samtravels" || uri.host != "oauth") return
        getSharedPreferences("sam_travels_oauth", MODE_PRIVATE)
            .edit()
            .putString("pending_callback_url", uri.toString())
            .apply()
    }
}
