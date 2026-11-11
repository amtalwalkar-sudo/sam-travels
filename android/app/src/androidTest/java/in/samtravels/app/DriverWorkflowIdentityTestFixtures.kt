package `in`.samtravels.app

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

internal object DriverWorkflowIdentityTestFixtures {
    fun seed(db: LocalDatabase, driverId: String, personId: String) {
        val now = Instant.now().toString()
        fun put(id: String, data: JSONObject) {
            val envelope = JSONObject().put("id", id).put("schemaVersion", 1).put("createdAt", now)
                .put("updatedAt", now).put("source", "android").put("revision", 1).put("data", data)
            db.records().put(StoredRecord(id, envelope.toString(), 1, now))
        }
        put("work:selected-driver", JSONObject().put("schemaVersion", 1).put("driverId", driverId))
        put("identity:driver-person-link:$driverId", JSONObject().put("schemaVersion", 1)
            .put("driverId", driverId).put("personId", personId))
        put("identity:person:$personId", JSONObject().put("schemaVersion", 1).put("personId", personId)
            .put("displayName", "Test Driver").put("roles", JSONArray().put("driver")).put("status", "active"))
    }
}
