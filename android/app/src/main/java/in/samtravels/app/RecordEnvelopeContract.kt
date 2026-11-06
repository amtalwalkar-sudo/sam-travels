package `in`.samtravels.app

import org.json.JSONObject
import java.time.LocalDate
import java.time.OffsetDateTime

/** Native implementation of packages/core/src/persistence-contract.ts. Keep rules in parity. */
internal object RecordEnvelopeContract {
    const val CURRENT_SCHEMA_VERSION = 1
    private val sources = setOf("web", "android", "import", "integration")
    private const val MAX_SAFE_INTEGER = 9_007_199_254_740_991.0

    fun validate(record: JSONObject) {
        val id = record.opt("id") as? String
        require(id != null && id.isNotBlank() && id == id.trim()) { "record_identity_required" }
        val schemaVersion = number(record, "schemaVersion")
        require(schemaVersion == CURRENT_SCHEMA_VERSION.toDouble()) { "record_unsupported_schema_version" }

        val createdAt = parseInstant(record.opt("createdAt") as? String ?: "")
        val updatedAt = parseInstant(record.opt("updatedAt") as? String ?: "")
        require(!updatedAt.isBefore(createdAt)) { "record_invalid_timestamps" }

        val source = record.opt("source") as? String
        require(source != null && source in sources) { "record_invalid_source" }
        val revision = number(record, "revision")
        require(revision >= 1.0 && revision <= MAX_SAFE_INTEGER) { "record_invalid_revision" }
        require(record.has("data")) { "record_data_required" }

        if (record.has("businessDate") && !record.isNull("businessDate")) {
            val date = record.opt("businessDate") as? String
            require(date != null && runCatching { LocalDate.parse(date).toString() == date }.getOrDefault(false)) {
                "record_invalid_business_date"
            }
        }
        if (record.has("deletedAt") && !record.isNull("deletedAt")) {
            parseInstant(record.opt("deletedAt") as? String ?: "")
        }
    }

    private fun number(record: JSONObject, key: String): Double {
        val value = record.opt(key) as? Number
            ?: throw IllegalArgumentException(if (key == "schemaVersion") "record_unsupported_schema_version" else "record_invalid_revision")
        val number = value.toDouble()
        require(number.isFinite() && number % 1.0 == 0.0 && number <= MAX_SAFE_INTEGER) {
            if (key == "schemaVersion") "record_unsupported_schema_version" else "record_invalid_revision"
        }
        return number
    }

    private fun parseInstant(value: String) =
        runCatching { OffsetDateTime.parse(value).toInstant() }
            .getOrElse { throw IllegalArgumentException("record_invalid_timestamps") }
}
