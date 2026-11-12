package `in`.samtravels.app

import org.json.JSONObject
import java.time.Instant

/** Applies the 04:00 boundary rotation inside the caller's existing Room transaction. */
internal object DriverShiftRotationStore {
    fun apply(db: LocalDatabase, current: JSONObject, command: JSONObject, eventId: String, now: String, next: JSONObject) {
        val rotation = command.getJSONObject("rotation")
        val odometer = command.getJSONObject("odometer")
        require(current.optString("state") == "shift_active" && current.optString("shiftId") == rotation.optString("outgoingShiftId") && current.optString("shiftStartedAt") == rotation.optString("outgoingShiftStartedAt") && current.optLong("shiftStartOdometerKm", -1L) == rotation.optLong("outgoingStartOdometerKm", -2L) && Instant.parse(command.getString("transitionAt")) >= Instant.parse(rotation.getString("boundaryAt"))) { "shift_rotation_snapshot_mismatch" }
        WorkDailyBusinessKilometreStore.append(db, current, command, eventId, now)
        next.put("shiftStartedAt", rotation.getString("boundaryAt")).put("shiftId", eventId).put("shiftContext", current.getJSONObject("shiftContext"))
        next.put("shiftStartOdometerKm", odometer.getLong("readingKm")).put("lastConfirmedOdometerKm", odometer.getLong("readingKm"))
        val selectedRow = db.records().get("work:selected-driver") ?: error("work_driver_not_selected")
        val envelope = JSONObject(selectedRow.json)
        val selected = envelope.optJSONObject("data") ?: error("work_selected_driver_invalid")
        require(selected.optString("lockedShiftId") == current.optString("shiftId")) { "work_driver_shift_lock_mismatch" }
        selected.put("lockedShiftId", eventId)
        envelope.put("revision", envelope.optInt("revision", 0) + 1).put("updatedAt", now).put("data", selected)
        db.records().put(StoredRecord("work:selected-driver", envelope.toString(), selectedRow.schemaVersion, now))
    }
}
