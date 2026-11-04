package `in`.samtravels.app

import org.json.JSONObject
import java.time.Instant
import kotlin.math.abs

/** Pure driver transition and GPS policy shared by native persistence callers. */
object DriverTransitionPolicy {
    fun target(state: String, event: String): String? = when (event) {
        "shift_start" -> if (state == "idle") "shift_active" else null
        "shift_end" -> if (state == "shift_active") "idle" else null
        "trip_start" -> if (state == "shift_active" || state == "approach_active") "trip_active" else null
        "trip_end", "ride_cancel" -> if (state == "trip_active" || state == "approach_active") "shift_active" else null
        else -> null
    }

    fun validateGpsEvidence(gps: JSONObject, transitionAtValue: String, now: Instant = Instant.now()) {
        val latitude = gps.optDouble("latitude", Double.NaN)
        val longitude = gps.optDouble("longitude", Double.NaN)
        val accuracy = gps.optDouble("horizontalAccuracyM", Double.NaN)

        require(
            latitude.isFinite() && longitude.isFinite()
                && latitude in -90.0..90.0 && longitude in -180.0..180.0,
        ) { "invalid_gps_coordinates" }
        require(accuracy.isFinite() && accuracy >= 0.0 && accuracy <= MAX_ACCURACY_METRES) {
            "gps_accuracy_exceeds_50m"
        }

        val fixAt = Instant.parse(gps.getString("fixAt"))
        val transitionAt = Instant.parse(transitionAtValue)
        require(fixAt.toEpochMilli() <= now.toEpochMilli() + FUTURE_TOLERANCE_MILLIS) {
            "gps_fix_from_future"
        }
        require(abs(fixAt.toEpochMilli() - transitionAt.toEpochMilli()) <= MAX_FIX_AGE_MILLIS) {
            "gps_fix_outside_30s_window"
        }
    }

    private const val MAX_ACCURACY_METRES = 50.0
    private const val MAX_FIX_AGE_MILLIS = 30_000L
    private const val FUTURE_TOLERANCE_MILLIS = 5_000L
}
