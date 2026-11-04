package `in`.samtravels.app

internal object DeviceReadinessPolicy {
    fun isPreciseLocationReady(fineGranted: Boolean): Boolean = fineGranted
    fun isOverlayRequired(overlayEnabled: Boolean): Boolean = overlayEnabled
    fun needsBackgroundLocation(apiLevel: Int, overlayEnabled: Boolean): Boolean = apiLevel >= 29 && overlayEnabled
    fun needsNotificationPermission(apiLevel: Int, overlayEnabled: Boolean): Boolean = apiLevel >= 33 && overlayEnabled
    fun isLocationEnabled(apiLevel: Int, modernEnabled: Boolean, gpsEnabled: Boolean, networkEnabled: Boolean): Boolean =
        if (apiLevel >= 28) modernEnabled else gpsEnabled || networkEnabled
}
