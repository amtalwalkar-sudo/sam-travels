package `in`.samtravels.app

import org.json.JSONObject
import java.time.Instant

/** Shared transactional boundary for native PWA commands and floating-overlay actions. */
object DriverWorkflowStore {
    private fun snapshot(db: LocalDatabase): JSONObject =
        db.records().get("driver-state")
            ?.let { JSONObject(it.json).optJSONObject("value") }
            ?: JSONObject().put("schemaVersion", 1).put("revision", 0).put("state", "idle")

    private fun save(db: LocalDatabase, key: String, value: JSONObject, now: String) {
        db.records().put(StoredRecord(key, value.toString(), 1, now))
    }

    fun queue(db: LocalDatabase, command: JSONObject): JSONObject {
        var result: JSONObject? = null
        db.runInTransaction {
            val eventId = command.optString("eventId")
            val commandId = command.optString("commandId")
            val idempotencyKey = command.optString("idempotencyKey")
            require(
                command.optInt("schemaVersion", -1) == 1 &&
                    eventId.isNotBlank() && commandId.isNotBlank() && idempotencyKey.isNotBlank(),
            ) { "invalid_command_identity" }
            Instant.parse(command.getString("transitionAt"))
            require(command.optInt("expectedRevision", -1) >= 0) { "invalid_revision" }
            require(command.optString("eventType") in setOf("shift_start", "shift_end", "trip_start", "trip_end", "ride_cancel")) {
                "invalid_event_type"
            }
            require(command.optString("originSurface") in setOf("pwa", "native_overlay")) {
                "invalid_command_surface"
            }

            val key = "driver-intent:$eventId"
            val oldRow = db.records().get(key)
            if (oldRow != null) {
                val old = JSONObject(oldRow.json)
                val previousCommand = old.optJSONObject("command")
                require(
                    previousCommand != null &&
                        previousCommand.optInt("schemaVersion", -1) == command.optInt("schemaVersion", -2) &&
                        previousCommand.optString("eventId") == eventId &&
                        previousCommand.optString("commandId") == commandId &&
                        previousCommand.optString("idempotencyKey") == idempotencyKey &&
                        previousCommand.optString("eventType") == command.optString("eventType") &&
                        previousCommand.optString("transitionAt") == command.optString("transitionAt") &&
                        previousCommand.optString("originSurface") == command.optString("originSurface") &&
                        previousCommand.optInt("expectedRevision", -1) == command.optInt("expectedRevision", -2) &&
                        previousCommand.optString("expectedPriorState") == command.optString("expectedPriorState"),
                ) { "duplicate_event_id_conflict" }
                result = old
                return@runInTransaction
            }

            val current = snapshot(db)
            require(
                command.optInt("expectedRevision", -1) == current.optInt("revision") &&
                    command.optString("expectedPriorState") == current.optString("state"),
            ) { "stale_revision" }
            require(
                DriverTransitionPolicy.target(current.optString("state"), command.optString("eventType")) != null,
            ) { "invalid_transition" }

            val competing = db.records().list().any { row ->
                if (!row.id.startsWith("driver-intent:")) {
                    false
                } else {
                    runCatching {
                        val item = JSONObject(row.json)
                        val revision = item.optJSONObject("command")?.optInt("expectedRevision", -1)
                        (item.optString("status") == "pending_location" ||
                            (item.optString("status") == "needs_attention" && item.optString("reason") != "gps_recovery_window_expired")) &&
                            revision == current.optInt("revision")
                    }.getOrDefault(false)
                }
            }
            require(!competing) { "competing_transition_pending" }

            val now = Instant.now().toString()
            val intent = JSONObject()
                .put("command", command)
                .put("status", "pending_location")
                .put("createdAt", now)
                .put("updatedAt", now)
            save(db, key, intent, now)
            result = intent
        }
        return result ?: error("intent_enqueue_failed")
    }

