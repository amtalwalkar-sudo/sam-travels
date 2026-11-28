package `in`.samtravels.app

import android.location.Location
import android.location.LocationListener
import android.os.Looper
import org.junit.Assert.assertEquals

/** Deterministic event-scoped GPS source for native overlay acceptance. */
internal class OverlayFakeLocationSource : DriverLocationSource {
    @Volatile var listener: LocationListener? = null
    @Volatile var removed = false
    @Volatile var requestCount = 0
    @Volatile var removeCount = 0
    private val activeListeners = java.util.Collections.newSetFromMap(
        java.util.IdentityHashMap<LocationListener, Boolean>(),
    )

    override fun bestProvider(): String = "gps"

    @Synchronized override fun requestLocationUpdates(provider: String, listener: LocationListener, looper: Looper) {
        assertEquals("Overlay GPS callbacks must be delivered on the main looper", Looper.getMainLooper(), looper)
        requestCount += 1
        activeListeners.add(listener)
        this.listener = listener
        val caller = Thread.currentThread().stackTrace.takeLast(8)
            .joinToString(" <- ") { it.className.substringAfterLast('.') + "." + it.methodName }
        android.util.Log.i("OverlayGpsFake", "request registered count=$requestCount caller=$caller")
    }

    @Synchronized override fun removeUpdates(listener: LocationListener) {
        activeListeners.remove(listener)
        if (this.listener === listener) this.listener = activeListeners.firstOrNull()
        removeCount += 1
        removed = activeListeners.isEmpty()
    }

    @Synchronized fun activeListenerCount(): Int = activeListeners.size

    @Synchronized fun deliver(location: Location) {
        val active = listener ?: error("overlay_location_listener_not_registered")
        active.onLocationChanged(location)
    }
}
