package \`in\`.samtravels.app

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.time.Instant

class DriverTransitionPolicyTest {
    @Test fun legalTransitionsAreOwnedByPolicy() {
        assertEquals("shift_active", DriverTransitionPolicy.target("idle", "shift_start"))
        assertEquals("trip_active", DriverTransitionPolicy.target("shift_active", "trip_start"))
        assertEquals("shift_active", DriverTransitionPolicy.target("trip_active", "ride_cancel"))
        assertEquals("idle", DriverTransitionPolicy.target("shift_active", "shift_end"))
        assertEquals(null, DriverTransitionPolicy.target("idle", "trip_start"))
    }

    @Test fun gpsPolicyAcceptsBoundaryAccuracyAndAge() {
        val transitionAt = Instant.parse("2026-11-03T10:00:00Z")
        val fix = JSONObject()
            .put("latitude", 19.076)
            .put("longitude", 72.8777)
            .put("horizontalAccuracyM", 50.0)
            .put("fixAt", transitionAt.plusMillis(30_000).toString())
        DriverTransitionPolicy.validateGpsEvidence(fix, transitionAt.toString(), transitionAt.plusSeconds(30))
    }

    @Test fun gpsPolicyRejectsInaccurateEvidence() {
        val fix = JSONObject()
            .put("latitude", 19.076)
            .put("longitude", 72.8777)
            .put("horizontalAccuracyM", 50.1)
            .put("fixAt", "2026-11-03T10:00:00Z")
        val error = assertThrows(IllegalArgumentException::class.java) {
            DriverTransitionPolicy.validateGpsEvidence(fix, "2026-11-03T10:00:00Z")
        }
        assertEquals("gps_accuracy_exceeds_50m", error.message)
    }

    @Test fun gpsPolicyRejectsEvidenceOutsideEventWindow() {
        val fix = JSONObject()
            .put("latitude", 19.076)
            .put("longitude", 72.8777)
            .put("horizontalAccuracyM", 10.0)
            .put("fixAt", "2026-11-03T10:00:31Z")
        val error = assertThrows(IllegalArgumentException::class.java) {
            DriverTransitionPolicy.validateGpsEvidence(fix, "2026-11-03T10:00:00Z")
        }
        assertEquals("gps_fix_outside_30s_window", error.message)
    }
}
