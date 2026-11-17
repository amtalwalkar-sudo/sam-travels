package `in`.samtravels.app

import org.json.JSONArray
import org.json.JSONObject
import java.net.URLDecoder
import java.net.URLEncoder
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
    private const val DAILY_ACCRUAL_PREFIX = PREFIX + "daily-accrual:"
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
                validatePayload(id, data, kind, vehicle.second, allRows)
            }
            validateEffectiveRateSnapshots(rows, vehicles)
            validateCorrectionChains(rows, allRows)
        },
    )

    private fun validDate(value: String): Boolean =
        runCatching { LocalDate.parse(value).toString() == value }.getOrDefault(false)

    private fun validInstant(value: String): Boolean =
        runCatching { OffsetDateTime.parse(value) }.isSuccess

    private fun validInteger(value: Any?): Boolean =
        value is Number && (value is Int || value is Long) && value.toLong() >= 0L &&
            value.toLong() <= 9_007_199_254_740_991L

    private fun assertExactKeys(data: JSONObject, required: Set<String>, optional: Set<String> = emptySet()) {
        val keys = data.keys().asSequence().toSet()
        require(keys.containsAll(required) && keys.all { it in required || it in optional }) {
            "maintenance_record_invalid"
        }
    }

    private fun validatePayload(id: String, data: JSONObject, kind: String, vehicleCreatedAt: String, allRows: List<JSONObject>) {
        require(data.optInt("schemaVersion", -1) == 1 && data.optString("vehicleId").startsWith("feature:vehicle:")) {
            "maintenance_record_invalid"
        }
        when (kind) {
            "visit" -> {
                require(id.startsWith(VISIT_PREFIX) && UUID.matches(id.removePrefix(VISIT_PREFIX)) &&
                    id.removePrefix(VISIT_PREFIX) == id.removePrefix(VISIT_PREFIX).lowercase()) {
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
                require(id.startsWith(EXPENSE_PREFIX) && UUID.matches(id.removePrefix(EXPENSE_PREFIX)) &&
                    id.removePrefix(EXPENSE_PREFIX) == id.removePrefix(EXPENSE_PREFIX).lowercase()) {
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
                            entry.optString("effectiveFrom") == expectedDefaultDate &&
                            entry.optString("savedAt") == vehicleCreatedAt) {
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
            "daily_accrual" -> {
                val operationalDate = data.optString("operationalDate")
                val encodedVehicle = URLEncoder.encode(vehicleIdFromData(data), "UTF-8").replace("+", "%20")
                val expectedId = DAILY_ACCRUAL_PREFIX + encodedVehicle + ":" + operationalDate
                require(id == expectedId && validDate(operationalDate) &&
                    validDate(data.optString("rateEffectiveFrom"))) { "maintenance_daily_accrual_identity_mismatch" }
                assertExactKeys(
                    data,
                    setOf("schemaVersion", "kind", "vehicleId", "operationalDate", "dailyBusinessKmRecordId",
                        "dailyBusinessKmRevision", "businessKm", "rateEffectiveFrom", "ratePaisePerKm", "amountPaise"),
                    setOf("personalKm", "personalAmountPaise"),
                )
                val businessKm = data.opt("businessKm")
                val rate = data.opt("ratePaisePerKm")
                val amount = data.opt("amountPaise")
                require(validInteger(businessKm) && validInteger(rate) && validInteger(amount) &&
                    data.optLong("businessKm") * data.optLong("ratePaisePerKm") == data.optLong("amountPaise") &&
                    data.optLong("dailyBusinessKmRevision") > 0L) { "maintenance_daily_accrual_invalid" }
                require(data.has("personalKm") == data.has("personalAmountPaise")) { "maintenance_daily_accrual_invalid" }
                if (data.has("personalKm")) {
                    require(validInteger(data.opt("personalKm")) && validInteger(data.opt("personalAmountPaise")) &&
                        data.optLong("personalKm") * data.optLong("ratePaisePerKm") == data.optLong("personalAmountPaise")) {
                        "maintenance_daily_accrual_invalid"
                    }
                }
                val sourceRow = allRows.firstOrNull { it.optString("id") == data.optString("dailyBusinessKmRecordId") }
                    ?: error("maintenance_daily_accrual_source_missing")
                val sourceEnvelope = JSONObject(sourceRow.getString("json"))
                val source = sourceEnvelope.getJSONObject("data")
                val entries = source.optJSONArray("entries") ?: error("maintenance_daily_accrual_source_invalid")
                var sourceBusinessKm = 0L
                var sourcePersonalKm = 0L
                for (index in 0 until entries.length()) {
                    val entry = entries.getJSONObject(index)
                    require(entry.optString("allocationStatus") == "allocated" &&
                        validInteger(entry.opt("businessKm")) && validInteger(entry.opt("personalKm") ?: 0)) {
                        "maintenance_daily_accrual_source_invalid"
                    }
                    sourceBusinessKm = Math.addExact(sourceBusinessKm, entry.optLong("businessKm"))
                    sourcePersonalKm = Math.addExact(sourcePersonalKm, entry.optLong("personalKm", 0L))
                }
                require(sourceEnvelope.optLong("revision") == data.optLong("dailyBusinessKmRevision") &&
                    source.optString("kind") == "daily_business_kilometres" &&
                    source.optString("vehicleId") == data.optString("vehicleId") && source.optString("operationalDate") == operationalDate &&
                    source.optLong("totalBusinessKm") == sourceBusinessKm && source.optLong("unallocatedBusinessKm") == 0L &&
                    sourceBusinessKm == data.optLong("businessKm") &&
                    sourcePersonalKm == data.optLong("personalKm", 0L)) {
                    "maintenance_daily_accrual_source_invalid"
                }
            }
            else -> error("maintenance_record_kind_invalid")
        }
    }

    private fun validateEffectiveRateSnapshots(rows: List<JSONObject>, vehicles: Map<String, Pair<JSONObject, String>>) {
        val ratesByVehicle = rows.mapNotNull { row ->
            val envelope = JSONObject(row.getString("json"))
            val data = envelope.getJSONObject("data")
            if (data.optString("kind") == "rate_history") data.optString("vehicleId") to data else null
        }.toMap()
        rows.forEach { row ->
            val envelope = JSONObject(row.getString("json"))
            val data = envelope.getJSONObject("data")
            if (data.optString("kind") != "daily_accrual") return@forEach
            val vehicleId = data.optString("vehicleId")
            val vehicleCreatedAt = vehicles[vehicleId]?.second ?: error("maintenance_vehicle_not_found")
            val operationalDate = data.getString("operationalDate")
            val entries = ratesByVehicle[vehicleId]?.optJSONArray("entries")
            var effective: JSONObject? = null
            if (entries != null) {
                for (index in 0 until entries.length()) {
                    val candidate = entries.getJSONObject(index)
                    val date = candidate.optString("effectiveFrom")
                    val savedAt = candidate.optString("savedAt")
                    val current = effective
                    if (date <= operationalDate &&
                        (current == null || date > current.optString("effectiveFrom") ||
                            (date == current.optString("effectiveFrom") && savedAt > current.optString("savedAt")))) {
                        effective = candidate
                    }
                }
            }
            val defaultDate = OffsetDateTime.parse(vehicleCreatedAt).toInstant().atZone(zone).toLocalDate().toString()
            val expectedEffectiveFrom = effective?.optString("effectiveFrom") ?: defaultDate
            val expectedRate = effective?.optLong("ratePaisePerKm") ?: DEFAULT_RATE
            require(expectedEffectiveFrom <= operationalDate &&
                data.optString("rateEffectiveFrom") == expectedEffectiveFrom &&
                data.optLong("ratePaisePerKm", -1L) == expectedRate) {
                "maintenance_daily_accrual_effective_rate_mismatch"
            }
        }
    }

    private fun validateCorrectionChains(maintenanceRows: List<JSONObject>, allRows: List<JSONObject>) {
        val expenses = maintenanceRows.filter { it.optString("id").startsWith(EXPENSE_PREFIX) }
            .associateBy { it.optString("id") }
        val correctionsByTarget = mutableMapOf<String, MutableList<Pair<JSONObject, JSONObject>>>()
        val headsByTarget = mutableMapOf<String, Pair<JSONObject, JSONObject>>()

        allRows.forEach { row ->
            val id = row.optString("id")
            val envelope = JSONObject(row.getString("json"))
            val data = envelope.optJSONObject("data") ?: return@forEach
            val targetId = data.optString("targetRecordId")
            val featureId = data.optString("featureId")
            if (id.startsWith("historical-correction:") &&
                (featureId == FEATURE_ID || targetId.startsWith(EXPENSE_PREFIX))) {
                require(featureId == FEATURE_ID && targetId.startsWith(EXPENSE_PREFIX)) {
                    "maintenance_correction_identity_invalid"
                }
                correctionsByTarget.getOrPut(targetId) { mutableListOf() }.add(row to envelope)
            }
            if (id.startsWith("historical-correction-chain:") && targetId.startsWith(EXPENSE_PREFIX)) {
                require(headsByTarget.put(targetId, row to envelope) == null) {
                    "maintenance_correction_chain_head_duplicate"
                }
            }
        }

        val targetIds = correctionsByTarget.keys + headsByTarget.keys
        targetIds.forEach { targetId ->
            val originalRow = expenses[targetId] ?: error("maintenance_correction_target_missing")
            val originalEnvelope = JSONObject(originalRow.getString("json"))
            val originalData = originalEnvelope.getJSONObject("data")
            require(originalData.optString("kind") == "expense" &&
                validInteger(originalData.opt("amountPaise"))) {
                "maintenance_correction_target_invalid"
            }
            val ordered = correctionsByTarget[targetId].orEmpty().sortedBy {
                it.second.getJSONObject("data").optInt("chainRevision", -1)
            }
            val headPair = headsByTarget[targetId]
            require(ordered.isNotEmpty() && headPair != null) {
                "maintenance_correction_chain_head_missing"
            }

            var projectedAmount = originalData.getLong("amountPaise")
            var previousCorrectionId: String? = null
            ordered.forEachIndexed { index, (row, envelope) ->
                RecordEnvelopeContract.validate(envelope)
                val id = row.optString("id")
                val data = envelope.getJSONObject("data")
                assertExactKeys(
                    data,
                    setOf("schemaVersion", "correctionId", "targetRecordId", "targetRecordRevision",
                        "featureId", "chainRevision", "fieldPath", "beforeValue", "afterValue",
                        "reason", "actor", "recordedAt"),
                    setOf("supersedesCorrectionId", "businessEffectiveDate"),
                )
                val correctionId = data.optString("correctionId")
                require(envelope.optString("id") == id && id == "historical-correction:" + correctionId &&
                    envelope.optLong("revision", -1L) == 1L &&
                    correctionId.matches(Regex("[A-Za-z0-9_-]{1,128}")) &&
                    data.optInt("schemaVersion", -1) == 1 && data.optString("targetRecordId") == targetId &&
                    data.optLong("targetRecordRevision", -1L) == originalEnvelope.optLong("revision", -2L) &&
                    data.optString("featureId") == FEATURE_ID && data.optInt("chainRevision", -1) == index + 1 &&
                    data.optString("fieldPath") == "amountPaise" &&
                    data.optString("reason").isNotBlank() && data.optString("reason").length <= 1000 &&
                    validInstant(data.optString("recordedAt")) &&
                    (!data.has("businessEffectiveDate") || validDate(data.optString("businessEffectiveDate")))) {
                    "maintenance_correction_record_invalid"
                }
                if (index == 0) {
                    require(!data.has("supersedesCorrectionId")) { "maintenance_correction_chain_link_invalid" }
                } else {
                    require(data.optString("supersedesCorrectionId") == previousCorrectionId) {
                        "maintenance_correction_chain_link_invalid"
                    }
                }
                val before = data.opt("beforeValue")
                val after = data.opt("afterValue")
                require(validInteger(before) && validInteger(after) &&
                    (before as Number).toLong() == projectedAmount &&
                    (after as Number).toLong() != projectedAmount) {
                    "maintenance_correction_before_value_mismatch"
                }
                val actor = data.optJSONObject("actor") ?: error("maintenance_correction_actor_invalid")
                assertExactKeys(actor, setOf("role", "actorId"), setOf("adminPinVerifiedAt"))
                val role = actor.optString("role")
                val actorId = actor.optString("actorId")
                require(actorId.matches(Regex("[A-Za-z0-9_-]{1,128}")) &&
                    (role == "driver" || role == "admin")) {
                    "maintenance_correction_actor_invalid"
                }
                val createdBy = envelope.optJSONObject("createdBy")
                require(createdBy?.optString("personId") == actorId && createdBy.optString("role") == role) {
                    "maintenance_correction_actor_envelope_mismatch"
                }
                if (role == "admin") {
                    require(actor.has("adminPinVerifiedAt") && validInstant(actor.optString("adminPinVerifiedAt"))) {
                        "maintenance_correction_admin_verification_required"
                    }
                } else {
                    require(!actor.has("adminPinVerifiedAt") &&
                        originalEnvelope.optJSONObject("createdBy")?.optString("personId") == actorId) {
                        "maintenance_correction_driver_authority_invalid"
                    }
                }
                projectedAmount = (after as Number).toLong()
                previousCorrectionId = correctionId
            }

            val (headRow, headEnvelope) = headPair
            RecordEnvelopeContract.validate(headEnvelope)
            val headData = headEnvelope.getJSONObject("data")
            assertExactKeys(headData, setOf("schemaVersion", "targetRecordId", "chainRevision", "headCorrectionId"))
            val expectedHeadId = "historical-correction-chain:" +
                URLEncoder.encode(targetId, "UTF-8").replace("+", "%20")
            require(headRow.optString("id") == expectedHeadId &&
                headEnvelope.optLong("revision", -1L) == ordered.size.toLong() &&
                headData.optInt("schemaVersion", -1) == 1 && headData.optString("targetRecordId") == targetId &&
                headData.optInt("chainRevision", -1) == ordered.size &&
                headData.optString("headCorrectionId") == previousCorrectionId) {
                "maintenance_correction_chain_head_invalid"
            }
        }
    }

    private fun vehicleIdFromData(data: JSONObject): String = data.optString("vehicleId")
}
