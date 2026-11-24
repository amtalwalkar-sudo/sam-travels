package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

@RunWith(AndroidJUnit4::class)
class NativeBackupSnapshotConsistencyTest {
    @Test fun snapshotAndManifestShareOneRoomTransactionBoundaryDuringConcurrentWrite() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        val executor = Executors.newSingleThreadExecutor()
        try {
            val at = "2026-11-24T00:00:00.000Z"
            fun platformRow(value: String, updatedAt: String) = StoredRecord(
                "snapshot-boundary-record",
                JSONObject().put("id", "snapshot-boundary-record").put("schemaVersion", 1)
                    .put("createdAt", at).put("updatedAt", updatedAt).put("source", "android")
                    .put("revision", if (value == "before") 1 else 2)
                    .put("data", JSONObject().put("value", value)).toString(),
                1, updatedAt,
            )
            database.records().put(platformRow("before", at))
            database.logBookEvents().put(LogBookEventRecord(
                "snapshot-event-before",
                """{"eventId":"snapshot-event-before","kind":"trip_completed"}""",
                1, at,
            ))

            val writerStarted = CountDownLatch(1)
            val writerFinished = CountDownLatch(1)
            val writerValue = AtomicBoolean(false)
            var bundle: NativeSnapshotBundle? = null
            database.runInTransaction {
                bundle = NativeSnapshotBuilder.build(
                    database, NativeBackupRecovery::isInternalRecord, "snapshot-consistency-test", at,
                )
                executor.submit {
                    writerStarted.countDown()
                    database.runInTransaction {
                        database.records().put(platformRow("after", "2026-11-24T00:01:00.000Z"))
                        database.logBookEvents().clear()
                        database.logBookEvents().put(LogBookEventRecord(
                            "snapshot-event-after",
                            """{"eventId":"snapshot-event-after","kind":"trip_completed"}""",
                            1, "2026-11-24T00:01:00.000Z",
                        ))
                    }
                    writerValue.set(true)
                    writerFinished.countDown()
                }
                assertTrue(writerStarted.await(5, TimeUnit.SECONDS))
                assertEquals(false, writerFinished.await(100, TimeUnit.MILLISECONDS))
            }

            assertTrue(writerFinished.await(5, TimeUnit.SECONDS))
            assertEquals(true, writerValue.get())
            val snapshot = bundle?.snapshot ?: error("snapshot_bundle_missing")
            val rows = snapshot.getJSONArray("records")
            val platform = (0 until rows.length()).map { rows.getJSONObject(it) }
                .single { it.optString("id") == "snapshot-boundary-record" }
            assertEquals("before", JSONObject(platform.getString("json")).getJSONObject("data").getString("value"))
            val event = (0 until rows.length()).map { rows.getJSONObject(it) }
                .single { it.optString("participantId") == "logbook-events" }
            assertEquals("snapshot-event-before", event.getString("id"))
            assertEquals("after", JSONObject(database.records().get("snapshot-boundary-record")!!.json)
                .getJSONObject("data").getString("value"))
            assertEquals("snapshot-event-after", database.logBookEvents().list().single().eventId)
        } finally {
            executor.shutdownNow()
            database.close()
        }
    }
}
