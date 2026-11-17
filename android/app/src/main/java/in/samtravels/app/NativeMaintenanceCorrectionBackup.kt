package `in`.samtravels.app

import org.json.JSONObject
import java.net.URLEncoder
import java.time.LocalDate
import java.time.OffsetDateTime

/** Validates Maintenance-only append-only correction chains in the shared native backup snapshot. */
internal object NativeMaintenanceCorrectionBackup {
    private const val FEATURE_ID = "maintenance"
    private const val EXPENSE_PREFIX = "feature:maintenance:expense:"
    private const val CORRECTION_PREFIX = "historical-correction:"
    private const val CHAIN_PREFIX = "historical-correction-chain:"
    private val actorIdPattern = Regex("[A-Za-z0-9_-]{1,128}")
    private val correctionIdPattern = Regex("[A-Za-z0-9_-]{1,128}")

    fun validate(maintenanceRows: List<JSONObject>, allRows: List<JSONObject>) {
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
            if (id.startsWith(CHAIN_PREFIX)) {
                if (targetId.startsWith(EXPENSE_PREFIX) || featureId == FEATURE_ID) {
                    require(targetId.startsWith(EXPENSE_PREFIX) &&
                        id == CHAIN_PREFIX + URLEncoder.encode(targetId, "UTF-8").replace("+", "%20")) {
                        "maintenance_correction_chain_head_identity_invalid"
                    }
                    require(headsByTarget.put(targetId, row to envelope) == null) {
                        "maintenance_correction_chain_head_duplicate"
                    }
                }
            } else if (featureId == FEATURE_ID || targetId.startsWith(EXPENSE_PREFIX)) {
                require(id.startsWith(CORRECTION_PREFIX) && featureId == FEATURE_ID &&
                    targetId.startsWith(EXPENSE_PREFIX)) {
                    "maintenance_correction_identity_invalid"
                }
                correctionsByTarget.getOrPut(targetId) { mutableListOf() }.add(row to envelope)
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
                require(envelope.optString("id") == id && id == CORRECTION_PREFIX + correctionId &&
                    envelope.optLong("revision", -1L) == 1L &&
                    correctionIdPattern.matches(correctionId) &&
                    validInteger(data.opt("schemaVersion")) && data.optInt("schemaVersion", -1) == 1 &&
                    data.optString("targetRecordId") == targetId &&
                    validInteger(data.opt("targetRecordRevision")) &&
                    data.optLong("targetRecordRevision", -1L) == originalEnvelope.optLong("revision", -2L) &&
                    data.optString("featureId") == FEATURE_ID &&
                    validInteger(data.opt("chainRevision")) && data.optInt("chainRevision", -1) == index + 1 &&
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
                require(actorIdPattern.matches(actorId) && (role == "driver" || role == "admin")) {
                    "maintenance_correction_actor_invalid"
                }
                val createdBy = envelope.optJSONObject("createdBy")
                require(createdBy != null && createdBy.optString("personId") == actorId &&
                    createdBy.optString("role") == role) {
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
            require(headRow.optString("id") == CHAIN_PREFIX +
                URLEncoder.encode(targetId, "UTF-8").replace("+", "%20") &&
                headEnvelope.optLong("revision", -1L) == ordered.size.toLong() &&
                validInteger(headData.opt("schemaVersion")) && headData.optInt("schemaVersion", -1) == 1 &&
                headData.optString("targetRecordId") == targetId &&
                validInteger(headData.opt("chainRevision")) && headData.optInt("chainRevision", -1) == ordered.size &&
                headData.optString("headCorrectionId") == previousCorrectionId) {
                "maintenance_correction_chain_head_invalid"
            }
        }
    }

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
            "maintenance_correction_record_invalid"
        }
    }
}
