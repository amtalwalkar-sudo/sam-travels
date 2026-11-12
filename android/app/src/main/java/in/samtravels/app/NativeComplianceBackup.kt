package `in`.samtravels.app

import org.json.JSONObject
import java.time.LocalDate
import java.time.Instant
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/** Installs Compliance Room backup validation before native backup, restore, or recovery. */
internal object NativeComplianceBackup {
    private const val PARTICIPANT_ID = "compliance-records"
    private const val FEATURE_ID = "compliance"
    private const val RECORD_PREFIX = "feature:compliance:"
    private val UUID = Regex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}")
    @Volatile private var processRegistration: AutoCloseable? = null

    @Synchronized
    fun ensureRegistered() {
        if (processRegistration == null) processRegistration = register()
    }

    fun register(): AutoCloseable = NativeBackupCoverage.registerFeatureRecordParticipant(
        id = PARTICIPANT_ID,
        featureId = FEATURE_ID,
        snapshotVersion = 1,
        recordIdPrefix = RECORD_PREFIX,
        validateRelationships = { rows, allRows ->
            val records = linkedMapOf<String, JSONObject>()
            rows.forEach { row ->
                val id = row.optString("id")
                require(id.startsWith(RECORD_PREFIX)) { "compliance_record_namespace_mismatch" }
                val envelope = JSONObject(row.getString("json"))
                RecordEnvelopeContract.validate(envelope)
                require(envelope.optString("id") == id) { "compliance_record_identity_mismatch" }
                val data = envelope.getJSONObject("data")
                val keys = data.keys().asSequence().toSet()
                val required = setOf("schemaVersion", "vehicleId", "complianceName", "validFrom", "validTo", "totalCostPaise")
                val allowed = required + setOf("supportingDocumentRef", "renewedFromRecordId")
                require(keys.containsAll(required) && keys.all { it in allowed } &&
                    data.optInt("schemaVersion", -1) == 1) { "compliance_record_invalid" }
                val uuid = id.removePrefix(RECORD_PREFIX)
                require(UUID.matches(uuid) && id == RECORD_PREFIX + uuid.lowercase()) {
                    "compliance_record_identity_invalid"
                }
                val vehicleId = data.optString("vehicleId")
                require(vehicleId.startsWith("feature:vehicle:") &&
                    vehicleId.removePrefix("feature:vehicle:").isNotBlank()) { "compliance_record_invalid" }
                val name = data.optString("complianceName")
                require(name.isNotBlank() && name == name.trim()) { "compliance_record_invalid" }
                val from = data.optString("validFrom")
                val to = data.optString("validTo")
                val validPeriod = runCatching {
                    LocalDate.parse(from).toString() == from &&
                        LocalDate.parse(to).toString() == to &&
                        !LocalDate.parse(to).isBefore(LocalDate.parse(from))
                }.getOrDefault(false)
                require(validPeriod) { "compliance_record_invalid" }
                val cost = data.opt("totalCostPaise")
                require(cost is Number && (cost is Int || cost is Long) && cost.toLong() >= 0L) {
                    "compliance_record_invalid"
                }
                if (data.has("supportingDocumentRef")) {
                    require(data.optString("supportingDocumentRef").isNotBlank()) {
                        "compliance_record_document_reference_invalid"
                    }
                }
                records[id] = data
            }
            val vehicles = allRows.filter { it.optString("participantId") == "vehicle-records" }
                .associate { row ->
                    val vehicleId = row.optString("id")
                    val envelope = JSONObject(row.getString("json"))
                    val vehicle = envelope.getJSONObject("data")
                    val registration = vehicle.optString("registrationNumber")
                    require(vehicleId == "feature:vehicle:" + registration &&
                        registration.isNotBlank() &&
                        registration == registration.uppercase().filterNot { it.isWhitespace() || it == '-' }) {
                        "compliance_vehicle_identity_mismatch"
                    }
                    vehicleId to vehicle
                }
            rows.forEach { row ->
                val id = row.optString("id")
                val data = records.getValue(id)
                require(vehicles.containsKey(data.optString("vehicleId"))) {
                    "compliance_vehicle_not_found"
                }
                if (data.has("renewedFromRecordId")) {
                    val previousId = data.optString("renewedFromRecordId")
                    val previous = records[previousId] ?: error("compliance_renewal_source_not_found")
                    require(previous.optString("vehicleId") == data.optString("vehicleId") &&
                        previous.optString("complianceName") == data.optString("complianceName")) {
                        "compliance_renewal_source_mismatch"
                    }
                }
            }

            validateOverlapReviewHistory(allRows, records)
            validateHistoricalCorrections(allRows, rows)

        },
    )

    private fun encoded(value: String): String =
        URLEncoder.encode(value, StandardCharsets.UTF_8.name()).replace("+", "%20")

    private fun validateOverlapReviewHistory(
        allRows: List<JSONObject>,
        complianceRecords: Map<String, JSONObject>,
    ) {
        val prefix = "compliance-overlap-review:"
        val headPrefix = "compliance-overlap-review-head:"
        val groups = linkedMapOf<String, MutableList<JSONObject>>()
        allRows.filter { it.optString("id").startsWith(prefix) }.forEach { row ->
            val id = row.optString("id")
            val envelope = JSONObject(row.getString("json"))
            RecordEnvelopeContract.validate(envelope)
            require(envelope.optString("id") == id) { "compliance_overlap_review_identity_mismatch" }
            val event = envelope.getJSONObject("data")
            require(event.optInt("schemaVersion", -1) == 1 && event.optString("eventId") == id) {
                "compliance_overlap_review_invalid"
            }
            require(Regex("^compliance-overlap-review:[0-9a-fA-F-]{36}$").matches(id)) {
                "compliance_overlap_review_identity_mismatch"
            }
            val sources = event.optJSONArray("sourceRecords") ?: error("compliance_overlap_review_source_invalid")
            require(sources.length() == 2) { "compliance_overlap_review_source_invalid" }
            val firstRef = sources.getJSONObject(0)
            val secondRef = sources.getJSONObject(1)
            val firstId = firstRef.optString("recordId")
            val secondId = secondRef.optString("recordId")
            require(firstId < secondId && firstRef.optInt("recordRevision", 0) > 0 &&
                secondRef.optInt("recordRevision", 0) > 0) {
                "compliance_overlap_review_source_order_invalid"
            }
            val first = complianceRecords[firstId] ?: error("compliance_overlap_review_source_not_found")
            val second = complianceRecords[secondId] ?: error("compliance_overlap_review_source_not_found")
            require(first.optString("vehicleId") == second.optString("vehicleId") &&
                first.optString("complianceName") == second.optString("complianceName")) {
                "compliance_overlap_review_source_mismatch"
            }
            val from = event.optString("from")
            val to = event.optString("to")
            val overlapFrom = maxOf(first.optString("validFrom"), second.optString("validFrom"))
            val overlapTo = minOf(first.optString("validTo"), second.optString("validTo"))
            require(overlapFrom <= overlapTo && from == overlapFrom && to == overlapTo) {
                "compliance_overlap_review_scope_mismatch"
            }
            require(event.optString("decision") in setOf("confirmed", "rejected") &&
                event.optInt("decisionRevision", 0) > 0 &&
                event.optString("rationale").isNotBlank()) { "compliance_overlap_review_invalid" }
            val actor = event.optJSONObject("actor") ?: error("compliance_overlap_review_actor_required")
            require(actor.optString("actorId").matches(Regex("[A-Za-z0-9_-]{1,128}")) &&
                actor.optString("role") in setOf("admin", "driver")) {
                "compliance_overlap_review_actor_required"
            }
            runCatching { Instant.parse(event.optString("recordedAt")) }
                .getOrElse { error("compliance_overlap_review_invalid") }
            val key = listOf(firstId, secondId, from, to).joinToString("|")
            groups.getOrPut(key) { mutableListOf() }.add(event)
        }
        groups.forEach { (key, events) ->
            val ordered = events.sortedBy { it.optInt("decisionRevision") }
            var previous: String? = null
            ordered.forEachIndexed { index, event ->
                require(event.optInt("decisionRevision") == index + 1 &&
                    event.optString("supersedesEventId").ifBlank { null } == previous) {
                    "compliance_overlap_review_chain_invalid"
                }
                previous = event.optString("eventId")
            }
            val headId = headPrefix + encoded(key)
            val headEnvelope = allRows.firstOrNull { it.optString("id") == headId }
                ?.let { JSONObject(it.getString("json")) } ?: error("compliance_overlap_review_head_missing")
            val head = headEnvelope.getJSONObject("data")
            require(head.optInt("schemaVersion", -1) == 1 && head.optString("overlapKey") == key &&
                head.optInt("decisionRevision", -1) == ordered.size &&
                head.optString("headEventId") == previous) {
                "compliance_overlap_review_head_mismatch"
            }
        }
        allRows.filter { it.optString("id").startsWith(headPrefix) }.forEach { row ->
            require(groups.keys.any { headPrefix + encoded(it) == row.optString("id") }) {
                "compliance_overlap_review_orphan_head"
            }
        }
    }

    private fun validateHistoricalCorrections(
        allRows: List<JSONObject>,
        complianceRows: List<JSONObject>,
    ) {
        val correctionPrefix = "historical-correction:"
        val headPrefix = "historical-correction-chain:"
        val allowedFields = setOf("validFrom", "validTo", "totalCostPaise", "supportingDocumentRef")
        val targets = complianceRows.associate { row ->
            row.optString("id") to JSONObject(row.getString("json"))
        }
        val corrections = linkedMapOf<String, MutableList<JSONObject>>()
        allRows.filter { it.optString("id").startsWith(correctionPrefix) }.forEach { row ->
            val id = row.optString("id")
            val envelope = JSONObject(row.getString("json"))
            RecordEnvelopeContract.validate(envelope)
            require(envelope.optString("id") == id) { "historical_correction_identity_mismatch" }
            val correction = envelope.getJSONObject("data")
            val correctionId = correction.optString("correctionId")
            val targetId = correction.optString("targetRecordId")
            require(correction.optInt("schemaVersion", -1) == 1 &&
                id == correctionPrefix + correctionId &&
                correction.optString("featureId") == FEATURE_ID &&
                targetId in targets &&
                correction.optString("fieldPath") in allowedFields &&
                correction.optInt("targetRecordRevision", 0) == targets.getValue(targetId).optInt("revision", 0)) {
                "compliance_historical_correction_invalid_target"
            }
            require(correction.optInt("chainRevision", 0) > 0 &&
                correction.optString("reason").isNotBlank()) { "historical_correction_invalid" }
            val actor = correction.optJSONObject("actor") ?: error("historical_correction_actor_required")
            val role = actor.optString("role")
            require(actor.optString("actorId").matches(Regex("[A-Za-z0-9_-]{1,128}")) &&
                role in setOf("driver", "admin")) { "historical_correction_actor_required" }
            if (role == "admin") {
                runCatching { Instant.parse(actor.optString("adminPinVerifiedAt")) }
                    .getOrElse { error("historical_correction_admin_verification_required") }
            }
            runCatching { Instant.parse(correction.optString("recordedAt")) }
                .getOrElse { error("historical_correction_invalid") }
            corrections.getOrPut(targetId) { mutableListOf() }.add(correction)
        }
        corrections.forEach { (targetId, chain) ->
            val targetEnvelope = targets.getValue(targetId)
            val projected = JSONObject(targetEnvelope.getJSONObject("data").toString())
            val ordered = chain.sortedBy { it.optInt("chainRevision") }
            var previous: String? = null
            ordered.forEachIndexed { index, correction ->
                val field = correction.optString("fieldPath")
                val before = correction.get("beforeValue")
                require(correction.optInt("chainRevision") == index + 1 &&
                    correction.optString("supersedesCorrectionId").ifBlank { null } == previous &&
                    JSONObject.valueToString(projected.get(field)) == JSONObject.valueToString(before)) {
                    "historical_correction_chain_needs_attention"
                }
                projected.put(field, correction.get("afterValue"))
                previous = correction.optString("correctionId")
            }
            val data = projected
            val validDates = runCatching {
                val from = LocalDate.parse(data.optString("validFrom"))
                val to = LocalDate.parse(data.optString("validTo"))
                !to.isBefore(from)
            }.getOrDefault(false)
            val cost = data.opt("totalCostPaise")
            require(validDates && cost is Number && (cost is Int || cost is Long) && cost.toLong() >= 0L) {
                "compliance_historical_correction_projection_invalid"
            }
            val headId = headPrefix + encoded(targetId)
            val headEnvelope = allRows.firstOrNull { it.optString("id") == headId }
                ?.let { JSONObject(it.getString("json")) } ?: error("historical_correction_chain_head_missing")
            val head = headEnvelope.getJSONObject("data")
            require(head.optInt("schemaVersion", -1) == 1 && head.optString("targetRecordId") == targetId &&
                head.optInt("chainRevision", -1) == ordered.size &&
                head.optString("headCorrectionId") == previous) {
                "historical_correction_chain_head_mismatch"
            }
        }
        allRows.filter { it.optString("id").startsWith(headPrefix) }.forEach { row ->
            require(corrections.keys.any { headPrefix + encoded(it) == row.optString("id") }) {
                "historical_correction_orphan_chain_head"
            }
        }
    }

}
