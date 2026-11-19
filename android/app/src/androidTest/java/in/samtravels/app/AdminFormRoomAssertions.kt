package `in`.samtravels.app

import org.json.JSONObject
import org.junit.Assert.assertEquals

/** Shared assertions for operation receipts written through the production Room repository. */
internal fun assertRoomOperationReceiptExists(
    database: LocalDatabase,
    targetRecordId: String,
    actions: Set<String> = setOf("create"),
) {
    val count = database.records().list().count { row ->
        val data = JSONObject(row.json).optJSONObject("data") ?: return@count false
        data.optString("kind") == "feature_record_operation_receipt" &&
            data.optString("targetRecordId") == targetRecordId &&
            actions.contains(data.optString("action"))
    }
    assertEquals(
        "Expected one durable operation receipt for $targetRecordId",
        1,
        count,
    )
}
