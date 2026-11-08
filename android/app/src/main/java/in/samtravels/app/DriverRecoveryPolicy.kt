package `in`.samtravels.app

import java.time.Duration
import java.time.Instant
import kotlin.math.abs

/** The approved event GPS fix must remain within 30 seconds of the original gesture instant. */
internal object DriverRecoveryPolicy {
    const val GPS_EVIDENCE_WINDOW_MILLIS = 30_000L

    fun isWithinGpsWindow(transitionAt: String, now: Instant = Instant.now()): Boolean = runCatching {
        abs(Duration.between(Instant.parse(transitionAt), now).toMillis()) <= GPS_EVIDENCE_WINDOW_MILLIS
    }.getOrDefault(false)

    /** Remaining acquisition time is capped to one event window, even for a future-dated command. */
    fun remainingGpsWindowMillis(transitionAt: String, now: Instant = Instant.now()): Long = runCatching {
        Duration.between(now, Instant.parse(transitionAt).plusMillis(GPS_EVIDENCE_WINDOW_MILLIS))
            .toMillis().coerceIn(0L, GPS_EVIDENCE_WINDOW_MILLIS)
    }.getOrDefault(0L)
}
