package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NativeBackupRestoreCoordinatorTest {
    private fun envelope(id: String, data: JSONObject, at: String, revision: Int = 1) = StoredRecord(
        id,
        JSONObject().put("id", id).put("schemaVersion", 1).put("createdAt", at)
            .put("updatedAt", at).put("source", "android").put("revision", revision)
            .put("data", data).toString(),
        1, at,
    )

    private fun snapshot(database: LocalDatabase) =
        NativeSnapshotBuilder.build(database, NativeBackupRecovery::isInternalRecord, "test")

    @Test fun productionRestoreReopenRecoveryAndReexportPreservePreRestoreGraph() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val name = "restore-coordinator-integrated.db"
        context.deleteDatabase(name)
        val vehicle = NativeVehicleBackup.register()
        val drivers = NativeDriverRecordsBackup.register()
        val at = "2026-11-17T08:00:00.000Z"
        try {
            val db = Room.databaseBuilder(context, LocalDatabase::class.java, name)
                .allowMainThreadQueries().build()
            val vehicleId = "feature:vehicle:MH01AB1234"
            val driverId = "feature:driver-records:driver:driver-1"
            val assignmentId = "feature:driver-records:assignment:driver-1"
            db.records().put(envelope(vehicleId, JSONObject()
                .put("schemaVersion", 1).put("registrationNumber", "MH01AB1234")
                .put("make", "Tata").put("model", "Ace").put("vehicleType", "LCV")
                .put("fuelType", "Diesel").put("yearOfManufacture", 2022)
                .put("ownership", "Owned").put("lifecycleState", "active"), at))
            db.records().put(envelope(driverId, JSONObject()
                .put("schemaVersion", 1).put("driverId", "driver-1").put("name", "Driver One")
                .put("lifecycleState", "active").put("selectedForWork", true), at))
            db.records().put(envelope(assignmentId, JSONObject()
                .put("schemaVersion", 1).put("driverId", "driver-1")
                .put("assignments", org.json.JSONArray().put(JSONObject()
                    .put("assignmentId", "assignment-1").put("vehicleId", vehicleId)
                    .put("assignedAt", at))), at))
            val source = snapshot(db)

            // A different valid target state is the rollback baseline.
            db.records().put(envelope("pre-restore-record", JSONObject().put("value", "keep"), at, 2))
            val beforeRestore = snapshot(db)
            val result = NativeBackupRestoreCoordinator.restore(
                db, source.snapshot, source.manifest,
            ) { snapshot(db) }
            assertEquals(source.snapshot.getJSONArray("records").length(), result.restoredCount)
            db.close()

            // A new Room handle simulates a process restart. The unverified
            // restore must roll back to the checkpoint captured by production restore.
            val reopened = Room.databaseBuilder(context, LocalDatabase::class.java, name)
                .allowMainThreadQueries().build()
            try {
                assertEquals(listOf(result.checkpointId), NativeStartupRecovery.ensure(reopened))
                val recovered = snapshot(reopened)
                assertEquals(
                    canonical(beforeRestore.snapshot.getJSONArray("records")),
                    canonical(recovered.snapshot.getJSONArray("records")),
                )
                assertEquals(emptyList<String>(), NativeStartupRecovery.ensure(reopened))
                val reexported = snapshot(reopened)
                assertEquals(
                    canonical(recovered.snapshot.getJSONArray("records")),
                    canonical(reexported.snapshot.getJSONArray("records")),
                )
            } finally { reopened.close() }
        } finally {
            drivers.close()
            vehicle.close()
            context.deleteDatabase(name)
        }
    }

    @Test fun driverAssignmentWithDanglingVehicleIsRejectedBeforeRestoreMutation() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val db = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        val vehicle = NativeVehicleBackup.register()
        val drivers = NativeDriverRecordsBackup.register()
        val at = "2026-11-17T08:00:00.000Z"
        try {
            val assignment = envelope("feature:driver-records:assignment:driver-2", JSONObject()
                .put("schemaVersion", 1).put("driverId", "driver-2")
                .put("assignments", org.json.JSONArray().put(JSONObject()
                    .put("assignmentId", "assignment-2")
                    .put("vehicleId", "feature:vehicle:MISSING")
                    .put("assignedAt", at))), at)
            val records = org.json.JSONArray().put(JSONObject()
                .put("id", assignment.id).put("json", assignment.json)
                .put("schemaVersion", assignment.schemaVersion).put("updatedAt", assignment.updatedAt)
                .put("participantId", "driver-records"))
            assertThrows(IllegalArgumentException::class.java) {
                NativeBackupCoverage.validateBusinessRecords(records, requireExplicitOwnerTags = true)
            }
        } finally {
            drivers.close()
            vehicle.close()
            db.close()
        }
    }

    private fun canonical(records: org.json.JSONArray): List<String> =
        (0 until records.length()).map { index ->
            val row = records.getJSONObject(index)
            listOf(row.getString("participantId"), row.getString("id"), row.getString("json"),
                row.getInt("schemaVersion").toString(), row.getString("updatedAt")).joinToString("|")
        }.sorted()
}
