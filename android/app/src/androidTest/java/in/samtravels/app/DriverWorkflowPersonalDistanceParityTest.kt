package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DriverWorkflowPersonalDistanceParityTest {
    @Test fun interShiftOdometerGapIsPersonalDistanceLikeSharedPwaFixture() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val assets = androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().context.assets
        val fixture = JSONObject(assets.open("driver-workflow-parity-v1.json").bufferedReader().use { it.readText() })
            .getJSONObject("personalDistance")
        val databaseName = "driver-workflow-personal-distance.db"
        context.deleteDatabase(databaseName)
        val db = Room.databaseBuilder(context, LocalDatabase::class.java, databaseName)
            .addMigrations(LocalDatabase.MIGRATION_1_2, LocalDatabase.MIGRATION_2_3)
            .allowMainThreadQueries().build()
        val vehicleId = "feature:vehicle:MH01PD1234"
        val firstDate = "2026-11-08"
        val secondDate = "2026-11-09"
        fun putRecord(id: String, data: JSONObject) {
            val created = firstDate + "T00:00:00.000Z"
            val envelope = JSONObject().put("id", id).put("schemaVersion", 1).put("createdAt", created)
                .put("updatedAt", created).put("source", "android").put("revision", 1).put("data", data)
            db.records().put(StoredRecord(id, envelope.toString(), 1, created))
        }
        fun command(id: String, event: String, state: String, revision: Int, at: String, odometer: JSONObject) =
            JSONObject().put("schemaVersion", 1).put("workflowVersion", 2).put("commandId", id).put("eventId", id)
                .put("eventType", event).put("originSurface", "native_overlay").put("transitionAt", at)
                .put("expectedPriorState", state).put("expectedRevision", revision).put("idempotencyKey", id)
                .put("odometer", odometer)
        fun complete(id: String, event: String, state: String, revision: Int, at: String, odometer: JSONObject) {
            DriverWorkflowStore.queue(db, command(id, event, state, revision, at, odometer), java.time.Instant.parse(at))
            DriverWorkflowStore.complete(db, id, JSONObject().put("latitude", 19.076).put("longitude", 72.8777)
                .put("horizontalAccuracyM", 8.0).put("fixAt", at).put("provider", "android-test"), java.time.Instant.parse(at))
        }
        try {
            putRecord("work:selected-driver", JSONObject().put("schemaVersion", 1).put("driverId", "personal-distance-driver"))
            putRecord("identity:driver-person-link:personal-distance-driver", JSONObject().put("schemaVersion", 1)
                .put("driverId", "personal-distance-driver").put("personId", "personal-distance-person"))
            putRecord("identity:person:personal-distance-person", JSONObject().put("schemaVersion", 1)
                .put("personId", "personal-distance-person").put("displayName", "Distance Driver")
                .put("roles", JSONArray().put("driver")).put("status", "active"))
            putRecord("feature:driver-records:driver:personal-distance-driver", JSONObject().put("schemaVersion", 1)
                .put("driverId", "personal-distance-driver").put("name", "Distance Driver").put("lifecycleState", "active"))
            putRecord("feature:driver-records:assignment:personal-distance-driver", JSONObject().put("schemaVersion", 1)
                .put("driverId", "personal-distance-driver").put("assignments", JSONArray().put(JSONObject()
                    .put("assignmentId", "personal-distance-assignment").put("vehicleId", vehicleId)
                    .put("assignedAt", firstDate + "T00:00:00.000Z"))))
            putRecord(vehicleId, JSONObject().put("schemaVersion", 1).put("registrationNumber", "MH01PD1234")
                .put("make", "Make").put("model", "Model").put("vehicleType", "Sedan").put("fuelType", "CNG")
                .put("yearOfManufacture", 2024).put("ownership", "Owned").put("lifecycleState", "active"))

            val firstStart = firstDate + "T10:00:00.000Z"
            val firstEnd = firstDate + "T11:00:00.000Z"
            val secondStart = secondDate + "T10:00:00.000Z"
            val secondEnd = secondDate + "T11:00:00.000Z"
            complete("personal-first-start", "shift_start", "idle", 0, firstStart,
                JSONObject().put("schemaVersion", 1).put("readingKm", fixture.getLong("firstShiftStartOdometerKm")))
            complete("personal-first-end", "shift_end", "shift_active", 1, firstEnd,
                JSONObject().put("schemaVersion", 1).put("readingKm", fixture.getLong("previousShiftEndOdometerKm"))
                    .put("businessKm", fixture.getLong("currentShiftBusinessKm")))
            complete("personal-second-start", "shift_start", "idle", 2, secondStart,
                JSONObject().put("schemaVersion", 1).put("readingKm", fixture.getLong("nextShiftStartOdometerKm"))
                    .put("previousConfirmedKm", fixture.getLong("previousShiftEndOdometerKm"))
                    .put("personalKm", fixture.getLong("personalKm")))
            complete("personal-second-end", "shift_end", "shift_active", 3, secondEnd,
                JSONObject().put("schemaVersion", 1).put("readingKm", fixture.getLong("nextShiftStartOdometerKm"))
                    .put("businessKm", fixture.getLong("secondShiftBusinessKm")))

            val dailyRows = db.records().list().filter { it.id.startsWith("work:daily-business-km:") }
            val first = dailyRows.single { it.id.endsWith(firstDate) }
            val second = dailyRows.single { it.id.endsWith(secondDate) }
            val firstData = JSONObject(first.json).getJSONObject("data")
            val secondData = JSONObject(second.json).getJSONObject("data")
            assertEquals(fixture.getLong("currentShiftBusinessKm"), firstData.getLong("totalBusinessKm"))
            assertEquals(fixture.getLong("secondShiftBusinessKm"), secondData.getLong("totalBusinessKm"))
            assertEquals(0, secondData.getLong("unallocatedBusinessKm"))
            val secondEntry = secondData.getJSONArray("entries").getJSONObject(0)
            assertEquals(fixture.getLong("personalKm"), secondEntry.getLong("personalKm"))
            assertEquals(fixture.getLong("secondShiftBusinessKm"), secondEntry.getLong("businessKm"))
            assertEquals(fixture.getLong("expectedTotalBusinessKm"),
                firstData.getLong("totalBusinessKm") + secondData.getLong("totalBusinessKm"))
        } finally {
            db.close()
            context.deleteDatabase(databaseName)
        }
    }
}
