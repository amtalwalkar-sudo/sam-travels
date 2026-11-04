package `in`.samtravels.app

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings

/**
 * Reattaches the foreground overlay after reboot only when the driver explicitly
 * enabled it and Android permits a location foreground service from background.
 * If Android withholds that capability, the durable Room queue is left untouched;
 * MainActivity resumes the service when the user next opens the app.
 */
class DriverOverlayBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_BOOT_COMPLETED) return
        val preferences = context.getSharedPreferences("sam_travels_driver_overlay", Context.MODE_PRIVATE)
        if (!preferences.getBoolean("overlay_enabled", false)) return
        if (!Settings.canDrawOverlays(context)) {
            preferences.edit().putBoolean("boot_resume_deferred", true).commit()
            return
        }

        val hasForegroundLocation =
            context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!hasForegroundLocation) {
            preferences.edit().putBoolean("boot_resume_deferred", true).commit()
            return
        }

        // Android 10+ requires background location permission to start a location
        // foreground service from BOOT_COMPLETED. Never bypass this OS boundary.
        val hasBackgroundLocation = Build.VERSION.SDK_INT < 29 ||
            context.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!hasBackgroundLocation) {
            preferences.edit().putBoolean("boot_resume_deferred", true).commit()
            return
        }

        try {
            val service = Intent(context, DriverOverlayService::class.java)
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(service) else context.startService(service)
            preferences.edit().putBoolean("boot_resume_deferred", false).commit()
        } catch (_: Exception) {
            preferences.edit().putBoolean("boot_resume_deferred", true).commit()
        }
    }
}
