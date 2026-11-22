package `in`.samtravels.app

import org.json.JSONObject

/** Seeds the shared fixture's committed, acknowledged, pending and recoverable Work states through Room. */
internal object SharedFixtureWorkSeeder {
    fun seed(database: LocalDatabase, workFixture: JSONObject) {
        DriverWorkflowIdentityTestFixtures.seed(database, "driver-001", "synthetic-person-001")
        val transitionsJson = workFixture.getJSONArray("committedTransitions")
        val transitions = (0 until transitionsJson.length()).map { index ->
            val item = transitionsJson.getJSONObject(index)
            Triple(item.getString("type"), item.getString("id"), item.getString("at"))
        }
        for ((eventType, eventId, transitionAt) in transitions) {
            val current = DriverWorkflowStore.snapshot(database)
            val command = JSONObject().put("schemaVersion", 1).put("commandId", eventId).put("eventId", eventId)
                .put("eventType", eventType).put("originSurface", "pwa").put("transitionAt", transitionAt)
                .put("expectedPriorState", current.getString("state")).put("expectedRevision", current.getInt("revision"))
                .put("idempotencyKey", eventId)
            DriverWorkflowStore.queue(database, command, java.time.Instant.parse(transitionAt))
            val gps = JSONObject().put("latitude", 19.076).put("longitude", 72.8777).put("horizontalAccuracyM", 8)
                .put("fixAt", transitionAt).put("provider", "android-test")
            DriverWorkflowStore.complete(database, eventId, gps, java.time.Instant.parse(transitionAt))
            val expectedOutbox = (0 until workFixture.getJSONArray("outboxStates").length())
                .map { workFixture.getJSONArray("outboxStates").getJSONObject(it) }
                .firstOrNull { it.optString("eventId") == eventId }
            if (expectedOutbox?.optBoolean("delivered") == true) DriverWorkflowOutbox.markEventDelivered(database, eventId)
        }
        val intentStates = workFixture.getJSONArray("intentStates")
        for (index in 0 until intentStates.length()) {
            val scenario = intentStates.getJSONObject(index)
            if (scenario.optString("status") == "recorded") continue
            val eventId = scenario.getString("eventId")
            val transitionAt = scenario.getString("transitionAt")
            val current = DriverWorkflowStore.snapshot(database)
            val command = JSONObject().put("schemaVersion", 1).put("commandId", eventId).put("eventId", eventId)
                .put("eventType", scenario.getString("eventType")).put("originSurface", "pwa").put("transitionAt", transitionAt)
                .put("expectedPriorState", current.getString("state")).put("expectedRevision", current.getInt("revision"))
                .put("idempotencyKey", eventId)
            DriverWorkflowStore.queue(database, command, java.time.Instant.parse(transitionAt))
            if (scenario.optString("status") == "needs_attention") {
                val reason = scenario.getString("reason")
                DriverWorkflowStore.markNeedsAttention(database, eventId, reason)
                DriverWorkflowStore.reactivate(database, eventId)
                DriverWorkflowStore.markNeedsAttention(database, eventId, reason)
            }
        }
    }
}
