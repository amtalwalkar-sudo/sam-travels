package `in`.samtravels.app

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DriverPresentationContractTest {
    @Test
    fun nativeOverlayConsumesSharedTokensAndAllowsCompactLayout() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val contract = DriverPresentationContract.fromAssets(context)
        assertEquals(13, contract.cardRadius)
        assertEquals(10, contract.fieldRadius)
        assertEquals(48, contract.fieldHeight)
        assertEquals(270, contract.overlayWidth)
        assertEquals(560, contract.overlayMaxHeight)
        assertEquals(14, contract.overlayPanelPadding)
        assertEquals(10, contract.overlayCompactPadding)
        assertTrue(contract.disabledOpacity in 0f..1f)
        assertEquals(0xFFF6F9FA.toInt(), contract.surface)
        assertEquals(0xFF234B60.toInt(), contract.textStrong)
        assertEquals(0xFFEDF2F5.toInt(), contract.state("pending").surface)
        assertEquals(0xFFA34840.toInt(), contract.state("error").text)
        assertEquals(120, contract.motionDurationMs)
        assertEquals(160, contract.completionDurationMs)
        assertEquals(0xFFEDF2F5.toInt(), contract.state("pending").surface)
        assertEquals(0xFFA34840.toInt(), contract.state("error").text)
        assertEquals(120, contract.motionDurationMs)
    }
}
