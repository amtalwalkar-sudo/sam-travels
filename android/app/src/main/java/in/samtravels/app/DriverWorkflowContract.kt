package `in`.samtravels.app

import org.json.JSONObject
import java.time.Duration
import java.time.OffsetDateTime

/** Native mirror of the persisted Work command, intent, state and Log Book event contracts. */
internal object DriverWorkflowContract {
    private val eventTypes = setOf("shift_start", "shift_end", "trip_start", "trip_end", "ride_cancel")
    private val states = setOf("idle", "shift_active", "trip_active", "approach_active", "needs_attention")
    private val surfaces = setOf("pwa", "native_overlay")
    private val intentStatuses = setOf("pending_location", "needs_attention", "recorded", "rejected")

    fun validateCommand(command: JSONObject) {
        require(integer(command, "schemaVersion") == 1L) { "invalid_command" }
        val commandId = command.opt("commandId") as? String
        val eventId = command.opt("eventId") as? String
        val idempotencyKey = command.opt("idempotencyKey") as? String
        require(!commandId.isNullOrBlank() && commandId == commandId.trim() &&
            !eventId.isNullOrBlank() && eventId == eventId.trim() &&
            !idempotencyKey.isNullOrBlank() && idempotencyKey == idempotencyKey.trim()) { "invalid_command_identity" }
        val eventType = command.opt("eventType") as? String
        val surface = command.opt("originSurface") as? String
        val priorState = command.opt("expectedPriorState") as? String
        require(eventType != null && eventType in eventTypes) { "invalid_event_type" }
        require(surface != null && surface in surfaces) { "invalid_command_surface" }
        require(priorState != null && priorState in states) { "invalid_prior_state" }
        require(integer(command, "expectedRevision") >= 0L) { "invalid_revision" }
        parseInstant(command.optString("transitionAt"), "invalid_transition_timestamp")
        if (command.has("driverContext")) {
            val driver = command.optJSONObject("driverContext") ?: error("invalid_driver_context")
            require(driver.optString("driverId").matches(Regex("[A-Za-z0-9_-]{1,128}")) &&
                driver.optString("driverName").isNotBlank() &&
                (!driver.has("vehicleId") || driver.optString("vehicleId").startsWith("feature:vehicle:"))) {
                "invalid_driver_context"
            }
            if (eventType == "trip_start") require(driver.optString("vehicleId").startsWith("feature:vehicle:")) {
                "trip_start_vehicle_context_required"
            }
        }
    }

    fun validateIntent(intent: JSONObject) {
        validateCommand(intent.optJSONObject("command") ?: error("invalid_driver_intent"))
        val status = intent.opt("status") as? String
        require(status != null && status in intentStatuses) { "invalid_driver_intent_status" }
        val createdAt = parseInstant(intent.optString("createdAt"), "invalid_driver_intent_timestamp")
        val updatedAt = parseInstant(intent.optString("updatedAt"), "invalid_driver_intent_timestamp")
        require(!updatedAt.isBefore(createdAt)) { "invalid_driver_intent_timestamp" }
        require(!intent.has("reason") || intent.isNull("reason") || intent.opt("reason") is String) {
            "invalid_driver_intent_reason"
        }
    }

    fun validateState(state: JSONObject) {
        require(state.optInt("schemaVersion", -1) == 1 && integer(state, "revision") >= 0L &&
            state.optString("state") in states) { "invalid_driver_state" }
        listOf("shiftStartedAt", "tripStartedAt", "approachStartedAt").forEach { key ->
            if (state.has(key)) parseInstant(state.opt(key) as? String ?: "", "invalid_driver_state_timestamp")
        }
        if (state.has("lastEventId")) require((state.opt("lastEventId") as? String)?.isNotBlank() == true) {
            "invalid_driver_state_event_id"
        }
    }

    fun validateEvent(event: JSONObject) {
        val command = event.optJSONObject("command") ?: error("invalid_driver_event")
        validateCommand(command)
        require((event.opt("eventId") as? String) == command.optString("eventId")) { "driver_event_identity_mismatch" }
        val revision = integer(event, "revision")
        require(revision == integer(command, "expectedRevision") + 1L) { "driver_event_revision_mismatch" }
        parseInstant(event.optString("committedAt"), "invalid_driver_event_timestamp")
        val gps = event.optJSONObject("gps") ?: error("invalid_driver_event_gps")
        val latitude = number(gps, "latitude")
        val longitude = number(gps, "longitude")
        val accuracy = number(gps, "horizontalAccuracyM")
        require(latitude in -90.0..90.0 && longitude in -180.0..180.0 &&
            accuracy in 0.0..50.0 && gps.optString("provider").isNotBlank()) {
            "invalid_driver_event_gps"
        }
        val fixAt = parseInstant(gps.optString("fixAt"), "invalid_driver_event_gps")
        val transitionAt = parseInstant(command.optString("transitionAt"), "invalid_driver_event_gps")
        require(kotlin.math.abs(Duration.between(transitionAt, fixAt).toMillis()) <= 30_000L) {
            "invalid_driver_event_gps"
        }
    }

    /** Legacy v1 Log Book rows predate the command/GPS event envelope and remain immutable source history. */
    fun validateStoredEvent(event: JSONObject) {
        if (event.has("command")) {
            validateEvent(event)
            return
        }
        require(event.optString("eventId").isNotBlank() && event.optString("kind").isNotBlank()) {
            "invalid_legacy_logbook_event"
        }
    }

    fun validateOutbox(row: JSONObject) {
        val revision = integer(row, "revision")
        require(row.optString("id") == "driver-state:" + revision && row.optString("eventId").isNotBlank() &&
            revision >= 1L && row.optString("integrationId") == "logbook.work-driver-events.v1" &&
            integer(row, "contractVersion") == 1L &&
            row.optString("eventName") == "work.driver-event-committed" &&
            integer(row, "payloadVersion") == 1L && row.opt("delivered") is Boolean) {
            "invalid_driver_outbox"
        }
        parseInstant(row.optString("createdAt"), "invalid_driver_outbox_timestamp")
    }

    private fun integer(json: JSONObject, key: String): Long {
        val value = json.opt(key) as? Number ?: throw IllegalArgumentException("invalid_" + key)
        val number = value.toDouble()
        require(number.isFinite() && number % 1.0 == 0.0 && number in 0.0..9_007_199_254_740_991.0) {
            "invalid_" + key
        }
        return number.toLong()
    }

    private fun number(json: JSONObject, key: String): Double {
        val value = json.opt(key) as? Number ?: throw IllegalArgumentException("invalid_" + key)
        return value.toDouble().also {
            require(it.isFinite()) { "invalid_" + key }
        }
    }

    private fun parseInstant(value: String, errorCode: String) =
        runCatching { OffsetDateTime.parse(value).toInstant() }
            .getOrElse { throw IllegalArgumentException(errorCode) }
}
