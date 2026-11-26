package `in`.samtravels.app

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue

internal object HistoricalTripBackfillAcceptanceSupport {
    fun assertHistoricalTripBackfill(
        activity: MainActivity,
        support: AdminFormsCapacitorAcceptanceTest,
        db: LocalDatabase,
        driverId: String,
        vehicleId: String,
        marker: String,
    ) {
        val backfillReference = "android-entry-" + marker.replace(Regex("[^A-Za-z0-9_-]"), "-")
        support.click(activity, "Add missing historical trip")
        support.set(activity, "Driver", driverId)
        support.set(activity, "Vehicle", vehicleId)
        support.set(activity, "Trip started (India time)", "2026-11-10T08:00")
        support.set(activity, "Trip ended (India time)", "2026-11-10T08:30")
        support.set(activity, "Fare (₹)", "250")
        support.set(activity, "Toll (₹, optional)", "10")
        support.set(activity, "Toll paid by", "driver")
        support.set(activity, "Parking (₹, optional)", "5")
        support.set(activity, "Parking paid by", "customer")
        support.set(activity, "Backfill reference (optional)", backfillReference)
        support.set(activity, "Reason / source of historical information", marker + " reconciled paper trip")
        support.click(activity, "Save historical trip")
        val saved = support.await(activity,
            "document.body.innerText.includes('Historical trip recorded as an Admin-declared entry')", 15000)
        if (!saved) {
            val status = support.javascriptValue(activity,
                "document.querySelector('section[aria-label=\\\"Historical trip backfill\\\"] [role=status]')?.textContent || 'no status message'")
            throw AssertionError("Historical trip is saved through the Room-backed Admin form; status=$status")
        }
        val backfillRows = db.records().list().filter { row ->
            row.id == "historical-trip-backfill:" + backfillReference
        }
        assertEquals("One Room-backed missing-trip record", 1, backfillRows.size)
        val backfillData = JSONObject(backfillRows.single().json).getJSONObject("data")
        assertEquals("Backfill fare", 25000, backfillData.getInt("farePaise"))
        assertEquals("Backfill driver-paid toll", 1000, backfillData.getInt("tollPaise"))
        assertEquals("Backfill toll payer", "driver", backfillData.getString("tollPayer"))
        assertEquals("Backfill customer-paid parking", 500, backfillData.getInt("parkingPaise"))
        assertEquals("Backfill parking payer", "customer", backfillData.getString("parkingPayer"))
        for (key in listOf("eventId", "startEventId", "endEventId", "gps", "startGps", "endGps", "odometerKm", "tripContext")) {
            assertTrue("Missing trip must not fabricate Work/GPS/odometer evidence: $key", !backfillData.has(key))
        }
    }

}
