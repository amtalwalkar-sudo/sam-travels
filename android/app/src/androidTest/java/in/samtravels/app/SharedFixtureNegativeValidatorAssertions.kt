package `in`.samtravels.app

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertTrue

/** Applies the shared fixture's negative matrix to the native production validators. */
internal object SharedFixtureNegativeValidatorAssertions {
    fun assertRejected(records: JSONArray) {
        fun assertMutationRejected(label: String, recordId: String, mutation: (JSONObject, JSONArray) -> Unit) {
            val candidate = JSONArray(records.toString())
            val index = (0 until candidate.length()).firstOrNull {
                candidate.getJSONObject(it).optString("id") == recordId
            } ?: error("fixture_negative_target_missing:$label")
            val target = candidate.getJSONObject(index)
            mutation(target, candidate)
            assertTrue("$label must be rejected by the native production validators", runCatching {
                NativeBackupCoverage.validateBusinessRecords(candidate, requireExplicitOwnerTags = true)
            }.isFailure)
        }

        assertMutationRejected("malformed fuel amount",
            "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174071") { row, _ ->
            JSONObject(row.getString("json")).also { envelope ->
                envelope.getJSONObject("data").put("amountPaise", 0)
                row.put("json", envelope.toString())
            }
        }
        assertMutationRejected("dangling vehicle",
            "feature:business-expenses:entry:123e4567-e89b-42d3-a456-426614174080") { row, _ ->
            JSONObject(row.getString("json")).also { envelope ->
                envelope.getJSONObject("data").put("vehicleId", "feature:vehicle:MISSINGVEHICLE001")
                row.put("json", envelope.toString())
            }
        }
        assertMutationRejected("dangling trip financial source",
            "feature:business-expenses:entry:123e4567-e89b-42d3-a456-426614174084") { row, _ ->
            JSONObject(row.getString("json")).also { envelope ->
                envelope.getJSONObject("data").put("tripFinancialSourceId", "work:trip-financial-obligation:MISSINGTRIP001")
                row.put("json", envelope.toString())
            }
        }
        assertMutationRejected("wrong participant owner",
            "feature:vehicle:SYNTHETICVEHICLE001") { row, _ ->
            row.put("participantId", "maintenance-records")
        }
        assertMutationRejected("invalid correction head",
            "historical-correction-chain:feature%3Amaintenance%3Aexpense%3A123e4567-e89b-42d3-a456-426614174050") { row, _ ->
            JSONObject(row.getString("json")).also { envelope ->
                envelope.getJSONObject("data").put("headCorrectionId", "missing-correction")
                row.put("json", envelope.toString())
            }
        }
        assertMutationRejected("malformed record revision",
            "feature:vehicle:SYNTHETICVEHICLE001") { row, _ ->
            JSONObject(row.getString("json")).also { envelope ->
                envelope.put("revision", 0)
                row.put("json", envelope.toString())
            }
        }
        assertMutationRejected("duplicate record identity",
            "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174071") { row, candidate ->
            candidate.put(JSONObject(row.toString()))
        }
    }
}
