package `in`.samtravels.app

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DeviceReadinessPolicyTest {
    @Test fun preciseLocationIsRequiredForDriverLocationActions() {
        assertTrue(DeviceReadinessPolicy.isPreciseLocationReady(true))
        assertFalse(DeviceReadinessPolicy.isPreciseLocationReady(false))
    }

    @Test fun overlayIsRequiredOnlyAfterTheDriverEnablesIt() {
        assertFalse(DeviceReadinessPolicy.isOverlayRequired(false))
        assertTrue(DeviceReadinessPolicy.isOverlayRequired(true))
    }

    @Test fun backgroundLocationIsVersionAndFeatureGated() {
        assertFalse(DeviceReadinessPolicy.needsBackgroundLocation(28, true))
        assertFalse(DeviceReadinessPolicy.needsBackgroundLocation(35, false))
        assertTrue(DeviceReadinessPolicy.needsBackgroundLocation(35, true))
    }

    @Test fun notificationsAreVersionAndFeatureGated() {
        assertFalse(DeviceReadinessPolicy.needsNotificationPermission(32, true))
        assertFalse(DeviceReadinessPolicy.needsNotificationPermission(35, false))
        assertTrue(DeviceReadinessPolicy.needsNotificationPermission(35, true))
    }

    @Test fun locationServiceCheckUsesModernApiWhenAvailable() {
        assertTrue(DeviceReadinessPolicy.isLocationEnabled(35, true, false, false))
        assertFalse(DeviceReadinessPolicy.isLocationEnabled(35, false, true, true))
        assertTrue(DeviceReadinessPolicy.isLocationEnabled(27, false, false, true))
    }
}
