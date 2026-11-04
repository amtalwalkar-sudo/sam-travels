package `in`.samtravels.app

internal object OverlayBootRestartPolicy {
    fun shouldStart(
        sdkInt: Int,
        explicitlyEnabled: Boolean,
        canDrawOverlays: Boolean,
        hasForegroundLocation: Boolean,
        hasBackgroundLocation: Boolean,
    ): Boolean = explicitlyEnabled && canDrawOverlays && hasForegroundLocation &&
        (sdkInt < 29 || hasBackgroundLocation)
}
