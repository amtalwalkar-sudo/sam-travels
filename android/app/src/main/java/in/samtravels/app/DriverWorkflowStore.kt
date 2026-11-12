package `in`.samtravels.app

import org.json.JSONObject
import java.time.Instant

/** Shared transactional boundary for native PWA commands and floating-overlay actions. */
object DriverWorkflowStore {

    /** Read selected Driver and current vehicle context within the Work persistence gateway. */
    fun selectedWorkContext(db: LocalDatabase, requireVehicle: Boolean): JSONObject {
        val selected=db.records().get("work:selected-driver") ?: error("work_driver_not_selected")
        val selection=JSONObject(selected.json).optJSONObject("data") ?: error("work_selected_driver_invalid")
        require(selection.optInt("schemaVersion",-1)==1) { "work_selected_driver_invalid" }
        val driverId=selection.optString("driverId")
        require(driverId.matches(Regex("[A-Za-z0-9_-]{1,128}"))) { "work_selected_driver_invalid" }
        val driverRow=db.records().get("feature:driver-records:driver:$driverId") ?: error("driver_not_active")
        val driver=JSONObject(driverRow.json).optJSONObject("data") ?: error("driver_not_active")
        require(driver.optString("driverId")==driverId&&driver.optString("lifecycleState")=="active") { "driver_not_active" }
        val result=JSONObject().put("driverId",driverId).put("driverName",driver.optString("name"))
        if(requireVehicle) {
            val activeContext=snapshot(db).optJSONObject("shiftContext")
            if(activeContext!=null)result.put("vehicleId",activeContext.getString("vehicleId"))
            else if(snapshot(db).optString("state")=="idle")result.put("vehicleId",WorkDriverContextResolver.resolve(db,Instant.now().toString()).getString("vehicleId"))
        }
        return result
    }
    /** Resolve Admin Driver, assignment and Vehicle from Room inside the trip completion transaction. */
    private fun resolveDriverContext(db: LocalDatabase): JSONObject {
        val records = db.records().list()
        val selected = records.filter { it.id.startsWith("feature:driver-records:driver:") }.mapNotNull { row ->
            val data = JSONObject(row.json).optJSONObject("data") ?: error("driver_record_invalid")
            if (data.optBoolean("selectedForWork") && data.optString("lifecycleState") == "active") data else null
        }
        require(selected.size == 1) { if (selected.isEmpty()) "work_driver_selection_missing" else "work_driver_selection_ambiguous" }
        val driverId = selected.single().optString("driverId")
        require(driverId.matches(Regex("[A-Za-z0-9_-]{1,128}"))) { "driver_record_invalid" }
        val histories = records.filter { it.id == "feature:driver-records:assignment:$driverId" }
        require(histories.size == 1) { "work_driver_assignment_history_missing" }
        val history = JSONObject(histories.single().json).optJSONObject("data") ?: error("driver_assignment_history_invalid")
        require(history.optString("driverId") == driverId && history.optInt("schemaVersion",-1)==1) { "driver_assignment_identity_mismatch" }
        val assignments = history.optJSONArray("assignments") ?: error("driver_assignment_history_invalid")
        val active = (0 until assignments.length()).mapNotNull { assignments.optJSONObject(it) }.filter { !it.has("unassignedAt") || it.isNull("unassignedAt") }
        require(active.size == 1) { if (active.isEmpty()) "work_driver_assignment_missing" else "work_driver_assignment_ambiguous" }
        val assignment = active.single()
        val assignmentId = assignment.optString("assignmentId")
        val vehicleId = assignment.optString("vehicleId")
        require(assignmentId.matches(Regex("[A-Za-z0-9_-]{1,128}")) && vehicleId.matches(Regex("feature:vehicle:[A-Za-z0-9_-]{1,128}"))) { "driver_assignment_invalid" }
        val vehicles = records.filter { it.id == vehicleId }
        require(vehicles.size == 1) { "work_driver_vehicle_missing" }
        val vehicle = JSONObject(vehicles.single().json).optJSONObject("data")
        require(vehicle?.optString("lifecycleState") == "active") { "work_driver_vehicle_inactive" }
        return JSONObject().put("schemaVersion",1).put("driverId",driverId).put("assignmentId",assignmentId).put("vehicleId",vehicleId)
    }

