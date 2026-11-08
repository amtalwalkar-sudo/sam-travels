package `in`.samtravels.app

import org.json.JSONObject
import java.time.Instant

/** Shared transactional boundary for native PWA commands and floating-overlay actions. */
object DriverWorkflowStore {

    /** Read selected Driver and current vehicle context within the Work persistence gateway. */
    fun selectedWorkContext(db: LocalDatabase, requireVehicle: Boolean): JSONObject {
        val selected = db.records().list().mapNotNull { row ->
            if (!row.id.startsWith("feature:driver-records:driver:")) null else {
                val data = JSONObject(row.json).optJSONObject("data") ?: error("driver_record_invalid")
                if (data.optBoolean("selectedForWork") && data.optString("lifecycleState") == "active") data else null
            }
        }
        require(selected.size == 1) {
            if (selected.isEmpty()) "Select one active Driver in Admin before using Work."
            else "More than one Driver is selected for Work. Clear the extra selection in Admin."
        }
        val driver = selected.single()
        val driverId = driver.optString("driverId")
        val assignmentRow = db.records().get("feature:driver-records:assignment:" + driverId)
        val assignments = assignmentRow?.let { JSONObject(it.json).optJSONObject("data")?.optJSONArray("assignments") }
        var vehicleId: String? = null
        if (assignments != null) for (index in 0 until assignments.length()) {
            val item = assignments.optJSONObject(index) ?: continue
            if (!item.has("unassignedAt") || item.isNull("unassignedAt")) vehicleId = item.optString("vehicleId")
        }
        if (requireVehicle) {
            require(!vehicleId.isNullOrBlank()) { "Assign an active vehicle to the selected Driver before starting a trip." }
            val vehicleData = db.records().get(vehicleId!!)?.let { JSONObject(it.json).optJSONObject("data") }
            require(vehicleData?.optString("lifecycleState") == "active") {
                "The selected Driver's assigned vehicle is not active. Update the assignment in Admin."
            }
        }
        return JSONObject().put("driverId", driverId).put("driverName", driver.optString("name")).apply {
            if (!vehicleId.isNullOrBlank()) put("vehicleId", vehicleId)
        }
    }
    fun snapshot(db: LocalDatabase): JSONObject {
        val state = db.records().get("driver-state")
            ?.let { JSONObject(it.json).optJSONObject("value") }
            ?: JSONObject().put("schemaVersion", 1).put("revision", 0).put("state", "idle")
        DriverWorkflowContract.validateState(state)
        return state
    }

    private fun save(db: LocalDatabase, key: String, value: JSONObject, now: String) {
        db.records().put(StoredRecord(key, value.toString(), 1, now))
    }

    private fun sameCommand(left: JSONObject, right: JSONObject): Boolean {
        val fields = listOf(
            "schemaVersion", "commandId", "eventId", "eventType", "originSurface",
            "transitionAt", "expectedPriorState", "expectedRevision", "idempotencyKey",
        )
        return fields.all { field -> left.opt(field).toString() == right.opt(field).toString() }
    }

