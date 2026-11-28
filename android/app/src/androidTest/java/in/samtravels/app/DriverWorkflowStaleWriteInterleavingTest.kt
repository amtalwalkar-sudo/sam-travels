package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DriverWorkflowStaleWriteInterleavingTest {
    private val db = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext<Context>(),
        LocalDatabase::class.java,
    ).allowMainThreadQueries().build()

    @After fun closeDatabase() = db.close()

    private fun command(id: String, surface: String) = JSONObject()
        .put("schemaVersion", 1).put("commandId", id).put("eventId", id)
        .put("eventType", "shift_start").put("originSurface", surface)
        .put("transitionAt", java.time.Instant.now().toString())
        .put("expectedPriorState", "idle").put("expectedRevision", 0)
        .put("idempotencyKey", id)

    private fun gps() = JSONObject()
        .put("latitude", 19.076).put("longitude", 72.8777)
        .put("horizontalAccuracyM", 8.0)
        .put("fixAt", java.time.Instant.now().toString()).put("provider", "android-test")

    @Test fun stalePwaWriteAfterOverlayCommitIsRejectedAndAuthoritativeRevisionWins() {
        // The PWA reads idle/revision 0. The overlay commits before that stale
        // PWA command reaches the shared Room transaction boundary.
        DriverWorkflowIdentityTestFixtures.seed(db, "interleaving-driver", "interleaving-person")
        val stalePwaCommand = command("stale-pwa-after-overlay", "pwa")
        val overlayCommand = command("overlay-wins-interleaving", "native_overlay")

        DriverWorkflowStore.queue(db, overlayCommand)
        val committed = DriverWorkflowStore.complete(db, "overlay-wins-interleaving", gps())

        assertEquals("shift_active", committed.getString("state"))
        assertEquals(1, committed.getInt("revision"))
        assertEquals("native_overlay", JSONObject(
            db.logBookEvents().list().single().json,
        ).getJSONObject("command").getString("originSurface"))

        val staleFailure = runCatching {
            DriverWorkflowStore.queue(db, stalePwaCommand)
        }.exceptionOrNull()
        assertEquals("stale_revision", staleFailure?.message)

        val authoritative = DriverWorkflowStore.snapshot(db)
        assertEquals("shift_active", authoritative.getString("state"))
        assertEquals(1, authoritative.getInt("revision"))
        assertEquals(1, DriverWorkflowStore.listEvents(db).size)
        assertEquals(1, DriverWorkflowStore.listIntents(db).size)
        assertTrue(db.records().get("driver-intent:stale-pwa-after-overlay") == null)
    }
}
