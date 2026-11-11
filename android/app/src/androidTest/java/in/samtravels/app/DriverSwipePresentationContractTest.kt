package `in`.samtravels.app

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DriverSwipePresentationContractTest {
    @Test
    fun nativeOverlayUsesTheVersionedSharedActionLabelsAndGesturePolicy() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val contract = DriverSwipePresentationContract.fromAssets(context)

        assertEquals(95, contract.completionPercent)
        assertEquals(24, contract.minimumIntentTravelDp)
        assertEquals("Going to pickup", contract.action("shift_active")?.label)
        assertEquals("trip_create", contract.action("shift_active")?.eventType)
        assertEquals("Start trip", contract.action("going_to_pickup")?.label)
        assertEquals("start_ride", contract.action("going_to_pickup")?.eventType)
        assertEquals("End trip", contract.action("trip_active")?.label)
        assertEquals("end_ride", contract.action("trip_active")?.eventType)
        assertNotNull(contract.secondaryAction("going_to_pickup"))
        assertEquals("Cancel ride", contract.secondaryAction("going_to_pickup")?.label)
        assertEquals("cancel_ride", contract.secondaryAction("going_to_pickup")?.eventType)
        assertEquals(null, contract.action("idle"))
        assertEquals(null, contract.action("needs_attention"))
    }
}
