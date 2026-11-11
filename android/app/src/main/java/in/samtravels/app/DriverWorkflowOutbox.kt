package `in`.samtravels.app

import org.json.JSONObject
import java.time.Instant

/** Durable Work-to-Log Book outbox reads and acknowledgements shared by PWA and overlay. */
object DriverWorkflowOutbox {
    fun listUndeliveredEvents(db: LocalDatabase): List<JSONObject> {
        val pendingIds = db.records().list()
            .filter { it.id.startsWith("driver-outbox:") }
            .map { JSONObject(it.json).also(DriverWorkflowContract::validateOutbox) }
            .filter { !it.optBoolean("delivered", false) }
            .sortedBy { it.optInt("revision", Int.MAX_VALUE) }
            .map { it.optString("eventId") }
            .toSet()
        return DriverWorkflowStore.listEvents(db).filter { it.optString("eventId") in pendingIds }
    }

    fun markEventDelivered(db: LocalDatabase, eventId: String) {
        db.runInTransaction {
            val row = db.records().list().firstOrNull {
                it.id.startsWith("driver-outbox:") && JSONObject(it.json).optString("eventId") == eventId
            } ?: error("outbox_event_missing")
            val outbox = JSONObject(row.json)
            DriverWorkflowContract.validateOutbox(outbox)
            outbox.put("delivered", true)
            db.records().put(StoredRecord(row.id, outbox.toString(), row.schemaVersion, Instant.now().toString()))
        }
    }
}
