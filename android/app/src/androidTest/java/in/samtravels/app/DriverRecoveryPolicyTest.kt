package `in`.samtravels.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class DriverRecoveryPolicyTest {
    private val transition = Instant.parse("2026-11-04T10:00:00Z")

    @Test fun acceptsPendingEventInsideOriginalGpsWindow() {
        assertTrue(DriverRecoveryPolicy.isWithinGpsWindow(transition.toString(), transition.plusSeconds(29)))
    }

    @Test fun rejectsPendingEventOutsideOriginalGpsWindow() {
        assertFalse(DriverRecoveryPolicy.isWithinGpsWindow(transition.toString(), transition.plusSeconds(31)))
    }

    @Test fun rejectsMalformedTransitionTimestamp() {
        assertFalse(DriverRecoveryPolicy.isWithinGpsWindow("not-a-timestamp", transition))
    }

    @Test fun acquisitionDeadlineUsesOnlyRemainingOriginalEvidenceWindow() {
        assertEquals(15_000L, DriverRecoveryPolicy.remainingGpsWindowMillis(
            transition.toString(), transition.plusSeconds(15),
        ))
        assertEquals(0L, DriverRecoveryPolicy.remainingGpsWindowMillis(
            transition.toString(), transition.plusSeconds(30),
        ))
    }

    @Test fun acquisitionDeadlineNeverExceedsOneWindowForFutureTimestamp() {
        assertEquals(30_000L, DriverRecoveryPolicy.remainingGpsWindowMillis(
            transition.plusSeconds(5).toString(), transition,
        ))
    }
}
