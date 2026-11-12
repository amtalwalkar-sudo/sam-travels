package `in`.samtravels.app

import org.json.JSONObject

/** Appends an immutable shift contribution to the vehicle's daily Work distance projection. */
internal object WorkDailyBusinessKilometreStore {
    fun validateTransition(current: JSONObject, command: JSONObject) {
        val eventType = command.optString("eventType")
        val odometer = command.optJSONObject("odometer")
        if (command.optInt("workflowVersion", 1) == 2 && eventType == "shift_start") {
            val reading = odometer?.getLong("readingKm") ?: error("shift_odometer_required")
            if (current.has("lastConfirmedOdometerKm")) {
                val previous = current.getLong("lastConfirmedOdometerKm")
                require(reading >= previous && odometer.optLong("previousConfirmedKm", -1L) == previous &&
                    odometer.optLong("personalKm", -1L) == reading - previous) { "shift_start_odometer_invalid" }
            } else require(!odometer.has("previousConfirmedKm") && !odometer.has("personalKm")) {
                "shift_start_odometer_invalid"
            }
        }
        if (command.optInt("workflowVersion", 1) == 2 && eventType == "shift_end") {
            val start = current.optLong("shiftStartOdometerKm", -1L)
            val end = odometer?.optLong("readingKm", -1L) ?: -1L
            require(start >= 0L && end >= start && odometer?.optLong("businessKm", -1L) == end - start) {
                "shift_end_odometer_invalid"
            }
        }
    }

    fun append(db: LocalDatabase, current: JSONObject, command: JSONObject, eventId: String, now: String) {
        val shiftId = current.optString("shiftId")
        val context = current.optJSONObject("shiftContext") ?: error("work_shift_context_missing")
        val startedAt = current.optString("shiftStartedAt")
        val startKm = current.optLong("shiftStartOdometerKm", -1L)
        val odometer = command.getJSONObject("odometer")
        val endKm = odometer.getLong("readingKm")
        require(shiftId.isNotBlank() && startedAt.isNotBlank() && startKm >= 0L) { "shift_odometer_snapshot_missing" }
        val operationalDate = DriverWorkflowStore.operationalDateAt(startedAt)
        val vehicleId = context.getString("vehicleId")
        val dailyId = "work:daily-business-km:" + java.net.URLEncoder.encode(vehicleId, "UTF-8") + ":" + operationalDate
        val existingRow = db.records().get(dailyId)
        val existingEnvelope = existingRow?.let { JSONObject(it.json) }
        val existingData = existingEnvelope?.optJSONObject("data")
        if (existingData != null) require(
            existingData.optInt("schemaVersion", -1) == 1 &&
                existingData.optString("kind") == "daily_business_kilometres" &&
                existingData.optString("vehicleId") == vehicleId &&
                existingData.optString("operationalDate") == operationalDate,
        ) { "daily_business_km_record_invalid" }
        val entries = existingData?.optJSONArray("entries") ?: org.json.JSONArray()
        require((0 until entries.length()).none { entries.optJSONObject(it)?.optString("shiftId") == shiftId }) {
            "daily_business_km_duplicate_shift"
        }
        val businessKm = odometer.getLong("businessKm")
        val allocationStatus = if (DriverWorkflowStore.operationalDateAt(command.getString("transitionAt")) == operationalDate)
            "allocated" else "awaiting_operational_boundary"
        entries.put(
            JSONObject().put("shiftId", shiftId).put("shiftStartEventId", shiftId).put("shiftEndEventId", eventId)
                .put("shiftStartedAt", startedAt).put("shiftEndedAt", command.getString("transitionAt"))
                 .put("startOdometerKm", startKm).put("endOdometerKm", endKm).put("businessKm", businessKm)
                .put("allocationStatus", allocationStatus),
        )
        var total = 0L
        var unallocated = 0L
        for (index in 0 until entries.length()) {
            val entry = entries.getJSONObject(index)
            if (entry.optString("allocationStatus") == "allocated") total = Math.addExact(total, entry.getLong("businessKm"))
            else if (entry.optString("allocationStatus") == "awaiting_operational_boundary") unallocated = Math.addExact(unallocated, entry.getLong("businessKm"))
            else error("daily_business_km_allocation_status_invalid")
        }
        val data = JSONObject().put("schemaVersion", 1).put("kind", "daily_business_kilometres")
            .put("vehicleId", vehicleId).put("operationalDate", operationalDate)
            .put("entries", entries).put("totalBusinessKm", total).put("unallocatedBusinessKm", unallocated)
        val envelope = JSONObject().put("id", dailyId).put("schemaVersion", 1)
            .put("createdAt", existingEnvelope?.optString("createdAt") ?: now).put("updatedAt", now)
            .put("source", "integration").put("revision", (existingEnvelope?.optInt("revision") ?: 0) + 1)
            .put("data", data)
        db.records().put(StoredRecord(dailyId, envelope.toString(), 1, now))
    }
}