    internal fun operationalDateAt(value:String):String {
        val local=java.time.OffsetDateTime.parse(value).atZoneSameInstant(java.time.ZoneId.of("Asia/Kolkata"))
        return (if(local.hour<4)local.toLocalDate().minusDays(1) else local.toLocalDate()).toString()
    }

    fun snapshot(db: LocalDatabase): JSONObject {
        val state = db.records().get("driver-state")
            ?.let { JSONObject(it.json).optJSONObject("value") }
            ?: JSONObject().put("schemaVersion", 1).put("revision", 0).put("state", "idle")
        DriverWorkflowContract.validateState(state)
        return state
    }

    /** Read a committed command's type through the Work persistence boundary. */
    fun eventTypeForIntent(db: LocalDatabase, eventId: String): String =
        db.records().get("driver-intent:$eventId")
            ?.let { JSONObject(it.json).optJSONObject("command")?.optString("eventType") }
            .orEmpty()


    private fun save(db: LocalDatabase, key: String, value: JSONObject, now: String) {
        db.records().put(StoredRecord(key, value.toString(), 1, now))
    }

    private fun sameCommand(left: JSONObject, right: JSONObject): Boolean {
        val fields = listOf(
            "schemaVersion", "commandId", "eventId", "eventType", "originSurface",
            "transitionAt", "expectedPriorState", "expectedRevision", "idempotencyKey", "workflowVersion", "driverContext", "tripContext", "odometer",
        )
        return fields.all { field -> (left.opt(field)?.toString() ?: "null") == (right.opt(field)?.toString() ?: "null") }
    }

