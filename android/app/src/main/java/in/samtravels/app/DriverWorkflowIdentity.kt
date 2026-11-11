package `in`.samtravels.app

import org.json.JSONObject

/** Resolves the trusted Driver actor from persisted profile-to-person identity records. */
internal object DriverWorkflowIdentity {
    fun resolveDriverAuthor(db: LocalDatabase, command: JSONObject, current: JSONObject): JSONObject {
        // The person who started an active shift remains its author even if an Admin
        // deactivates or edits the Driver profile while the shift is in progress.
        current.optJSONObject("shiftAuthor")?.let { return JSONObject(it.toString()) }
        val context = command.optJSONObject("driverContext") ?: command.optJSONObject("tripContext")
            ?: current.optJSONObject("shiftContext") ?: current.optJSONObject("tripContext")
        val driverId = context?.optString("driverId")?.takeIf { it.isNotBlank() }
            ?: run {
                val selected = db.records().get("work:selected-driver") ?: error("work_driver_not_selected")
                JSONObject(selected.json).optJSONObject("data")?.optString("driverId")?.takeIf { it.isNotBlank() }
                    ?: error("work_selected_driver_invalid")
            }
        val driverRow = db.records().get("feature:driver-records:driver:$driverId") ?: error("driver_person_profile_missing")
        val driver = JSONObject(driverRow.json).optJSONObject("data") ?: error("driver_person_profile_invalid")
        require(driver.optString("driverId") == driverId && driver.optString("lifecycleState") == "active") { "driver_person_profile_invalid" }
        val linkRow = db.records().get("identity:driver-person-link:$driverId") ?: error("driver_person_link_missing")
        val link = JSONObject(linkRow.json).optJSONObject("data") ?: error("driver_person_link_invalid")
        require(link.optInt("schemaVersion", -1) == 1 && link.optString("driverId") == driverId) { "driver_person_link_invalid" }
        val personId = link.optString("personId")
        require(personId.matches(Regex("[A-Za-z0-9_-]{1,128}"))) { "driver_person_link_invalid" }
        val personRow = db.records().get("identity:person:$personId") ?: error("driver_person_identity_missing")
        val person = JSONObject(personRow.json).optJSONObject("data") ?: error("driver_person_identity_invalid")
        val roles = person.optJSONArray("roles") ?: error("driver_person_identity_invalid")
        require(person.optInt("schemaVersion", -1) == 1 && person.optString("personId") == personId &&
            person.optString("status") == "active" && (0 until roles.length()).any { roles.optString(it) == "driver" }) {
            "driver_person_identity_inactive"
        }
        return JSONObject().put("personId", personId).put("role", "driver")
    }

}
