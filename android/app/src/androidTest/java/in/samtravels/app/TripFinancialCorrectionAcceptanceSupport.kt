package `in`.samtravels.app

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import java.util.UUID

internal object TripFinancialCorrectionAcceptanceSupport {
    fun assertTripFinancialCorrection(
        activity: MainActivity,
        support: AdminFormsCapacitorAcceptanceTest,
        db: LocalDatabase,
        driverId: String,
        vehicleId: String,
        assignmentId: String,
    ) {
        // Seed a submitted trip-financial source and its immutable end-ride evidence.
        // The rendered correction form must append a correction without rewriting either.
        val tripId = "trip-correction-" + UUID.randomUUID().toString()
        val tripFinancialId = "work:trip-financial-obligation:" + tripId
        val endRideEventId = "end-ride-" + UUID.randomUUID().toString()
        val recordedAt = "2026-11-15T08:30:00.000Z"
        val tripContext = JSONObject()
        .put("schemaVersion", 1).put("shiftId", "shift-" + tripId)
        .put("driverId", driverData.getString("driverId"))
        .put("assignmentId", assignmentRecordId)
        .put("vehicleId", vehicleRecordId).put("operationalDate", "2026-11-15")
        val financialData = JSONObject()
        .put("schemaVersion", 1).put("tripId", tripId)
        .put("kind", "completed_ride_financials").put("status", "submitted")
        .put("endRideEventId", endRideEventId).put("createdAt", recordedAt)
        .put("tripContext", tripContext).put("farePaise", 15000)
        .put("tollPaise", 2000).put("tollPayer", "driver")
        .put("parkingPaise", 1000).put("parkingPayer", "customer")
        .put("operationId", "operation-" + tripId).put("submittedAt", recordedAt)
        val financialEnvelope = JSONObject()
        .put("id", tripFinancialId).put("schemaVersion", 1)
        .put("createdAt", recordedAt).put("updatedAt", recordedAt)
        .put("source", "integration").put("revision", 1).put("data", financialData)
        db.records().put(StoredRecord(tripFinancialId, financialEnvelope.toString(), 1, recordedAt))
        val logbookId = "logbook:" + endRideEventId
        val logbookData = JSONObject()
        .put("eventId", endRideEventId).put("eventType", "end_ride")
        .put("tripId", tripId).put("shiftId", "shift-" + tripId)
        .put("driverId", driverData.getString("driverId")).put("vehicleId", vehicleRecordId)
        .put("gps", JSONObject().put("latitude", 19.076).put("longitude", 72.8777)
        .put("accuracyMeters", 10).put("capturedAt", recordedAt))
        .put("odometerKm", 1050)
        val logbookEnvelope = JSONObject()
        .put("id", logbookId).put("schemaVersion", 1)
        .put("createdAt", recordedAt).put("updatedAt", recordedAt)
        .put("source", "integration").put("revision", 1).put("data", logbookData)
        db.records().put(StoredRecord(logbookId, logbookEnvelope.toString(), 1, recordedAt))
        val originalLogbookJson = db.records().get(logbookId)!!.json
        support.eval(activity, "document.getElementById('admin-section-trigger-vehicle')?.click()")
        support.eval(activity, "document.getElementById('admin-section-trigger-driver')?.click()")
        assertTrue("Submitted trip appears in correction form", support.await(activity,
        "document.querySelector('section[aria-label=\\\"Trip financial corrections\\\"]')?.innerText.includes('$tripId')===true", 15000))
        support.set(activity, "Correct value", "175")
        support.set(activity, "Reason for correction", "Verified against the original trip receipt")
        support.click(activity, "Record correction")
        assertTrue("Trip correction committed and projected", support.await(activity,
        "document.querySelector('section[aria-label=\\\"Trip financial corrections\\\"] [role=status]')?.textContent.includes('Trip financial correction recorded')===true && document.querySelector('section[aria-label=\\\"Trip financial corrections\\\"]')?.innerText.includes('Fare ₹175.00')===true", 20000))
        val immutableTripSource = db.records().get(tripFinancialId)
        assertNotNull("Original trip financial source remains", immutableTripSource)
        val immutableTripData = JSONObject(immutableTripSource!!.json).getJSONObject("data")
        assertEquals("Original fare is not overwritten", 15000, immutableTripData.getInt("farePaise"))
        assertEquals("Original source revision is not advanced", 1, immutableTripSource.revision)
        val tripCorrections = db.records().list().filter { row ->
        row.id.startsWith("historical-correction:") &&
        JSONObject(row.json).getJSONObject("data").optString("targetRecordId") == tripFinancialId
        }
        assertEquals("One append-only trip correction", 1, tripCorrections.size)
        val tripCorrectionData = JSONObject(tripCorrections.single().json).getJSONObject("data")
        assertEquals("farePaise", tripCorrectionData.getString("fieldPath"))
        assertEquals(15000, tripCorrectionData.getInt("beforeValue"))
        assertEquals(17500, tripCorrectionData.getInt("afterValue"))
        assertEquals("admin", tripCorrectionData.getJSONObject("actor").getString("role"))
        assertEquals("Verified against the original trip receipt", tripCorrectionData.getString("reason"))
        assertEquals("Work/GPS event is immutable", originalLogbookJson, db.records().get(logbookId)!!.json)
    }
}
