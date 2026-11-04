package `in`.samtravels.app

import android.Manifest
import android.content.Intent
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "DeviceReadiness")
class DeviceReadinessPlugin : Plugin() {
    @PluginMethod
    fun getStatus(call: PluginCall) {
        try {
            val fine = DeviceReadinessPolicy.isPreciseLocationReady(granted(Manifest.permission.ACCESS_FINE_LOCATION))
            val coarse = granted(Manifest.permission.ACCESS_COARSE_LOCATION)
            val manager = context.getSystemService(android.content.Context.LOCATION_SERVICE) as LocationManager
            val locationEnabled = DeviceReadinessPolicy.isLocationEnabled(
                Build.VERSION.SDK_INT,
                if (Build.VERSION.SDK_INT >= 28) manager.isLocationEnabled else false,
                if (Build.VERSION.SDK_INT < 28) manager.isProviderEnabled(LocationManager.GPS_PROVIDER) else false,
                if (Build.VERSION.SDK_INT < 28) manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) else false
            )
            val overlayEnabled = context.getSharedPreferences("sam_travels_driver_overlay", android.content.Context.MODE_PRIVATE)
                .getBoolean("overlay_enabled", false)
            val overlayGranted = Settings.canDrawOverlays(context)
            val items = JSArray()
            items.put(item("location_services", "Location services", "Turn on your phone's location setting.", locationEnabled, true))
            items.put(item("precise_location", "Precise location access", "Allow Sam Travels to use precise location for trip and shift records.", fine, true))
            items.put(item("overlay_access", "Floating controls access", "Allow display over other apps to use optional floating driver controls.", overlayGranted, DeviceReadinessPolicy.isOverlayRequired(overlayEnabled)))
            if (DeviceReadinessPolicy.needsBackgroundLocation(Build.VERSION.SDK_INT, overlayEnabled)) {
                items.put(item("background_location", "Background location", "Needed for supported floating-control recovery scenarios. Android may ask you to choose Allow all the time.", granted(Manifest.permission.ACCESS_BACKGROUND_LOCATION), false))
            }
            if (DeviceReadinessPolicy.needsNotificationPermission(Build.VERSION.SDK_INT, overlayEnabled)) {
                items.put(item("notifications", "Foreground service notification", "Allow notifications so Android can show the active driver-control service.", granted(Manifest.permission.POST_NOTIFICATIONS), false))
            }
            if (overlayEnabled && Build.VERSION.SDK_INT >= 23) {
                val power = context.getSystemService(android.content.Context.POWER_SERVICE) as PowerManager
                items.put(item("battery_optimization", "Battery restrictions", "Review battery restrictions if your phone stops floating controls in the background.", power.isIgnoringBatteryOptimizations(context.packageName), false))
            }
            val result = JSObject()
            result.put("items", items)
            result.put("manufacturer", Build.MANUFACTURER ?: "Android")
            result.put("model", Build.MODEL ?: "Android device")
            result.put("androidVersion", Build.VERSION.SDK_INT)
            result.put("hasAnyLocationPermission", fine || coarse)
            call.resolve(result)
        } catch (error: Exception) {
            call.reject("Unable to check Android device readiness", error)
        }
    }

    @PluginMethod
    fun openSetting(call: PluginCall) {
        val setting = call.getString("setting")
        if (setting.isNullOrBlank()) {
            call.reject("A settings destination is required")
            return
        }
        val appDetails = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
        val preferred = when (setting) {
            "location_services" -> Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)
            "precise_location", "background_location" -> appDetails
            "overlay_access" -> Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}"))
            "notifications" -> if (Build.VERSION.SDK_INT >= 26) Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName) else appDetails
            "battery_optimization" -> Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
            else -> {
                call.reject("Unknown settings destination")
                return
            }
        }
        try {
            launch(preferred)
            val result = JSObject()
            result.put("opened", true)
            result.put("usedFallback", false)
            call.resolve(result)
        } catch (_: Exception) {
            try {
                launch(appDetails)
                val result = JSObject()
                result.put("opened", true)
                result.put("usedFallback", true)
                call.resolve(result)
            } catch (_: Exception) {
                try {
                    launch(Intent(Settings.ACTION_SETTINGS))
                    val result = JSObject()
                    result.put("opened", true)
                    result.put("usedFallback", true)
                    call.resolve(result)
                } catch (error: Exception) {
                    call.reject("Android could not open the requested settings screen", error)
                }
            }
        }
    }

    private fun granted(permission: String): Boolean =
        context.checkSelfPermission(permission) == android.content.pm.PackageManager.PERMISSION_GRANTED

    private fun launch(intent: Intent) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (intent.resolveActivity(context.packageManager) == null) throw IllegalStateException("Settings activity unavailable")
        context.startActivity(intent)
    }

    private fun item(id: String, title: String, description: String, granted: Boolean, required: Boolean) =
        JSObject().apply {
            put("id", id)
            put("title", title)
            put("description", description)
            put("granted", granted)
            put("required", required)
        }
}
