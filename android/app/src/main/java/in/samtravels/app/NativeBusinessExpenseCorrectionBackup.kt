package `in`.samtravels.app

import org.json.JSONObject
import java.net.URLEncoder
import java.time.LocalDate
import java.time.OffsetDateTime

/** Validates Business Expenses append-only correction chains in the shared native backup snapshot. */
internal object NativeBusinessExpenseCorrectionBackup {
    private const val FEATURE_ID = "business-expenses"
    private const val RECORD_PREFIX = "feature:business-expenses:"
    private const val CORRECTION_PREFIX = "historical-correction:"
    private const val CHAIN_PREFIX = "historical-correction-chain:"
    private val safeId = Regex("[A-Za-z0-9_-]{1,128}")

    fun validate(expenseRows: List<JSONObject>, allRows: List<JSONObject>) {
        val originals = expenseRows.associateBy { it.optString("id") }
        val correctionsByTarget = mutableMapOf<String, MutableList<Pair<JSONObject, JSONObject>>>()
        val headsByTarget = mutableMapOf<String, Pair<JSONObject, JSONObject>>()

        allRows.forEach { row ->
            val id = row.optString("id")
            val envelope = JSONObject(row.getString("json"))
            val data = envelope.optJSONObject("data") ?: return@forEach
            val targetId = data.optString("targetRecordId")
            val featureId = data.optString("featureId")
            if (id.startsWith(CHAIN_PREFIX) &&
                (targetId.startsWith(RECORD_PREFIX) || featureId == FEATURE_ID)) {
                require(targetId.startsWith(RECORD_PREFIX) &&
                    id == CHAIN_PREFIX + encode(targetId)) {
                    "business_expense_correction_chain_head_identity_invalid"
                }
                require(headsByTarget.put(targetId, row to envelope) == null) {
                    "business_expense_correction_chain_head_duplicate"
                }
            } else if (id.startsWith(CORRECTION_PREFIX) &&
                (featureId == FEATURE_ID || targetId.startsWith(RECORD_PREFIX))) {
                require(featureId == FEATURE_ID && targetId.startsWith(RECORD_PREFIX) &&
                    id == CORRECTION_PREFIX + data.optString("correctionId")) {
                    "business_expense_correction_identity_invalid"
                }
                correctionsByTarget.getOrPut(targetId) { mutableListOf() }.add(row to envelope)
            } else if (featureId == FEATURE_ID || targetId.startsWith(RECORD_PREFIX)) {
                // A row claiming this feature/target but not using the append-only
                // correction identity is malformed, not an unrelated platform row.
                error("business_expense_correction_identity_invalid")
            }
        }

        val targets = correctionsByTarget.keys + headsByTarget.keys
        targets.forEach { targetId ->
            val targetRow = originals[targetId] ?: error("business_expense_correction_target_missing")
            val targetEnvelope = JSONObject(targetRow.getString("json"))
            RecordEnvelopeContract.validate(targetEnvelope)
            require(targetEnvelope.optString("id") == targetId &&
                (!targetEnvelope.has("deletedAt") || targetEnvelope.isNull("deletedAt"))) {
                "business_expense_correction_target_missing"
            }
            val targetData = targetEnvelope.getJSONObject("data")
            val kind = targetData.optString("kind")
            val allowedFields = when (kind) {
                "fuel_purchase" -> setOf("odometerKm", "pricePaisePerKg", "amountPaise", "partialRefill")
                "business_expense" -> setOf("businessDate", "amountPaise", "category", "description",
                    "reference", "alreadyNettedFromIncome", "paymentStatus")
                else -> error("business_expense_correction_target_invalid")
            }
            val ordered = correctionsByTarget[targetId].orEmpty().sortedBy {
                it.second.getJSONObject("data").optInt("chainRevision", -1)
            }
            val headPair = headsByTarget[targetId]
            require(ordered.isNotEmpty() && headPair != null) {
                "business_expense_correction_chain_head_missing"
            }

            val projected = JSONObject(targetData.toString())
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
                val fieldPath = data.optString("fieldPath")
                require(envelope.optString("id") == id && id == CORRECTION_PREFIX + correctionId &&
                    envelope.optLong("revision", -1L) == 1L && safeId.matches(correctionId) &&
                    positiveInteger(data.opt("schemaVersion")) && data.optInt("schemaVersion", -1) == 1 &&
                    data.optString("targetRecordId") == targetId &&
                    positiveInteger(data.opt("targetRecordRevision")) &&
                    data.optLong("targetRecordRevision", -1L) == targetEnvelope.optLong("revision", -2L) &&
                    data.optString("featureId") == FEATURE_ID &&
                    positiveInteger(data.opt("chainRevision")) && data.optInt("chainRevision", -1) == index + 1 &&
                    fieldPath in allowedFields &&
                    data.optString("reason").isNotBlank() && data.optString("reason").length <= 1000 &&
                    validInstant(data.optString("recordedAt")) &&
                    (!data.has("businessEffectiveDate") || validDate(data.optString("businessEffectiveDate"))) &&
                    (!envelope.has("businessDate") || envelope.optString("businessDate") == data.optString("businessEffectiveDate"))) {
                    "business_expense_correction_record_invalid"
                }
                if (index == 0) {
                    require(!data.has("supersedesCorrectionId")) {
                        "business_expense_correction_chain_link_invalid"
                    }
                } else {
                    require(data.optString("supersedesCorrectionId") == previousCorrectionId) {
                        "business_expense_correction_chain_link_invalid"
                    }
                }

                val before = data.opt("beforeValue")
                val after = data.opt("afterValue")
                require(data.has("beforeValue") && data.has("afterValue") &&
                    sameJsonValue(projected.opt(fieldPath), before) && !sameJsonValue(before, after)) {
                    "business_expense_correction_before_value_mismatch"
                }
                val actor = data.optJSONObject("actor") ?: error("business_expense_correction_actor_invalid")
                val role = actor.optString("role")
                val actorId = actor.optString("actorId")
                assertExactKeys(actor, setOf("role", "actorId"),
                    if (role == "admin") setOf("adminPinVerifiedAt") else emptySet())
                require(safeId.matches(actorId) && (role == "driver" || role == "admin")) {
                    "business_expense_correction_actor_invalid"
                }
                val createdBy = envelope.optJSONObject("createdBy")
                require(createdBy != null && createdBy.optString("personId") == actorId &&
                    createdBy.optString("role") == role) {
                    "business_expense_correction_actor_envelope_mismatch"
                }
                if (role == "admin") {
                    require(actor.has("adminPinVerifiedAt") &&
                        validInstant(actor.optString("adminPinVerifiedAt"))) {
                        "business_expense_correction_admin_verification_required"
                    }
                } else {
                    require(!actor.has("adminPinVerifiedAt") &&
                        targetEnvelope.optJSONObject("createdBy")?.optString("personId") == actorId) {
                        "business_expense_correction_driver_authority_invalid"
                    }
                }
                projected.put(fieldPath, after)
                previousCorrectionId = correctionId
            }

            NativeBusinessExpensesBackup.validateCorrectedProjection(projected, targetId)
            val (headRow, headEnvelope) = headPair
            RecordEnvelopeContract.validate(headEnvelope)
            val headData = headEnvelope.getJSONObject("data")
            assertExactKeys(headData, setOf("schemaVersion", "targetRecordId", "chainRevision", "headCorrectionId"))
            require(headRow.optString("id") == CHAIN_PREFIX + encode(targetId) &&
                headEnvelope.optLong("revision", -1L) == ordered.size.toLong() &&
                headData.optInt("schemaVersion", -1) == 1 &&
                headData.optString("targetRecordId") == targetId &&
                headData.optInt("chainRevision", -1) == ordered.size &&
                headData.optString("headCorrectionId") == previousCorrectionId) {
                "business_expense_correction_chain_head_invalid"
            }
        }
    }

    private fun encode(value: String): String =
        URLEncoder.encode(value, "UTF-8").replace("+", "%20")

    private fun positiveInteger(value: Any?): Boolean =
        value is Number && value.toDouble().isFinite() && value.toDouble() == value.toLong().toDouble() &&
            value.toLong() > 0L && value.toLong() <= 9_007_199_254_740_991L

    private fun sameJsonValue(left: Any?, right: Any?): Boolean {
        if (left is Number && right is Number) {
            return left.toDouble() == right.toDouble() && left.toLong() == right.toLong()
        }
        return left == right
    }

    private fun validDate(value: String): Boolean =
        runCatching { LocalDate.parse(value).toString() == value }.getOrDefault(false)

    private fun validInstant(value: String): Boolean =
        runCatching { OffsetDateTime.parse(value) }.isSuccess

    private fun assertExactKeys(data: JSONObject, required: Set<String>, optional: Set<String> = emptySet()) {
        val keys = data.keys().asSequence().toSet()
        require(keys.containsAll(required) && keys.all { it in required || it in optional }) {
            "business_expense_correction_record_invalid"
        }
    }
}
