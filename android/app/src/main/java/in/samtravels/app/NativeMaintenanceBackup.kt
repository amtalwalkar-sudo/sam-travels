package `in`.samtravels.app

import org.json.JSONArray
import org.json.JSONObject
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId

/** Installs Maintenance Room backup validation before native backup, restore, or recovery. */
internal object NativeMaintenanceBackup {
    private const val PARTICIPANT_ID = "maintenance-records"
    private const val FEATURE_ID = "maintenance"
    private const val PREFIX = "feature:maintenance:"
    private const val VISIT_PREFIX = PREFIX + "visit:"
    private const val EXPENSE_PREFIX = PREFIX + "expense:"
    private const val RATE_PREFIX = PREFIX + "rate:"
    private const val DEFAULT_RATE = 250L
    private val UUID = Regex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}")
    private val sources = setOf("web", "android", "import", "integration")
    private val zone = ZoneId.of("Asia/Kolkata")
    @Volatile private var processRegistration: AutoCloseable? = null

    @Synchronized
    fun ensureRegistered() {
        if (processRegistration == null) processRegistration = register()
    }

    fun register(): AutoCloseable = NativeBackupCoverage.registerFeatureRecordParticipant(
        id = PARTICIPANT_ID,
        featureId = FEATURE_ID,
        snapshotVersion = 1,
        recordIdPrefix = PREFIX,
        validateRelationships = { rows, allRows ->
            val vehicles = allRows.filter { it.optString("participantId") == "vehicle-records" }
                .associate { row ->
                    val id = row.optString("id")
                    val envelope = JSONObject(row.getString("json"))
                    val data = envelope.getJSONObject("data")
                    val registration = data.optString("registrationNumber")
                    require(id == "feature:vehicle:" + registration && registration.isNotBlank()) {
                        "maintenance_vehicle_identity_mismatch"
                    }
                    id to Pair(data, envelope.getString("createdAt"))
                }

            rows.forEach { row ->
                val id = row.optString("id")
                val envelope = JSONObject(row.getString("json"))
                RecordEnvelopeContract.validate(envelope)
                require(envelope.optString("id") == id) { "maintenance_record_identity_mismatch" }
                val data = envelope.getJSONObject("data")
                val kind = data.optString("kind")
                val vehicleId = data.optString("vehicleId")
                val vehicle = vehicles[vehicleId] ?: error("maintenance_vehicle_not_found")
                validatePayload(id, data, kind, vehicle.second)
            }
        },
    )

    private fun validDate(value: String): Boolean =
        runCatching { LocalDate.parse(value).toString() == value }.getOrDefault(false)

    private fun validInteger(value: Any?): Boolean =
        value is Number && (value is Int || value is Long) && value.toLong() >= 0L

    private fun assertExactKeys(data: JSONObject, required: Set<String>, optional: Set<String> = emptySet()) {
        val keys = data.keys().asSequence().toSet()
        require(keys.containsAll(required) && keys.all { it in required || it in optional }) {
            "maintenance_record_invalid"
        }
    }

    private fun validatePayload(id: String, data: JSONObject, kind: String, vehicleCreatedAt: String) {
        require(data.optInt("schemaVersion", -1) == 1 && data.optString("vehicleId").startsWith("feature:vehicle:")) {
            "maintenance_record_invalid"
        }
        when (kind) {
            "visit" -> {
                require(id.startsWith(VISIT_PREFIX) && UUID.matches(id.removePrefix(VISIT_PREFIX))) {
                    "maintenance_record_identity_invalid"
                }
                assertExactKeys(
                    data,
                    setOf("schemaVersion", "kind", "vehicleId", "maintenanceDate", "maintenanceType", "description", "items", "totalPaise"),
                    setOf("odometerKm", "provider", "nextServiceDate", "nextServiceKm"),
                )
                val date = data.optString("maintenanceDate")
                require(validDate(date) && data.optString("maintenanceType").isNotBlank() &&
                    data.optString("description").isNotBlank() && validInteger(data.opt("totalPaise"))) {
                    "maintenance_visit_invalid"
                }
                if (data.has("odometerKm")) require(validInteger(data.opt("odometerKm"))) { "maintenance_visit_invalid" }
                if (data.has("nextServiceKm")) require(validInteger(data.opt("nextServiceKm"))) { "maintenance_visit_invalid" }
                if (data.has("provider")) require(data.optString("provider").isNotBlank()) { "maintenance_visit_invalid" }
                if (data.has("nextServiceDate")) {
                    val next = data.optString("nextServiceDate")
                    require(validDate(next) && next >= date) { "maintenance_visit_invalid" }
                }
                val items = data.optJSONArray("items") ?: error("maintenance_visit_items_required")
                require(items.length() > 0) { "maintenance_visit_items_required" }
                val ids = mutableSetOf<String>()
                var total = 0L
                for (index in 0 until items.length()) {
                    val item = items.getJSONObject(index)
                    val itemId = item.optString("id")
                    require(UUID.matches(itemId) && ids.add(itemId.lowercase()) &&
                        item.optString("description").isNotBlank() && validInteger(item.opt("amountPaise"))) {
                        "maintenance_visit_item_invalid"
                    }
                    total += item.getLong("amountPaise")
                    require(total <= 9_007_199_254_740_991L) { "maintenance_visit_total_out_of_range" }
                }
                require(total == data.getLong("totalPaise")) { "maintenance_visit_total_mismatch" }
            }
            "expense" -> {
                require(id.startsWith(EXPENSE_PREFIX) && UUID.matches(id.removePrefix(EXPENSE_PREFIX))) {
                    "maintenance_record_identity_invalid"
                }
                assertExactKeys(
                    data,
                    setOf("schemaVersion", "kind", "vehicleId", "expenseDate", "expenseName", "description", "amountPaise"),
                    setOf("odometerKm", "provider"),
                )
                require(validDate(data.optString("expenseDate")) && data.optString("expenseName").isNotBlank() &&
                    data.optString("description").isNotBlank() && validInteger(data.opt("amountPaise"))) {
                    "maintenance_expense_invalid"
                }
                if (data.has("odometerKm")) require(validInteger(data.opt("odometerKm"))) { "maintenance_expense_invalid" }
                if (data.has("provider")) require(data.optString("provider").isNotBlank()) { "maintenance_expense_invalid" }
            }
            "rate_history" -> {
                val encodedVehicle = URLEncoder.encode(vehicleIdFromData(data), "UTF-8").replace("+", "%20")
                require(id == RATE_PREFIX + encodedVehicle &&
                    URLDecoder.decode(id.removePrefix(RATE_PREFIX), "UTF-8") == vehicleIdFromData(data)) {
                    "maintenance_rate_history_identity_mismatch"
                }
                assertExactKeys(data, setOf("schemaVersion", "kind", "vehicleId", "entries"))
                val entries = data.optJSONArray("entries") ?: error("maintenance_rate_history_invalid")
                require(entries.length() > 0) { "maintenance_rate_history_invalid" }
                val expectedDefaultDate = OffsetDateTime.parse(vehicleCreatedAt).toInstant().atZone(zone).toLocalDate().toString()
                var previousDate = ""
                var previousSavedAt = ""
                val commandIds = mutableSetOf<String>()
                for (index in 0 until entries.length()) {
                    val entry = entries.getJSONObject(index)
                    val isDefault = entry.optBoolean("isDefault", false)
                    if (index == 0) {
                        assertExactKeys(entry, setOf("effectiveFrom", "ratePaisePerKm", "savedAt", "isDefault"))
                        require(isDefault && entry.optLong("ratePaisePerKm", -1L) == DEFAULT_RATE &&
                            entry.optString("effectiveFrom") == expectedDefaultDate) {
                            "maintenance_default_rate_invalid"
                        }
                    } else {
                        assertExactKeys(entry, setOf("effectiveFrom", "ratePaisePerKm", "savedAt", "isDefault", "commandId", "source"))
                        val commandId = entry.optString("commandId")
                        require(!isDefault && UUID.matches(commandId) && commandIds.add(commandId.lowercase()) &&
                            entry.optString("source") in sources) { "maintenance_rate_entry_invalid" }
                    }
                    val effective = entry.optString("effectiveFrom")
                    val savedAt = entry.optString("savedAt")
                    require(validDate(effective) && validInteger(entry.opt("ratePaisePerKm")) &&
                        runCatching { OffsetDateTime.parse(savedAt) }.isSuccess &&
                        (effective > previousDate || (effective == previousDate && savedAt >= previousSavedAt))) {
                        "maintenance_rate_history_order_invalid"
                    }
                    previousDate = effective
                    previousSavedAt = savedAt
                }
            }
            else -> error("maintenance_record_kind_invalid")
        }
    }

    private fun vehicleIdFromData(data: JSONObject): String = data.optString("vehicleId")
}
