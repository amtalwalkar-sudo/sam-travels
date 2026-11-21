package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import androidx.test.ext.junit.runners.AndroidJUnit4

@RunWith(AndroidJUnit4::class)
class OperatingConfigurationResolverTest {
    private val at = "2026-11-19T08:00:00Z"
    private fun db() = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext<Context>(), LocalDatabase::class.java,
    ).allowMainThreadQueries().build()

    private fun put(db: LocalDatabase, id: String, data: JSONObject, revision: Int = 1) {
        val envelope = JSONObject().put("id", id).put("schemaVersion", 1)
            .put("createdAt", at).put("updatedAt", at).put("source", "android")
            .put("revision", revision).put("data", data)
        db.records().put(StoredRecord(id, envelope.toString(), 1, at))
    }
    private fun driver(id: String = "driver-1", lifecycle: String = "active") = JSONObject()
        .put("schemaVersion", 1).put("driverId", id).put("name", "Driver $id").put("lifecycleState", lifecycle)
    private fun vehicle(reg: String = "MH01AB1234", lifecycle: String = "active") = JSONObject()
        .put("schemaVersion", 1).put("registrationNumber", reg).put("make", "Make").put("model", "Model")
        .put("vehicleType", "Sedan").put("fuelType", "CNG").put("yearOfManufacture", 2024)
        .put("ownership", "Owned").put("lifecycleState", lifecycle)
    private fun assignment(driverId: String = "driver-1", vehicleId: String = "feature:vehicle:MH01AB1234",
        assignmentId: String = "assignment-1", assignedAt: String = at) = JSONObject()
        .put("schemaVersion", 1).put("driverId", driverId).put("assignments", JSONArray().put(
            JSONObject().put("assignmentId", assignmentId).put("vehicleId", vehicleId).put("assignedAt", assignedAt),
        ))
    private fun seed(db: LocalDatabase, selectedDriver: String = "driver-1", locked: Boolean = false) {
        put(db, "work:selected-driver", JSONObject().put("schemaVersion", 1).put("driverId", selectedDriver)
            .apply { if (locked) put("lockedShiftId", "shift-1") })
        put(db, "feature:driver-records:driver:driver-1", driver(), 3)
        put(db, "feature:vehicle:MH01AB1234", vehicle(), 4)
        put(db, "feature:driver-records:assignment:driver-1", assignment(), 5)
    }
    private fun failure(db: LocalDatabase, expected: String) {
        val error = runCatching { WorkDriverContextResolver.resolve(db, at) }.exceptionOrNull()
        assertEquals(expected, error?.message)
    }

    @Test fun resolvesSoleConfiguredPairAndReturnsSourceRevisions() {
        val db = db()
        try {
            seed(db)
            val result = WorkDriverContextResolver.resolve(db, at)
            assertEquals("driver-1", result.getString("driverId"))
            assertEquals("feature:vehicle:MH01AB1234", result.getString("vehicleId"))
            assertEquals("assignment-1", result.getString("assignmentId"))
            assertEquals(3, result.getInt("driverRevision"))
            assertEquals(4, result.getInt("vehicleRevision"))
            assertEquals(5, result.getInt("assignmentRevision"))
            assertEquals(1, result.getInt("selectionRevision"))
        } finally { db.close() }
    }

    @Test fun rejectsAmbiguousActiveDriverAndVehicleProfiles() {
        val drivers = db()
        try {
            seed(drivers)
            put(drivers, "feature:driver-records:driver:driver-2", driver("driver-2"))
            failure(drivers, "operating_driver_ambiguous")
        } finally { drivers.close() }

        val vehicles = db()
        try {
            seed(vehicles)
            put(vehicles, "feature:vehicle:MH02CD5678", vehicle("MH02CD5678"))
            failure(vehicles, "operating_vehicle_ambiguous")
        } finally { vehicles.close() }
    }

    @Test fun rejectsMissingSelectionLockedShiftAndMismatchedAssignment() {
        val locked = db()
        try {
            seed(locked, locked = true)
            failure(locked, "operating_driver_selection_locked")
        } finally { locked.close() }

        val mismatch = db()
        try {
            seed(mismatch)
            put(mismatch, "feature:driver-records:assignment:driver-1",
                assignment(vehicleId = "feature:vehicle:MH02CD5678"))
            failure(mismatch, "operating_assignment_pair_mismatch")
        } finally { mismatch.close() }

        val missing = db()
        try {
            put(missing, "feature:driver-records:driver:driver-1", driver())
            put(missing, "feature:vehicle:MH01AB1234", vehicle())
            put(missing, "feature:driver-records:assignment:driver-1", assignment())
            failure(missing, "work_driver_not_selected")
        } finally { missing.close() }
    }

    @Test fun rejectsAssignmentNotEffectiveAtTransition() {
        val db = db()
        try {
            seed(db)
            val error = runCatching {
                WorkDriverContextResolver.resolve(db, "2026-11-19T07:59:59Z")
            }.exceptionOrNull()
            assertEquals("operating_assignment_not_effective", error?.message)
            assertTrue(db.records().list().isNotEmpty())
        } finally { db.close() }
    }
}
