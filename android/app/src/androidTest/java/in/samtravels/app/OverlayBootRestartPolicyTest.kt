package `in`.samtravels.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OverlayBootRestartPolicyTest {
    @Test fun resumesOnlyWhenUserEnabledAndAllRequiredPermissionsAreAvailable() {
        assertTrue(OverlayBootRestartPolicy.shouldStart(35, true, true, true, true))
        assertFalse(OverlayBootRestartPolicy.shouldStart(35, false, true, true, true))
        assertFalse(OverlayBootRestartPolicy.shouldStart(35, true, false, true, true))
        assertFalse(OverlayBootRestartPolicy.shouldStart(35, true, true, false, true))
        assertFalse(OverlayBootRestartPolicy.shouldStart(35, true, true, true, false))
    }

    @Test fun preAndroidTenDoesNotRequireBackgroundLocationPermissionForBootStart() {
        assertTrue(OverlayBootRestartPolicy.shouldStart(28, true, true, true, false))
    }
}
