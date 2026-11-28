package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import androidx.test.ext.junit.runners.AndroidJUnit4

@RunWith(AndroidJUnit4::class)
class SharedSemanticBackupValidatorParityTest {
    @Test fun sharedFixtureAcceptsAndRejectsTheSameValidatorMatrix() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        try {
            NativeBusinessSettingsBackup.ensureRegistered()
            NativeVehicleBackup.ensureRegistered()
            NativeDriverRecordsBackup.ensureRegistered()
            NativeComplianceBackup.ensureRegistered()
            NativeMaintenanceBackup.ensureRegistered()
            NativeFinanceBackup.ensureRegistered()
            NativeBusinessExpensesBackup.ensureRegistered()
            NativePerformanceBackup.ensureRegistered()

            val fixture = InstrumentationRegistry.getInstrumentation().context.assets
                .open("semantic-backup-lifecycle-v1.json")
                .bufferedReader().use { JSONObject(it.readText()) }
            val records = fixture.getJSONObject("populatedGraph").getJSONArray("records")
            for (index in 0 until records.length()) {
                val row = records.getJSONObject(index)
                database.records().put(StoredRecord(
                    row.getString("id"), row.toString(), row.getInt("schemaVersion"), row.getString("updatedAt"),
                ))
            }
            val work = fixture.getJSONObject("populatedGraph").getJSONObject("work")
            val financial = work.getJSONObject("tripFinancial")
            val endRide = (0 until work.getJSONArray("committedTransitions").length()).map {
                work.getJSONArray("committedTransitions").getJSONObject(it)
            }.first { it.optString("type") == "end_ride" }
            val tripCreate = (0 until work.getJSONArray("committedTransitions").length()).map {
                work.getJSONArray("committedTransitions").getJSONObject(it)
            }.first { it.optString("type") == "trip_create" }
            val financialData = JSONObject().put("schemaVersion", 1).put("tripId", financial.getString("tripId"))
                .put("kind", "completed_ride_financials").put("status", "submitted")
                .put("endRideEventId", endRide.getString("id")).put("createdAt", endRide.getString("at"))
                .put("tripContext", tripCreate.getJSONObject("tripContext"))
            val values = financial.getJSONObject("values")
            values.keys().forEach { key -> financialData.put(key, values.get(key)) }
            financialData.put("operationId", financial.getString("operationId"))
                .put("submittedAt", financial.getString("submittedAt"))
            val financialEnvelope = JSONObject().put("id", financial.getString("recordId"))
                .put("schemaVersion", 1).put("createdAt", endRide.getString("at"))
                .put("updatedAt", financial.getString("submittedAt")).put("source", "integration")
                .put("revision", 2).put("createdBy", financial.getJSONObject("author")).put("data", financialData)
            database.records().put(StoredRecord(financial.getString("recordId"), financialEnvelope.toString(), 1, financial.getString("submittedAt")))
            val validRows = NativeBackupCoverage.exportBusinessRecords(database, NativeBackupRecovery::isInternalRecord)
            assertTrue(validRows.length() >= records.length())
            NativeBackupCoverage.validateBusinessRecords(validRows, requireExplicitOwnerTags = true)

            val matrix = fixture.getJSONObject("validatorMatrix").getJSONArray("negativeCases")
            fun recordId(caseId: String): String =
                (0 until matrix.length()).map { matrix.getJSONObject(it) }
                    .first { it.getString("id") == caseId }.getString("recordId")

            fun assertRejected(caseId: String, mutate: (JSONArray) -> Unit) {
                val scenario = (0 until matrix.length()).map { matrix.getJSONObject(it) }
                    .first { it.getString("id") == caseId }
                val candidate = JSONArray(validRows.toString())
                mutate(candidate)
                val failure = runCatching {
                    NativeBackupCoverage.validateBusinessRecords(candidate, requireExplicitOwnerTags = true)
                }.exceptionOrNull()
                assertTrue("$caseId must be rejected by the Room validator", failure != null)
                val message = failure?.message.orEmpty()
                val actualCategory = when {
                    "revision" in message -> "malformed_revision"
                    "duplicate" in message -> "duplicate_identity"
                    "owner" in message || "participant" in message -> "wrong_owner"
                    "correction" in message -> "invalid_correction_head"
                    "not_found" in message || "link_invalid" in message -> "dangling_reference"
                    else -> "malformed_record"
                }
                assertEquals("$caseId normalized validator category", scenario.getString("category"), actualCategory)
            }

            assertRejected("malformed-fuel-purchase") { rows ->
                val row = (0 until rows.length()).map { rows.getJSONObject(it) }
                    .first { it.getString("id") == recordId("malformed-fuel-purchase") }
                val envelope = JSONObject(row.getString("json"))
                envelope.getJSONObject("data").put("amountPaise", 0)
                row.put("json", envelope.toString())
            }
            assertRejected("dangling-business-expense-vehicle") { rows ->
                val row = (0 until rows.length()).map { rows.getJSONObject(it) }
                    .first { it.getString("id") == recordId("dangling-business-expense-vehicle") }
                val envelope = JSONObject(row.getString("json"))
                envelope.getJSONObject("data").put("vehicleId", "feature:vehicle:MISSINGVEHICLE001")
                row.put("json", envelope.toString())
            }
            assertRejected("dangling-trip-financial-source") { rows ->
                val row = (0 until rows.length()).map { rows.getJSONObject(it) }
                    .first { it.getString("id") == recordId("dangling-trip-financial-source") }
                val envelope = JSONObject(row.getString("json"))
                envelope.getJSONObject("data").put("tripFinancialSourceId", "work:trip-financial-obligation:MISSINGTRIP001")
                row.put("json", envelope.toString())
            }
            assertRejected("wrong-feature-participant-owner") { rows ->
                val row = (0 until rows.length()).map { rows.getJSONObject(it) }
                    .first { it.getString("id") == recordId("wrong-feature-participant-owner") }
                row.put("participantId", "maintenance-records")
            }
            assertRejected("invalid-maintenance-correction-head") { rows ->
                val row = (0 until rows.length()).map { rows.getJSONObject(it) }
                    .first { it.getString("id") == recordId("invalid-maintenance-correction-head") }
                val envelope = JSONObject(row.getString("json"))
                envelope.getJSONObject("data").put("headCorrectionId", "missing-correction")
                row.put("json", envelope.toString())
            }
            assertRejected("malformed-record-revision") { rows ->
                val row = (0 until rows.length()).map { rows.getJSONObject(it) }
                    .first { it.getString("id") == recordId("malformed-record-revision") }
                val envelope = JSONObject(row.getString("json"))
                envelope.put("revision", 0)
                row.put("json", envelope.toString())
            }
            assertRejected("duplicate-record-identity") { rows ->
                val row = (0 until rows.length()).map { rows.getJSONObject(it) }
                    .first { it.getString("id") == recordId("duplicate-record-identity") }
                rows.put(JSONObject(row.toString()))
            }
        } finally {
            database.close()
        }
    }
}
