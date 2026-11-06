package `in`.samtravels.app

import org.json.JSONObject
import java.time.LocalDate
import java.time.OffsetDateTime

/** Native implementation of packages/core/src/persistence-contract.ts. Keep rules in parity. */
internal object RecordEnvelopeContract {
    const val CURRENT_SCHEMA_VERSION = 1
    private val sources = setOf("web", "android", "import", "integration")

    fun validate(record: JSONObject) {
        val id = record.optString("id")
        require(id.isNotBlank() && id == id.trim()) { "record_identity_required" }
        require(record.optInt("schemaVersion", -1) == CURRENT_SCHEMA_VERSION) {
            "record_unsupported_schema_version"
        }
        val createdAt = parseInstant(record.optString("createdAt"))
        val updatedAt = parseInstant(record.optString("updatedAt"))
        require(!updatedAt.isBefore(createdAt)) { "record_invalid_timestamps" }
        require(record.optString("source") in sources) { "record_invalid_source" }
        val revision = record.opt("revision") as? Number
        require(revision != null && revision.toDouble().isFinite() && revision.toDouble() % 1.0 == 0.0 &&
            revision.toDouble() in 1.0..9_007_199_254_740_991.0) {
            "record_invalid_revision"
        }
        require(record.has("data")) { "record_data_required" }
        if (record.has("businessDate") && !record.isNull("businessDate")) {
            val date = record.optString("businessDate")
            require(runCatching { LocalDate.parse(date).toString() == date }.getOrDefault(false)) {
                "record_invalid_business_date"
            }
        }
        if (record.has("deletedAt") && !record.isNull("deletedAt")) {
            parseInstant(record.optString("deletedAt"))
        }
    }

    private fun parseInstant(value: String) =
        runCatching { OffsetDateTime.parse(value).toInstant() }
            .getOrElse { throw IllegalArgumentException("record_invalid_timestamps") }
}
