package `in`.samtravels.app

import android.content.Context
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

@RunWith(AndroidJUnit4::class)
class DriverWorkflowStoreTest {
    private val db = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext<Context>(),
        LocalDatabase::class.java,
    ).allowMainThreadQueries().build()

    @After fun closeDatabase() = db.close()

    private fun command(id: String, event: String = "shift_start") = JSONObject()
        .put("schemaVersion", 1)
        .put("commandId", id)
        .put("eventId", id)
        .put("eventType", event)
        .put("originSurface", "native_overlay")
        .put("transitionAt", java.time.Instant.now().toString())
        .put("expectedPriorState", "idle")
        .put("expectedRevision", 0)
        .put("idempotencyKey", id)

    private fun gps(accuracy: Double = 8.0) = JSONObject()
        .put("latitude", 19.076)
        .put("longitude", 72.8777)
        .put("horizontalAccuracyM", accuracy)
        .put("fixAt", java.time.Instant.now().toString())
        .put("provider", "android-test")


    @Test fun operationalDateUsesExactIndiaFourAmBoundary() {
        assertEquals("2026-11-08",DriverWorkflowStore.operationalDateAt("2026-11-08T22:29:59Z"))
        assertEquals("2026-11-09",DriverWorkflowStore.operationalDateAt("2026-11-08T22:30:00Z"))
    }

    @Test fun v2CapturesShiftAndTripContextAndLocksSelectedDriverUntilShiftEnd() {
        val now=java.time.Instant.now()
        val created=now.minusSeconds(120).toString()
        fun putFeatureRecord(id:String,data:JSONObject) {
            val envelope=JSONObject().put("id",id).put("schemaVersion",1).put("createdAt",created)
                .put("updatedAt",created).put("source","android").put("revision",1).put("data",data)
            db.records().put(StoredRecord(id,envelope.toString(),1,created))
        }
        putFeatureRecord("work:selected-driver",JSONObject().put("schemaVersion",1).put("driverId","driver-v2"))
        putFeatureRecord("feature:driver-records:driver:driver-v2",JSONObject().put("schemaVersion",1)
            .put("driverId","driver-v2").put("name","Driver V2").put("lifecycleState","active"))
        putFeatureRecord("feature:driver-records:assignment:driver-v2",JSONObject().put("schemaVersion",1)
            .put("driverId","driver-v2").put("assignments",org.json.JSONArray().put(JSONObject()
                .put("assignmentId","assignment-v2").put("vehicleId","feature:vehicle:MH01AB1234")
                .put("assignedAt",created))))
        putFeatureRecord("feature:vehicle:MH01AB1234",JSONObject().put("schemaVersion",1)
            .put("registrationNumber","MH01AB1234").put("make","Make").put("model","Model")
            .put("vehicleType","Sedan").put("fuelType","Petrol").put("yearOfManufacture",2024)
            .put("ownership","Owned").put("lifecycleState","active"))

        fun v2Command(id:String,event:String,state:String,revision:Int)=JSONObject()
            .put("schemaVersion",1).put("workflowVersion",2).put("commandId",id).put("eventId",id)
            .put("eventType",event).put("originSurface","native_overlay").put("transitionAt",java.time.Instant.now().toString())
            .put("expectedPriorState",state).put("expectedRevision",revision).put("idempotencyKey",id)
        fun run(id:String,event:String,state:String,revision:Int):JSONObject {
            DriverWorkflowStore.queue(db,v2Command(id,event,state,revision))
            return DriverWorkflowStore.complete(db,id,gps())
        }

        val started=run("shift-v2","shift_start","idle",0)
        assertEquals("shift-v2",started.getString("shiftId"))
        assertEquals("driver-v2",started.getJSONObject("shiftContext").getString("driverId"))
        val selectedAfterStart=JSONObject(db.records().get("work:selected-driver")!!.json).getJSONObject("data")
        assertEquals("shift-v2",selectedAfterStart.getString("lockedShiftId"))

        val pickup=run("trip-v2","trip_create","shift_active",1)
        assertEquals("going_to_pickup",pickup.getString("state"))
        assertEquals("shift-v2",pickup.getJSONObject("tripContext").getString("shiftId"))
        assertEquals("assignment-v2",pickup.getJSONObject("tripContext").getString("assignmentId"))
        assertTrue(pickup.getJSONObject("tripContext").getString("operationalDate").matches(Regex("\\d{4}-\\d{2}-\\d{2}")))

        val riding=run("ride-start-v2","start_ride","going_to_pickup",2)
        assertEquals("trip_active",riding.getString("state"))
        val ended=run("ride-end-v2","end_ride","trip_active",3)
        assertEquals("shift_active",ended.getString("state"))
        val shiftEnded=run("shift-end-v2","shift_end","shift_active",4)
        assertEquals("idle",shiftEnded.getString("state"))
        val selectedAfterEnd=JSONObject(db.records().get("work:selected-driver")!!.json).getJSONObject("data")
        assertFalse(selectedAfterEnd.has("lockedShiftId"))
        val events=DriverWorkflowStore.listEvents(db)
        assertEquals(5,events.size)
        assertTrue(JSONObject(events.first { it.optString("eventId")=="shift-v2" }.toString())
            .getJSONObject("command").has("driverContext"))
        assertTrue(JSONObject(events.first { it.optString("eventId")=="trip-v2" }.toString())
            .getJSONObject("command").has("tripContext"))
    }

    @Test fun completionAtomicallyWritesEventProjectionIntentAndOutbox() {
        DriverWorkflowStore.queue(db, command("event-1"))
        val next = DriverWorkflowStore.complete(db, "event-1", gps())

        assertEquals("shift_active", next.getString("state"))
        assertEquals(1, next.getInt("revision"))
        assertEquals("recorded", JSONObject(db.records().get("driver-intent:event-1")!!.json).getString("status"))
        assertEquals(1, db.logBookEvents().list().size)
        assertEquals("event-1", JSONObject(db.logBookEvents().list().single().json).getString("eventId"))
        val outbox = JSONObject(db.records().get("driver-outbox:1")!!.json)
        assertEquals("logbook.work-driver-events.v1", outbox.getString("integrationId"))
        assertEquals(1, outbox.getInt("contractVersion"))
        assertEquals("work.driver-event-committed", outbox.getString("eventName"))
        assertEquals(1, outbox.getInt("payloadVersion"))
        assertEquals(1, JSONObject(db.records().get("driver-state")!!.json)
            .getJSONObject("value").getInt("revision"))
    }

    @Test fun failedGpsValidationLeavesIntentPendingAndProjectionUnchanged() {
        DriverWorkflowStore.queue(db, command("event-bad-gps"))
        var rejected = false
        try {
            DriverWorkflowStore.complete(db, "event-bad-gps", gps(51.0))
        } catch (_: IllegalArgumentException) {
            rejected = true
        }
        assertTrue(rejected)
        // A failed first transition must not create a projection; its implicit baseline is idle/revision 0.
        val persistedState = db.records().get("driver-state")?.let { JSONObject(it.json).getJSONObject("value") }
        assertEquals("idle", persistedState?.optString("state", "idle") ?: "idle")
        assertEquals(0, persistedState?.optInt("revision", 0) ?: 0)
        assertEquals("pending_location", JSONObject(db.records().get("driver-intent:event-bad-gps")!!.json)
            .getString("status"))
        assertTrue(db.logBookEvents().list().isEmpty())
        assertFalse(db.records().list().any { it.id.startsWith("driver-outbox:") })
    }

    @Test fun competingPwaAndOverlayCommandsCannotBothQueueAtOneRevision() {
        val ready = CountDownLatch(2)
        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(2)
        try {
            val first = pool.submit<Boolean> {
                ready.countDown(); start.await()
                try { DriverWorkflowStore.queue(db, command("race-a")); true }
                catch (_: Exception) { false }
            }
            val second = pool.submit<Boolean> {
                ready.countDown(); start.await()
                try {
                    DriverWorkflowStore.queue(db, command("race-b").put("originSurface", "pwa")); true
                } catch (_: Exception) { false }
            }
            assertTrue(ready.await(5, TimeUnit.SECONDS))
            start.countDown()
            val accepted = listOf(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS))
            assertEquals(1, accepted.count { it })
            assertEquals(1, db.records().list().count { it.id.startsWith("driver-intent:") })
        } finally {
            pool.shutdownNow()
        }
    }

    @Test fun recordedIntentCannotBeReactivatedOrDowngraded() {
        DriverWorkflowStore.queue(db, command("event-terminal"))
        DriverWorkflowStore.markNeedsAttention(db, "event-terminal", "gps_timeout")
        DriverWorkflowStore.reactivate(db, "event-terminal")
        DriverWorkflowStore.complete(db, "event-terminal", gps())

        var rejected = false
        try { DriverWorkflowStore.reactivate(db, "event-terminal") }
        catch (_: IllegalArgumentException) { rejected = true }
        DriverWorkflowStore.markNeedsAttention(db, "event-terminal", "late_error")
        assertTrue(rejected)
        assertEquals("recorded", JSONObject(db.records().get("driver-intent:event-terminal")!!.json)
            .getString("status"))
    }
    @Test fun duplicateCommandIsIdempotentButChangedPayloadIsRejected() {
        val original = command("same-event")
        val first = DriverWorkflowStore.queue(db, original)
        val duplicate = DriverWorkflowStore.queue(db, original)
        assertEquals(first.getString("status"), duplicate.getString("status"))
        assertEquals(first.getJSONObject("command").getString("commandId"),
            duplicate.getJSONObject("command").getString("commandId"))

        var rejected = false
        try { DriverWorkflowStore.queue(db, command("same-event", "trip_start")) }
        catch (_: IllegalArgumentException) { rejected = true }
        assertTrue(rejected)
        assertEquals(1, db.records().list().count { it.id.startsWith("driver-intent:") })
    }

    @Test fun commandAndIdempotencyKeysCannotBeReusedForAnotherEvent() {
        val first = command("identity-owner")
        DriverWorkflowStore.queue(db, first)
        val reusedKey = command("identity-second").put("idempotencyKey", first.getString("idempotencyKey"))
        assertEquals("duplicate_command_identity_conflict",
            runCatching { DriverWorkflowStore.queue(db, reusedKey) }.exceptionOrNull()?.message)
        val reusedCommand = command("identity-third").put("commandId", first.getString("commandId"))
        assertEquals("duplicate_command_identity_conflict",
            runCatching { DriverWorkflowStore.queue(db, reusedCommand) }.exceptionOrNull()?.message)
        assertEquals(1, DriverWorkflowStore.listIntents(db).size)
    }

    @Test fun pendingIntentSurvivesRoomReopenAndCanBeRecovered() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val databaseName = "driver-workflow-recovery-test.db"
        context.deleteDatabase(databaseName)
        val first = Room.databaseBuilder(context, LocalDatabase::class.java, databaseName)
            .allowMainThreadQueries().build()
        DriverWorkflowStore.queue(first, command("persistent-event"))
        first.close()

        val reopened = Room.databaseBuilder(context, LocalDatabase::class.java, databaseName)
            .allowMainThreadQueries().build()
        try {
            val persisted = JSONObject(reopened.records().get("driver-intent:persistent-event")!!.json)
            assertEquals("pending_location", persisted.getString("status"))
            assertEquals("persistent-event", persisted.getJSONObject("command").getString("eventId"))
            DriverWorkflowStore.reactivate(reopened, "persistent-event")
            val next = DriverWorkflowStore.complete(reopened, "persistent-event", gps())
            assertEquals("shift_active", next.getString("state"))
            assertEquals("recorded", JSONObject(reopened.records().get("driver-intent:persistent-event")!!.json)
                .getString("status"))
        } finally {
            reopened.close()
            context.deleteDatabase(databaseName)
        }
    }

    @Test fun replayedCompletionCannotDuplicateEventProjectionOrOutbox() {
        DriverWorkflowStore.queue(db, command("event-replay"))
        val first = DriverWorkflowStore.complete(db, "event-replay", gps())
        assertEquals(1, first.getInt("revision"))

        val replayed = DriverWorkflowStore.complete(db, "event-replay", gps())
        assertEquals(first.getString("state"), replayed.getString("state"))
        assertEquals(first.getInt("revision"), replayed.getInt("revision"))
        assertEquals(1, db.logBookEvents().list().size)
        assertEquals(1, db.records().list().count { it.id.startsWith("driver-outbox:") })
        assertEquals(1, JSONObject(db.records().get("driver-state")!!.json)
            .getJSONObject("value").getInt("revision"))
        assertEquals("recorded", JSONObject(db.records().get("driver-intent:event-replay")!!.json)
            .getString("status"))
    }


    @Test fun committedTransitionReplayAfterRoomReopenCannotDuplicateEventOrOutbox() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val databaseName = "driver-workflow-commit-replay-test.db"
        context.deleteDatabase(databaseName)
        val first = Room.databaseBuilder(context, LocalDatabase::class.java, databaseName)
            .allowMainThreadQueries().build()
        DriverWorkflowStore.queue(first, command("durable-replay"))
        val committed = DriverWorkflowStore.complete(first, "durable-replay", gps())
        assertEquals(1, committed.getInt("revision"))
        first.close()

        val reopened = Room.databaseBuilder(context, LocalDatabase::class.java, databaseName)
            .allowMainThreadQueries().build()
        try {
            val replayed = DriverWorkflowStore.complete(reopened, "durable-replay", gps())
            assertEquals(committed.getString("state"), replayed.getString("state"))
            assertEquals(committed.getInt("revision"), replayed.getInt("revision"))
            assertEquals(1, reopened.logBookEvents().list().size)
            assertEquals("durable-replay", JSONObject(reopened.logBookEvents().list().single().json).getString("eventId"))
            assertEquals(1, reopened.records().list().count { it.id.startsWith("driver-outbox:") })
            assertEquals(1, JSONObject(reopened.records().get("driver-state")!!.json)
                .getJSONObject("value").getInt("revision"))
            assertEquals("recorded", JSONObject(
                reopened.records().get("driver-intent:durable-replay")!!.json,
            ).getString("status"))
        } finally {
            reopened.close()
            context.deleteDatabase(databaseName)
        }
    }

    @Test fun injectedFailureAtEachCompletionWriteBoundaryRollsBackEveryAuthoritativeWrite() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val boundaries = listOf(
            "logbook" to "CREATE TRIGGER fail_logbook BEFORE INSERT ON logbook_events WHEN NEW.eventId='fault-logbook' BEGIN SELECT RAISE(ABORT, 'injected_logbook_failure'); END",
            "state" to "CREATE TRIGGER fail_state BEFORE INSERT ON records WHEN NEW.id='driver-state' BEGIN SELECT RAISE(ABORT, 'injected_state_failure'); END",
            "intent" to "CREATE TRIGGER fail_intent BEFORE INSERT ON records WHEN NEW.id='driver-intent:fault-intent' BEGIN SELECT RAISE(ABORT, 'injected_intent_failure'); END",
            "outbox" to "CREATE TRIGGER fail_outbox BEFORE INSERT ON records WHEN NEW.id='driver-outbox:1' BEGIN SELECT RAISE(ABORT, 'injected_outbox_failure'); END",
        )
        boundaries.forEach { (boundary, sql) ->
            val local = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
                .allowMainThreadQueries().build()
            val eventId = when (boundary) {
                "logbook" -> "fault-logbook"
                "state" -> "fault-state"
                "intent" -> "fault-intent"
                else -> "fault-outbox"
            }
            try {
                DriverWorkflowStore.queue(local, command(eventId))
                local.openHelper.writableDatabase.execSQL(sql)
                val failure = runCatching { DriverWorkflowStore.complete(local, eventId, gps()) }.exceptionOrNull()
                local.openHelper.writableDatabase.execSQL("DROP TRIGGER fail_" + boundary)
                assertTrue("Expected injected " + boundary + " failure", failure != null)
                assertEquals("idle", DriverWorkflowStore.snapshot(local).getString("state"))
                assertEquals(0, DriverWorkflowStore.snapshot(local).getInt("revision"))
                assertEquals("pending_location",
                    JSONObject(local.records().get("driver-intent:" + eventId)!!.json).getString("status"))
                assertTrue(local.logBookEvents().list().isEmpty())
                assertEquals(0, local.records().list().count { it.id.startsWith("driver-outbox:") })
            } finally {
                runCatching { local.openHelper.writableDatabase.execSQL("DROP TRIGGER fail_" + boundary) }
                local.close()
            }
        }
    }

    @Test fun workRepositoryGatewayExposesSnapshotPendingIntentsAndCommittedEvents() {
        DriverWorkflowStore.queue(db, command("gateway-event"))
        assertEquals("idle", DriverWorkflowStore.snapshot(db).getString("state"))
        assertEquals(1, DriverWorkflowStore.listIntents(db).size)
        assertEquals(1, DriverWorkflowStore.listPending(db).size)
        assertEquals("gateway-event", DriverWorkflowStore.firstPendingLocation(db)
            ?.getJSONObject("command")?.getString("eventId"))
        assertEquals("gateway-event", DriverWorkflowStore.firstRecoverableIntent(db)
            ?.getJSONObject("command")?.getString("eventId"))

        DriverWorkflowStore.complete(db, "gateway-event", gps())
        assertEquals(0, DriverWorkflowStore.listPending(db).size)
        assertEquals(1, DriverWorkflowStore.listEvents(db).size)
        assertEquals("gateway-event", DriverWorkflowStore.listEvents(db).single().getString("eventId"))
        assertEquals("shift_active", DriverWorkflowStore.snapshot(db).getString("state"))
        assertTrue(DriverWorkflowStore.firstPendingLocation(db) == null)
        assertTrue(DriverWorkflowStore.firstRecoverableIntent(db) == null)
    }


    @Test fun durableRoomRestoreAndReopenMatchesTheCompleteDexieProjectionOracle() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val instrumentation = androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
        val assets = instrumentation.context.assets
        val oracle = JSONObject(assets.open("generated/timeline-projection-parity-oracle-v1.json")
            .bufferedReader().use { it.readText() })
        val bundle = assets.open("timeline-projection.js").bufferedReader().use { it.readText() }

        fun runSharedProjection(rows: List<JSONObject>): String {
            val eventJson = org.json.JSONArray().apply { rows.forEach { put(it) } }
            val completed = CountDownLatch(1)
            val projectionJson = AtomicReference<String?>()
            lateinit var webView: WebView
            instrumentation.runOnMainSync {
                webView = WebView(context)
                webView.settings.javaScriptEnabled = true
                webView.webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView, url: String) {
                        view.evaluateJavascript(
                            "JSON.stringify(TimelineParity.buildTimelineProjection({events:$eventJson}))",
                        ) { encoded ->
                            projectionJson.set(org.json.JSONTokener(encoded).nextValue() as String)
                            completed.countDown()
                        }
                    }
                }
                webView.loadDataWithBaseURL(
                    "https://localhost/",
                    "<html><head><script>$bundle</script></head><body></body></html>",
                    "text/html",
                    "UTF-8",
                    null,
                )
            }
            try {
                assertTrue("Shared Timeline projection did not finish", completed.await(20, TimeUnit.SECONDS))
                return projectionJson.get() ?: error("Timeline projection returned no result")
            } finally {
                instrumentation.runOnMainSync { webView.destroy() }
            }
        }

        val fixture = assets.open("timeline-parity-events-v1.json").bufferedReader().use { it.readText() }
        val expectedEvents = org.json.JSONArray(fixture)
        val databaseName = "timeline-parity-durable-restore.db"
        context.deleteDatabase(databaseName)
        val builder = Room.databaseBuilder(context, LocalDatabase::class.java, databaseName)
            .addMigrations(LocalDatabase.MIGRATION_1_2, LocalDatabase.MIGRATION_2_3)
            .allowMainThreadQueries()

        var durable = builder.build()
        try {
            for (index in 0 until expectedEvents.length()) {
                val event = expectedEvents.getJSONObject(index)
                val row = LogBookEventRecord(
                    event.getString("eventId"), event.toString(), 1, event.getString("committedAt"),
                )
                durable.logBookEvents().put(row)
                if (index == 0) durable.logBookEvents().put(row)
            }
            val exported = NativeBackupCoverage.exportBusinessRecords(durable) { false }
            assertEquals(expectedEvents.length(), exported.length())

            // Exercise the native replacement/restore adapter, not just a second insert.
            durable.runInTransaction { NativeBackupCoverage.replaceBusinessRecords(durable, org.json.JSONArray()) }
            assertTrue(durable.logBookEvents().list().isEmpty())
            durable.runInTransaction { NativeBackupCoverage.replaceBusinessRecords(durable, exported) }
        } finally {
            durable.close()
        }

        // A real on-disk Room close/reopen separates the persisted source from the projection.
        durable = builder.build()
        try {
            val persisted = DriverWorkflowStore.listEvents(durable)
            assertEquals(expectedEvents.length(), persisted.size)
            val normalOutput = runSharedProjection(persisted)
            assertEquals("Complete normal projection differs from Dexie oracle", oracle.getString("normal"), normalOutput)

            // Pending shift/trip edge dataset is independently persisted and reopened.
            durable.logBookEvents().clear()
            for (index in 0 until 2) {
                val event = expectedEvents.getJSONObject(index)
                durable.logBookEvents().put(LogBookEventRecord(
                    event.getString("eventId"), event.toString(), 1, event.getString("committedAt"),
                ))
            }
            durable.close()
            durable = builder.build()
            val edgeOutput = runSharedProjection(DriverWorkflowStore.listEvents(durable))
            assertEquals("Complete pending-edge projection differs from Dexie oracle", oracle.getString("edge"), edgeOutput)
        } finally {
            durable.close()
            context.deleteDatabase(databaseName)
        }
    }



    @Test fun malformedPersistedEventFailsClosedAtRoomReadBoundary() {
        db.logBookEvents().put(LogBookEventRecord(
            "malformed-event",
            """{"eventId":"malformed-event","command":{},"committedAt":"not-an-instant","revision":1}""",
            1,
            "2026-11-06T00:00:00Z",
        ))
        val failure = runCatching { DriverWorkflowStore.listEvents(db) }.exceptionOrNull()
        assertTrue(failure is IllegalArgumentException)
    }
}
