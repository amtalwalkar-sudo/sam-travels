package `in`.samtravels.app

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class RecordEnvelopeContractTest {
    private fun validRecord() = JSONObject(
        """{
          "id":"historical-trip-001",
          "schemaVersion":1,
          "createdAt":"2025-04-03T08:00:00.000Z",
          "updatedAt":"2025-04-03T08:15:00.000Z",
          "businessDate":"2025-04-03",
          "source":"import",
          "revision":2,
          "data":{"eventType":"trip_completed","fare":240}
        }""",
    )

    @Test
    fun acceptsHistoricalV1RecordFixtureShape() {
        RecordEnvelopeContract.validate(validRecord())
    }

    @Test
    fun rejectsUnsupportedFutureSchemaWithoutFallback() {
        val record = validRecord().put("schemaVersion", 2)
        val error = assertThrows(IllegalArgumentException::class.java) {
            RecordEnvelopeContract.validate(record)
        }
        assertEquals("record_unsupported_schema_version", error.message)
    }

    @Test
    fun rejectsMissingDataAndInvalidIdentity() {
        val missingData = validRecord().apply { remove("data") }
        assertEquals("record_data_required", assertThrows(IllegalArgumentException::class.java) {
            RecordEnvelopeContract.validate(missingData)
        }.message)
        val invalidIdentity = validRecord().put("id", "  ")
        assertEquals("record_identity_required", assertThrows(IllegalArgumentException::class.java) {
            RecordEnvelopeContract.validate(invalidIdentity)
        }.message)
    }

    @Test
    fun rejectsInvalidRevisionSourceAndBusinessDate() {
        assertEquals("record_invalid_revision", assertThrows(IllegalArgumentException::class.java) {
            RecordEnvelopeContract.validate(validRecord().put("revision", 0))
        }.message)
        assertEquals("record_invalid_source", assertThrows(IllegalArgumentException::class.java) {
            RecordEnvelopeContract.validate(validRecord().put("source", "unknown"))
        }.message)
        assertEquals("record_invalid_business_date", assertThrows(IllegalArgumentException::class.java) {
            RecordEnvelopeContract.validate(validRecord().put("businessDate", "2025-02-30"))
        }.message)
    }

    @Test
    fun rejectsTimestampRegressionAndMalformedDeletedAt() {
        assertEquals("record_invalid_timestamps", assertThrows(IllegalArgumentException::class.java) {
            RecordEnvelopeContract.validate(validRecord().put("updatedAt", "2025-04-02T00:00:00Z"))
        }.message)
        assertEquals("record_invalid_timestamps", assertThrows(IllegalArgumentException::class.java) {
            RecordEnvelopeContract.validate(validRecord().put("deletedAt", "not-a-time"))
        }.message)
    }
}