    fun queue(db: LocalDatabase, command: JSONObject, createdAt: Instant = Instant.now()): JSONObject {
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
            require(command.optString("eventType") in setOf("shift_start", "shift_end", "trip_start", "trip_end", "ride_cancel", "trip_create", "start_ride", "end_ride", "cancel_ride")) {
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
            if(command.optString("eventType")=="shift_end") DriverCancellationFeeStore.requireNoPendingObligation(db)
            WorkDailyBusinessKilometreStore.validateTransition(current,command)
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

            val now = createdAt.toString()
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

    fun complete(db: LocalDatabase, eventId: String, gps: JSONObject, nowInstant: Instant = Instant.now()): JSONObject {
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

            
            require(DriverRecoveryPolicy.isWithinGpsWindow(command.getString("transitionAt"), nowInstant)) { "gps_recovery_window_expired" }
            val current = snapshot(db)
            if(command.optString("eventType")=="shift_end") DriverCancellationFeeStore.requireNoPendingObligation(db)
            require(
                command.optInt("expectedRevision", -1) == current.optInt("revision") &&
                    command.optString("expectedPriorState") == current.optString("state"),
            ) { "stale_revision" }
            DriverTransitionPolicy.validateGpsEvidence(gps, command.getString("transitionAt"), nowInstant)
            WorkDailyBusinessKilometreStore.validateTransition(current,command)
            val eventType=command.optString("eventType")
            if(command.optInt("workflowVersion",1)==2) {
                when(eventType) {
                    "shift_start" -> command.put("driverContext",WorkDriverContextResolver.resolve(db,command.getString("transitionAt")))
                    "trip_create" -> {
                        val shiftId=current.optString("shiftId")
                        val shiftContext=current.optJSONObject("shiftContext")?:error("work_shift_context_missing")
                        require(shiftId.isNotBlank()) { "work_shift_context_missing" }
                        command.put("tripContext",JSONObject().put("schemaVersion",1).put("shiftId",shiftId)
                            .put("driverId",shiftContext.getString("driverId")).put("assignmentId",shiftContext.getString("assignmentId"))
                            .put("vehicleId",shiftContext.getString("vehicleId")).put("operationalDate",operationalDateAt(command.getString("transitionAt"))))
                    }
                }
            } else if(eventType=="trip_start") command.put("driverContext",resolveDriverContext(db))
            intent.put("command",command)
            DriverWorkflowContract.validateCommand(command)
            val author = DriverWorkflowIdentity.resolveDriverAuthor(db, command, current)
            val nextState = DriverTransitionPolicy.target(current.optString("state"), eventType)
                ?: error("invalid_transition")
            val revision = current.optInt("revision") + 1
            val next = JSONObject(current.toString())
                .put("schemaVersion", 1)
                .put("revision", revision)
                .put("state", nextState)
                .put("lastEventId", eventId)
            val now = nowInstant.toString()

            when (eventType) {
                "shift_start" -> {
                    next.put("shiftStartedAt",command.getString("transitionAt")).put("shiftAuthor", author)
                    if(command.optInt("workflowVersion",1)==2) {
                        val reading=command.getJSONObject("odometer").getLong("readingKm")
                        next.put("shiftStartOdometerKm",reading).put("lastConfirmedOdometerKm",reading)
                    }
                    if(command.optInt("workflowVersion",1)==2) {
                        val selectedRow=db.records().get("work:selected-driver")?:error("work_driver_not_selected")
                        val envelope=JSONObject(selectedRow.json)
                        val selected=envelope.optJSONObject("data")?:error("work_selected_driver_invalid")
                        require(!selected.has("lockedShiftId")||selected.isNull("lockedShiftId")) { "work_driver_selection_locked_during_shift" }
                        selected.put("lockedShiftId",eventId)
                        envelope.put("revision",envelope.optInt("revision",0)+1).put("updatedAt",now).put("data",selected)
                        db.records().put(StoredRecord("work:selected-driver",envelope.toString(),selectedRow.schemaVersion,now))
                        next.put("shiftId",eventId).put("shiftContext",command.getJSONObject("driverContext"))
                    }
                }
                "shift_end" -> {
                    if(command.optInt("workflowVersion",1)==2) {
                        WorkDailyBusinessKilometreStore.append(db,current,command,eventId,now)
                        next.put("lastConfirmedOdometerKm",command.getJSONObject("odometer").getLong("readingKm"))
                    }
                    next.remove("shiftStartedAt");next.remove("shiftStartOdometerKm");next.remove("shiftId");next.remove("shiftContext");next.remove("shiftAuthor")
                    if(command.optInt("workflowVersion",1)==2&&current.has("shiftId")) {
                        val selectedRow=db.records().get("work:selected-driver")?:error("work_driver_not_selected")
                        val envelope=JSONObject(selectedRow.json)
                        val selected=envelope.optJSONObject("data")?:error("work_selected_driver_invalid")
                        require(selected.optString("lockedShiftId")==current.optString("shiftId")) { "work_driver_shift_lock_mismatch" }
                        selected.remove("lockedShiftId")
                        envelope.put("revision",envelope.optInt("revision",0)+1).put("updatedAt",now).put("data",selected)
                        db.records().put(StoredRecord("work:selected-driver",envelope.toString(),selectedRow.schemaVersion,now))
                    }
                }
                "trip_start" -> next.put("tripStartedAt",command.getString("transitionAt"))
                "trip_end", "ride_cancel" -> next.remove("tripStartedAt")
                "trip_create" -> next.put("activeTripId",eventId).put("tripContext",command.getJSONObject("tripContext"))
                "start_ride" -> next.put("tripStartedAt",command.getString("transitionAt"))
                "end_ride" -> {
                    val tripId=current.optString("activeTripId")
                    require(tripId.isNotBlank()) { "completed_trip_identity_missing" }
                    DriverTripFinancialStore.createPendingObligation(db,tripId,eventId,now,current.optJSONObject("tripContext"))
                    next.remove("tripStartedAt");next.remove("activeTripId");next.remove("tripContext")
                }
                "cancel_ride" -> {
                    DriverCancellationFeeStore.createPendingObligation(db,current.optString("activeTripId"),eventId,now)
                    next.remove("tripStartedAt");next.remove("activeTripId");next.remove("tripContext")
                }
            }

            DriverWorkflowContract.validateState(next)
            val eventRecord = JSONObject()
                .put("eventId", eventId)
                .put("command", command)
                .put("gps", gps)
                .put("committedAt", now)
                .put("revision", revision)
                .put("createdBy", author)
            DriverWorkflowContract.validateNewlyCommittedEvent(eventRecord)
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
