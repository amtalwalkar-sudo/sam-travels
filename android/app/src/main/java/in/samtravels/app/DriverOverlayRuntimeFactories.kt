package `in`.samtravels.app

import android.content.Context
import android.location.Criteria
import android.location.LocationListener
import android.location.LocationManager
import android.os.Looper
import androidx.room.Room

/** Narrow platform boundary so the real overlay workflow can be exercised with deterministic GPS evidence. */
internal interface DriverLocationSource {
    fun bestProvider(): String?
    fun requestLocationUpdates(provider: String, listener: LocationListener, looper: Looper)
    fun removeUpdates(listener: LocationListener)
}

private class AndroidDriverLocationSource(context: Context) : DriverLocationSource {
    private val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager

    override fun bestProvider(): String? =
        if (manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) LocationManager.GPS_PROVIDER
        else manager.getBestProvider(Criteria().apply { accuracy = Criteria.ACCURACY_FINE }, true)

    override fun requestLocationUpdates(provider: String, listener: LocationListener, looper: Looper) {
        manager.requestLocationUpdates(provider, 0L, 0f, listener, looper)
    }

    override fun removeUpdates(listener: LocationListener) {
        manager.removeUpdates(listener)
    }
}

internal object DriverLocationSourceFactory {
    @Volatile var overrideForTests: DriverLocationSource? = null

    fun create(context: Context): DriverLocationSource =
        overrideForTests ?: AndroidDriverLocationSource(context)
}

/** Keeps test overlays on an isolated Room file while production always uses sam-travels.db. */
internal object DriverOverlayDatabaseFactory {
    @Volatile var databaseNameOverrideForTests: String? = null

    fun open(context: Context): LocalDatabase =
        Room.databaseBuilder(
            context.applicationContext,
            LocalDatabase::class.java,
            databaseNameOverrideForTests ?: "sam-travels.db",
        ).addMigrations(LocalDatabase.MIGRATION_1_2, LocalDatabase.MIGRATION_2_3)
            .enableMultiInstanceInvalidation()
            .build()
}