    fun queue(db: LocalDatabase, command: JSONObject): JSONObject {
        var result: JSONObject? = null
        db.runInTransaction {
            val eventId = command.optString("eventId")
            val commandId = command.optString("commandId")
            val idempotencyKey = command.optString("idempotencyKey")
            DriverWorkflowContract.validateCommand(command)
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
                DriverWorkflowContract.validateIntent(old)
                val previousCommand = old.optJSONObject("command")
                require(previousCommand != null && sameCommand(previousCommand, command)) {
                    "duplicate_event_id_conflict"
                }
                result = old
                return@runInTransaction
            }

            val identityConflict = db.records().list()
                .filter { it.id.startsWith("driver-intent:") }
                .any { stored ->
                    val existingIntent = JSONObject(stored.json)
                    DriverWorkflowContract.validateIntent(existingIntent)
                    val existingCommand = existingIntent.getJSONObject("command")
                    existingCommand.optString("eventId") != eventId &&
                        (existingCommand.optString("commandId") == commandId ||
                            existingCommand.optString("idempotencyKey") == idempotencyKey)
                }
            require(!identityConflict) { "duplicate_command_identity_conflict" }

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
            DriverWorkflowContract.validateIntent(intent)
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
            DriverWorkflowContract.validateIntent(intent)
            val command = intent.getJSONObject("command")
            if (intent.optString("status") == "recorded") {
                val storedEvent = db.logBookEvents().list().firstOrNull { it.eventId == eventId }
                    ?: error("recorded_event_missing")
                val event = JSONObject(storedEvent.json)
                DriverWorkflowContract.validateStoredEvent(event)
                require(sameCommand(event.getJSONObject("command"), command)) {
                    "recorded_event_identity_conflict"
                }
                val revision = event.optInt("revision", -1)
                val current = snapshot(db)
                require(revision >= 1 && revision <= current.optInt("revision")) {
                    "recorded_event_revision_invalid"
                }
                val outboxRow = db.records().get("driver-outbox:$revision")
                    ?: error("recorded_outbox_missing")
                val outbox = JSONObject(outboxRow.json)
                DriverWorkflowContract.validateOutbox(outbox)
                require(outbox.optString("eventId") == eventId) { "recorded_outbox_identity_conflict" }
                committed = current
                return@runInTransaction
            }
            require(intent.optString("status") == "pending_location") { "intent_not_pending" }

            
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
            DriverWorkflowContract.validateState(next)
            val eventRecord = JSONObject()
                .put("eventId", eventId)
                .put("command", command)
                .put("gps", gps)
                .put("committedAt", now)
                .put("revision", revision)
            DriverWorkflowContract.validateEvent(eventRecord)
            intent.put("status", "recorded").put("updatedAt", now).remove("reason")

            DriverWorkflowContract.validateIntent(intent)
            db.logBookEvents().put(LogBookEventRecord(eventId, eventRecord.toString(), 1, now))
            save(db, "driver-state", JSONObject().put("value", next), now)
            save(db, key, intent, now)
            val outbox = JSONObject()
                    .put("id", "driver-state:$revision")
                    .put("eventId", eventId)
                    .put("revision", revision)
                    .put("integrationId", "logbook.work-driver-events.v1")
                    .put("contractVersion", 1)
                    .put("eventName", "work.driver-event-committed")
                    .put("payloadVersion", 1)
                    .put("delivered", false)
                    .put("createdAt", now)
            DriverWorkflowContract.validateOutbox(outbox)
            save(db, "driver-outbox:$revision", outbox, now)
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
            DriverWorkflowContract.validateIntent(intent)
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
            DriverWorkflowContract.validateIntent(intent)
            intent.put("status", "pending_location").put("updatedAt", now).remove("reason")
            DriverWorkflowContract.validateIntent(intent)
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
            DriverWorkflowContract.validateIntent(intent)
            if (intent.optString("status") != "recorded") {
                val now = Instant.now().toString()
                DriverWorkflowContract.validateIntent(intent)
                intent.put("status", "needs_attention").put("reason", reason).put("updatedAt", now)
                DriverWorkflowContract.validateIntent(intent)
                save(db, key, intent, now)
            }
        }
    }

    /** Read the durable pending-intent set through the Work repository boundary. */
    fun listPending(db: LocalDatabase): List<JSONObject> =
        db.records().list()
            .filter { it.id.startsWith("driver-intent:") }
            .map { JSONObject(it.json).also(DriverWorkflowContract::validateIntent) }
            .filter {
                it.optString("status") == "pending_location" ||
                    it.optString("status") == "needs_attention"
            }

    /** Read the immutable committed event stream through its owning repository boundary. */
    fun listEvents(db: LocalDatabase): List<JSONObject> =
        db.logBookEvents().list().map { JSONObject(it.json).also(DriverWorkflowContract::validateStoredEvent) }


    /** Enumerate Work-owned durable intents; callers receive detached JSON values. */
    fun listIntents(db: LocalDatabase): List<JSONObject> =
        db.records().list()
            .filter { it.id.startsWith("driver-intent:") }
            .map { JSONObject(it.json).also(DriverWorkflowContract::validateIntent) }

    /** Find the original pending-location intent eligible for service-start recovery. */
    fun firstPendingLocation(db: LocalDatabase): JSONObject? =
        listIntents(db).firstOrNull { it.optString("status") == "pending_location" }

    /** Find a recoverable intent without reviving an expired GPS evidence window. */
    fun firstRecoverableIntent(db: LocalDatabase): JSONObject? =
        listIntents(db).firstOrNull {
            it.optString("status") == "pending_location" ||
                (it.optString("status") == "needs_attention" &&
                    it.optString("reason") != "gps_recovery_window_expired")
        }

}