    fun complete(db: LocalDatabase, eventId: String, gps: JSONObject): JSONObject {
        var committed: JSONObject? = null
        db.runInTransaction {
            val key = "driver-intent:$eventId"
            val row = db.records().get(key) ?: error("intent_not_found")
            val intent = JSONObject(row.json)
            require(intent.optString("status") == "pending_location") { "intent_not_pending" }

            val command = intent.getJSONObject("command")
            require(DriverRecoveryPolicy.isWithinGpsWindow(command.getString("transitionAt"))) { "gps_recovery_window_expired" }
            val current = snapshot(db)
            require(
                command.optInt("expectedRevision", -1) == current.optInt("revision") &&
                    command.optString("expectedPriorState") == current.optString("state"),
            ) { "stale_revision" }
            DriverTransitionPolicy.validateGpsEvidence(gps, command.getString("transitionAt"))

            val eventType = command.optString("eventType")
            val nextState = DriverTransitionPolicy.target(current.optString("state"), eventType)
                ?: error("invalid_transition")
            val revision = current.optInt("revision") + 1
            val next = JSONObject(current.toString())
                .put("schemaVersion", 1)
                .put("revision", revision)
                .put("state", nextState)
                .put("lastEventId", eventId)

            when (eventType) {
                "shift_start" -> next.put("shiftStartedAt", command.getString("transitionAt"))
                "shift_end" -> next.remove("shiftStartedAt")
                "trip_start" -> next.put("tripStartedAt", command.getString("transitionAt"))
                "trip_end", "ride_cancel" -> next.remove("tripStartedAt")
            }

            val now = Instant.now().toString()
            val eventRecord = JSONObject()
                .put("eventId", eventId)
                .put("command", command)
                .put("gps", gps)
                .put("committedAt", now)
                .put("revision", revision)
            intent.put("status", "recorded").put("updatedAt", now).remove("reason")

            db.logBookEvents().put(LogBookEventRecord(eventId, eventRecord.toString(), 1, now))
            save(db, "driver-state", JSONObject().put("value", next), now)
            save(db, key, intent, now)
            save(
                db,
                "driver-outbox:$revision",
                JSONObject()
                    .put("id", "driver-state:$revision")
                    .put("eventId", eventId)
                    .put("revision", revision)
                    .put("integrationId", "logbook.work-driver-events.v1")
                    .put("contractVersion", 1)
                    .put("eventName", "work.driver-event-committed")
                    .put("payloadVersion", 1)
                    .put("delivered", false)
                    .put("createdAt", now),
                now,
            )
            committed = next
        }
        return committed ?: error("transition_not_committed")
    }

    fun reactivate(db: LocalDatabase, eventId: String): JSONObject {
        var result: JSONObject? = null
        db.runInTransaction {
            val key = "driver-intent:$eventId"
            val row = db.records().get(key) ?: error("intent_not_found")
            val intent = JSONObject(row.json)
            require(
                intent.optString("status") == "needs_attention" ||
                    intent.optString("status") == "pending_location",
            ) { "intent_not_recoverable" }

            val command = intent.getJSONObject("command")
            val current = snapshot(db)
            require(
                command.optInt("expectedRevision", -1) == current.optInt("revision") &&
                    command.optString("expectedPriorState") == current.optString("state"),
            ) { "stale_revision" }

            val now = Instant.now().toString()
            intent.put("status", "pending_location").put("updatedAt", now).remove("reason")
            save(db, key, intent, now)
            result = intent
        }
        return result ?: error("intent_recovery_failed")
    }

    fun markNeedsAttention(db: LocalDatabase, eventId: String, reason: String) {
        db.runInTransaction {
            val key = "driver-intent:$eventId"
            val row = db.records().get(key) ?: error("intent_not_found")
            val intent = JSONObject(row.json)
            if (intent.optString("status") != "recorded") {
                val now = Instant.now().toString()
                intent.put("status", "needs_attention").put("reason", reason).put("updatedAt", now)
                save(db, key, intent, now)
            }
        }
    }
}
