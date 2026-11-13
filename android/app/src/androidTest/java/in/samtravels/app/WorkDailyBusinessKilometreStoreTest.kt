package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class WorkDailyBusinessKilometreStoreTest {
    private val db = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext<Context>(),
        LocalDatabase::class.java,
    ).allowMainThreadQueries().build()

    @After fun closeDatabase() = db.close()

    @Test fun boundaryRotationIsRejectedWhileATripIsActive() {
        val current = JSONObject().put("state", "trip_active").put("activeTripId", "trip-active")
        val failure = runCatching {
            WorkDailyBusinessKilometreStore.rotate(
                db, current, JSONObject(), "rotation-event", java.time.Instant.now().toString(), JSONObject(),
            )
        }.exceptionOrNull()
        assertEquals("shift_rotation_during_active_trip", failure?.message)
    }
}
