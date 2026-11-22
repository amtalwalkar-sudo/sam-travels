package `in`.samtravels.app

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull

/** Shared assertions for operation receipts written through the production Room repository. */
internal fun assertRoomOperationReceiptExists(
    database: LocalDatabase,
    targetRecordId: String,
    actions: Set<String> = setOf("create"),
) {
    val rows = database.records().list()
    val receipts = rows.mapNotNull { row ->
        val envelope = JSONObject(row.json)
        val data = envelope.optJSONObject("data") ?: return@mapNotNull null
        if (data.optString("kind") == "feature_record_operation_receipt" &&
            data.optString("targetRecordId") == targetRecordId &&
            actions.contains(data.optString("action"))) envelope else null
    }
    assertEquals("Expected one durable operation receipt for $targetRecordId", 1, receipts.size)
    val receipt = receipts.single()
    val data = receipt.getJSONObject("data")
    assertFalse("Operation identity must survive in Room", data.optString("operationId").isBlank())
    assertFalse("Payload fingerprint must survive in Room", data.optString("payloadFingerprint").isBlank())
    val target = rows.singleOrNull { it.id == targetRecordId }
    assertNotNull("Receipt target must remain durable", target)
    assertEquals("First-submit time must be the committed update timestamp",
        target!!.updatedAt, receipt.getString("updatedAt"))
    assertEquals("Receipt timestamp must remain immutable",
        receipt.getString("createdAt"), receipt.getString("updatedAt"))
}
